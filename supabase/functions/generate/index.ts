import { createClient, type User } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Rôles — inlinés (le deploy Dashboard n'inclut pas ../_shared)
type AppRole = 'user' | 'admin' | 'super_admin'
const APP_ROLES = new Set<string>(['user', 'admin', 'super_admin'])

function normalizeAppRole(value: unknown): AppRole {
  return typeof value === 'string' && APP_ROLES.has(value) ? (value as AppRole) : 'user'
}

function hasUnlimitedAccess(role: AppRole | null | undefined): boolean {
  return role === 'super_admin'
}

async function resolveAppRole(
  db: ReturnType<typeof createClient>,
  authUserId: string | null | undefined,
): Promise<AppRole> {
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

const KIE_API_BASE = 'https://api.kie.ai'
const KIE_FILE_API_BASE = 'https://kieai.redpandaai.co'
const POLL_INTERVAL_MS = 3000
/** Nano Banana dépasse souvent 90s ; un abort trop tôt affiche une erreur alors que la photo est prête. */
const POLL_TIMEOUT_MS = 300_000
const GENERATION_CREDIT_COST = 1
const COMPOSITION_MODEL = 'gemini-3-flash'
const COMPOSITION_ENDPOINT = '/gemini-3-flash/v1/chat/completions'
const COMPOSITION_TEMPERATURE = 0.2
const TEMP_SIGNED_URL_TTL_SEC = 300
const PHOTO_EDIT_PROMPT_MAX_CHARS = 5000

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

function buildSceneSummary(ctx: PhotoGenerationContext): string {
  if (ctx.creationMode === 'photo_edit') {
    return ['Star ajoutée à ma photo', ctx.interaction, ctx.customPrompt]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 200)
  }
  if (ctx.mode === 'custom' && ctx.customPrompt) {
    return ctx.customPrompt.slice(0, 200)
  }
  if (ctx.scene) {
    return [ctx.scene.location, ctx.scene.outfits, ctx.scene.position]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 200)
  }
  return ''
}

function stripDataUrl(base64: string) {
  return base64.replace(/^data:image\/\w+;base64,/, '')
}

function getMime(base64: string) {
  if (base64.startsWith('data:image/png')) return 'image/png'
  if (base64.startsWith('data:image/webp')) return 'image/webp'
  return 'image/jpeg'
}

function toDataUrl(base64: string): string {
  if (base64.startsWith('data:')) return base64
  return `data:${getMime(base64)};base64,${stripDataUrl(base64)}`
}

function getExt(mime: string) {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

interface PhotoScene {
  location: string
  outfits: string
  position: string
}

/** Doit rester aligné sur CelebrityCreationMode dans lib/types.ts.
 *  Absent = 'full_generation' (générations historiques et parcours « jumeau célèbre »). */
type CelebrityCreationMode = 'full_generation' | 'photo_edit'
type SceneSource = 'invented' | 'user_photo'

/** Doit rester aligné sur CelebrityHeightConfidence dans lib/height.ts. */
type CelebrityHeightConfidence = 'verified' | 'probable' | 'unknown'

interface PhotoGenerationContext {
  celebrityName: string
  celebrityDomain: string
  celebrityStyleDescription?: string
  traits?: string[]
  funFact?: string
  mode: 'presets' | 'custom'
  creationMode?: CelebrityCreationMode
  sceneSource?: SceneSource
  scene?: PhotoScene
  customPrompt?: string
  interaction?: string
  hasCelebrityReferenceImage?: boolean
  /** photo_edit : placement précis issu de l'analyse de composition */
  celebrityPlacementInstruction?: string
  /** photo_edit : celebrityHeightCm / userHeightCm lorsque les deux tailles sont connues */
  celebrityTargetApparentHeightRatio?: number
  /** Parcours « Choisis ta star » uniquement — absent = aucune contrainte de taille */
  userHeightCm?: number
  celebrityHeightCm?: number | null
  celebrityHeightConfidence?: CelebrityHeightConfidence
}

/** Doit rester aligné sur lib/interactions.ts. */
const INTERACTION_PROMPTS: Record<string, string> = {
  selfie: 'both looking at the phone camera as if taking a selfie together, heads close',
  side_by_side: 'standing casually side by side, close enough to look like they are together',
  arm_shoulder: 'the celebrity resting one arm loosely over the user\'s shoulder in a friendly way',
  seated: 'both seated next to each other, relaxed posture',
  candid: 'a candid unposed moment, neither of them fully facing the camera',
}

function getInteractionPrompt(id?: string): string | undefined {
  if (!id) return undefined
  return INTERACTION_PROMPTS[id]
}

function sanitizeSceneText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

// ── Tailles ───────────────────────────────────────────────────────────────────
// Doit rester aligné sur lib/height.ts et lib/celebrity-height.ts.
// Deno ne peut pas importer lib/, la logique est dupliquée à l'identique.

const MIN_USER_HEIGHT_CM = 120
const MAX_USER_HEIGHT_CM = 220
const MIN_CELEBRITY_HEIGHT_CM = 120
const MAX_CELEBRITY_HEIGHT_CM = 260
const HEIGHT_SOURCES_TOLERANCE_CM = 2
const HEIGHT_LOOKUP_TIMEOUT_MS = 4000
const HEIGHT_MEMORY_TTL_MS = 30 * 60 * 1000
const HEIGHT_RETRY_UNKNOWN_AFTER_MS = 7 * 24 * 60 * 60 * 1000
const HEIGHT_MAX_LOOKUP_ATTEMPTS = 3
const HEIGHT_UA = 'StarFusion/1.0 (https://starfusion.app; celebrity height lookup)'

interface CelebrityHeight {
  celebrityId: string
  heightCm: number | null
  sourceUrl: string | null
  verifiedAt: string | null
  confidence: CelebrityHeightConfidence
}

interface HeightCandidate {
  heightCm: number
  sourceUrl: string
  confidence: 'verified' | 'probable'
}

const heightMemoryCache = new Map<string, { value: CelebrityHeight; expiresAt: number }>()

function unknownCelebrityHeight(celebrityId: string): CelebrityHeight {
  return { celebrityId, heightCm: null, sourceUrl: null, verifiedAt: null, confidence: 'unknown' }
}

function celebrityIdFromName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function isValidUserHeightCm(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_USER_HEIGHT_CM &&
    value <= MAX_USER_HEIGHT_CM
  )
}

function normalizeCelebrityHeightCm(value: number): number | null {
  if (!Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded < MIN_CELEBRITY_HEIGHT_CM || rounded > MAX_CELEBRITY_HEIGHT_CM) return null
  return rounded
}

function feetInchesToCm(feet: number, inches = 0): number {
  return feet * 30.48 + inches * 2.54
}

function extractHeightsFromText(text: string): number[] {
  const found: number[] = []
  const push = (cm: number | null) => {
    if (cm !== null && !found.includes(cm)) found.push(cm)
  }

  for (const m of Array.from(text.matchAll(/(\d)[.,](\d{2})\s?(?:m\b|m[eè]tres?\b)/gi))) {
    push(normalizeCelebrityHeightCm(Number(`${m[1]}.${m[2]}`) * 100))
  }
  for (const m of Array.from(text.matchAll(/(\d{3})\s?(?:cm\b|centim[eè]tres?\b)/gi))) {
    push(normalizeCelebrityHeightCm(Number(m[1])))
  }
  for (const m of Array.from(text.matchAll(
    /(\d)\s?(?:ft\b|feet\b|foot\b|['’′])\s?(\d{1,2})?\s?(?:in\b|inch(?:es)?\b|["”″])?/gi
  ))) {
    const inches = m[2] ? Number(m[2]) : 0
    if (inches > 11) continue
    push(normalizeCelebrityHeightCm(feetInchesToCm(Number(m[1]), inches)))
  }

  return found
}

function reconcileHeightCandidates(
  celebrityId: string,
  candidates: HeightCandidate[],
  now: Date = new Date()
): CelebrityHeight {
  const valid = candidates.filter((c) => normalizeCelebrityHeightCm(c.heightCm) !== null)
  if (valid.length === 0) return unknownCelebrityHeight(celebrityId)

  const ranked = [...valid].sort((a, b) =>
    a.confidence === b.confidence ? 0 : a.confidence === 'verified' ? -1 : 1
  )
  const best = ranked[0]
  const heightCm = normalizeCelebrityHeightCm(best.heightCm) as number

  const conflicting = ranked
    .slice(1)
    .some((c) => Math.abs((normalizeCelebrityHeightCm(c.heightCm) as number) - heightCm) > HEIGHT_SOURCES_TOLERANCE_CM)

  return {
    celebrityId,
    heightCm,
    sourceUrl: best.sourceUrl,
    verifiedAt: now.toISOString(),
    confidence: conflicting ? 'probable' : best.confidence,
  }
}

function logHeightEvent(event: string, payload: Record<string, unknown>) {
  console.log(`[celebrity-height] ${event}`, JSON.stringify(payload))
}

/** Panne de transport (réseau, timeout, 429 Wikimedia) — à ne pas confondre
 *  avec « la célébrité n'a pas de taille connue ». */
class HeightLookupTransportError extends Error {}

async function fetchHeightJson<T>(url: string, signal: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': HEIGHT_UA },
      signal,
    })
  } catch (err) {
    throw new HeightLookupTransportError(err instanceof Error ? err.message : 'fetch failed')
  }
  if (!res.ok) throw new HeightLookupTransportError(`HTTP ${res.status}`)
  return await res.json() as T
}

const WIKIDATA_UNITS_TO_CM: Record<string, number> = {
  Q11573: 100,
  Q174728: 1,
  Q174789: 0.1,
  Q3710: 30.48,
  Q218593: 2.54,
}

type WikidataClaim = {
  mainsnak?: { datavalue?: { value?: { amount?: string; unit?: string; id?: string } } }
}

function heightFromClaim(claim: WikidataClaim): number | null {
  const value = claim.mainsnak?.datavalue?.value
  if (!value?.amount || !value.unit) return null
  const amount = Number(value.amount)
  if (!Number.isFinite(amount)) return null
  const unitId = value.unit.split('/').pop() ?? ''
  const factor = WIKIDATA_UNITS_TO_CM[unitId]
  if (!factor) return null
  return normalizeCelebrityHeightCm(amount * factor)
}

async function fetchWikidataHeight(name: string, signal: AbortSignal): Promise<HeightCandidate | null> {
  const searchLang = async (lang: string): Promise<string[]> => {
    const searchUrl =
      'https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&limit=3' +
      `&language=${lang}&uselang=${lang}&search=${encodeURIComponent(name)}`
    const search = await fetchHeightJson<{ search?: { id?: string }[] }>(searchUrl, signal)
    return (search.search ?? []).map((s) => s.id).filter((id): id is string => Boolean(id))
  }

  let ids = await searchLang('fr')
  if (ids.length === 0) ids = await searchLang('en')
  if (ids.length === 0) return null

  const entitiesUrl =
    'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims' +
    `&ids=${ids.join('|')}`
  const entities = await fetchHeightJson<{
    entities?: Record<string, { claims?: Record<string, WikidataClaim[]> }>
  }>(entitiesUrl, signal)
  if (!entities.entities) return null

  for (const id of ids) {
    const claims = entities.entities[id]?.claims
    if (!claims) continue
    const isHuman = (claims.P31 ?? []).some((c) => c.mainsnak?.datavalue?.value?.id === 'Q5')
    if (!isHuman) continue

    for (const claim of claims.P2048 ?? []) {
      const heightCm = heightFromClaim(claim)
      if (heightCm !== null) {
        return {
          heightCm,
          sourceUrl: `https://www.wikidata.org/wiki/${id}#P2048`,
          confidence: 'verified',
        }
      }
    }
  }

  return null
}

