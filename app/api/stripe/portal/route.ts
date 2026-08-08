import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { appOrigin, getStripe } from '@/lib/stripe'

export const runtime = 'nodejs'

type Body = {
  sessionId?: string
  userId?: string
}

async function resolveStripeCustomerId(
  sessionId?: string,
  userId?: string
): Promise<string | null> {
  const db = createServerClient()

  if (userId) {
    const { data } = await db
      .from('sessions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .not('stripe_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.stripe_customer_id) return data.stripe_customer_id
  }

  if (sessionId) {
    const { data } = await db
      .from('sessions')
      .select('stripe_customer_id')
      .eq('id', sessionId)
      .maybeSingle()
    if (data?.stripe_customer_id) return data.stripe_customer_id
  }

  return null
}

/** Ouvre une session Stripe Customer Portal pour gérer l'abonnement. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body
    const sessionId = body.sessionId?.trim()
    const userId = body.userId?.trim()

    if (!sessionId && !userId) {
      return NextResponse.json({ error: 'sessionId ou userId requis' }, { status: 400 })
    }

    const customerId = await resolveStripeCustomerId(sessionId, userId)
    if (!customerId) {
      return NextResponse.json(
        {
          error:
            'Aucun client Stripe associé à ce compte. Effectue d’abord un paiement ou un abonnement.',
        },
        { status: 404 }
      )
    }

    const stripe = getStripe()
    const origin = appOrigin(req)
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/dashboard`,
    })

    if (!portal.url) {
      return NextResponse.json({ error: 'URL du portail introuvable' }, { status: 500 })
    }

    return NextResponse.json({ url: portal.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[stripe/portal]', message)
    // Configuration portail manquante dans le Dashboard
    if (message.toLowerCase().includes('customer portal') || message.includes('No configuration')) {
      return NextResponse.json(
        {
          error:
            'Le Customer Portal Stripe n’est pas encore activé. Active-le dans Dashboard → Settings → Billing → Customer portal.',
        },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
