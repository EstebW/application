import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { PlanId } from '@/lib/plans'
import {
  getStripe,
  parsePlanId,
  planCents,
  planCredits,
  planFromPriceId,
} from '@/lib/stripe'

type Db = SupabaseClient<Database>

export type FulfillResult = {
  alreadyFulfilled: boolean
  paymentId: string
  sessionId: string
  plan: PlanId
  creditsGranted: number
  creditsBalance: number
}

async function sessionHasHistory(db: Db, sessionId: string): Promise<boolean> {
  const [a, g] = await Promise.all([
    db.from('analyses').select('id', { count: 'exact', head: true }).eq('session_id', sessionId),
    db.from('generations').select('id', { count: 'exact', head: true }).eq('session_id', sessionId),
  ])
  return (a.count ?? 0) > 0 || (g.count ?? 0) > 0
}

export async function resolveBillingSessionId(
  db: Db,
  opts: { sessionId?: string | null; userId?: string | null; email?: string | null }
): Promise<string | null> {
  const { sessionId, userId } = opts
  const normalizedEmail = opts.email?.trim().toLowerCase() || null
  const nowIso = new Date().toISOString()

  if (userId) {
    const { data: owned } = await db
      .from('sessions')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (owned?.id) return owned.id

    if (sessionId) {
      const { data: anon } = await db
        .from('sessions')
        .select('id, user_id')
        .eq('id', sessionId)
        .maybeSingle()
      if (anon?.id && !anon.user_id && !(await sessionHasHistory(db, sessionId))) {
        await db
          .from('sessions')
          .update({
            user_id: userId,
            owned_at: nowIso,
            credits_balance: 0,
            ...(normalizedEmail ? { email: normalizedEmail } : {}),
          })
          .eq('id', sessionId)
        return anon.id
      }
    }

    const { data: created } = await db
      .from('sessions')
      .insert({
        user_id: userId,
        email: normalizedEmail,
        credits_balance: 0,
        owned_at: nowIso,
      })
      .select('id')
      .single()
    return created?.id ?? null
  }

  if (sessionId) {
    const { data } = await db.from('sessions').select('id').eq('id', sessionId).maybeSingle()
    if (data?.id) return data.id
  }

  return null
}

function planExpiry(plan: PlanId): string | null {
  const now = new Date()
  if (plan === 'weekly') {
    now.setDate(now.getDate() + 7)
    return now.toISOString()
  }
  if (plan === 'monthly') {
    now.setMonth(now.getMonth() + 1)
    return now.toISOString()
  }
  return null
}

async function findExistingPayment(
  db: Db,
  opts: { checkoutSessionId?: string | null; invoiceId?: string | null }
) {
  if (opts.checkoutSessionId) {
    const { data } = await db
      .from('payments')
      .select('id, session_id, plan, credits_granted, status')
      .eq('stripe_checkout_session_id', opts.checkoutSessionId)
      .maybeSingle()
    if (data) return data
  }
  if (opts.invoiceId) {
    const { data } = await db
      .from('payments')
      .select('id, session_id, plan, credits_granted, status')
      .eq('stripe_invoice_id', opts.invoiceId)
      .maybeSingle()
    if (data) return data
  }
  return null
}