async function fetchWikipediaHeight(
  lang: 'fr' | 'en',
  name: string,
  signal: AbortSignal
): Promise<HeightCandidate | null> {
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=extracts` +
    `&explaintext=1&exintro=1&redirects=1&titles=${encodeURIComponent(name)}`
  const data = await fetchHeightJson<{
    query?: { pages?: Record<string, { title?: string; extract?: string }> }
  }>(url, signal)
  const pages = data.query?.pages
  if (!pages) return null

  for (const page of Object.values(pages)) {
    const extract = page.extract
    if (!extract) continue
    const candidates = extractHeightsFromText(extract)
    if (candidates.length !== 1) continue
    return {
      heightCm: candidates[0],
      sourceUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title ?? name)}`,
      confidence: 'probable',
    }
  }

  return null
}

type HeightRow = {
  celebrity_id: string
  height_cm: number | null
  source_url: string | null
  verified_at: string | null
  confidence: CelebrityHeightConfidence
  manual_override: boolean
  lookup_attempts: number
  last_attempt_at: string | null
}

function shouldRetryHeightLookup(row: HeightRow): boolean {
  if (row.manual_override) return false
  if (row.height_cm !== null) return false
  if (row.lookup_attempts >= HEIGHT_MAX_LOOKUP_ATTEMPTS) return false
  if (!row.last_attempt_at) return true
  return Date.now() - new Date(row.last_attempt_at).getTime() > HEIGHT_RETRY_UNKNOWN_AFTER_MS
}

/**
 * Taille de la célébrité, résolue côté serveur à partir de son identifiant.
 * Ne jette jamais : une taille introuvable laisse la génération continuer avec
 * une contrainte de proportions plus souple.
 */
async function resolveCelebrityHeight(db: DbClient, celebrityName: string): Promise<CelebrityHeight> {
  const celebrityId = celebrityIdFromName(celebrityName)
  if (!celebrityId) return unknownCelebrityHeight('')

  const cached = heightMemoryCache.get(celebrityId)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  let attempts = 0
  try {
    const { data } = await db
      .from('celebrity_heights')
      .select('celebrity_id, height_cm, source_url, verified_at, confidence, manual_override, lookup_attempts, last_attempt_at')
      .eq('celebrity_id', celebrityId)
      .maybeSingle()
    const row = data as HeightRow | null
    if (row) {
      attempts = row.lookup_attempts
      if (!shouldRetryHeightLookup(row)) {
        const value: CelebrityHeight = {
          celebrityId: row.celebrity_id,
          heightCm: row.height_cm,
          sourceUrl: row.source_url,
          verifiedAt: row.verified_at,
          confidence: row.confidence,
        }
        heightMemoryCache.set(celebrityId, { value, expiresAt: Date.now() + HEIGHT_MEMORY_TTL_MS })
        if (value.heightCm === null) logHeightEvent('missing_cached', { celebrityId, attempts })
        return value
      }
    }
  } catch (err) {
    // Table absente (migration pas encore appliquée) → on cherche quand même.
    logHeightEvent('cache_read_failed', { celebrityId, error: getErrorMessage(err) })
  }

  if (Deno.env.get('CELEBRITY_HEIGHT_LOOKUP_DISABLED')?.trim() === '1') {
    return unknownCelebrityHeight(celebrityId)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEIGHT_LOOKUP_TIMEOUT_MS)
  let resolved: CelebrityHeight
  let transportFailed = false
  try {
    // Recherche étagée : Wikidata est structuré et fait autorité. On n'interroge
    // Wikipédia (et on ne recoupe FR/EN) que s'il ne renvoie rien — inutile de
    // multiplier les requêtes vers Wikimedia, qui limite les appels rapprochés.
    const candidates: HeightCandidate[] = []
    const wikidata = await fetchWikidataHeight(celebrityName, controller.signal)
    if (wikidata) {
      candidates.push(wikidata)
    } else {
      const [wikiFr, wikiEn] = await Promise.all([
        fetchWikipediaHeight('fr', celebrityName, controller.signal),
        fetchWikipediaHeight('en', celebrityName, controller.signal),
      ])
      for (const c of [wikiFr, wikiEn]) if (c) candidates.push(c)
    }

    resolved = reconcileHeightCandidates(celebrityId, candidates)

    if (candidates.length > 1) {
      const values = candidates.map((c) => c.heightCm)
      const spread = Math.max(...values) - Math.min(...values)
      if (spread > HEIGHT_SOURCES_TOLERANCE_CM) {
        logHeightEvent('sources_conflict', { celebrityId, spread, values })
      }
    }
  } catch (err) {
    transportFailed = true
    resolved = unknownCelebrityHeight(celebrityId)
    logHeightEvent('lookup_transport_error', { celebrityId, error: getErrorMessage(err) })
  } finally {
    clearTimeout(timer)
  }

  // Une panne réseau ne doit pas figer un « taille inconnue » dans le cache :
  // la prochaine génération refera la recherche.
  if (transportFailed) return resolved

  if (resolved.heightCm === null) {
    logHeightEvent('lookup_failed', { celebrityId, celebrityName, attempts: attempts + 1 })
  } else {
    logHeightEvent('resolved', {
      celebrityId,
      heightCm: resolved.heightCm,
      confidence: resolved.confidence,
      sourceUrl: resolved.sourceUrl,
    })
  }

  heightMemoryCache.set(celebrityId, { value: resolved, expiresAt: Date.now() + HEIGHT_MEMORY_TTL_MS })

  try {
    const { error } = await db.from('celebrity_heights').upsert(
      {
        celebrity_id: celebrityId,
        display_name: celebrityName.trim().slice(0, 120),
        height_cm: resolved.heightCm,
        source_url: resolved.sourceUrl,
        verified_at: resolved.verifiedAt,
        confidence: resolved.confidence,
        lookup_attempts: attempts + 1,
        last_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'celebrity_id' }
    )
    // Table absente (migration non appliquée) : la génération continue,
    // seule la mise en cache est perdue.
    if (error) logHeightEvent('cache_write_failed', { celebrityId, error: error.message })
  } catch (err) {
    logHeightEvent('cache_write_failed', { celebrityId, error: getErrorMessage(err) })
  }

  return resolved
}

/** Doit rester aligné sur heightConsistencyBlock dans lib/scene-suggestions.ts. */
function heightConsistencyBlock(ctx: PhotoGenerationContext): string[] {
  const { userHeightCm, celebrityHeightCm, creationMode } = ctx
  if (!userHeightCm) return []

  const photoEditLines =
    creationMode === 'photo_edit'
      ? [
          '',
          'The user\'s existing body in the uploaded photograph is immutable.',
          '',
          'Do not resize, stretch, reconstruct or alter the user to enforce the stated height.',
          '',
          'Use the user\'s visible body and the declared height only as a reference for calculating the celebrity\'s physically believable scale.',
          '',
          'Adapt the added celebrity to the original photograph, not the original user to the celebrity.',
          '',
          'Preserve the original framing, perspective, camera angle and user pixels whenever possible.',
        ]
      : []

  if (!celebrityHeightCm) {
    return [
      'PHYSICAL SCALE AND PERSPECTIVE CONSISTENCY:',
      '',
      `The user's real height is ${userHeightCm} centimeters.`,
      '',
      'The celebrity\'s exact verified height is currently unavailable.',
      '',
      'Use realistic human proportions and a plausible visual scale based on the scene, while preserving the user\'s known height.',
      '',
      'Do not exaggerate the size or dominance of the celebrity.',
      'Do not deform, stretch or compress either body.',
      'Keep both people coherent with the same ground plane, camera perspective, distance, posture, footwear and environment.',
      '',
      'Treat the celebrity\'s relative height as a soft visual constraint and prioritize a physically believable composition.',
      ...photoEditLines,
    ]
  }

  return [
    'PHYSICAL HEIGHT, SCALE AND PERSPECTIVE CONSISTENCY:',
    '',
    `The user's real height is ${userHeightCm} centimeters.`,
    `The celebrity's real height is ${celebrityHeightCm} centimeters.`,
    '',
    'Respect the real-world height difference between the user and the celebrity.',
    '',
    'Use these measurements as physical constraints, not as a reason to create a rigid or unnatural pose.',
    '',
    'If both people are standing on the same ground plane and at a similar distance from the camera, their visible difference in height must correspond naturally to their real measurements.',
    '',
    'Keep the scale of the entire body coherent. Adjust the full body proportionally, including head position, shoulder level, torso, hips, legs and feet.',
    '',
    'Do not resize only the head, face, torso or legs.',
    'Do not make the celebrity larger or taller because they are famous.',
    'Do not make the user shorter or taller simply to improve the composition.',
    'Do not stretch, compress or deform either body.',
    '',
    'Account naturally for:',
    '- camera perspective;',
    '- distance from the camera;',
    '- lens distortion;',
    '- posture;',
    '- bent knees;',
    '- body lean;',
    '- hairstyle;',
    '- footwear;',
    '- uneven ground;',
    '- one person standing slightly in front of the other.',
    '',
    'Both people must remain connected to the same believable ground plane, with coherent foot placement, body scale, horizon, camera height and perspective.',
    '',
    'When one person is closer to the camera, their apparent size may change naturally, but the underlying physical scale must remain consistent with their real height.',
    '',
    'If the feet or full bodies are not visible, infer the difference subtly through shoulder height, head position, body scale and perspective. Do not force an exaggerated visible height difference.',
    '',
    'A small real-life height difference must remain subtle.',
    'A larger height difference must be visible but never caricatured.',
    '',
    'The final result must look as if both people were genuinely photographed together by the same camera at the same moment.',
    ...photoEditLines,
  ]
}

type DbClient = ReturnType<typeof createClient>
type SessionRow = { id: string; credits_balance?: number | null; user_id?: string | null; email?: string | null }

