import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PLAN_CREDITS: Record<string, number> = { once: 1, weekly: 10, monthly: 40 }
const PLAN_CENTS: Record<string, number> = { once: 299, weekly: 599, monthly: 1299 }

/** Les erreurs Postgrest/Supabase sont des objets simples, pas des `Error` — sans
 *  ça, `err instanceof Error` échoue et masque le vrai message derrière "Erreur interne". */
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null) {
    const rec = err as Record<string, unknown>
    if (typeof rec.message === 'string' && rec.message) {
      const details = typeof rec.details === 'string' && rec.details ? ` — ${rec.details}` : ''
      const hint = typeof rec.hint === 'string' && rec.hint ? ` (hint: ${rec.hint})` : ''
      return `${rec.message}${details}${hint}`
    }
  }
  return String(err)
}

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

type DbClient = ReturnType<typeof createClient>

async function resolveBillingSessionId(
  db: DbClient,
  opts: { sessionId?: string; userId?: string; email?: string }
): Promise<string | null> {
  const { sessionId, userId, email } = opts

  if (userId) {
    const { data } = await db
      .from('sessions')
      .select('id')
      .eq('user_id', userId)
      .order('credits_balance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.id) return data.id as string
  }

  if (sessionId) {
    const { data } = await db
      .from('sessions')
      .select('id, user_id')
      .eq('id', sessionId)
      .maybeSingle()
    if (data?.id) {
      if (userId && !data.user_id) {
        await db.from('sessions').update({ user_id: userId }).eq('id', sessionId)
      }
      return data.id as string
    }
  }

  if (email?.trim()) {
    const normalized = email.trim().toLowerCase()
    const { data } = await db
      .from('sessions')
      .select('id, user_id')
      .eq('email', normalized)
      .order('credits_balance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.id) {
      if (userId && !data.user_id) {
        await db.from('sessions').update({ user_id: userId }).eq('id', data.id)
      }
      return data.id as string
    }
  }

  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const { sessionId, generationId, method, plan, userId, email } = await req.json() as {
      sessionId?: string
      generationId?: string
      method: string
      plan?: string
      userId?: string
      email?: string
    }

    if (!sessionId && !userId && !email?.trim()) {
      throw new Error('sessionId, userId ou email requis')
    }

    const planId = plan && PLAN_CREDITS[plan] ? plan : 'once'
    const creditsGranted = PLAN_CREDITS[planId]
    const amountCents = PLAN_CENTS[planId]

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    const billingSessionId = await resolveBillingSessionId(db, { sessionId, userId, email })
    if (!billingSessionId) {
      throw new Error('Session introuvable pour créditer le compte')
    }

    // generationId est souvent une chaîne vide (payé AVANT toute génération) —
    // "" n'est pas un UUID valide pour Postgres, donc on la traite comme absente.
    const generationUuid = generationId?.trim() ? generationId.trim() : null

    const { data: payment, error } = await db
      .from('payments')
      .insert({
        session_id: billingSessionId,
        generation_id: generationUuid,
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
      .eq('id', billingSessionId)
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
      .eq('id', billingSessionId)

    await db.from('credit_transactions').insert({
      session_id: billingSessionId,
      amount: creditsGranted,
      reason: 'payment',
      reference_id: payment.id,
    })

    if (generationUuid) {
      await db.from('generations').update({ unlocked: true }).eq('id', generationUuid)
    }

    return new Response(
      JSON.stringify({
        paymentId: payment.id,
        status: 'completed',
        creditsGranted,
        creditsBalance: newBalance,
        plan: planId,
        sessionId: billingSessionId,
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = getErrorMessage(err)
    console.error('[payment]', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
