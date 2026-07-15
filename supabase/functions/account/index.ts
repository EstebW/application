import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type SessionRow = Record<string, unknown>

async function resolveSession(
  db: ReturnType<typeof createClient>,
  opts: { sessionId?: string; userId?: string; email?: string }
): Promise<SessionRow> {
  const { sessionId, userId, email } = opts

  // 1. Lien auth user → session (prioritaire pour un utilisateur connecté)
  if (userId) {
    const { data } = await db
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) return data
  }

  // 2. Session locale du parcours en cours
  if (sessionId) {
    const { data } = await db
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle()
    if (data) {
      if (userId && !data.user_id) {
        await db.from('sessions').update({ user_id: userId }).eq('id', sessionId)
        data.user_id = userId
      }
      return data
    }
  }

  // 3. Email (compte créé mais user_id pas encore lié)
  if (email?.trim()) {
    const normalized = email.trim().toLowerCase()
    const { data } = await db
      .from('sessions')
      .select('*')
      .eq('email', normalized)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) {
      if (userId && !data.user_id) {
        await db.from('sessions').update({ user_id: userId }).eq('id', data.id)
        data.user_id = userId
      }
      return data
    }
  }

  throw new Error('Compte introuvable')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const { sessionId, email, userId } = await req.json() as {
      sessionId?: string
      email?: string
      userId?: string
    }

    if (!sessionId && !email?.trim() && !userId) {
      throw new Error('sessionId, userId ou email requis')
    }

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    const session = await resolveSession(db, { sessionId, userId, email })
    const sid = session.id as string

    const [analysesRes, generationsRes, transactionsRes] = await Promise.all([
      db
        .from('analyses')
        .select('id, celebrity_name, score, traits, description, created_at')
        .eq('session_id', sid)
        .order('created_at', { ascending: false })
        .limit(20),
      db
        .from('generations')
        .select('id, celebrity_name, unlocked, scene_summary, created_at, analysis_id')
        .eq('session_id', sid)
        .order('created_at', { ascending: false })
        .limit(20),
      db
        .from('credit_transactions')
        .select('id, amount, reason, created_at')
        .eq('session_id', sid)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    return new Response(
      JSON.stringify({
        sessionId: sid,
        email: session.email,
        firstName: session.first_name,
        creditsBalance: session.credits_balance ?? 0,
        subscriptionPlan: session.subscription_plan,
        subscriptionExpiresAt: session.subscription_expires_at,
        analyses: analysesRes.data ?? [],
        generations: generationsRes.data ?? [],
        transactions: transactionsRes.error ? [] : (transactionsRes.data ?? []),
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