/** Session de facturation isolée par user — refuse les sessions anonymes déjà polluées. */
async function resolveBillingSession(
  db: DbClient,
  opts: { sessionId?: string; userId?: string; email?: string }
): Promise<SessionRow | null> {
  const { sessionId, userId, email } = opts
  const normalizedEmail = email?.trim().toLowerCase() || null
  const nowIso = new Date().toISOString()

  if (userId) {
    const { data: owned } = await db
      .from('sessions')
      .select('id, credits_balance, user_id, email')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (owned) return owned as SessionRow

    if (sessionId) {
      const { data: anon } = await db
        .from('sessions')
        .select('id, credits_balance, user_id, email')
        .eq('id', sessionId)
        .maybeSingle()
      if (anon && !anon.user_id) {
        const [a, g] = await Promise.all([
          db.from('analyses').select('id', { count: 'exact', head: true }).eq('session_id', sessionId),
          db.from('generations').select('id', { count: 'exact', head: true }).eq('session_id', sessionId),
        ])
        const dirty = (a.count ?? 0) > 0 || (g.count ?? 0) > 0
        if (!dirty) {
          await db
            .from('sessions')
            .update({
              user_id: userId,
              owned_at: nowIso,
              credits_balance: 0,
              ...(normalizedEmail ? { email: normalizedEmail } : {}),
            })
            .eq('id', sessionId)
          return { ...(anon as SessionRow), user_id: userId, credits_balance: 0 }
        }
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
      .select('id, credits_balance, user_id, email')
      .single()
    return (created as SessionRow) ?? null
  }

  if (sessionId) {
    const { data } = await db
      .from('sessions')
      .select('id, credits_balance, user_id, email')
      .eq('id', sessionId)
      .maybeSingle()
    if (data) return data as SessionRow
  }

  return null
}

/** Critère #1 : identité faciale INTÉGRALE.
 *  Avec 2 images, Person A et Person B sont verrouillés à égalité.
 *  Parcours « jumeau » (1 image) : verrouillage maximal contre le morphing vers la star. */
function facePreservationBlock(hasCelebrityReferenceImage: boolean): string[] {
  const dual = hasCelebrityReferenceImage
  return [
    '⚠️⚠️ ABSOLUTE PRIORITY — FACIAL IDENTITY LOCK (NON-NEGOTIABLE) ⚠️⚠️',
    dual
      ? 'This task is an IDENTITY-PRESERVING COMPOSITE EDIT using TWO reference photos. It is NOT face generation, NOT face redesign, NOT beautification, NOT a likeness reinterpretation.'
      : 'This task is an IDENTITY-PRESERVING EDIT of Person A from the reference photo. Person A\'s face, hair, and head proportions must stay pixel-faithful to image_input[0]. The celebrity match is thematic only — NEVER transfer the celebrity\'s look onto Person A.',
    '',
    'image_input ORDER:',
    dual
      ? '- image_input[0] = Person A (USER) — ground-truth face #1'
      : '- image_input[0] = Person A (USER) — sole ground-truth for Person A\'s identity',
    dual ? '- image_input[1] = Person B (CELEBRITY) — ground-truth face #2' : '',
    '',
    'PERSON A (USER) — HARD LOCK (STRICTER THAN SCENE / CELEBRITY):',
    '- Treat image_input[0] as a biometric template. Person A in the output must look like the SAME photograph of the SAME person, only reposed in a new scene.',
    '- Copy EXACTLY from image_input[0]: bone structure, skull shape, face width, cheek volume, jawline, chin, forehead, eyes, eye spacing, eyebrows, nose (bridge + tip + nostrils), lips, ears, neck thickness, skin tone, freckles/moles/marks, age, and facial fat distribution.',
    '- HAIR LOCK: keep the EXACT hair color, undertone (warm/cool), dye/roots if any, texture (straight/wavy/curly/coily), length, volume, parting, hairline, and hairstyle from image_input[0]. Do NOT recolor, lighten, darken, highlight, straighten, curl, thicken, thin, or restyle Person A\'s hair to match the celebrity or the scene.',
    '- PROPORTION LOCK: do NOT enlarge, widen, puff, inflate, slim, elongate, or "beautify" the face. Do NOT make the face fuller, rounder, thinner, or more angular than in image_input[0]. Keep the same head-to-body scale.',
    '- Do NOT redraw, reinvent, morph, average, smooth, beautify, age-shift, gender-shift, ethnicity-shift, or "improve" Person A.',
    '- Do NOT blend Person A with Person B / the celebrity. Zero transfer of hair color, face shape, jaw, lips, eyes, brows, skin tone, or makeup from the celebrity onto Person A.',
    '- Glasses, facial hair, piercings, and accessories on Person A\'s face must match image_input[0] (present only if present in the reference).',
    '- Allowed changes for Person A ONLY: body pose, clothing (unless the brief keeps their outfit), hands, and scene lighting falling on an otherwise UNCHANGED face and hair.',
    '',
    ...(dual
      ? [
          'PERSON B (CELEBRITY) — HARD LOCK (SAME STRENGTH AS PERSON A):',
          '- Copy Person B\'s face EXACTLY from image_input[1]: same identity, same features, same hair as in that photo.',
          '- Do NOT invent a generic celebrity face. Do NOT use prior knowledge of the celebrity if it conflicts with image_input[1].',
          '- Do NOT beautify, morph, blend with Person A, or replace Person B with a different person.',
          '- Allowed changes for Person B ONLY: body pose, FULL OUTFIT (mandatory — see wardrobe rules), and scene lighting falling on an UNCHANGED face.',
          '- CLOTHING FROM image_input[1] IS NOT LOCKED. Discard the reference photo\'s suit, uniform, jersey, stage costume, or formalwear unless the USER SCENE BRIEF explicitly asks for that same outfit.',
          '',
          'FAILURE CONDITIONS (either one fails the whole result):',
          '- Person A is not instantly recognizable as the exact same person as image_input[0].',
          '- Person A\'s hair color/style or face width/volume differs from image_input[0].',
          '- Person B is not instantly recognizable as the exact same person as image_input[1].',
          '- Person B still wears their iconic/reference clothing when the scene brief calls for casual / location-appropriate clothes.',
          '- Any face-swap artifact, melted features, hybrid face, or "AI beauty filter" look on either person.',
        ]
      : [
          'PERSON B (CELEBRITY) — SEPARATE IDENTITY:',
          '- Person B is a different person standing next to Person A. Generate Person B\'s own appearance.',
          '- Never "nudge" Person A toward looking more like Person B (no shared hair color, no shared face fullness, no hybrid look).',
          '- Looking alike as twins is a FUN LABEL only — visually they remain two distinct people; Person A stays locked to image_input[0].',
          '',
          'FAILURE CONDITIONS (any one fails the whole result):',
          '- Person A is not instantly recognizable as the exact same person as image_input[0] → FAILED, even if the scene is perfect.',
          '- Person A\'s hair color, hair style, or face width/fullness differs from image_input[0] → FAILED.',
          '- Person A looks partially like the celebrity (hybrid / averaged face) → FAILED.',
          '- Prefer an imperfect scene over ANY change to Person A\'s face or hair.',
        ]),
  ].filter((line) => line !== '')
}

/** Anti-"AI look" : photo smartphone amateur, indiscernable d'une vraie photo. */
function photorealismBlock(celebrityName: string): string[] {
  const celeb = sanitizeSceneText(celebrityName) || 'the celebrity'
  return [
    'PHOTOREALISM — AUTHENTIC AMATEUR SMARTPHONE PHOTO (highest visual priority after face locks):',
    `Create a highly believable real-life amateur smartphone photo featuring the user together with ${celeb} in the scene described in the USER SCENE BRIEF below.`,
    '',
    'ABSOLUTE PRIORITY — PRESERVE THE USER\'S IDENTITY EXACTLY:',
    'Do not redesign, beautify, improve, reinterpret, fatten, slim, or recolor the user. Keep the exact facial structure, face width, cheek volume, jawline, nose shape, eye shape, mouth shape, hair color, hair texture, hairstyle, skin tone, glasses if present, and overall likeness. The user must still look exactly like the same real person from the source image, not like an AI-modified or celebrity-blended version.',
    '',
    'The image must look like a genuine casual phone photo taken in real life, not like AI art, CGI, a 3D render, or a professional photoshoot. It should feel spontaneous, natural, candid, and slightly imperfect, as if captured quickly in a real moment by a friend or as a casual selfie.',
    '',
    'AUTHENTIC AMATEUR SMARTPHONE PHOTOGRAPHY STYLE:',
    '- natural real-world lighting only',
    '- slightly imperfect framing',
    '- subtle handheld feel',
    '- mild realistic motion blur when appropriate',
    '- slight lens distortion from a phone camera',
    '- natural skin texture with pores and small imperfections',
    '- realistic eyes, teeth, hands, and hair',
    '- realistic clothing wrinkles and folds',
    '- mild phone-camera noise',
    '- slight compression artifacts',
    '- realistic shadows and reflections',
    '- believable depth and perspective',
    '- authentic background details',
    '- natural asymmetry in faces and posture',
    '- expressions must feel relaxed and genuine, not staged',
    '',
    `${celeb} must look naturally present in the same environment as the user, with realistic posture, believable body language, and lighting perfectly matching the surroundings. The interaction between the user and ${celeb} should feel like a real encounter captured in the moment, not like a promotional image or posed advertisement.`,
    '',
    'The composition must not feel too perfect or too polished. Avoid a centered commercial look. Let the image feel like a normal everyday snapshot from a phone gallery, Snapchat, BeReal, or Instagram Story. The final image should include subtle imperfections that make it feel real: slightly uneven framing, tiny exposure inconsistencies, natural ambient clutter, and realistic environment details.',
    '',
    'IMPORTANT NEGATIVE REQUIREMENTS:',
    'Do not make the skin too smooth, do not beautify the face, do not change the user\'s hair color or hairstyle, do not make the user\'s face fuller/wider/thinner than the reference, do not over-sharpen, do not make the image cinematic, do not use studio lighting, do not create a beauty-filter effect, do not make smiles too perfect, do not create fake bokeh, do not overprocess HDR, do not distort objects, do not generate incoherent backgrounds, do not create unrealistic car interiors or strange object shapes, do not make the subjects look like influencers or models, and do not make the result look AI-generated in any way.',
    '',
    'AVOID: AI-generated look, CGI, 3D render, waxy skin, doll face, glossy skin, fake symmetry, changed hair color, celebrity-hair transplant onto the user, puffy/inflated cheeks, widened jaw, slimmed face, perfect composition, professional advertising style, fashion-shoot vibes, magazine photography, unrealistic colors, over-detailed textures, unnatural hands, distorted perspective, and artificial background people.',
    '',
    'VARIATION (scene only — NEVER vary Person A\'s identity):',
    '- Randomize camera angle, focal length, distance, lighting, Person B expression, posture, framing, background activity, object placement, and slight imperfections so each generation feels like a different real-life moment.',
    '- Do NOT randomize Person A\'s hair, face shape, facial features, or identity.',
    '',
    'SCENE FIDELITY — FOLLOW THE USER BRIEF LITERALLY:',
    '- Execute the requested location, outfits, and pose EXACTLY as described. Do not substitute a generic VIP / red-carpet / yacht / gala stock scene.',
    '- If the brief is quirky, funny, or specific, KEEP that specificity — originality is the point.',
    '- Do not "upgrade" the scene into a cliché celebrity photoshoot unless the user asked for that.',
    '',
    `OUTPUT GOAL: a photo that is almost impossible to distinguish from a genuine real amateur smartphone picture taken in a real-life moment with ${celeb} in the requested scene.`,
  ]
}

/**
 * Tenues adaptées au lieu — pas aux habits iconiques de la star
 * (ex. Macron en costard dans un parc → tenue civile décontractée).
 */
function sceneAdaptiveWardrobeBlock(celebrityName: string): string[] {
  const celeb = sanitizeSceneText(celebrityName) || 'the celebrity'
  return [
    '⚠️ SCENE-ADAPTIVE WARDROBE (MANDATORY — SAME PRIORITY AS SCENE FIDELITY) ⚠️',
    'Clothing is driven by LOCATION + OUTFIT BRIEF, never by the celebrity\'s famous look or by clothes visible in any reference photo.',
    '',
    `- Dress BOTH Person A and ${celeb} (Person B) for THIS specific setting, as real people would dress if they were actually there together.`,
    `- Do NOT keep ${celeb}'s signature / official / stage / match-day / red-carpet / presidential / suit-and-tie wardrobe by default.`,
    '- Examples: park / street / café / home / beach / laundromat → casual civilian clothes (jeans, sneakers, jacket, t-shirt…). Formal suit only if the brief explicitly asks for formalwear or a formal venue.',
    '- If the outfit brief is playful or quirky, apply that spirit to BOTH people — matching vibes, not a VIP next to a tourist.',
    '- If the outfit brief is vague, infer natural clothes from the location (weather, activity, time of day) — still casual when the place is casual.',
    '- Reference images supply FACE and HAIR identity only. Their garments, shoes, accessories (except eyeglasses already on the locked face), and styling props must be redesigned for the scene.',
    `- A park selfie with ${celeb} still in a formal suit / jersey / gown when the brief did not ask for it = FAILED wardrobe.`,
  ]
}

/** « Créer une nouvelle photo » — le modèle recompose la scène. */
function buildFullGenerationPrompt(ctx: PhotoGenerationContext): string {
  const {
    celebrityName,
    celebrityDomain,
    celebrityStyleDescription,
    funFact,
    mode,
    scene,
    customPrompt,
    interaction,
    hasCelebrityReferenceImage,
    sceneSource,
  } = ctx

  const dual = Boolean(hasCelebrityReferenceImage)
  const domain = sanitizeSceneText(celebrityDomain)
  const style = celebrityStyleDescription ? sanitizeSceneText(celebrityStyleDescription) : ''
  // Ne jamais injecter les traits de ressemblance — ils poussent au morphing.
  const mood = !dual && funFact ? sanitizeSceneText(funFact) : ''

  const subjectLines = [
    dual
      ? '- Person A = face locked from image_input[0]. Person B = face locked from image_input[1].'
      : '- Person A (USER): face + hair + head proportions locked from image_input[0] — biometric identity preserved exactly; never morph toward the celebrity.',
    dual
      ? `- Person B name label only (do not reinvent the face): ${celebrityName}${domain ? `, ${domain}` : ''}. Clothes = scene-adapted, NOT from image_input[1].`
      : `- Person B (CELEBRITY): ${celebrityName}${domain ? `, ${domain}` : ''} — separate person beside Person A. Do NOT borrow Person B\'s hair color, face shape, or features for Person A. Dress Person B for the scene, not their iconic look.`,
    // Style « vibe » de la star : jamais comme tenue figée — seulement si utile, et subordonné au lieu
    !dual && style
      ? `- Optional Person B fashion vibe (LOW priority — override with location-appropriate clothes if the scene is casual): ${style}.`
      : '',
    mood ? `- Scene mood / energy only (NOT faces, NOT Person A\'s hair): ${mood}.` : '',
  ]

  const requirements = [
    'SCENE REQUIREMENTS (secondary to face locks, but must still obey the brief):',
    '- Both people clearly visible in ONE cohesive real photograph.',
    '- Natural bodies/poses; faces remain identity-locked as above.',
    '- Outfits for BOTH people must match the location and outfit brief (scene-adaptive wardrobe).',
    '- Tasteful, family-friendly content.',
    '- Single photo — not a collage, not a side-by-side split, not a face-swap glitch.',
    '- If anything conflicts with the face locks, DROP the conflicting detail and KEEP the faces.',
    '- If iconic celebrity clothing conflicts with the scene, DROP the iconic clothing and KEEP the scene-appropriate outfits.',
  ]

  const finalReminder = dual
    ? [
        'FINAL MANDATORY CHECK:',
        '1) Compare Person A\'s output face to image_input[0] — must be the same person, unedited identity.',
        '2) Compare Person B\'s output face to image_input[1] — must be the same person, unedited identity.',
        '3) Are BOTH outfits appropriate for THIS location / outfit brief (not Person B\'s default suit/jersey/gown)? If not, restyle clothes.',
        '4) Does it look like a raw smartphone snap (Snapchat/BeReal/Stories), NOT AI/CGI/studio/glamour? If not, fix realism.',
        '5) Does the scene match the user brief specifically (not a generic celebrity cliché)? If not, fix the scene.',
        '6) Face integrity > scene beauty, but face locks AND amateur-phone realism AND brief fidelity AND scene-adaptive clothes are all required.',
      ]
    : [
        'FINAL MANDATORY CHECK:',
        '1) Compare Person A\'s output face to image_input[0] — same person, same face width/volume, same features, unedited identity.',
        '2) Compare Person A\'s hair to image_input[0] — same color, texture, length, and style (no celebrity hair transplant).',
        '3) Person A must NOT look like a blend/average with the celebrity.',
        '4) Are BOTH outfits appropriate for THIS location / outfit brief (celebrity not stuck in iconic formalwear)? If not, restyle clothes.',
        '5) Does it look like a raw smartphone snap (Snapchat/BeReal/Stories), NOT AI/CGI/studio/glamour? If not, fix realism.',
        '6) Does the scene match the user brief specifically? If not, fix the scene.',
        '7) Face + hair integrity of Person A > scene beauty. If identity drifted, the result is invalid.',
      ]

  const opener = dual
    ? 'IDENTITY-PRESERVING COMPOSITE: keep BOTH reference faces exactly intact while placing Person A and Person B together in a NEW scene that faithfully matches the user brief — output must look like a genuine amateur smartphone photo.'
    : 'IDENTITY-PRESERVING EDIT: keep Person A\'s face, hair color, hairstyle, and head proportions EXACTLY intact from image_input[0] while placing them in a scene with a celebrity — never morph Person A toward the celebrity. Output must look like a genuine amateur smartphone photo that faithfully matches the user brief.'

  const interactionPrompt = getInteractionPrompt(interaction)
  const interactionLine = interactionPrompt
    ? `4. INTERACTION between the two people: ${sanitizeSceneText(interactionPrompt)}.`
    : ''

  // Les lignes vides sont filtrées en fin de fonction : le bloc est pré-joint
  // pour conserver ses paragraphes.
  const heightSection = heightConsistencyBlock(ctx).join('\n')

  if (sceneSource === 'user_photo') {
    return [
      opener,
      '',
      ...facePreservationBlock(dual),
      '',
      ...photorealismBlock(celebrityName),
      '',
      ...sceneAdaptiveWardrobeBlock(celebrityName),
      '',
      heightSection,
      '',
      'KEEP THE USER PHOTO SCENE (full_generation — not a pixel-locked edit):',
      '- image_input[0] is BOTH Person A identity AND the scene to keep.',
      '- Recreate a NEW candid photo of Person A with the celebrity in the SAME place, lighting, time of day, and overall atmosphere as image_input[0].',
      '- Keep Person A’s clothes from the source photo unless a tiny natural adjustment is needed.',
      '- Dress the celebrity to belong in that same real setting — not a studio, not a red carpet.',
      '- Do NOT invent a new location (no karaoke, IKEA, festival, etc.).',
      '- Do NOT rebuild the environment from scratch.',
      interactionLine,
      '',
      'SUBJECTS:',
      ...subjectLines,
      '',
      ...requirements,
      '',
      ...finalReminder,
    ].filter(Boolean).join('\n')
  }

  if (mode === 'custom' && customPrompt) {
    const userPrompt = sanitizeSceneText(customPrompt)
    return [
      opener,
      '',
      ...facePreservationBlock(dual),
      '',
      ...photorealismBlock(celebrityName),
      '',
      ...sceneAdaptiveWardrobeBlock(celebrityName),
      '',
      heightSection,
      '',
      'USER SCENE PROMPT (apply to setting/outfits/pose ONLY — faces stay locked; follow literally):',
      userPrompt,
      interactionLine,
      '',
      'SUBJECTS:',
      ...subjectLines,
      '',
      ...requirements,
      '',
      ...finalReminder,
    ].filter(Boolean).join('\n')
  }

  if (!scene) throw new Error('photoScene requis en mode presets')

  const location = sanitizeSceneText(scene.location)
  const outfits = sanitizeSceneText(scene.outfits)
  const position = sanitizeSceneText(scene.position)

  return [
    opener,
    '',
    ...facePreservationBlock(dual),
    '',
    ...photorealismBlock(celebrityName),
    '',
    ...sceneAdaptiveWardrobeBlock(celebrityName),
    '',
    heightSection,
    '',
    'USER SCENE BRIEF (setting/outfits/pose ONLY — faces stay locked; follow literally):',
    `1. LOCATION / SETTING: ${location}`,
    `2. OUTFITS for both people (MUST adapt to the location — no iconic celebrity default clothes): ${outfits}`,
    `3. POSE and FRAMING: ${position}`,
    interactionLine,
    '',
    'SUBJECTS:',
    ...subjectLines,
    '',
    ...requirements,
    '',
    ...finalReminder,
  ].filter(Boolean).join('\n')
}

/** Préservation source photo_edit — identité stricte, scène globale, micro-ajustements autorisés. */
function sourceLockBlock(starName: string, dual: boolean): string[] {
  const celeb = sanitizeSceneText(starName) || 'the celebrity'
  return [
    'SOURCE PRESERVATION (HIGH PRIORITY — photo_edit):',
    'The first input image is the main source photograph and must remain the visual foundation of the final result.',
    'USER IDENTITY = STRICTLY PRESERVED: keep the same person, same face, same hair, same overall identity, and same general body appearance.',
    'Do not replace the user, do not beautify heavily, and do not change their identity.',
    'Small pose adjustments are allowed only if they improve realism and natural interaction with the celebrity.',
    'The user may be slightly reposed if needed, but must still look like the same real person in the same moment and same setting.',
    'SCENE = GLOBALLY PRESERVED: keep the same overall environment, same mood, same amateur smartphone feel, same lighting logic, and same candid realism.',
    'Do not fully rebuild or reinvent the scene.',
    'Minor composition adjustments are allowed if they improve realism and the natural interaction.',
    'Small repositioning of secondary elements is allowed only when it remains subtle and believable.',
    `ALLOWED GOAL: integrate ${celeb} naturally into the source photo while preserving realism, identity, and the original candid feel.`,
    'Do not turn the result into a polished professional photoshoot.',
    'Do not make the image too perfect, too symmetrical, or too staged.',
    dual
      ? `The second input image is FACE/HAIR IDENTITY REFERENCE ONLY for ${celeb}. Ignore its background, pose, clothes, crop, and image quality.`
      : '',
  ].filter(Boolean)
}

function naturalInteractionBlock(): string[] {
  return [
    'NATURAL INTERACTION PRIORITY:',
    'The final image must feel like a real spontaneous moment, not a stiff side-by-side composite.',
    'Preserve the user’s identity very faithfully, but allow slight pose adaptation if needed to create a more natural interaction.',
    'Allow realistic body proximity, subtle leaning, relaxed posture, natural shoulder alignment, and candid body language.',
    'Allow the celebrity and the user to stand closer together if that improves realism.',
    'Allow natural gestures such as an arm around the shoulder, arm around the waist, slight lean-in, or natural hand placement when appropriate.',
    'Preserve the overall setting, atmosphere, and smartphone snapshot feeling of the source photo.',
    'Allow minor composition adjustments if they help the image feel more alive and believable.',
    'Do not create a rigid “two people standing separately” result unless the scene naturally calls for it.',
    'Do not regenerate the image into a polished, glamorous, or studio-quality portrait.',
    'Do not create a perfectly symmetrical or over-posed couple shot.',
    'Prefer believable imperfection over artificial perfection.',
  ]
}

/**
 * Identité faciale de la célébrité — photo_edit uniquement, si une vraie photo de référence est fournie.
 */
function celebrityIdentityLockBlock(starName: string, hasCelebrityReferenceImage: boolean): string[] {
  if (!hasCelebrityReferenceImage) return []
  const celeb = starName
  return [
    'CELEBRITY IDENTITY LOCK — NON-NEGOTIABLE:',
    `image_input[1] / the second input image is the SINGLE source of truth for ${celeb}'s visual identity.`,
    `The final face must remain faithfully the same person as in that reference — not a generic lookalike.`,
    'Preserve exactly from the celebrity reference: face shape, skull width and proportions, jaw and chin, eyes and eye spacing, eyebrows, nose, lips, cheekbones, skin tone, apparent age, hairline, hair color, hair length and hair texture.',
    'Do not generate a generic person who vaguely resembles the celebrity.',
    'Do not beautify, smooth, rejuvenate, restyle or reinterpret the celebrity face.',
    'Do not blend or fuse the celebrity face with the user.',
    'Pose, clothing and lighting may change to match the source photo. Facial identity must not change.',
    `The celebrity reference photo has priority over any internal knowledge of ${celeb}'s appearance.`,
    'Placement must preserve enough facial resolution: keep the celebrity at a depth close to the user so the face stays large enough to keep their features. Never solve composition by turning the celebrity into a tiny background silhouette.',
  ]
}

/** Échelle et profondeur photo_edit — évite la star minuscule trop loin derrière. */
function photoEditScaleDepthLock(ctx: PhotoGenerationContext): string[] {
  const userH = ctx.userHeightCm
  const starH = ctx.celebrityHeightCm ?? null
  const hasBoth = Boolean(userH && starH)
  const delta = hasBoth ? Math.abs(userH! - starH!) : null
  const celebrityShorter = hasBoth && starH! < userH!
  const celebrityTaller = hasBoth && starH! > userH!

  const heightLines = hasBoth
    ? [
        `- The user's real height is ${userH} cm. The celebrity's real height is ${starH} cm.`,
        `- The real height difference is about ${delta} cm. This must look subtle and realistic, not extreme.`,
        celebrityShorter
          ? '- If both are standing on the same ground plane, the celebrity should appear clearly shorter, but not tiny.'
          : celebrityTaller
            ? '- If both are standing on the same ground plane, the celebrity should appear clearly taller, but not giant.'
            : '- If both are standing on the same ground plane, they should appear essentially the same height.',
      ]
    : userH
      ? [
          `- The user's real height is ${userH} cm.`,
          '- Use realistic adult human scale. Do not make the celebrity miniature.',
        ]
      : [
          '- Use realistic adult human scale. Do not make the celebrity miniature by pushing them far back.',
        ]

  return [
    'PHYSICAL SCALE AND DEPTH LOCK (NON-NEGOTIABLE):',
    ...(hasBoth
      ? ['- Use the user’s real height and the celebrity’s real height as hard visual constraints.']
      : []),
    ...heightLines,
    '- Keep both people on a believable shared ground plane.',
    '- If feet or the ground plane are visible, foot placement and floor contact must be coherent. If they are not visible, infer depth from body scale, perspective and environmental cues. Do not invent feet or reconstruct the user\'s lower body.',
    '- Keep the celebrity at a similar camera distance to the user unless the scene explicitly requires otherwise.',
    '- Place the celebrity on a depth plane close to the user.',
    '- Do not solve composition by pushing the celebrity far into the background just to fit them in the image.',
    '- Apparent size must come mainly from real height, not from an excessive distance to the camera.',
    '- Integrate the celebrity near the user, with coherent perspective, as if both were really in the room at the same moment.',
    '- If a placement instruction says “behind”, keep them only slightly behind on a nearby depth plane — never as a distant miniature figure.',
  ]
}

function computeTargetApparentHeightRatio(
  userHeightCm?: number,
  celebrityHeightCm?: number | null,
): number | undefined {
  if (!userHeightCm || !celebrityHeightCm || userHeightCm <= 0 || celebrityHeightCm <= 0) return undefined
  return Math.round((celebrityHeightCm / userHeightCm) * 100) / 100
}

/** Ratio de hauteur visible — photo_edit uniquement, si les deux tailles réelles sont connues. */
function visibleHeightRatioLockBlock(ctx: PhotoGenerationContext): string[] {
  const userH = ctx.userHeightCm
  const starH = ctx.celebrityHeightCm ?? null
  const ratio = ctx.celebrityTargetApparentHeightRatio ?? computeTargetApparentHeightRatio(userH, starH)
  if (ratio == null || !userH || !starH) return []
  const pct = Math.round(ratio * 100)
  return [
    'VISIBLE HEIGHT RATIO LOCK — MANDATORY:',
    `- At comparable camera depth, the celebrity's visible body height should be approximately ${pct}% of the user's visible body height.`,
    `- Example: ${starH} cm vs ${userH} cm => approximately ${pct}%.`,
    '- Do NOT make the celebrity look miniature.',
    '- Do NOT create an exaggerated height difference.',
    '- Apparent size difference must primarily come from real physical height, not from pushing the celebrity farther away.',
    '- Keep the celebrity on a depth plane close to the user.',
    "- Keep the celebrity's face large enough to preserve identity.",
  ]
}

function extractTextFromResponse(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const d = data as Record<string, unknown>
  const choices = d.choices as Array<{ message?: { content?: string } }> | undefined
  if (choices?.[0]?.message?.content) return choices[0].message.content
  if (typeof d.text === 'string') return d.text
  if (d.data && typeof d.data === 'object') return extractTextFromResponse(d.data)
  return ''
}

function extractJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.trim()
  try {
    return JSON.parse(cleaned) as Record<string, unknown>
  } catch { /* continue */ }
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim()) as Record<string, unknown>
    } catch { /* continue */ }
  }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
  }
  throw new Error('Impossible de parser la réponse du modèle')
}