async function grantCredits(params: {
  db: Db
  billingSessionId: string
  plan: PlanId
  generationId?: string | null
  method: string
  stripeCheckoutSessionId?: string | null
  stripePaymentIntentId?: string | null
  stripeInvoiceId?: string | null
  stripeSubscriptionId?: string | null
  stripeCustomerId?: string | null
}): Promise<FulfillResult> {
  const {
    db,
    billingSessionId,
    plan,
    generationId,
    method,
    stripeCheckoutSessionId,
    stripePaymentIntentId,
    stripeInvoiceId,
    stripeSubscriptionId,
    stripeCustomerId,
  } = params

  const existing = await findExistingPayment(db, {
    checkoutSessionId: stripeCheckoutSessionId,
    invoiceId: stripeInvoiceId,
  })

  if (existing?.status === 'completed') {
    const { data: session } = await db
      .from('sessions')
      .select('credits_balance')
      .eq('id', existing.session_id)
      .single()
    return {
      alreadyFulfilled: true,
      paymentId: existing.id,
      sessionId: existing.session_id,
      plan: (parsePlanId(existing.plan) ?? plan),
      creditsGranted: existing.credits_granted ?? planCredits(plan),
      creditsBalance: session?.credits_balance ?? 0,
    }
  }

  const creditsGranted = planCredits(plan)
  const amountCents = planCents(plan)
  const generationUuid = generationId?.trim() || null

  const { data: payment, error: payErr } = await db
    .from('payments')
    .insert({
      session_id: billingSessionId,
      generation_id: generationUuid,
      amount_cents: amountCents,
      currency: 'EUR',
      method,
      plan,
      credits_granted: creditsGranted,
      status: 'completed',
      stripe_checkout_session_id: stripeCheckoutSessionId ?? null,
      stripe_payment_intent_id: stripePaymentIntentId ?? null,
      stripe_invoice_id: stripeInvoiceId ?? null,
      stripe_subscription_id: stripeSubscriptionId ?? null,
    })
    .select('id')
    .single()

  if (payErr) {
    // Race: another worker inserted first
    const raced = await findExistingPayment(db, {
      checkoutSessionId: stripeCheckoutSessionId,
      invoiceId: stripeInvoiceId,
    })
    if (raced?.status === 'completed') {
      const { data: session } = await db
        .from('sessions')
        .select('credits_balance')
        .eq('id', raced.session_id)
        .single()
      return {
        alreadyFulfilled: true,
        paymentId: raced.id,
        sessionId: raced.session_id,
        plan: parsePlanId(raced.plan) ?? plan,
        creditsGranted: raced.credits_granted ?? creditsGranted,
        creditsBalance: session?.credits_balance ?? 0,
      }
    }
    throw new Error(payErr.message)
  }

  const { data: session } = await db
    .from('sessions')
    .select('credits_balance')
    .eq('id', billingSessionId)
    .single()

  const currentBalance = session?.credits_balance ?? 0
  const newBalance = currentBalance + creditsGranted
  const expiresAt = planExpiry(plan)

  const sessionUpdate: Database['public']['Tables']['sessions']['Update'] = {
    credits_balance: newBalance,
    subscription_plan: plan === 'once' ? null : plan,
    subscription_expires_at: expiresAt,
  }
  if (stripeCustomerId) {
    sessionUpdate.stripe_customer_id = stripeCustomerId
  }

  await db.from('sessions').update(sessionUpdate).eq('id', billingSessionId)

  await db.from('credit_transactions').insert({
    session_id: billingSessionId,
    amount: creditsGranted,
    reason: 'payment',
    reference_id: payment.id,
  })

  if (generationUuid) {
    await db.from('generations').update({ unlocked: true }).eq('id', generationUuid)
  }

  return {
    alreadyFulfilled: false,
    paymentId: payment.id,
    sessionId: billingSessionId,
    plan,
    creditsGranted,
    creditsBalance: newBalance,
  }
}

function metaString(meta: Stripe.Metadata | null | undefined, key: string): string | null {
  const v = meta?.[key]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

async function resolvePlanFromCheckout(session: Stripe.Checkout.Session): Promise<PlanId> {
  const fromMeta = parsePlanId(session.metadata?.plan)
  if (fromMeta) return fromMeta

  const stripe = getStripe()
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 })
  const priceId = lineItems.data[0]?.price?.id
  const fromPrice = planFromPriceId(priceId)
  if (fromPrice) return fromPrice
  throw new Error('Impossible de déterminer le plan Stripe')
}

/** Crédite le compte après un Checkout Session payé (idempotent). */
export async function fulfillCheckoutSession(
  db: Db,
  checkoutSessionId: string
): Promise<FulfillResult> {
  const stripe = getStripe()
  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
    expand: ['line_items.data.price'],
  })

  if (session.status !== 'complete') {
    throw new Error('Paiement Stripe non confirmé')
  }
  if (session.mode === 'payment' && session.payment_status !== 'paid') {
    throw new Error('Paiement Stripe non confirmé')
  }

  const plan = await resolvePlanFromCheckout(session)
  const sessionId = metaString(session.metadata, 'sessionId') ?? session.client_reference_id
  const userId = metaString(session.metadata, 'userId')
  const email =
    metaString(session.metadata, 'email') ??
    session.customer_details?.email ??
    session.customer_email
  const generationId = metaString(session.metadata, 'generationId')

  const billingSessionId = await resolveBillingSessionId(db, { sessionId, userId, email })
  if (!billingSessionId) {
    throw new Error('Session introuvable pour créditer le compte')
  }

  const paymentIntent =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null
  const invoiceId =
    typeof session.invoice === 'string' ? session.invoice : session.invoice?.id ?? null
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id ?? null
  const customerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null

  return grantCredits({
    db,
    billingSessionId,
    plan,
    generationId,
    method: 'stripe',
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: paymentIntent,
    stripeInvoiceId: invoiceId,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: customerId,
  })
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription
  if (!sub) return null
  return typeof sub === 'string' ? sub : sub.id
}

