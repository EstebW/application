import { createClient, type User } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getAuthUser(req: Request): Promise<User | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const jwt = authHeader.slice('Bearer '.length).trim()
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!jwt || jwt === anon) return null
  const url = Deno.env.get('SUPABASE_URL')
  if (!url || !anon) return null
  try {
    const client = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await client.auth.getUser(jwt)
    if (error || !data.user) return null
    return data.user
  } catch {
    return null
  }
}

function bindUserId(authUser: User | null, bodyUserId?: string): string | undefined {
  if (authUser?.id) return authUser.id
  return bodyUserId?.trim() || undefined
}

async function sessionHasHistory(
  db: ReturnType<typeof createClient>,
  sessionId: string
): Promise<boolean> {
  const [a, g] = await Promise.all([
    db.from('analyses').select('id', { count: 'exact', head: true }).eq('session_id', sessionId),
    db.from('generations').select('id', { count: 'exact', head: true }).eq('session_id', sessionId),
  ])
  return (a.count ?? 0) > 0 || (g.count ?? 0) > 0
}

const PLAN_CREDITS: Record<string, number> = { once: 1, weekly: 10, monthly: 40 }
const PLAN_CENTS: Record<string, number> = { once: 299, weekly: 599, monthly: 1299 }

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
  const normalizedEmail = email?.trim().toLowerCase() || null
  const nowIso = new Date().toISOString()

  if (userId) {
    const { data: owned } = await db
      .from('sessions')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (owned?.id) return owned.id as string

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
        return anon.id as string
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
    return (created?.id as string) ?? null
  }

  if (sessionId) {
    const { data } = await db
      .from('sessions')
      .select('id')
      .eq('id', sessionId)
      .maybeSingle()
    if (data?.id) return data.id as string
  }

  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const authUser = await getAuthUser(req)
    const body = await req.json() as {
      sessionId?: string
      generationId?: string
      method: string
      plan?: string
      userId?: string
      email?: string
    }

    const userId = bindUserId(authUser, body.userId)
    const email = authUser?.email ?? body.email
    const { sessionId, generationId, method, plan } = body

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