async function callCompositionVision(messages: unknown[], apiKey: string): Promise<string> {
  const res = await fetch(`${KIE_API_BASE}${COMPOSITION_ENDPOINT}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      stream: false,
      reasoning_effort: 'medium',
      temperature: COMPOSITION_TEMPERATURE,
    }),
  })

  const bodyText = await res.text()
  let data: unknown
  try {
    data = JSON.parse(bodyText)
  } catch {
    throw new Error(`kie.ai ${COMPOSITION_MODEL} ${res.status} — ${bodyText}`)
  }

  if (!res.ok) {
    const err = data as { error?: { message?: string }; msg?: string }
    throw new Error(`kie.ai ${COMPOSITION_MODEL} ${res.status} — ${err.error?.message ?? err.msg ?? bodyText}`)
  }

  const parsed = data as { code?: number; msg?: string }
  if (typeof parsed.code === 'number' && parsed.code !== 200) {
    throw new Error(`kie.ai ${COMPOSITION_MODEL} — ${parsed.msg ?? 'erreur'}`)
  }

  const raw = extractTextFromResponse(data)
  if (!raw) throw new Error('Réponse vide du modèle de composition')
  return raw
}

type CompositionAnalysis =
  | { suitable: true; celebrityPlacementInstruction: string; targetApparentHeightRatio?: number }
  | { suitable: false }

function parseCompositionResult(
  raw: Record<string, unknown>,
  lockedRatio?: number,
): CompositionAnalysis {
  if (raw.suitable === false || raw.reason === 'SOURCE_PHOTO_UNSUITABLE') {
    return { suitable: false }
  }
  const instruction = typeof raw.celebrityPlacementInstruction === 'string'
    ? sanitizeSceneText(raw.celebrityPlacementInstruction).slice(0, 400)
    : ''
  if (raw.suitable === true && instruction) {
    return {
      suitable: true,
      celebrityPlacementInstruction: instruction,
      ...(lockedRatio != null ? { targetApparentHeightRatio: lockedRatio } : {}),
    }
  }
  throw new Error('Analyse de composition invalide')
}

async function analyzePhotoEditComposition(
  imageBase64: string,
  ctx: PhotoGenerationContext,
  apiKey: string,
): Promise<CompositionAnalysis> {
  const starName = sanitizeSceneText(ctx.celebrityName) || 'the celebrity'
  const interactionPrompt = getInteractionPrompt(ctx.interaction)
  const userHint = ctx.customPrompt ? sanitizeSceneText(ctx.customPrompt).slice(0, 200) : ''
  const sceneIntent = sanitizeSceneText(
    [interactionPrompt, userHint].filter(Boolean).join(' — ')
  ) || 'présence naturelle, comme si la star était déjà là'

  const userH = ctx.userHeightCm
  const starH = ctx.celebrityHeightCm ?? null
  const lockedRatio = ctx.celebrityTargetApparentHeightRatio
    ?? computeTargetApparentHeightRatio(userH, starH)
  const heightBlock: string[] = []
  if (userH && starH && lockedRatio != null) {
    const delta = Math.abs(userH - starH)
    const pct = Math.round(lockedRatio * 100)
    const smallerOrLarger = starH < userH ? 'plus petite' : starH > userH ? 'plus grande' : 'de même taille'
    heightBlock.push(
      `Utilisateur : ${userH} cm`,
      `Célébrité : ${starH} cm`,
      `Différence réelle : ${delta} cm`,
      `Ratio de hauteur physique verrouillé : ${lockedRatio} (${starH} / ${userH})`,
      `À profondeur caméra comparable, la hauteur apparente visible de la célébrité doit être d’environ ${pct} % de celle de l’utilisateur.`,
      '',
      'RÈGLE DE COMPOSITION :',
      'Si les deux personnes sont debout, privilégier un placement à profondeur caméra comparable afin que leur différence apparente provienne principalement de leur vraie différence de taille.',
      'Ne jamais placer la célébrité beaucoup plus loin simplement pour trouver une zone vide.',
      `Une personne de ${starH} cm à côté d’une personne de ${userH} cm doit paraître seulement légèrement ${smallerOrLarger} (${pct} % de la hauteur visible de l’utilisateur), pas miniature.`,
      'Ne pas inventer ni modifier targetApparentHeightRatio : recopier exactement la valeur verrouillée ci-dessus.',
      'Si aucun emplacement à profondeur comparable n’est disponible sans modifier fortement la photo source, retourner SOURCE_PHOTO_UNSUITABLE plutôt que pousser la célébrité loin dans l’arrière-plan.',
    )
  } else if (userH) {
    heightBlock.push(
      `Utilisateur : ${userH} cm`,
      'Célébrité : taille non vérifiée — utiliser une échelle adulte réaliste.',
      'Ne jamais miniaturiser la célébrité en la plaçant trop loin.',
    )
  } else {
    heightBlock.push(
      'Tailles non disponibles. Utiliser une échelle adulte réaliste. Ne jamais miniaturiser la célébrité en la plaçant trop loin.',
    )
  }

  const messages = [
    {
      role: 'system',
      content:
        'Tu analyses UNE photo source pour décider si une deuxième personne réelle peut y être ajoutée en conservant l’identité des visages et la structure globale de la scène. De légers micro-ajustements de posture et d’objets secondaires sont autorisés s’ils rendent l’interaction plus vivante. Tu dois tenir compte de la taille réelle FOURNIE (sources Wikidata/Wikipédia), de la perspective, de la distance caméra et du plan de profondeur. N’estime JAMAIS une taille à partir des pixels de la photo. Réponds UNIQUEMENT en JSON.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            `Analyse la PHOTO SOURCE. La célébrité à ajouter s’appelle ${starName}.`,
            '',
            'TAILLE ET PROFONDEUR :',
            ...heightBlock,
            'Ne pas estimer ni inventer une taille à partir de la photo source. Utiliser uniquement les mesures ci-dessus. Ne pas inventer targetApparentHeightRatio si une valeur verrouillée est fournie.',
            '',
            'Détermine : position de l’utilisateur ; orientation et posture ; cadrage ; perspective ; profondeur ; distance caméra ; plan du sol / supports visibles ; objets importants ; zones réellement disponibles pour une deuxième personne à une profondeur comparable ; placement et posture plausibles de la célébrité.',
            'IDENTITÉ FACIALE : le placement doit laisser le visage de la célébrité assez grand pour conserver ses traits. Placer la célébrité à une profondeur proche de l’utilisateur. Ne jamais résoudre la composition en la transformant en petite silhouette d’arrière-plan.',
            'CONTRÔLE QUALITÉ : ne pas exiger que la posture soit identique à la photo source. Ne pas exiger que chaque petit objet soit à la même position exacte. Micro-ajustements naturels valides : légère rotation du buste, variation de posture, bras/mains, tête légèrement réorientée, rapprochement, interaction vivante, petit objet secondaire déplacé. Invalider seulement si la scène est trop transformée (décor recréé, meuble important fortement déplacé, objet important disparu, cadrage/angle totalement changé) ou si l’identité dérive.',
            'OBJETS : conserver les objets importants. Un banc ou meuble structurant doit rester. Un petit objet secondaire (lunettes tenues autrement, tissu, rideau, accessoire) peut bouger légèrement.',
            `Intention utilisateur (à ignorer si elle exige de reconstruire le décor, de supprimer un objet important, ou de reculer fortement la célébrité) : ${sceneIntent}`,
            'Ne jamais proposer de recréer entièrement le décor ni de supprimer un objet important. De légers micro-ajustements de posture de l’utilisateur sont autorisés pour une interaction naturelle. Ne jamais inventer de banc, chaise, mur, table ou support absent. Le placement doit rester crédible dans l’espace déjà visible, à une profondeur caméra comparable.',
            lockedRatio != null
              ? `Si une intégration crédible est possible : {"suitable":true,"celebrityPlacementInstruction":"une phrase concrète en français, ex: ajouter la célébrité à droite de l’utilisateur, même plancher, profondeur caméra comparable, interaction naturelle vivante, visage assez grand pour conserver ses traits, hauteur apparente ≈ ${Math.round(lockedRatio * 100)} % de l’utilisateur","targetApparentHeightRatio":${lockedRatio}}`
              : 'Si une intégration crédible est possible : {"suitable":true,"celebrityPlacementInstruction":"une phrase concrète en français, ex: ajouter la célébrité à droite de l’utilisateur, même plancher, profondeur caméra comparable, interaction naturelle vivante, visage assez grand pour conserver ses traits"}',
            'Si aucun emplacement ne permet simultanément de conserver l’identité des visages, la structure globale de la photo source, une profondeur proche, le ratio de taille réaliste ET un visage de célébrité suffisamment visible, ou si cela exigerait de reconstruire fortement le décor / pousser la célébrité loin dans l’arrière-plan : {"suitable":false,"reason":"SOURCE_PHOTO_UNSUITABLE"}',
          ].join('\n'),
        },
        { type: 'image_url', image_url: { url: toDataUrl(imageBase64) } },
      ],
    },
  ]

  try {
    const parsed = parseCompositionResult(extractJsonObject(await callCompositionVision(messages, apiKey)), lockedRatio)
    console.log('[generate] composition:', JSON.stringify(parsed))
    return parsed
  } catch (firstErr) {
    const retryMessages = [
      ...messages,
      {
        role: 'user',
        content: 'Ta réponse précédente était invalide. Renvoie UNIQUEMENT l’objet JSON demandé, sans markdown ni texte autour.',
      },
    ]
    try {
      const parsed = parseCompositionResult(extractJsonObject(await callCompositionVision(retryMessages, apiKey)), lockedRatio)
      console.log('[generate] composition retry:', JSON.stringify(parsed))
      return parsed
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr))
    }
  }
}

/** « Ajouter la star à ma photo » — photo source = vérité. */
function buildPhotoEditPrompt(ctx: PhotoGenerationContext): string {
  const {
    celebrityName,
    celebrityDomain,
    celebrityStyleDescription,
    interaction,
    customPrompt,
    hasCelebrityReferenceImage,
    celebrityPlacementInstruction,
    userHeightCm,
    celebrityHeightCm,
  } = ctx
  const starName = sanitizeSceneText(celebrityName) || 'the celebrity'
  const domain = sanitizeSceneText(celebrityDomain)
  const style = celebrityStyleDescription ? sanitizeSceneText(celebrityStyleDescription) : ''
  const dual = Boolean(hasCelebrityReferenceImage)
  const interactionPrompt = getInteractionPrompt(interaction)
  const userHint = customPrompt ? sanitizeSceneText(customPrompt).slice(0, 300) : ''
  const sceneIntent = sanitizeSceneText(
    [interactionPrompt, userHint].filter(Boolean).join(' — ')
  ) || 'présence naturelle, posture cohérente avec la scène, comme si la star était déjà là'
  const starDescription = sanitizeSceneText(
    dual
      ? (domain ? `${starName} (${domain})` : starName)
      : [domain && `${starName} (${domain})`, style].filter(Boolean).join('. ')
  ) || starName
  const userHeightLabel = userHeightCm ? `${userHeightCm}` : 'non disponible'
  const starHeightLabel = celebrityHeightCm ? `${celebrityHeightCm}` : 'non disponible'
  const placement = celebrityPlacementInstruction
    ? sanitizeSceneText(celebrityPlacementInstruction)
    : ''

  const prompt = [
    'MODE : AJOUTER LA STAR À MA PHOTO',
    '',
    ...sourceLockBlock(starName, dual),
    '',
    ...naturalInteractionBlock(),
    '',
    'Tu reçois une PHOTO SOURCE réelle fournie par l’utilisateur. Cette photo source est la base absolue de l’image finale.',
    '',
    'IMAGE ORDER:',
    '- First image = PHOTO SOURCE (utilisateur + décor). Structure globale à conserver, puis à rendre vivante.',
    ...(dual
      ? [
          `- Second image = RÉFÉRENCE VISAGE / CHEVEUX UNIQUEMENT pour ${starName}. Ignorer son fond, sa pose, ses vêtements, son cadrage et sa qualité d’image.`,
        ]
      : []),
    '',
    'OBJECTIF :',
    `Ajouter naturellement ${starName} dans la photo source, comme si la célébrité était réellement présente : photo naturelle, vivante et crédible, pas deux personnes figées côte à côte.`,
    '',
    ...celebrityIdentityLockBlock(starName, dual),
    '',
    'INSTRUCTIONS OBLIGATOIRES :',
    '1. Préserver très fidèlement l’utilisateur tel qu’il apparaît dans la photo source :',
    '- préserver son visage, ses traits, sa coiffure, son identité visuelle et son apparence générale ;',
    '- ne pas embellir fortement ;',
    '- ne pas rajeunir ;',
    '- ne pas remplacer son identité visuelle ;',
    '- une légère adaptation de posture ou d’orientation corporelle est autorisée si cela améliore le naturel de la scène ;',
    '- l’utilisateur doit rester clairement reconnaissable comme la même personne réelle.',
    '',
    '2. Préserver la photo source comme base principale de la scène :',
    '- préserver le cadrage général, l’ambiance, le décor principal et la sensation de photo réelle ;',
    '- préserver la logique du lieu, des objets, de la lumière et de la composition ;',
    '- ne pas recréer totalement la scène ;',
    '- ne pas transformer l’image en photo trop parfaite ou trop professionnelle ;',
    '- de petits ajustements de composition ou de détails secondaires sont autorisés s’ils améliorent le naturel global ;',
    '- ne pas introduire d’éléments incohérents ou artificiels.',
    '',
    `3. Ajouter uniquement la célébrité ${starName} :`,
    ...(placement
      ? [
          'PLACEMENT OBLIGATOIRE (analyse de composition — unique consigne de placement) :',
          placement,
          '- Ne pas substituer cette instruction par un placement générique dans un espace vide.',
          `- Si l’intention suivante entre en conflit, suivre le placement analysé : ${sceneIntent}.`,
        ]
      : [
          `- la star doit avoir une posture cohérente avec la scène et avec l’intention suivante : ${sceneIntent}.`,
          '- Si cette intention exigerait de recréer le décor ou d’inventer un meuble, IGNORER l’intention.',
        ]),
    '- éviter toute impression de sticker, collage, cutout ou personnage “posé” dans un coin ;',
    '- privilégier une interaction crédible et naturelle plutôt qu’une simple juxtaposition ;',
    '- favoriser une proximité réaliste entre l’utilisateur et la célébrité ;',
    '- autoriser une posture plus vivante, plus spontanée, et moins figée ;',
    '- éviter un rendu où les deux personnes semblent juste “posées” l’une à côté de l’autre sans lien ;',
    '',
    '4. Cohérence visuelle obligatoire :',
    '- même lumière, direction de lumière, température, netteté, grain, détail et style smartphone amateur que la photo source ;',
    '- ombres de contact et présence réaliste dans le décor ;',
    '- intégration fluide, discrète et crédible.',
    '',
    '5. Proportions réalistes :',
    `- utilisateur ${userHeightLabel} cm si disponible ; célébrité ${starHeightLabel} cm si disponible ;`,
    '- ne jamais rendre la célébrité trop petite, trop grande ou disproportionnée.',
    '- Adapter la star à la photo, jamais l’utilisateur à la star.',
    '',
    ...photoEditScaleDepthLock(ctx),
    '',
    ...visibleHeightRatioLockBlock(ctx),
    '',
    '6. Rendu attendu : photo réaliste amateur prise sur le vif, pas cinéma, pas glamour, pas esthétique IA.',
    '',
    'DESCRIPTION DE LA STAR :',
    starDescription,
    '',
    'INTERDICTIONS ABSOLUES :',
    '- ne pas changer fortement le visage de l’utilisateur ;',
    '- ne pas changer ses cheveux ;',
    '- ne pas altérer fortement sa morphologie ;',
    '- ne pas changer fortement la taille apparente réelle ;',
    '- ne pas recréer entièrement la photo ;',
    '- ne pas recréer entièrement le décor ;',
    '- ne pas supprimer un objet important ;',
    '- ne pas déplacer fortement un meuble important ;',
    '- ne pas transformer totalement l’angle ou le cadrage ;',
    '- ne pas ajouter de deuxième objet incohérent, ni banc/chaise/mur/table absents de la scène ;',
    '- ne pas placer la star à un endroit physiquement impossible ;',
    '- ne pas faire une star détourée, incrustée, affiche, pub ou studio.',
    '',
    'PRIORITÉ FINALE :',
    'La priorité n°1 est la préservation réaliste de la photo source.',
    `La priorité n°2 est l’intégration naturelle de ${starName}.`,
  ].filter((line) => line !== '').join('\n')

  if (prompt.length > PHOTO_EDIT_PROMPT_MAX_CHARS) {
    console.warn('[generate] photo_edit prompt length', prompt.length)
  }
  return prompt
}

function buildPhotoPrompt(ctx: PhotoGenerationContext): string {
  return ctx.creationMode === 'photo_edit'
    ? buildPhotoEditPrompt(ctx)
    : buildFullGenerationPrompt(ctx)
}

function base64ToBytes(base64: string): Uint8Array {
  const raw = stripDataUrl(base64)
  const bin = atob(raw)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function extractUploadUrl(data: {
  fileUrl?: string
  downloadUrl?: string
} | undefined): string | undefined {
  return data?.fileUrl ?? data?.downloadUrl
}

async function uploadToSupabaseStorage(imageBase64: string): Promise<{ path: string; signedUrl: string } | null> {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null

  try {
    const db = createClient(url, key, { auth: { persistSession: false } })
    const mime = getMime(imageBase64)
    const ext = getExt(mime)
    const path = `refs/${crypto.randomUUID()}.${ext}`
    const bytes = base64ToBytes(imageBase64)

    const { error } = await db.storage.from('temp-images').upload(path, bytes, {
      contentType: mime,
      upsert: false,
    })

    if (error) {
      console.warn('[generate] Supabase storage upload failed:', error.message)
      return null
    }

    const { data: signed, error: signErr } = await db.storage
      .from('temp-images')
      .createSignedUrl(path, TEMP_SIGNED_URL_TTL_SEC)

    if (signErr || !signed?.signedUrl) {
      console.warn('[generate] signed URL failed:', signErr?.message ?? 'missing url')
      await db.storage.from('temp-images').remove([path])
      return null
    }

    return { path, signedUrl: signed.signedUrl }
  } catch (err) {
    console.warn('[generate] Supabase storage upload error:', err)
    return null
  }
}

async function removeTempObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return
  try {
    const db = createClient(url, key, { auth: { persistSession: false } })
    const { error } = await db.storage.from('temp-images').remove(paths)
    if (error) console.warn('[generate] temp cleanup failed:', error.message)
  } catch (err) {
    console.warn('[generate] temp cleanup error:', err)
  }
}

async function uploadUrlToKie(fileUrl: string, apiKey: string): Promise<string | null> {
  const res = await fetch(`${KIE_FILE_API_BASE}/api/file-url-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      fileUrl,
      uploadPath: 'starfusion',
      fileName: `ref-${Date.now()}.jpg`,
    }),
  })

  const json = await res.json() as {
    code?: number
    msg?: string
    data?: { fileUrl?: string; downloadUrl?: string }
  }

  const imageUrl = extractUploadUrl(json.data)
  if (json.code === 200 && imageUrl) return imageUrl

  console.warn('[generate] kie url upload failed:', JSON.stringify(json))
  return null
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 8192
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, chunk as unknown as number[])
  }
  return btoa(binary)
}

