import { NextResponse } from 'next/server'
import { getRequestAuthUser } from '@/lib/auth-request'
import { createServerClient } from '@/lib/supabase'
import { isPlanId, type PlanId } from '@/lib/plans'
import {
  appOrigin,
  getStripe,
  getStripePriceId,
  randomIntegrationSuffix,
} from '@/lib/stripe'
import { resolveBillingSessionId } from '@/lib/stripe-fulfillment'

export const runtime = 'nodejs'

type Body = {
  plan?: string
  sessionId?: string
  userId?: string
  email?: string
  generationId?: string
  /** 'home' | 'dashboard' — où revenir après paiement */
  returnTo?: string
  appMode?: 'match' | 'custom' | null
}

export async function POST(req: Request) {
  try {
    const authUser = await getRequestAuthUser(req)
    if (!authUser?.id) {
      return NextResponse.json({ error: 'Connexion requise' }, { status: 401 })
    }

    const body = (await req.json()) as Body
    const plan: PlanId = isPlanId(body.plan) ? body.plan : 'once'
    const priceId = getStripePriceId(plan)
    const userId = authUser.id
    const email = (authUser.email ?? body.email)?.trim().toLowerCase() || undefined
    const sessionId = body.sessionId?.trim() || undefined
    const generationId = body.generationId?.trim() || undefined
    const returnTo = body.returnTo === 'dashboard' ? 'dashboard' : 'home'
    const appMode = body.appMode === 'custom' ? 'custom' : 'match'
    const funnelPay = appMode === 'custom' ? '/star/paiement' : '/jumeau/paiement'

    const db = createServerClient()
    const billingSessionId = await resolveBillingSessionId(db, { sessionId, userId, email })
    if (!billingSessionId) {
      return NextResponse.json(
        { error: 'Session introuvable pour démarrer le paiement' },
        { status: 400 }
      )
    }

    const origin = appOrigin(req)
    const successPath = returnTo === 'dashboard' ? '/dashboard' : funnelPay
    const cancelPath = returnTo === 'dashboard' ? '/dashboard?checkout=cancel' : `${funnelPay}?checkout=cancel`

    const metadata: Record<string, string> = {
      plan,
      sessionId: billingSessionId,
    }
    if (userId) metadata.userId = userId
    if (email) metadata.email = email
    if (generationId) metadata.generationId = generationId
    metadata.returnTo = returnTo

    const stripe = getStripe()

    // Réutiliser le customer Stripe si déjà lié à la session
    const { data: sess } = await db
      .from('sessions')
      .select('stripe_customer_id, email')
      .eq('id', billingSessionId)
      .maybeSingle()

    const customerId = sess?.stripe_customer_id || undefined
    const customerEmail = email || sess?.email || undefined

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: plan === 'once' ? 'payment' : 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}${successPath}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${cancelPath}`,
      client_reference_id: billingSessionId,
      metadata,
      locale: 'fr',
      ...(customerId
        ? { customer: customerId }
        : customerEmail
          ? { customer_email: customerEmail }
          : {}),
      ...(plan !== 'once'
        ? {
            subscription_data: {
              metadata: {
                plan,
                sessionId: billingSessionId,
                ...(userId ? { userId } : {}),
              },
            },
          }
        : {}),
      integration_identifier: `starfusion_checkout_${randomIntegrationSuffix()}`,
    })

    if (!checkoutSession.url) {
      return NextResponse.json({ error: 'URL Checkout introuvable' }, { status: 500 })
    }

    return NextResponse.json({
      url: checkoutSession.url,
      checkoutSessionId: checkoutSession.id,
      sessionId: billingSessionId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[stripe/checkout]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
