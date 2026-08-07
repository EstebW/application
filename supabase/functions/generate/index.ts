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

const KIE_API_BASE = 'https://api.kie.ai'
const KIE_FILE_API_BASE = 'https://kieai.redpandaai.co'
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 90_000
const GENERATION_CREDIT_COST = 1

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
  scene?: PhotoScene
  customPrompt?: string
  interaction?: string
  hasCelebrityReferenceImage?: boolean
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
  const searchUrl =
    'https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&limit=3' +
    `&language=fr&uselang=fr&search=${encodeURIComponent(name)}`
  const search = await fetchHeightJson<{ search?: { id?: string }[] }>(searchUrl, signal)
  const ids = (search.search ?? []).map((s) => s.id).filter((id): id is string => Boolean(id))
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
          '- Allowed changes for Person B ONLY: body pose, outfit, and scene lighting falling on an UNCHANGED face.',
          '',
          'FAILURE CONDITIONS (either one fails the whole result):',
          '- Person A is not instantly recognizable as the exact same person as image_input[0].',
          '- Person A\'s hair color/style or face width/volume differs from image_input[0].',
          '- Person B is not instantly recognizable as the exact same person as image_input[1].',
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
      ? `- Person B name label only (do not reinvent the face): ${celebrityName}${domain ? `, ${domain}` : ''}.`
      : `- Person B (CELEBRITY): ${celebrityName}${domain ? `, ${domain}` : ''} — separate person beside Person A. Do NOT borrow Person B\'s hair color, face shape, or features for Person A.`,
    !dual && style ? `- Celebrity styling for Person B only (Person B clothes/vibe ONLY — never Person A\'s hair, face, or makeup): ${style}.` : '',
    mood ? `- Scene mood / energy only (NOT faces, NOT Person A\'s hair): ${mood}.` : '',
  ]

  const requirements = [
    'SCENE REQUIREMENTS (secondary to face locks, but must still obey the brief):',
    '- Both people clearly visible in ONE cohesive real photograph.',
    '- Natural bodies/poses; faces remain identity-locked as above.',
    '- Tasteful, family-friendly content.',
    '- Single photo — not a collage, not a side-by-side split, not a face-swap glitch.',
    '- If anything conflicts with the face locks, DROP the conflicting detail and KEEP the faces.',
  ]

  const finalReminder = dual
    ? [
        'FINAL MANDATORY CHECK:',
        '1) Compare Person A\'s output face to image_input[0] — must be the same person, unedited identity.',
        '2) Compare Person B\'s output face to image_input[1] — must be the same person, unedited identity.',
        '3) Does it look like a raw smartphone snap (Snapchat/BeReal/Stories), NOT AI/CGI/studio/glamour? If not, fix realism.',
        '4) Does the scene match the user brief specifically (not a generic celebrity cliché)? If not, fix the scene.',
        '5) Face integrity > scene beauty, but face locks AND amateur-phone realism AND brief fidelity are all required.',
      ]
    : [
        'FINAL MANDATORY CHECK:',
        '1) Compare Person A\'s output face to image_input[0] — same person, same face width/volume, same features, unedited identity.',
        '2) Compare Person A\'s hair to image_input[0] — same color, texture, length, and style (no celebrity hair transplant).',
        '3) Person A must NOT look like a blend/average with the celebrity.',
        '4) Does it look like a raw smartphone snap (Snapchat/BeReal/Stories), NOT AI/CGI/studio/glamour? If not, fix realism.',
        '5) Does the scene match the user brief specifically? If not, fix the scene.',
        '6) Face + hair integrity of Person A > scene beauty. If identity drifted, the result is invalid.',
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

  if (mode === 'custom' && customPrompt) {
    const userPrompt = sanitizeSceneText(customPrompt)
    return [
      opener,
      '',
      ...facePreservationBlock(dual),
      '',
      ...photorealismBlock(celebrityName),
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
    heightSection,
    '',
    'USER SCENE BRIEF (setting/outfits/pose ONLY — faces stay locked; follow literally):',
    `1. LOCATION / SETTING: ${location}`,
    `2. OUTFITS for both people: ${outfits}`,
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

/** « Ajouter la star à ma photo » — la photo importée est la base immuable. */
function buildPhotoEditPrompt(ctx: PhotoGenerationContext): string {
  const { celebrityName, celebrityDomain, interaction, customPrompt, hasCelebrityReferenceImage } = ctx
  const celeb = sanitizeSceneText(celebrityName) || 'the celebrity'
  const domain = sanitizeSceneText(celebrityDomain)
  const dual = Boolean(hasCelebrityReferenceImage)
  const interactionPrompt = getInteractionPrompt(interaction)
  // Précision facultative de l'utilisateur : jamais prioritaire sur la préservation.
  const userHint = customPrompt ? sanitizeSceneText(customPrompt).slice(0, 300) : ''

  return [
    'INVISIBLE INTEGRATION OF A CELEBRITY INTO AN EXISTING PHOTOGRAPH.',
    '',
    'Edit the uploaded photograph instead of generating an entirely new image.',
    '',
    'Treat the uploaded photograph as the immutable visual base of the final result.',
    '',
    `The goal is to add ${celeb}${domain ? ` (${domain})` : ''} naturally into the existing photograph, so that it looks as if they had really been present at the moment the original photo was taken.`,
    '',
    'image_input ORDER:',
    '- image_input[0] = THE BASE PHOTOGRAPH (immutable). It defines EVERYTHING: camera, framing, perspective, eye level, lighting and image quality. It contains the user.',
    ...(dual
      ? [
          `- image_input[1] = FACIAL IDENTITY REFERENCE ONLY for ${celeb}.`,
          '- CRITICAL: image_input[1] is NOT a cutout to paste. Never copy its framing, crop, head size, head angle, body pose, clothing scale, background, lighting or image quality. Take the facial identity from it and NOTHING else.',
          `- If image_input[1] shows only a head or upper body, generate the rest of ${celeb}'s body naturally, consistent with their real build and with the framing of image_input[0].`,
          `- ${celeb}'s facial identity must match image_input[1] exactly — same features, same hair. Do not invent a generic celebrity face and do not blend their face with the user's.`,
        ]
      : []),
    '',
    'DO NOT ASSUME THIS IS A GROUP PHOTO.',
    '',
    'Do not change the type of photo, the setting, the composition, the mood or the intent of the original photograph.',
    '',
    `Adapt ${celeb} to the existing image, whether it is a selfie, a portrait, a full-body shot, an indoor photo, an outdoor photo, an amateur snapshot, a party, a car interior, a street, a beach, a restaurant, a concert or any other real-life situation.`,
    '',
    'PRESERVE THE ORIGINAL PHOTOGRAPH AND THE PERSON ALREADY IN IT AS MUCH AS POSSIBLE.',
    '',
    'Do not regenerate, replace, beautify, redraw, smooth, sharpen or reinterpret the user.',
    '',
    'Preserve exactly: their identity; their face; their facial proportions; their expression; their skin texture; their hairstyle; their body; their posture; their hands; their clothing; their accessories.',
    '',
    'Preserve the original photographic characteristics as well: the background; the objects; the framing; the crop; the camera angle; the perspective; the horizon line; the apparent focal length; the resolution; the lighting; the shadows; the reflections; the colours; the sharpness; the blur; the depth of field; the grain; the digital noise; the compression artefacts; the visual signature of the camera or smartphone that took the photo.',
    '',
    `Only add ${celeb} into a physically believable available area of the photograph.`,
    '',
    `${celeb}'s position, posture, body orientation, expression, interaction and visibility must adapt naturally to the existing scene.`,
    '',
    'Do not impose a posture or an interaction that is incompatible with the original photograph.',
    '',
    `${celeb} must match the source photo precisely in terms of: perspective; camera height; body scale; distance from the camera; light direction; light intensity; shadow softness; exposure; white balance; colour temperature; colour cast; contrast; saturation; dynamic range; sharpness; focus softness; motion blur; depth of field; skin detail level; sensor noise; grain; compression; lens distortion; overall image quality.`,
    '',
    `${celeb} must NEVER appear sharper, cleaner, brighter, more detailed, more saturated, more contrasted or more professionally photographed than the user or the original environment.`,
    '',
    'If the source photograph is dark, soft, slightly blurry, grainy, noisy, compressed, desaturated, imperfectly exposed or of average quality, reproduce those exact same imperfections on the added celebrity.',
    '',
    `${celeb} must feel physically present in the environment. Use realistically: ground placement; perspective; body scale; contact shadows; cast shadows; light bounced from the environment; contour softness; overlaps; natural occlusions; spacing between people and objects; interaction with nearby objects; interaction with the user when appropriate.`,
    '',
    `${celeb} must not look pasted, floating, cut out, superimposed or photographed with a different camera.`,
    '',
    'GEOMETRY AND SCALE — THIS IS THE #1 FAILURE POINT, TREAT IT AS CRITICAL:',
    `- Render ${celeb} as a COMPLETE, coherent human being physically present in the scene. Never a floating head, never a head-and-shoulders cutout, never a sticker pasted on top of the photo.`,
    '- Their head-to-body proportions must be anatomically correct. A head without a matching body, or a head too large for its body, is an automatic failure.',
    '- Size their head like a real human head at their actual distance from the camera: compare it to the user\'s head and scale it by depth — slightly smaller when further away, never bigger unless they are clearly closer to the lens.',
    '- Use the SAME eye level, horizon line, camera height, lens focal length and perspective vanishing lines as image_input[0]. Their gaze and head tilt must be consistent with that camera position.',
    '- Ground them physically: plausible standing or seated position, weight supported by the floor, feet visible or naturally occluded by the user, furniture or the frame border.',
    '- If image_input[0] is a close-range selfie, place them at arm\'s length beside or slightly behind the user, sharing the same wide-angle distortion, partially occluded by the user or the frame — exactly as it would happen in real life.',
    '- If the frame cuts them off, it must read as natural photographic framing: a continuous body cut by the image border, never a detached silhouette floating inside the frame.',
    '- Blend their edges into the photograph: no hard cutout outline, no halo, no fringe. Their contours must carry the same softness, motion blur, grain and JPEG compression as the surrounding pixels.',
    `- Do not reuse or re-attribute the user's limbs. Any arm or hand belonging to ${celeb} must be anatomically connected to their own body. Never add a limb without a body.`,
    '- Never duplicate people, faces, hands or limbs.',
    '',
    heightConsistencyBlock(ctx).join('\n'),
    '',
    'DO NOT reconstruct the whole scene.',
    'DO NOT globally enhance or upgrade the photograph.',
    'DO NOT add cinematic lighting.',
    'DO NOT add studio lighting.',
    'DO NOT create fake HDR.',
    'DO NOT create fake background blur.',
    'DO NOT create shiny, plastic or artificial skin.',
    'DO NOT turn the image into a promotional, advertising, editorial, cinematic or poster photograph.',
    'DO NOT crop or reframe the image unless absolutely necessary.',
    '',
    `Make only the changes strictly necessary to integrate ${celeb} naturally into the original photograph.`,
    '',
    'AVOID: pasted cutout look, sticker effect, collage, photomontage, floating head or torso, disembodied head, oversized or undersized head, wrong head-to-body ratio, mismatched perspective, mismatched eye level, subject sharper than the photo, hard edges, halo outline, distorted anatomy, incoherent shadows, duplicated objects, altered faces, artificial skin and any obvious AI-generated appearance.',
    '',
    ...(interactionPrompt
      ? [
          'OPTIONAL INTERACTION (only if it fits the existing photo without moving or reshaping the user):',
          `- Preferred: ${sanitizeSceneText(interactionPrompt)}.`,
          '- If this interaction would require changing the user\'s pose, body, framing or background, IGNORE it and simply place the celebrity in the free space.',
          '',
        ]
      : []),
    ...(userHint
      ? [
          'OPTIONAL USER NOTE (lowest priority — never overrides the rules above):',
          userHint,
          '- Ignore any part of this note that would modify the user, the background or the framing.',
          '',
        ]
      : []),
    'FINAL GOAL:',
    'The edited result must look like ONE single real photograph taken at the same moment with the same camera.',
    'Someone looking at the image must not be able to tell which person was added after the shot.',
    '',
    'FINAL MANDATORY CHECK:',
    '1) Is the user pixel-identical to image_input[0] (face, pose, clothes, expression)? If not, redo without touching them.',
    '2) Is the background the ORIGINAL background, not a recreated one? If not, redo.',
    `3) Is ${celeb} a COMPLETE person with a correctly proportioned body, head size, eye level and perspective consistent with the user? If not, fix the geometry before anything else.`,
    `4) Is ${celeb} exactly as soft, grainy, noisy and imperfect as the rest of the photograph — never cleaner or sharper? If not, degrade them to match.`,
    '5) Does any part look pasted — hard edges, halo, floating body, sticker, mismatched sharpness? If yes, re-integrate with matching grain, blur, shadows and depth of field.',
    '6) Could a stranger tell which person was added? If yes, the edit has failed.',
    '7) Preserving the original photo always wins over a nicer composition.',
  ].filter((line) => line !== '').join('\n')
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

async function uploadToSupabaseStorage(imageBase64: string): Promise<string | null> {
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

    const { data } = db.storage.from('temp-images').getPublicUrl(path)
    return data.publicUrl
  } catch (err) {
    console.warn('[generate] Supabase storage upload error:', err)
    return null
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

async function resolveReferenceImageUrl(imageBase64: string, apiKey: string): Promise<string> {
  const publicUrl = await uploadToSupabaseStorage(imageBase64)
  if (publicUrl) {
    const kieUrl = await uploadUrlToKie(publicUrl, apiKey)
    if (kieUrl) return kieUrl
    return publicUrl
  }

  return uploadBase64ToKie(imageBase64, apiKey)
}

async function createTask(
  imageUrls: string[],
  ctx: PhotoGenerationContext,
  apiKey: string
): Promise<string> {
  const prompt = buildPhotoPrompt(ctx)
  console.log('[nano-banana-2] prompt:', prompt)

  const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'nano-banana-2',
      input: {
        prompt,
        image_input: imageUrls,
        aspect_ratio: 'auto',
        resolution: '2K',
        output_format: 'jpg',
      },
    }),
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
  throw new Error('Nano Banana 2: timeout 90 secondes')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const kieKey = Deno.env.get('KIE_API_KEY')
    if (!kieKey) throw new Error('KIE_API_KEY non configurée dans les secrets Supabase')

    const authUser = await getAuthUser(req)
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
    const userId = bindUserId(authUser, body.userId)
    const email = authUser?.email ?? body.email

    if (!imageBase64 || !celebrityName) throw new Error('imageBase64 et celebrityName requis')

    // Jamais de confiance aveugle au front : la cohérence est revalidée ici.
    if (body.creationMode && body.creationMode !== 'full_generation' && body.creationMode !== 'photo_edit') {
      throw new Error('creationMode invalide (attendu "full_generation" ou "photo_edit")')
    }
    const creationMode: CelebrityCreationMode =
      body.creationMode === 'photo_edit' ? 'photo_edit' : 'full_generation'

    if (interaction !== undefined && !getInteractionPrompt(interaction)) {
      throw new Error('interaction inconnue')
    }

    const mode = generationMode ?? (customPrompt ? 'custom' : 'presets')

    if (creationMode === 'photo_edit') {
      // La photo de base remplace la scène : mélanger les deux serait incohérent.
      if (photoScene) {
        throw new Error('photoScene interdit en mode photo_edit (la photo importée est la scène)')
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
      scene: creationMode === 'full_generation' && mode === 'presets' ? photoScene : undefined,
      customPrompt:
        creationMode === 'photo_edit'
          ? customPrompt?.trim() || undefined
          : mode === 'custom'
            ? customPrompt?.trim()
            : undefined,
      interaction: interaction?.trim() || undefined,
      hasCelebrityReferenceImage: Boolean(celebrityImageBase64),
      userHeightCm,
    }

    const sceneSummary = buildSceneSummary(generationContext)

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    // La taille de la star n'est jamais fournie par le client : elle est
    // résolue ici à partir du nom, puis mise en cache.
    if (userHeightCm) {
      const celebrityHeight = await resolveCelebrityHeight(db, celebrityName)
      generationContext.celebrityHeightCm = celebrityHeight.heightCm
      generationContext.celebrityHeightConfidence = celebrityHeight.confidence
      logHeightEvent('constraint_applied', {
        celebrityId: celebrityHeight.celebrityId,
        creationMode,
        userHeightCm,
        celebrityHeightCm: celebrityHeight.heightCm,
        celebrityHeightConfidence: celebrityHeight.confidence,
      })
    }

    const billingSession = (sessionId || userId || email?.trim())
      ? await resolveBillingSession(db, { sessionId, userId, email })
      : null
    const billingSessionId = billingSession?.id ?? sessionId

    if (billingSessionId) {
      const balance = billingSession?.credits_balance ?? 0
      if (balance < GENERATION_CREDIT_COST) {
        return new Response(
          JSON.stringify({
            error: 'Crédits insuffisants. Achète un pack pour générer une photo.',
            code: 'APP_CREDITS_INSUFFICIENT',
          }),
          { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Mémoriser la taille pour préremplir les prochaines générations.
    // Best-effort isolé : la colonne arrive par migration et son absence ne
    // doit jamais empêcher une génération déjà payée.
    if (billingSessionId && userHeightCm) {
      try {
        await db.from('sessions').update({ height_cm: userHeightCm }).eq('id', billingSessionId)
      } catch (err) {
        logHeightEvent('user_height_persist_failed', { error: getErrorMessage(err) })
      }
    }

    const imageUrl = await resolveReferenceImageUrl(imageBase64, kieKey)
    const imageUrls = [imageUrl]
    if (celebrityImageBase64) {
      imageUrls.push(await resolveReferenceImageUrl(celebrityImageBase64, kieKey))
    }
    const taskId = await createTask(imageUrls, generationContext, kieKey)
    const resultUrl = await pollTask(taskId, kieKey)

    const imgRes = await fetch(resultUrl)
    const imgBuf = await imgRes.arrayBuffer()
    const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'
    const b64 = arrayBufferToBase64(imgBuf)
    const generatedBase64 = `data:${contentType};base64,${b64}`

    let generationId: string | undefined
    let creditsBalance: number | undefined

    if (billingSessionId) {
      try {
        const { data: session } = await db
          .from('sessions')
          .select('credits_balance')
          .eq('id', billingSessionId)
          .single()

        const currentBalance = session?.credits_balance ?? 0
        const newBalance = currentBalance - GENERATION_CREDIT_COST

        const generationRow = {
          session_id: billingSessionId,
          // "" n'est pas un UUID Postgres valide — même piège que payment/index.ts.
          analysis_id: analysisId?.trim() ? analysisId.trim() : null,
          celebrity_name: celebrityName,
          unlocked: true,
          scene_summary: sceneSummary || null,
          ...(userId ? { user_id: userId } : {}),
        }

        let inserted = await db
          .from('generations')
          .insert({ ...generationRow, creation_mode: creationMode })
          .select('id')
          .single()

        // La colonne creation_mode arrive par migration : sans elle, on insère quand
        // même la génération pour ne pas casser le débit de crédits.
        if (inserted.error) {
          inserted = await db.from('generations').insert(generationRow).select('id').single()
        }

        generationId = inserted.data?.id

        await db
          .from('sessions')
          .update({ credits_balance: newBalance })
          .eq('id', billingSessionId)

        await db.from('credit_transactions').insert({
          session_id: billingSessionId,
          amount: -GENERATION_CREDIT_COST,
          reason: 'generation',
          reference_id: generationId ?? null,
        })

        creditsBalance = newBalance
      } catch (dbErr) {
        console.warn('[generate] DB update failed:', dbErr)
      }
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
