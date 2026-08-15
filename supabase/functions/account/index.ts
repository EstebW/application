import { createClient, type User } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type DbClient = ReturnType<typeof createClient>

// Rôles — inlinés (le deploy Dashboard n'inclut pas ../_shared)
type AppRole = 'user' | 'admin' | 'super_admin'
const APP_ROLES = new Set<string>(['user', 'admin', 'super_admin'])

function normalizeAppRole(value: unknown): AppRole {
  return typeof value === 'string' && APP_ROLES.has(value) ? (value as AppRole) : 'user'
}

function hasUnlimitedAccess(role: AppRole | null | undefined): boolean {
  return role === 'super_admin'
}

/** Résout le rôle depuis user_roles pour un JWT vérifié — jamais depuis le body client. */
async function resolveAppRole(db: DbClient, authUserId: string | null | undefined): Promise<AppRole> {
  if (!authUserId) return 'user'
  try {
    const { data, error } = await db
      .from('user_roles')
      .select('role')
      .eq('user_id', authUserId)
      .maybeSingle()
    if (error || !data) return 'user'
    return normalizeAppRole((data as { role?: string | null }).role)
  } catch {
    return 'user'
  }
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

type SessionRow = {
  id: string
  email?: string | null
  first_name?: string | null
  user_id?: string | null
  credits_balance?: number | null
  subscription_plan?: string | null
  subscription_expires_at?: string | null
  stripe_customer_id?: string | null
  owned_at?: string | null
  height_cm?: number | null
  created_at?: string | null
  [key: string]: unknown
}

function formatCelebrityName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((part) => {
      const lower = part.toLowerCase()
      if (['de', 'du', 'des', 'la', 'le', 'van', 'von', 'da', 'di'].includes(lower)) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
    .replace(/^([a-z])/, (c) => c.toUpperCase())
}

function paymentLabel(plan: string | null | undefined, amount: number): string {
  if (plan === 'weekly') return 'Abonnement hebdomadaire'
  if (plan === 'monthly') return 'Abonnement mensuel'
  if (plan === 'once') return 'Achat One Shot'
  if (amount === 10) return 'Abonnement hebdomadaire'
  if (amount === 40) return 'Abonnement mensuel'
  if (amount === 1) return 'Achat One Shot'
  return 'Achat de crédits'
}

const MAX_PROFILE_NAME = 40

function normalizeProfileName(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') throw new Error('Nom invalide')
  const name = value.replace(/\s+/g, ' ').trim()
  if (!name) return null
  if (name.length > MAX_PROFILE_NAME) {
    throw new Error(`Le nom doit faire au plus ${MAX_PROFILE_NAME} caractères`)
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) throw new Error('Nom invalide')
  return name
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
      action?: string
      firstName?: string
    }

    // Anti-IDOR : un userId/email dans le body sans JWT valide est refusé.
    if ((body.userId || body.email) && !authUser?.id) {
      return new Response(
        JSON.stringify({ error: 'Connexion requise' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Compte auth : uniquement l’id JWT. Anonyme : sessionId seul.
    const userId = authUser?.id
    const email = authUser?.email ?? undefined
    const sessionId = userId ? undefined : body.sessionId?.trim()

    if (!sessionId && !userId) {
      return new Response(
        JSON.stringify({ error: 'sessionId ou connexion requis' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    if (body.action === 'updateProfile') {
      if (!authUser?.id) {
        return new Response(
          JSON.stringify({ error: 'Connexion requise' }),
          { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }
      let firstName: string | null
      try {
        firstName = normalizeProfileName(body.firstName)
      } catch (err) {
        return new Response(
          JSON.stringify({ error: getErrorMessage(err) }),
          { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }
      const { error: updateErr } = await db
        .from('sessions')
        .update({ first_name: firstName })
        .eq('user_id', authUser.id)
      if (updateErr) {
        console.warn('[account] updateProfile failed:', getErrorMessage(updateErr))
        return new Response(
          JSON.stringify({ error: 'Impossible d’enregistrer le nom' }),
          { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }
      return new Response(
        JSON.stringify({ success: true, firstName }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const { primary, sessionIds, creditsBalance, ownedAtBySession } = await resolveAccount(db, {
      sessionId,
      userId,
      email,
    })

    // Rôle uniquement depuis le JWT vérifié — jamais depuis body.role / body.userId seul
    const appRole = await resolveAppRole(db, authUser?.id)
    const unlimitedAccess = hasUnlimitedAccess(appRole)

    // Historique : uniquement les lignes de CE user, ou créées après la prise de possession
    let analysesQuery = db
      .from('analyses')
      .select('id, celebrity_name, score, traits, description, created_at, session_id, user_id')
      .order('created_at', { ascending: false })
      .limit(60)

    let generationsQuery = db
      .from('generations')
      .select('id, celebrity_name, unlocked, scene_summary, created_at, analysis_id, session_id, user_id, creation_mode')
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
        .select('id, amount, reason, created_at, reference_id')
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

    const rawTx = transactionsRes.error ? [] : (transactionsRes.data ?? [])
    const paymentIds = rawTx
      .filter((t) => t.reason === 'payment' && t.reference_id)
      .map((t) => t.reference_id as string)
    const generationIds = rawTx
      .filter((t) => t.reason === 'generation' && t.reference_id)
      .map((t) => t.reference_id as string)

    const paymentPlanById = new Map<string, string | null>()
    const generationNameById = new Map<string, string>()

    if (paymentIds.length > 0) {
      const { data: pays } = await db.from('payments').select('id, plan').in('id', paymentIds)
      for (const p of pays ?? []) {
        paymentPlanById.set(p.id as string, (p.plan as string | null) ?? null)
      }
    }

    if (generationIds.length > 0) {
      const { data: gens } = await db
        .from('generations')
        .select('id, celebrity_name')
        .in('id', generationIds)
      for (const g of gens ?? []) {
        if (g.celebrity_name) {
          generationNameById.set(g.id as string, formatCelebrityName(g.celebrity_name as string))
        }
      }
    }

    // Aussi index les générations déjà chargées (même sans reference match)
    for (const g of generations) {
      if (g.id && g.celebrity_name) {
        generationNameById.set(g.id as string, formatCelebrityName(g.celebrity_name as string))
      }
    }

    const transactions = rawTx.map((t) => {
      let label = 'Mouvement'
      if (t.reason === 'payment') {
        label = paymentLabel(
          t.reference_id ? paymentPlanById.get(t.reference_id as string) : null,
          Number(t.amount) || 0
        )
      } else if (t.reason === 'generation') {
        const name = t.reference_id
          ? generationNameById.get(t.reference_id as string)
          : undefined
        label = name ? `Photo avec ${name}` : 'Photo générée'
      } else if (t.reason === 'refund') {
        label = 'Remboursement'
      } else if (t.reason === 'bonus') {
        label = 'Bonus'
      } else {
        label = String(t.reason)
      }
      return {
        id: t.id,
        amount: t.amount,
        reason: t.reason,
        created_at: t.created_at,
        reference_id: t.reference_id ?? null,
        label,
      }
    })

    return new Response(
      JSON.stringify({
        sessionId: primary.id,
        email: primary.email,
        firstName: primary.first_name,
        creditsBalance,
        subscriptionPlan: primary.subscription_plan,
        subscriptionExpiresAt: primary.subscription_expires_at,
        stripeCustomerId: (primary.stripe_customer_id as string | null | undefined) ?? null,
        // Prérempli le champ de taille du parcours « Choisis ta star ».
        // undefined tant que la colonne n'existe pas (migration non appliquée).
        heightCm: typeof primary.height_cm === 'number' ? primary.height_cm : null,
        role: appRole,
        hasUnlimitedAccess: unlimitedAccess,
        analyses: analyses.map(({ session_id: _s, user_id: _u, ...rest }) => ({
          ...rest,
          celebrity_name: formatCelebrityName(String(rest.celebrity_name ?? '')),
        })),
        generations: generations.map(({ session_id: _s, user_id: _u, ...rest }) => ({
          ...rest,
          celebrity_name: formatCelebrityName(String(rest.celebrity_name ?? '')),
          creation_mode: (rest as { creation_mode?: string | null }).creation_mode ?? null,
        })),
        transactions,
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
