import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { fulfillCheckoutSession } from '@/lib/stripe-fulfillment'

export const runtime = 'nodejs'

/** Après retour Checkout : vérifie le paiement Stripe et crédite (idempotent). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const checkoutSessionId = url.searchParams.get('session_id')?.trim()
    if (!checkoutSessionId?.startsWith('cs_')) {
      return NextResponse.json({ error: 'session_id Checkout invalide' }, { status: 400 })
    }

    const db = createServerClient()
    const result = await fulfillCheckoutSession(db, checkoutSessionId)

    return NextResponse.json({
      ok: true,
      alreadyFulfilled: result.alreadyFulfilled,
      creditsBalance: result.creditsBalance,
      creditsGranted: result.creditsGranted,
      plan: result.plan,
      sessionId: result.sessionId,
      paymentId: result.paymentId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[stripe/confirm]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
