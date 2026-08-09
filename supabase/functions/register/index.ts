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

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as Record<string, unknown>).message)
  }
  return String(err)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const authUser = await getAuthUser(req)
    if (!authUser?.id) {
      return new Response(
        JSON.stringify({ error: 'Connexion requise pour créer le compte' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json() as {
      sessionId?: string
      email?: string
      firstName?: string
      userId?: string
    }

    // JWT uniquement — ignorer body.userId (anti-IDOR)
    const userId = authUser.id
    const email = authUser.email ?? body.email
    const { sessionId, firstName } = body

    if (!email?.trim()) {
      return new Response(
        JSON.stringify({ error: 'email requis' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const normalizedEmail = email.trim().toLowerCase()
    if (!emailRegex.test(normalizedEmail)) {
      return new Response(
        JSON.stringify({ error: 'Email invalide' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    const name = firstName?.trim() || null
    const nowIso = new Date().toISOString()

    const { data: existing } = await db
      .from('sessions')
      .select('id, credits_balance, owned_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing?.id) {
      await db
        .from('sessions')
        .update({
          email: normalizedEmail,
          first_name: name,
          ...(!existing.owned_at ? { owned_at: nowIso } : {}),
        })
        .eq('id', existing.id)

      return new Response(
        JSON.stringify({
          success: true,
          sessionId: existing.id,
          creditsBalance: existing.credits_balance ?? 0,
        }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    if (sessionId) {
      const { data: current } = await db
        .from('sessions')
        .select('id, user_id')
        .eq('id', sessionId)
        .maybeSingle()

      if (current && !current.user_id) {
        const [a, g] = await Promise.all([
          db.from('analyses').select('id', { count: 'exact', head: true }).eq('session_id', sessionId),
          db.from('generations').select('id', { count: 'exact', head: true }).eq('session_id', sessionId),
        ])
        const dirty = (a.count ?? 0) > 0 || (g.count ?? 0) > 0

        if (!dirty) {
          await db
            .from('sessions')
            .update({
              email: normalizedEmail,
              first_name: name,
              user_id: userId,
              credits_balance: 0,
              owned_at: nowIso,
            })
            .eq('id', sessionId)

          return new Response(
            JSON.stringify({ success: true, sessionId, creditsBalance: 0 }),
            { headers: { ...CORS, 'Content-Type': 'application/json' } }
          )
        }
      }
    }

    const { data: created, error } = await db
      .from('sessions')
      .insert({
        email: normalizedEmail,
        first_name: name,
        user_id: userId,
        credits_balance: 0,
        owned_at: nowIso,
      })
      .select('id, credits_balance')
      .single()

    if (error || !created) {
      console.warn('[register] create session failed:', getErrorMessage(error))
      return new Response(
        JSON.stringify({ error: 'Impossible de créer la session compte' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        sessionId: created.id,
        creditsBalance: 0,
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = getErrorMessage(err)
    console.error('[register] Unexpected error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