async function uploadBase64ToKie(imageBase64: string, apiKey: string): Promise<string> {
  const mime = getMime(imageBase64)
  const ext = getExt(mime)
  const fileName = `ref-${Date.now()}.${ext}`
  const base64Data = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:${mime};base64,${stripDataUrl(imageBase64)}`

  const res = await fetch(`${KIE_FILE_API_BASE}/api/file-base64-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      base64Data,
      uploadPath: 'starfusion',
      fileName,
    }),
  })

  const json = await res.json() as {
    success?: boolean
    code?: number
    msg?: string
    data?: { fileUrl?: string; downloadUrl?: string; filePath?: string }
  }

  const imageUrl = extractUploadUrl(json.data)
  if (!imageUrl || json.code !== 200) {
    console.error('[generate] kie base64 upload failed:', JSON.stringify(json))
    throw new Error(`kie.ai upload: ${json.msg ?? 'URL manquante'} (code ${json.code ?? res.status})`)
  }

  return imageUrl
}

async function resolveReferenceImageUrl(
  imageBase64: string,
  apiKey: string,
  tempPaths: string[],
): Promise<string> {
  const uploaded = await uploadToSupabaseStorage(imageBase64)
  if (uploaded) {
    tempPaths.push(uploaded.path)
    const kieUrl = await uploadUrlToKie(uploaded.signedUrl, apiKey)
    await removeTempObjects([uploaded.path])
    const idx = tempPaths.indexOf(uploaded.path)
    if (idx >= 0) tempPaths.splice(idx, 1)
    if (kieUrl) return kieUrl
  }

  return uploadBase64ToKie(imageBase64, apiKey)
}

