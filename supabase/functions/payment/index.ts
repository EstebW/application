import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PLAN_CREDITS: Record<string, number> = { once: 1, weekly: 10, monthly: 40 }
const PLAN_CENTS: Record<string, number> = { once: 299, weekly: 599, monthly: 1299 }

function planExpiry(plan: string): string | null {
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const { sessionId, generationId, method, plan } = await req.json() as {
      sessionId: string
      generationId?: string
      method: string
      plan?: string
    }

    if (!sessionId) throw new Error('sessionId requis')

    const planId = plan && PLAN_CREDITS[plan] ? plan : 'once'
    const creditsGranted = PLAN_CREDITS[planId]
    const amountCents = PLAN_CENTS[planId]

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    const { data: payment, error } = await db
      .from('payments')
      .insert({
        session_id: sessionId,
        generation_id: generationId ?? null,
        amount_cents: amountCents,
        currency: 'EUR',
        method,
        plan: planId,
        credits_granted: creditsGranted,
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) throw error

    const { data: session } = await db
      .from('sessions')
      .select('credits_balance')
      .eq('id', sessionId)
      .single()

    const currentBalance = session?.credits_balance ?? 0
    const newBalance = currentBalance + creditsGranted

    await db.from('payments').update({ status: 'completed' }).eq('id', payment.id)

    const expiresAt = planExpiry(planId)
    await db
      .from('sessions')
      .update({
        credits_balance: newBalance,
        subscription_plan: planId === 'once' ? null : planId,
        subscription_expires_at: expiresAt,
      })
      .eq('id', sessionId)

    await db.from('credit_transactions').insert({
      session_id: sessionId,
      amount: creditsGranted,
      reason: 'payment',
      reference_id: payment.id,
    })

    if (generationId) {
      await db.from('generations').update({ unlocked: true }).eq('id', generationId)
    }

    return new Response(
      JSON.stringify({
        paymentId: payment.id,
        status: 'completed',
        creditsGranted,
        creditsBalance: newBalance,
        plan: planId,
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
