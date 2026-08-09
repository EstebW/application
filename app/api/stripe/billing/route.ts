import { NextResponse } from 'next/server'
import { getRequestAuthUser } from '@/lib/auth-request'
import { createServerClient } from '@/lib/supabase'
import {
  getStripe,
  parsePlanId,
  planCents,
  planCredits,
  planFromPriceId,
} from '@/lib/stripe'
import type { StripeBillingSummary } from '@/lib/stripe-billing'

export const runtime = 'nodejs'

export type { StripeBillingSummary }

async function resolveStripeCustomerId(
  userId: string,
  sessionId?: string | null
): Promise<string | null> {
  const db = createServerClient()

  const { data } = await db
    .from('sessions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .not('stripe_customer_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (data?.stripe_customer_id) return data.stripe_customer_id

  if (sessionId) {
    const { data: sess } = await db
      .from('sessions')
      .select('stripe_customer_id, user_id')
      .eq('id', sessionId)
      .maybeSingle()
    if (sess?.user_id === userId && sess.stripe_customer_id) {
      return sess.stripe_customer_id
    }
  }

  return null
}

/** Résumé abonnement Stripe live (pas un faux état local). */
export async function GET(req: Request) {
  try {
    const authUser = await getRequestAuthUser(req)
    if (!authUser?.id) {
      return NextResponse.json({ error: 'Connexion requise' }, { status: 401 })
    }

    const url = new URL(req.url)
    const sessionId = url.searchParams.get('sessionId')
    const userId = authUser.id

    const customerId = await resolveStripeCustomerId(userId, sessionId)
    if (!customerId) {
      const empty: StripeBillingSummary = {
        hasStripeCustomer: false,
        stripeCustomerId: null,
        subscription: null,
      }
      return NextResponse.json(empty)
    }

    const stripe = getStripe()
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 5,
      expand: ['data.items.data.price'],
    })

    const active =
      subs.data.find((s) => s.status === 'active' || s.status === 'trialing') ??
      subs.data.find((s) => s.status === 'past_due') ??
      null

    if (!active) {
      const summary: StripeBillingSummary = {
        hasStripeCustomer: true,
        stripeCustomerId: customerId,
        subscription: null,
      }
      return NextResponse.json(summary)
    }

    const price = active.items.data[0]?.price
    const priceId = typeof price === 'string' ? price : price?.id
    const plan =
      parsePlanId(active.metadata?.plan) ??
      planFromPriceId(priceId) ??
      null

    const unitAmount =
      typeof price === 'object' && price && 'unit_amount' in price
        ? price.unit_amount
        : plan
          ? planCents(plan)
          : null

    let interval: StripeBillingSummary['subscription'] extends null
      ? never
      : NonNullable<StripeBillingSummary['subscription']>['interval'] = null
    const rawInterval =
      typeof price === 'object' && price?.recurring?.interval
        ? String(price.recurring.interval)
        : plan === 'weekly'
          ? 'week'
          : plan === 'monthly'
            ? 'month'
            : null
    if (
      rawInterval === 'week' ||
      rawInterval === 'month' ||
      rawInterval === 'year' ||
      rawInterval === 'day'
    ) {
      interval = rawInterval
    }

    // API récente : current_period_end est sur l'item, plus sur la subscription
    const itemPeriodEnd = active.items.data[0]?.current_period_end
    const periodEnd = itemPeriodEnd
      ? new Date(itemPeriodEnd * 1000).toISOString()
      : null

    const summary: StripeBillingSummary = {
      hasStripeCustomer: true,
      stripeCustomerId: customerId,
      subscription: {
        id: active.id,
        status: active.status,
        plan,
        priceCents: unitAmount ?? null,
        currency: (typeof price === 'object' && price?.currency) || 'eur',
        interval,
        creditsPerPeriod: plan ? planCredits(plan) : null,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: Boolean(active.cancel_at_period_end),
      },
    }

    return NextResponse.json(summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[stripe/billing]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