function resolvePhotoEditModel(): 'nano-banana-2' | 'google/nano-banana-edit' {
  const raw = (Deno.env.get('PHOTO_EDIT_KIE_MODEL') ?? 'google/nano-banana-edit').trim()
  return raw === 'nano-banana-2' ? 'nano-banana-2' : 'google/nano-banana-edit'
}

async function createTask(
  imageUrls: string[],
  ctx: PhotoGenerationContext,
  apiKey: string
): Promise<string> {
  const prompt = buildPhotoPrompt(ctx)
  const useEditModel =
    ctx.creationMode === 'photo_edit' && resolvePhotoEditModel() === 'google/nano-banana-edit'

  const payload = useEditModel
    ? {
        model: 'google/nano-banana-edit',
        input: {
          prompt,
          image_urls: imageUrls,
          aspect_ratio: 'auto',
          output_format: 'jpeg',
        },
      }
    : {
        model: 'nano-banana-2',
        input: {
          prompt,
          image_input: imageUrls,
          aspect_ratio: 'auto',
          resolution: '2K',
          output_format: 'jpg',
        },
      }

  console.log('[generate] createTask', JSON.stringify({
    model: payload.model,
    photo_edit: ctx.creationMode === 'photo_edit',
    userHeightCm: ctx.userHeightCm ?? null,
    celebrityHeightCm: ctx.celebrityHeightCm ?? null,
    targetApparentHeightRatio: ctx.celebrityTargetApparentHeightRatio ?? null,
    celebrityPlacementInstruction: ctx.celebrityPlacementInstruction ?? null,
  }))
  console.log(`[${payload.model}] prompt:`, prompt)

  const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  })

  const json = await res.json() as { code: number; msg: string; data?: { taskId: string } }
  if (json.code !== 200 || !json.data?.taskId) {
    throw new Error(`kie.ai create task: ${json.msg} (code ${json.code})`)
  }
  return json.data.taskId
}