function priceIdFromInvoice(invoice: Stripe.Invoice): string | null {
  for (const line of invoice.lines?.data ?? []) {
    const pricing = line.pricing
    const priceId =
      pricing && typeof pricing === 'object' && 'price_details' in pricing
        ? (pricing as { price_details?: { price?: string } }).price_details?.price
        : null
    if (priceId) return priceId
    // Compat anciens payloads webhook
    const legacy = (line as { price?: { id?: string } | string }).price
    if (typeof legacy === 'string') return legacy
    if (legacy?.id) return legacy.id
  }
  return null
}

/** Met à jour le statut d'abonnement local à partir d'un event Stripe Subscription. */
export async function syncSubscriptionStatus(
  db: Db,
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id ?? null
  if (!customerId) return

  const { data: sessions } = await db
    .from('sessions')
    .select('id')
    .eq('stripe_customer_id', customerId)

  if (!sessions?.length) return

  const plan =
    parsePlanId(subscription.metadata?.plan) ??
    planFromPriceId(subscription.items.data[0]?.price?.id)

  const itemPeriodEnd = subscription.items.data[0]?.current_period_end
  const periodEnd = itemPeriodEnd
    ? new Date(itemPeriodEnd * 1000).toISOString()
    : null

  const active =
    subscription.status === 'active' ||
    subscription.status === 'trialing' ||
    subscription.status === 'past_due'

  const update = {
    subscription_plan: active && plan && plan !== 'once' ? plan : null,
    subscription_expires_at: active ? periodEnd : null,
  }

  await db
    .from('sessions')
    .update(update)
    .in(
      'id',
      sessions.map((s) => s.id)
    )
}

/** Renouvellement d'abonnement (invoice.paid) — idempotent via invoice id. */
export async function fulfillPaidInvoice(db: Db, invoice: Stripe.Invoice): Promise<FulfillResult | null> {
  // Premier paiement déjà couvert par checkout.session.completed
  if (invoice.billing_reason === 'subscription_create') {
    return null
  }

  if (invoice.status !== 'paid') return null

  const subscriptionId = subscriptionIdFromInvoice(invoice)
  const subMeta = invoice.parent?.subscription_details?.metadata

  let plan = parsePlanId(invoice.metadata?.plan) ?? parsePlanId(subMeta?.plan)
  let sessionId = metaString(invoice.metadata, 'sessionId') ?? metaString(subMeta, 'sessionId')
  let userId = metaString(invoice.metadata, 'userId') ?? metaString(subMeta, 'userId')

  if (subscriptionId && (!plan || !sessionId)) {
    const stripe = getStripe()
    const sub = await stripe.subscriptions.retrieve(subscriptionId)
    plan = plan ?? parsePlanId(sub.metadata?.plan)
    sessionId = sessionId ?? metaString(sub.metadata, 'sessionId')
    userId = userId ?? metaString(sub.metadata, 'userId')
    if (!plan) {
      plan = planFromPriceId(sub.items.data[0]?.price?.id)
    }
  }

  if (!plan) {
    plan = planFromPriceId(priceIdFromInvoice(invoice))
  }

  if (!plan) {
    throw new Error(`Plan introuvable pour invoice ${invoice.id}`)
  }

  const email = invoice.customer_email
  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null

  const billingSessionId = await resolveBillingSessionId(db, { sessionId, userId, email })
  if (!billingSessionId) {
    throw new Error('Session introuvable pour renouvellement')
  }

  return grantCredits({
    db,
    billingSessionId,
    plan,
    method: 'stripe_renewal',
    stripeInvoiceId: invoice.id,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: customerId,
  })
}
