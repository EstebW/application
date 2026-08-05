import { createClient, type User } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type DbClient = ReturnType<typeof createClient>

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

type SessionRow = {
  id: string
  email?: string | null
  first_name?: string | null
  user_id?: string | null
  credits_balance?: number | null
  subscription_plan?: string | null
  subscription_expires_at?: string | null
  owned_at?: string | null
  height_cm?: number | null
  created_at?: string | null
  [key: string]: unknown
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as Record<string, unknown>).message)
  }
  return String(err)
}

async function sessionHasHistory(db: DbClient, sessionId: string): Promise<boolean> {
  const [a, g] = await Promise.all([
    db.from('analyses').select('id', { count: 'exact', head: true }).eq('session_id', sessionId),
    db.from('generations').select('id', { count: 'exact', head: true }).eq('session_id', sessionId),
  ])
  return (a.count ?? 0) > 0 || (g.count ?? 0) > 0
}

/**
 * Un compte auth = ses sessions uniquement.
 * Ne réclame jamais une session navigateur déjà remplie par d'autres parcours.
 */
async function resolveAccount(
  db: DbClient,
  opts: { sessionId?: string; userId?: string; email?: string }
): Promise<{ primary: SessionRow; sessionIds: string[]; creditsBalance: number; ownedAtBySession: Record<string, string> }> {
  const { sessionId, userId, email } = opts
  const normalizedEmail = email?.trim().toLowerCase() || null
  const nowIso = new Date().toISOString()

  if (userId) {
    const { data: owned } = await db
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    let sessions = (owned ?? []) as SessionRow[]

    // Ancrer owned_at sur les sessions déjà liées (masque l'historique pollué pré-lien)
    for (const s of sessions) {
      if (!s.owned_at) {
        await db.from('sessions').update({ owned_at: nowIso }).eq('id', s.id)
        s.owned_at = nowIso
      }
    }

    // Pas de session → créer une session propre (ne jamais hériter d'un historique navigateur)
    if (sessions.length === 0) {
      let createFromAnon = false
      if (sessionId) {
        const { data: anon } = await db
          .from('sessions')
          .select('*')
          .eq('id', sessionId)
          .maybeSingle()
        // Réclamer UNIQUEMENT une session vide et sans propriétaire
        if (anon && !anon.user_id && !(await sessionHasHistory(db, sessionId))) {
          await db
            .from('sessions')
            .update({
              user_id: userId,
              owned_at: nowIso,
              credits_balance: 0,
              ...(normalizedEmail ? { email: normalizedEmail } : {}),
            })
            .eq('id', sessionId)
          sessions = [{ ...(anon as SessionRow), user_id: userId, owned_at: nowIso, credits_balance: 0 }]
          createFromAnon = true
        }
      }

      if (!createFromAnon) {
        const { data: created, error } = await db
          .from('sessions')
          .insert({
            user_id: userId,
            email: normalizedEmail,
            credits_balance: 0,
            owned_at: nowIso,
          })
          .select('*')
          .single()
        if (error || !created) throw error ?? new Error('Impossible de créer la session')
        sessions = [created as SessionRow]
      }
    }

    const primary = sessions[0]
    const totalCredits = sessions.reduce((sum, s) => sum + (Number(s.credits_balance) || 0), 0)
    if (sessions.length > 1 && totalCredits !== (Number(primary.credits_balance) || 0)) {
      await db.from('sessions').update({ credits_balance: totalCredits }).eq('id', primary.id)
      const others = sessions.slice(1).map((s) => s.id)
      if (others.length) {
        await db.from('sessions').update({ credits_balance: 0 }).in('id', others)
      }
      primary.credits_balance = totalCredits
    }

    const ownedAtBySession: Record<string, string> = {}
    for (const s of sessions) {
      ownedAtBySession[s.id] = (s.owned_at as string) || nowIso
    }

    return {
      primary,
      sessionIds: sessions.map((s) => s.id),
      creditsBalance: totalCredits,
      ownedAtBySession,
    }
  }

  if (sessionId) {
    const { data } = await db.from('sessions').select('*').eq('id', sessionId).maybeSingle()
    if (data) {
      return {
        primary: data as SessionRow,
        sessionIds: [data.id as string],
        creditsBalance: Number(data.credits_balance) || 0,
        ownedAtBySession: { [data.id as string]: (data.created_at as string) || nowIso },
      }
    }
  }

  throw new Error('Compte introuvable')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const authUser = await getAuthUser(req)
    const body = await req.json() as {
      sessionId?: string
      email?: string
      userId?: string
    }

    const userId = bindUserId(authUser, body.userId)
    const email = authUser?.email ?? body.email
    // Si connecté : ignorer le sessionId navigateur (évite un historique étranger)
    const sessionId = userId ? undefined : body.sessionId

    if (!sessionId && !email?.trim() && !userId) {
      throw new Error('sessionId, userId ou email requis')
    }

    if (!userId && !sessionId) {
      throw new Error('Connexion requise')
    }

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    const { primary, sessionIds, creditsBalance, ownedAtBySession } = await resolveAccount(db, {
      sessionId,
      userId,
      email,
    })

    // Historique : uniquement les lignes de CE user, ou créées après la prise de possession
    let analysesQuery = db
      .from('analyses')
      .select('id, celebrity_name, score, traits, description, created_at, session_id, user_id')
      .order('created_at', { ascending: false })
      .limit(60)

    let generationsQuery = db
      .from('generations')
      .select('id, celebrity_name, unlocked, scene_summary, created_at, analysis_id, session_id, user_id')
      .order('created_at', { ascending: false })
      .limit(60)

    if (userId) {
      analysesQuery = analysesQuery.eq('user_id', userId)
      generationsQuery = generationsQuery.eq('user_id', userId)
    } else {
      analysesQuery = analysesQuery.in('session_id', sessionIds)
      generationsQuery = generationsQuery.in('session_id', sessionIds)
    }

    const [analysesRes, generationsRes, transactionsRes] = await Promise.all([
      analysesQuery,
      generationsQuery,
      db
        .from('credit_transactions')
        .select('id, amount, reason, created_at')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    // Fallback si la colonne user_id n'existe pas encore / lignes legacy :
    // filtrer par session + owned_at pour ne pas remonter l'historique partagé.
    let analyses = analysesRes.data ?? []
    let generations = generationsRes.data ?? []

    if (userId && analysesRes.error) {
      const { data } = await db
        .from('analyses')
        .select('id, celebrity_name, score, traits, description, created_at, session_id')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: false })
        .limit(60)
      analyses = (data ?? []).filter((a) => {
        const ownedAt = ownedAtBySession[a.session_id as string]
        return ownedAt ? new Date(a.created_at) >= new Date(ownedAt) : false
      })
    }

    if (userId && generationsRes.error) {
      const { data } = await db
        .from('generations')
        .select('id, celebrity_name, unlocked, scene_summary, created_at, analysis_id, session_id')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: false })
        .limit(60)
      generations = (data ?? []).filter((g) => {
        const ownedAt = ownedAtBySession[g.session_id as string]
        return ownedAt ? new Date(g.created_at) >= new Date(ownedAt) : false
      })
    }

    // Si user_id filtre OK mais 0 résultats, tenter aussi le filtre owned_at sur les sessions
    // (lignes legacy sans user_id) — uniquement post-owned_at
    if (userId && analyses.length === 0 && !analysesRes.error) {
      const { data } = await db
        .from('analyses')
        .select('id, celebrity_name, score, traits, description, created_at, session_id, user_id')
        .in('session_id', sessionIds)
        .is('user_id', null)
        .order('created_at', { ascending: false })
        .limit(60)
      analyses = (data ?? []).filter((a) => {
        const ownedAt = ownedAtBySession[a.session_id as string]
        return ownedAt ? new Date(a.created_at) >= new Date(ownedAt) : false
      })
    }

    if (userId && generations.length === 0 && !generationsRes.error) {
      const { data } = await db
        .from('generations')
        .select('id, celebrity_name, unlocked, scene_summary, created_at, analysis_id, session_id, user_id')
        .in('session_id', sessionIds)
        .is('user_id', null)
        .order('created_at', { ascending: false })
        .limit(60)
      generations = (data ?? []).filter((g) => {
        const ownedAt = ownedAtBySession[g.session_id as string]
        return ownedAt ? new Date(g.created_at) >= new Date(ownedAt) : false
      })
    }

    const seenGen = new Set<string>()
    generations = generations.filter((g) => {
      if (seenGen.has(g.id)) return false
      seenGen.add(g.id)
      return true
    })

    return new Response(
      JSON.stringify({
        sessionId: primary.id,
        email: primary.email,
        firstName: primary.first_name,
        creditsBalance,
        subscriptionPlan: primary.subscription_plan,
        subscriptionExpiresAt: primary.subscription_expires_at,
        // Prérempli le champ de taille du parcours « Choisis ta star ».
        // undefined tant que la colonne n'existe pas (migration non appliquée).
        heightCm: typeof primary.height_cm === 'number' ? primary.height_cm : null,
        analyses: analyses.map(({ session_id: _s, user_id: _u, ...rest }) => rest),
        generations: generations.map(({ session_id: _s, user_id: _u, ...rest }) => rest),
        transactions: transactionsRes.error ? [] : (transactionsRes.data ?? []),
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = getErrorMessage(err)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
