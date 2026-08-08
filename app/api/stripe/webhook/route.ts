import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase'
import { getStripe } from '@/lib/stripe'
import {
  fulfillCheckoutSession,
  fulfillPaidInvoice,
  syncSubscriptionStatus,
} from '@/lib/stripe-fulfillment'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const stripe = getStripe()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!webhookSecret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET manquant')
    return NextResponse.json({ error: 'Webhook non configuré' }, { status: 500 })
  }

  const body = await req.text()
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Signature manquante' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[stripe/webhook] signature', message)
    return NextResponse.json({ error: `Signature invalide: ${message}` }, { status: 400 })
  }

  const db = createServerClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.status === 'complete') {
          await fulfillCheckoutSession(db, session.id)
        }
        break
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        await fulfillPaidInvoice(db, invoice)
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await syncSubscriptionStatus(db, subscription)
        break
      }
      case 'invoice.payment_failed': {
        // Soft-fail : on logue ; Smart Retries Stripe gère les relances.
        const invoice = event.data.object as Stripe.Invoice
        console.warn('[stripe/webhook] invoice.payment_failed', invoice.id)
        break
      }
      default:
        break
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[stripe/webhook] ${event.type}`, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