async function pollTask(taskId: string, apiKey: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))

    const res = await fetch(
      `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    const json = await res.json() as {
      code: number
      msg?: string
      data?: { state: string; resultJson?: string; failMsg?: string }
    }
    if (json.code !== 200) {
      throw new Error(`kie.ai poll: ${json.msg ?? 'erreur'} (code ${json.code})`)
    }
    const record = json.data
    if (!record) continue

    if (record.state === 'success') {
      const parsed = JSON.parse(record.resultJson ?? '{}') as { resultUrls?: string[] }
      const url = parsed.resultUrls?.[0]
      if (!url) throw new Error('Nano Banana 2: pas d\'URL dans le résultat')
      return url
    }
    if (record.state === 'fail') {
      throw new Error(`Nano Banana 2 échoué: ${record.failMsg ?? 'inconnu'}`)
    }
  }
  throw new Error('Nano Banana 2: timeout — la génération n’a pas renvoyé d’image à temps')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const kieKey = Deno.env.get('KIE_API_KEY')
    if (!kieKey) throw new Error('KIE_API_KEY non configurée dans les secrets Supabase')

    const authUser = await getAuthUser(req)
    if (!authUser?.id) {
      return new Response(
        JSON.stringify({ error: 'Connexion requise pour générer une photo', code: 'AUTH_REQUIRED' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json() as {
      imageBase64: string
      celebrityName: string
      celebrityDomain?: string
      celebrityStyleDescription?: string
      celebrityTraits?: string[]
      funFact?: string
      celebrityImageBase64?: string
      generationMode?: 'presets' | 'custom'
      creationMode?: string
      sceneSource?: string
      photoScene?: PhotoScene
      customPrompt?: string
      interaction?: string
      celebrityId?: string
      userHeightCm?: number
      sessionId?: string
      analysisId?: string
      userId?: string
      email?: string
    }

    const {
      imageBase64,
      celebrityName,
      celebrityDomain,
      celebrityStyleDescription,
      celebrityTraits,
      funFact,
      celebrityImageBase64,
      generationMode,
      photoScene,
      customPrompt,
      interaction,
      sessionId,
      analysisId,
    } = body
    // JWT uniquement — jamais body.userId
    const userId = authUser.id
    const email = authUser.email ?? undefined

    if (!imageBase64 || !celebrityName) throw new Error('imageBase64 et celebrityName requis')

    // Jamais de confiance aveugle au front : la cohérence est revalidée ici.
    if (body.creationMode && body.creationMode !== 'full_generation' && body.creationMode !== 'photo_edit') {
      throw new Error('creationMode invalide (attendu "full_generation" ou "photo_edit")')
    }
    const creationMode: CelebrityCreationMode =
      body.creationMode === 'photo_edit' ? 'photo_edit' : 'full_generation'

    if (body.sceneSource && body.sceneSource !== 'invented' && body.sceneSource !== 'user_photo') {
      throw new Error('sceneSource invalide (attendu "invented" ou "user_photo")')
    }
    if (creationMode === 'photo_edit' && body.sceneSource === 'user_photo') {
      throw new Error('sceneSource interdit en mode photo_edit')
    }
    const sceneSource: SceneSource | undefined =
      creationMode === 'full_generation'
        ? (body.sceneSource === 'user_photo' ? 'user_photo' : 'invented')
        : undefined

    if (interaction !== undefined && !getInteractionPrompt(interaction)) {
      throw new Error('interaction inconnue')
    }

    const mode = generationMode ?? (customPrompt ? 'custom' : 'presets')

    if (creationMode === 'photo_edit') {
      // La photo de base remplace la scène : mélanger les deux serait incohérent.
      if (photoScene) {
        throw new Error('photoScene interdit en mode photo_edit (la photo importée est la scène)')
      }
    } else if (sceneSource === 'user_photo') {
      if (photoScene) {
        throw new Error('photoScene interdit quand on garde la scène de la photo utilisateur')
      }
    } else if (mode === 'custom') {
      if (!customPrompt?.trim() || customPrompt.trim().length < 20) {
        throw new Error('customPrompt requis (minimum 20 caractères)')
      }
    } else if (!photoScene?.location?.trim() || !photoScene?.outfits?.trim() || !photoScene?.position?.trim()) {
      throw new Error('photoScene (lieu, tenues, position) requis')
    }

    // Taille utilisateur : facultative (le parcours « jumeau célèbre » n'en
    // envoie jamais) mais revalidée dès qu'elle est présente.
    if (body.userHeightCm !== undefined && !isValidUserHeightCm(body.userHeightCm)) {
      throw new Error(
        `userHeightCm invalide (entier attendu entre ${MIN_USER_HEIGHT_CM} et ${MAX_USER_HEIGHT_CM} cm)`
      )
    }
    const userHeightCm = isValidUserHeightCm(body.userHeightCm) ? body.userHeightCm : undefined

    const generationContext: PhotoGenerationContext = {
      celebrityName,
      celebrityDomain: celebrityDomain ?? '',
      celebrityStyleDescription: celebrityStyleDescription ?? '',
      traits: Array.isArray(celebrityTraits)
        ? celebrityTraits.filter((t): t is string => typeof t === 'string')
        : undefined,
      funFact: typeof funFact === 'string' ? funFact : undefined,
      mode,
      creationMode,
      sceneSource,
      scene: creationMode === 'full_generation' && sceneSource !== 'user_photo' && mode === 'presets' ? photoScene : undefined,
      customPrompt:
        creationMode === 'photo_edit'
          ? customPrompt?.trim() || undefined
          : sceneSource === 'user_photo'
            ? undefined
            : mode === 'custom'
              ? customPrompt?.trim()
              : undefined,
      interaction: interaction?.trim() || undefined,
      hasCelebrityReferenceImage: Boolean(celebrityImageBase64),
      userHeightCm,
    }

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    // Bypass crédits : uniquement JWT + rôle DB super_admin.
    const appRole = await resolveAppRole(db, authUser.id)
    const unlimitedAccess = hasUnlimitedAccess(appRole)

    const billingSession = await resolveBillingSession(db, { sessionId, userId, email })
    const billingSessionId = billingSession?.id ?? null

    if (!billingSessionId) {
      return new Response(
        JSON.stringify({
          error: 'Session de facturation introuvable. Reconnecte-toi puis réessaie.',
          code: 'APP_SESSION_REQUIRED',
        }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Vérification préalable : ne consomme pas le crédit. Les appels payants
    // Gemini/KIE n'ont lieu que si un crédit est disponible (sauf super_admin).
    if (!unlimitedAccess) {
      const available = billingSession?.credits_balance ?? 0
      if (available < GENERATION_CREDIT_COST) {
        return new Response(
          JSON.stringify({
            error: 'Crédits insuffisants. Achète un pack pour générer une photo.',
            code: 'APP_CREDITS_INSUFFICIENT',
          }),
          { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }
    }

    // La taille de la star n'est jamais fournie par le client : elle est
    // résolue ici à partir du nom / celebrityId StarFusion, puis mise en cache
    // — AVANT l'analyse de composition en photo_edit.
    // La photo célébrité n'est pas une source d'identité nominale : uniquement
    // une référence visuelle pour Nano Banana.
    if (userHeightCm) {
      const starfusionCelebrityId = celebrityIdFromName(celebrityName)
      const heightLookupName = celebrityName
      const celebrityHeight = await resolveCelebrityHeight(db, heightLookupName)
      generationContext.celebrityHeightCm = celebrityHeight.heightCm
      generationContext.celebrityHeightConfidence = celebrityHeight.confidence
      const targetRatio = computeTargetApparentHeightRatio(userHeightCm, celebrityHeight.heightCm)
      if (targetRatio != null) generationContext.celebrityTargetApparentHeightRatio = targetRatio
      logHeightEvent('constraint_applied', {
        celebrityId: celebrityHeight.celebrityId || starfusionCelebrityId,
        lookupName: heightLookupName,
        typedName: celebrityName,
        creationMode,
        userHeightCm,
        celebrityHeightCm: celebrityHeight.heightCm,
        celebrityHeightConfidence: celebrityHeight.confidence,
        targetApparentHeightRatio: generationContext.celebrityTargetApparentHeightRatio ?? null,
        sourceUrl: celebrityHeight.sourceUrl,
      })
    }

    if (creationMode === 'photo_edit') {
      const composition = await analyzePhotoEditComposition(imageBase64, generationContext, kieKey)
      if (!composition.suitable) {
        console.log('[generate] photo_edit scale', JSON.stringify({
          userHeightCm: generationContext.userHeightCm ?? null,
          celebrityHeightCm: generationContext.celebrityHeightCm ?? null,
          targetApparentHeightRatio: generationContext.celebrityTargetApparentHeightRatio ?? null,
          celebrityPlacementInstruction: null,
          kieModel: resolvePhotoEditModel(),
          suitable: false,
        }))
        return new Response(
          JSON.stringify({
            error: 'Cette photo ne permet pas d’ajouter la star de façon naturelle sans modifier la scène. Choisis une photo avec un peu plus d’espace autour de toi.',
            code: 'SOURCE_PHOTO_UNSUITABLE',
          }),
          { status: 422, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }
      generationContext.celebrityPlacementInstruction = composition.celebrityPlacementInstruction
      if (composition.targetApparentHeightRatio != null) {
        generationContext.celebrityTargetApparentHeightRatio = composition.targetApparentHeightRatio
      }
      console.log('[generate] photo_edit scale', JSON.stringify({
        userHeightCm: generationContext.userHeightCm ?? null,
        celebrityHeightCm: generationContext.celebrityHeightCm ?? null,
        targetApparentHeightRatio: generationContext.celebrityTargetApparentHeightRatio ?? null,
        celebrityPlacementInstruction: generationContext.celebrityPlacementInstruction,
        kieModel: resolvePhotoEditModel(),
        suitable: true,
      }))
    }

    const sceneSummary = buildSceneSummary(generationContext)

    let creditsBalance: number | undefined = billingSession?.credits_balance ?? undefined
    let creditReserved = false

    if (!unlimitedAccess) {
      const { data: consumeRaw, error: consumeErr } = await db.rpc('consume_generation_credit', {
        p_session_id: billingSessionId,
        p_amount: GENERATION_CREDIT_COST,
      })
      const consume = (consumeRaw ?? null) as { ok?: boolean; new_balance?: number } | null
      if (consumeErr) {
        console.error('[generate] consume_generation_credit failed:', consumeErr.message)
        return new Response(
          JSON.stringify({
            error: 'Le débit de crédit est temporairement indisponible. Réessaie dans un instant.',
            code: 'APP_CREDIT_DEBIT_UNAVAILABLE',
          }),
          { status: 503, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }
      if (!consume?.ok) {
        return new Response(
          JSON.stringify({
            error: 'Crédits insuffisants. Achète un pack pour générer une photo.',
            code: 'APP_CREDITS_INSUFFICIENT',
          }),
          { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }
      creditsBalance = typeof consume.new_balance === 'number' ? consume.new_balance : undefined
      creditReserved = true
    }

    // Mémoriser la taille — best-effort.
    if (userHeightCm) {
      try {
        await db.from('sessions').update({ height_cm: userHeightCm }).eq('id', billingSessionId)
      } catch (err) {
        logHeightEvent('user_height_persist_failed', { error: getErrorMessage(err) })
      }
    }

    let generatedBase64: string
    const tempPaths: string[] = []
    try {
      const imageUrl = await resolveReferenceImageUrl(imageBase64, kieKey, tempPaths)
      const imageUrls = [imageUrl]
      if (celebrityImageBase64) {
        imageUrls.push(await resolveReferenceImageUrl(celebrityImageBase64, kieKey, tempPaths))
      }
      const taskId = await createTask(imageUrls, generationContext, kieKey)
      const resultUrl = await pollTask(taskId, kieKey)

      const imgRes = await fetch(resultUrl)
      const imgBuf = await imgRes.arrayBuffer()
      const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'
      const b64 = arrayBufferToBase64(imgBuf)
      generatedBase64 = `data:${contentType};base64,${b64}`
    } catch (genErr) {
      // Rembourse le crédit réservé si la génération IA échoue
      if (creditReserved && billingSessionId) {
        try {
          const { data: refundRaw } = await db.rpc('refund_generation_credit', {
            p_session_id: billingSessionId,
            p_amount: GENERATION_CREDIT_COST,
          })
          const refund = refundRaw as { ok?: boolean; new_balance?: number } | null
          if (refund?.ok && typeof refund.new_balance === 'number') {
            creditsBalance = refund.new_balance
          } else {
            const { data: sess } = await db
              .from('sessions')
              .select('credits_balance')
              .eq('id', billingSessionId)
              .maybeSingle()
            const bal = (sess?.credits_balance ?? 0) + GENERATION_CREDIT_COST
            await db.from('sessions').update({ credits_balance: bal }).eq('id', billingSessionId)
            await db.from('credit_transactions').insert({
              session_id: billingSessionId,
              amount: GENERATION_CREDIT_COST,
              reason: 'refund',
              reference_id: null,
            })
            creditsBalance = bal
          }
        } catch (refundErr) {
          console.warn('[generate] credit refund failed:', refundErr)
        }
      }
      throw genErr
    } finally {
      await removeTempObjects(tempPaths)
    }

    let generationId: string | undefined

    try {
      const generationRow = {
        session_id: billingSessionId,
        analysis_id: analysisId?.trim() ? analysisId.trim() : null,
        celebrity_name: celebrityName,
        unlocked: true,
        scene_summary: sceneSummary || null,
        user_id: userId,
      }

      let inserted = await db
        .from('generations')
        .insert({ ...generationRow, creation_mode: creationMode })
        .select('id')
        .single()

      if (inserted.error) {
        inserted = await db.from('generations').insert(generationRow).select('id').single()
      }

      generationId = inserted.data?.id
    } catch (dbErr) {
      console.warn('[generate] generation insert failed:', dbErr)
    }

    return new Response(
      JSON.stringify({ imageBase64: generatedBase64, generationId, creditsBalance }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = getErrorMessage(err)
    console.error('[generate]', message)

    // Erreur côté fournisseur IA (kie.ai) : ex. leur propre code 402 pour
    // solde insuffisant sur LEUR compte. Ne jamais confondre avec les
    // crédits de l'utilisateur (APP_CREDITS_INSUFFICIENT ci-dessus, status 402).
    const lower = message.toLowerCase()
    const isKieVendorCreditError =
      lower.includes('kie.ai') && (lower.includes('code 402') || lower.includes('insufficient') || lower.includes('balance'))

    return new Response(
      JSON.stringify({
        error: message,
        code: isKieVendorCreditError ? 'KIE_VENDOR_INSUFFICIENT' : undefined,
      }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
