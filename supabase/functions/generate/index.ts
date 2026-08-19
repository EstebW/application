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
/** Durée max côté client (plusieurs appels poll courts). */
const CLIENT_POLL_TIMEOUT_MS = 300_000
const JOB_MAX_AGE_MS = 30 * 60 * 1000
const GENERATION_CREDIT_COST = 1
const COMPOSITION_MODEL = 'gemini-3-flash'
const COMPOSITION_ENDPOINT = '/gemini-3-flash/v1/chat/completions'
const COMPOSITION_TEMPERATURE = 0.2
const TEMP_SIGNED_URL_TTL_SEC = 300
/** KIE Nano Banana refuse au-delà de 5000 caractères (prompt interne, pas le champ UI). */
const KIE_PROMPT_MAX_CHARS = 4900

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

type PromptSectionKind = 'protected' | 'secondary' | 'other'

interface PromptSection {
  kind: PromptSectionKind
  text: string
}

const PROTECTED_SECTION_HEADER =
  /^(ABSOLUTE PRIORITY — FACIAL IDENTITY LOCK|FACIAL IDENTITY LOCK|PERSON A HARD LOCK|PERSON B HARD LOCK|USER SCENE BRIEF|USER SCENE PROMPT|KEEP THE USER PHOTO SCENE|PLACEMENT|PHYSICAL HEIGHT|PHYSICAL SCALE|SCALE:|PHOTOREALISM|NATURAL MOMENT LOCK|SELFIE LOCK|VERROUILLAGE PHOTO SOURCE)/i
const SECONDARY_SECTION_HEADER =
  /^(SCENE REQUIREMENTS|FINAL MANDATORY CHECK|SUBJECTS:)/i
const OTHER_SECTION_HEADER =
  /^(WARDROBE|MODE:|IMAGE ORDER|GOAL:|INTERACTION:|LIGHTING:|FORBIDDEN|PRIORITY \d)/i

function classifySectionHeader(line: string): PromptSectionKind | null {
  if (PROTECTED_SECTION_HEADER.test(line)) return 'protected'
  if (SECONDARY_SECTION_HEADER.test(line)) return 'secondary'
  if (OTHER_SECTION_HEADER.test(line)) return 'other'
  return null
}

function splitPromptSections(prompt: string): PromptSection[] {
  const lines = prompt.split('\n')
  const sections: PromptSection[] = []
  let kind: PromptSectionKind = 'other'
  let current: string[] = []

  const flush = () => {
    if (current.length === 0) return
    sections.push({ kind, text: current.join('\n') })
    current = []
  }

  for (const line of lines) {
    const headerKind = classifySectionHeader(line)
    if (headerKind) {
      flush()
      kind = headerKind
    }
    current.push(line)
  }
  flush()
  return sections
}

function joinPromptSections(sections: PromptSection[]): string {
  return sections
    .map((section) => section.text)
    .filter((text) => text.trim().length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

function trimProtectedSectionsToFit(sections: PromptSection[], maxChars: number): string {
  const parsed = sections.map((section) => {
    const newline = section.text.indexOf('\n')
    if (newline < 0) return { header: section.text, body: '' }
    return { header: section.text.slice(0, newline), body: section.text.slice(newline + 1) }
  })
  const headerCost = parsed.reduce((sum, part, index) => (
    sum + part.header.length + (index > 0 || part.body ? 1 : 0)
  ), 0)
  let budget = maxChars - headerCost
  if (budget < 0) {
    let out = ''
    for (const part of parsed) {
      const next = out ? `${out}\n${part.header}` : part.header
      if (next.length > maxChars) break
      out = next
    }
    return out
  }
  return parsed.map((part) => {
    const body = part.body.slice(0, Math.max(0, budget))
    budget -= body.length
    return body ? `${part.header}\n${body}` : part.header
  }).join('\n')
}

/**
 * Garde-fou KIE : ne coupe jamais en tête du prompt (ce qui supprimait le brief).
 * On retire d'abord les sections secondaires, puis le texte non protégé.
 */
function clampKiePrompt(
  prompt: string,
  maxChars = KIE_PROMPT_MAX_CHARS,
): { prompt: string; truncated: boolean } {
  if (prompt.length <= maxChars) return { prompt, truncated: false }

  let sections = splitPromptSections(prompt).filter((section) => section.kind !== 'secondary')
  let next = joinPromptSections(sections)
  if (next.length <= maxChars) return { prompt: next, truncated: true }

  let overflow = next.length - maxChars
  for (let i = sections.length - 1; i >= 0 && overflow > 0; i--) {
    if (sections[i].kind !== 'other') continue
    const originalLen = sections[i].text.length
    const kept = sections[i].text.slice(0, Math.max(0, originalLen - overflow)).trimEnd()
    sections[i] = { ...sections[i], text: kept }
    overflow -= originalLen - kept.length
  }
  sections = sections.filter((section) => section.text.trim().length > 0)
  next = joinPromptSections(sections)
  if (next.length <= maxChars) return { prompt: next, truncated: true }

  const protectedSections = sections.filter((section) => section.kind === 'protected')
  const otherSections = sections.filter((section) => section.kind === 'other')
  let rebuilt = joinPromptSections(protectedSections)
  if (rebuilt.length > maxChars) {
    rebuilt = trimProtectedSectionsToFit(protectedSections, maxChars)
  }
  for (const section of otherSections) {
    if (rebuilt.length >= maxChars) break
    const separator = rebuilt ? '\n' : ''
    const room = maxChars - rebuilt.length - separator.length
    if (room <= 0) break
    rebuilt += separator + (section.text.length <= room ? section.text : section.text.slice(0, room))
  }
  if (rebuilt.length > maxChars) rebuilt = rebuilt.slice(0, maxChars)
  return { prompt: rebuilt, truncated: true }
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

/** Selfie path : DB/mémoire uniquement — pas de Wikidata (économise 0–15 s). */
async function resolveCelebrityHeightCacheOnly(db: DbClient, celebrityName: string): Promise<CelebrityHeight> {
  const celebrityId = celebrityIdFromName(celebrityName)
  if (!celebrityId) return unknownCelebrityHeight('')

  const cached = heightMemoryCache.get(celebrityId)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  try {
    const { data } = await db
      .from('celebrity_heights')
      .select('celebrity_id, height_cm, source_url, verified_at, confidence')
      .eq('celebrity_id', celebrityId)
      .maybeSingle()
    const row = data as Pick<HeightRow, 'celebrity_id' | 'height_cm' | 'source_url' | 'verified_at' | 'confidence'> | null
    if (row?.height_cm != null) {
      const value: CelebrityHeight = {
        celebrityId: row.celebrity_id,
        heightCm: row.height_cm,
        sourceUrl: row.source_url,
        verifiedAt: row.verified_at,
        confidence: row.confidence,
      }
      heightMemoryCache.set(celebrityId, { value, expiresAt: Date.now() + HEIGHT_MEMORY_TTL_MS })
      return value
    }
  } catch (err) {
    logHeightEvent('cache_read_failed', { celebrityId, error: getErrorMessage(err) })
  }

  return unknownCelebrityHeight(celebrityId)
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

/** Doit rester aligné sur heightConsistencyBlock dans lib/height-prompt.ts. */
function heightConsistencyBlock(ctx: PhotoGenerationContext): string[] {
  const { userHeightCm, celebrityHeightCm, creationMode } = ctx
  if (!userHeightCm) return []

  const photoEditLines =
    creationMode === 'photo_edit'
      ? [
          "The user's existing body in the uploaded photograph is immutable.",
          'Do not resize, stretch, reconstruct or alter the user to enforce the stated height.',
          "Use the user's visible body and the declared height only as a reference for calculating the celebrity's physically believable scale.",
          'Adapt the added celebrity to the original photograph, not the original user to the celebrity.',
        ]
      : []

  if (!celebrityHeightCm) {
    return [
      'PHYSICAL SCALE AND PERSPECTIVE CONSISTENCY:',
      `The user's real height is ${userHeightCm} centimeters.`,
      "The celebrity's exact verified height is currently unavailable.",
      "Use realistic adult scale. Do not exaggerate the celebrity's size. Keep both people on the same ground plane.",
      ...photoEditLines,
    ]
  }

  return [
    'PHYSICAL HEIGHT, SCALE AND PERSPECTIVE CONSISTENCY:',
    `The user's real height is ${userHeightCm} centimeters.`,
    `The celebrity's real height is ${celebrityHeightCm} centimeters.`,
    'Respect the real-world height difference. Scale the full body, not just the head. Do not make the celebrity larger because they are famous, and do not resize the user to improve composition.',
    'Keep both people on a shared ground plane. If feet are hidden, infer scale from shoulders and head. Small real differences stay subtle.',
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
    'ABSOLUTE PRIORITY — FACIAL IDENTITY LOCK:',
    dual
      ? 'IDENTITY-PRESERVING COMPOSITE with TWO reference photos. Not face generation, not beautification.'
      : "IDENTITY-PRESERVING EDIT of Person A from image_input[0]. Never transfer the celebrity's look onto Person A.",
    dual
      ? '- image_input[0] = Person A (USER). image_input[1] = Person B (CELEBRITY).'
      : '- image_input[0] = Person A (USER) — sole identity source for Person A.',
    'PERSON A HARD LOCK:',
    '- Same person as image_input[0]: bone structure, face width, jaw, eyes, nose, lips, skin, age, marks.',
    '- HAIR LOCK: exact color, texture, length, volume, parting, hairline, style. Do not restyle to match the celebrity.',
    '- Do not morph, blend, beautify, slim, puff, or average Person A with the celebrity.',
    '- Allowed for Person A: pose, clothes (unless kept), hands, scene lighting on an UNCHANGED face and hair.',
    ...(dual
      ? [
          'PERSON B HARD LOCK:',
          '- Copy face and hair from image_input[1]. Do not invent a generic lookalike. Clothes from image_input[1] are NOT locked — dress for the scene.',
          'FAIL if either face is not instantly the same person, if Person A hair/face width drifted, or if Person B keeps iconic clothes when the scene is casual.',
        ]
      : [
          'PERSON B is a different person. Never nudge Person A toward Person B.',
          'FAIL if Person A is not the same person as image_input[0], if hair/face width changed, or if Person A looks like a hybrid with the celebrity.',
        ]),
  ]
}

/** Anti-"AI look" : photo smartphone amateur, indiscernable d'une vraie photo. */
function photorealismBlock(celebrityName: string): string[] {
  const celeb = sanitizeSceneText(celebrityName) || 'the celebrity'
  return [
    'PHOTOREALISM — amateur smartphone snap (after face locks):',
    `Ordinary phone-gallery photo with ${celeb}: candid, slightly soft, not studio, glamour, influencer, editorial, CGI, or a polished composite.`,
    'No beauty filter, no AI-smooth skin, no porcelain/waxy/plastic finish, no airbrush. Skin must look like unretouched real skin — that ordinary texture is what makes the photo beautiful and believable.',
    'Natural non-distinctive imperfections only: visible pores, slight uneven tone, subtle under-eye texture, fine lines, facial asymmetry. Do not invent new moles, scars, or distinctive marks. Realistic hair. Slight grain, compression, imperfect candid framing.',
    `BOTH people share the source photo's grain, softness, sharpness, noise, exposure, white balance and non-retouched skin. ${celeb} must never look smoother, cleaner, sharper, or more retouched than the user.`,
    'Natural spontaneous expressions and body language. Follow the USER SCENE BRIEF literally.',
  ]
}

function naturalMomentBlock(): string[] {
  return [
    'NATURAL MOMENT LOCK: the result must look like a genuine candid shared moment between two real people already together, not two subjects placed side by side.',
    'Relaxed posture, subtle torso rotation, slight lean/head tilt, natural asymmetry, believable proximity. A slight lean-in or arm around shoulder/waist/back is allowed if it improves realism. Small pose tweaks OK for a believable instant.',
    'Avoid stiff, static, symmetrical, overly frontal/centered, or cutout-next-to-user poses. Expressions unforced. Realism = photographic texture AND living human interaction.',
  ]
}

/**
 * Tenues adaptées au lieu — pas aux habits iconiques de la star
 * (ex. Macron en costard dans un parc → tenue civile décontractée).
 */
function sceneAdaptiveWardrobeBlock(celebrityName: string): string[] {
  const celeb = sanitizeSceneText(celebrityName) || 'the celebrity'
  return [
    'WARDROBE: dress BOTH people for THIS location and outfit brief.',
    `Ignore ${celeb}'s iconic / stage / suit / jersey look and any clothes in the reference photos. Casual place = casual clothes unless the brief asks otherwise.`,
  ]
}

const MAX_CELEBRITY_NAME_CHARS = 80
const MAX_CELEBRITY_DOMAIN_CHARS = 80
const MAX_SCENE_FIELD_CHARS = 220

function boundPromptField(text: string, maxChars: number): string {
  const cleaned = sanitizeSceneText(text)
  return cleaned.length <= maxChars ? cleaned : cleaned.slice(0, maxChars)
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
  const starName = boundPromptField(celebrityName, MAX_CELEBRITY_NAME_CHARS) || 'the celebrity'
  const domain = boundPromptField(celebrityDomain, MAX_CELEBRITY_DOMAIN_CHARS)
  const style = celebrityStyleDescription ? sanitizeSceneText(celebrityStyleDescription) : ''
  const mood = !dual && funFact ? sanitizeSceneText(funFact) : ''

  const celebrityLine = dual
    ? `- Person B: ${starName}${domain ? `, ${domain}` : ''}. Clothes = scene-adapted, not from image_input[1].`
    : `- Person B (CELEBRITY): ${starName}${domain ? `, ${domain}` : ''} — separate person beside Person A. Dress for the scene, not their iconic look.`
  const styleLine = !dual && style
    ? `- Optional Person B fashion vibe (LOW priority — override with location-appropriate clothes if the scene is casual): ${style}.`
    : ''
  const moodLine = mood ? `- Scene mood / energy only (NOT faces, NOT Person A's hair): ${mood}.` : ''

  const interactionPrompt = getInteractionPrompt(interaction)
  const interactionLine = interactionPrompt
    ? `4. INTERACTION between the two people: ${sanitizeSceneText(interactionPrompt)}.`
    : ''

  const heightSection = heightConsistencyBlock(ctx).join('\n')
  const closingBlocks = [
    heightSection,
    ...photorealismBlock(starName),
    ...naturalMomentBlock(),
    ...sceneAdaptiveWardrobeBlock(starName),
  ].filter(Boolean)

  const wrap = (sceneBlock: string[]) => [
    ...facePreservationBlock(dual),
    celebrityLine,
    styleLine,
    moodLine,
    '',
    ...sceneBlock,
    '',
    ...closingBlocks,
  ].filter((line) => line !== '').join('\n')

  if (sceneSource === 'user_photo') {
    return wrap([
      'KEEP THE USER PHOTO SCENE (full_generation — not a pixel-locked edit):',
      '- image_input[0] is BOTH Person A identity AND the scene to keep.',
      '- Recreate a NEW candid photo of Person A with the celebrity in the SAME place, lighting, time of day, and overall atmosphere as image_input[0].',
      '- Keep Person A’s clothes from the source photo unless a tiny natural adjustment is needed.',
      '- Dress the celebrity to belong in that same real setting — not a studio, not a red carpet.',
      '- Do NOT invent a new location (no karaoke, IKEA, festival, etc.).',
      '- Do NOT rebuild the environment from scratch.',
      interactionLine,
    ])
  }

  if (mode === 'custom' && customPrompt) {
    const header = 'USER SCENE PROMPT (apply to setting/outfits/pose ONLY — faces stay locked; follow literally):'
    const skeleton = wrap([header, '', interactionLine])
    const remaining = KIE_PROMPT_MAX_CHARS - skeleton.length - 1
    const userPrompt = sanitizeSceneText(customPrompt).slice(0, Math.max(0, remaining))
    return wrap([header, userPrompt, interactionLine])
  }

  if (!scene) throw new Error('photoScene requis en mode presets')

  const location = boundPromptField(scene.location, MAX_SCENE_FIELD_CHARS)
  const outfits = boundPromptField(scene.outfits, MAX_SCENE_FIELD_CHARS)
  const position = boundPromptField(scene.position, MAX_SCENE_FIELD_CHARS)

  return wrap([
    'USER SCENE BRIEF (setting/outfits/pose ONLY — faces stay locked; follow literally):',
    `1. LOCATION / SETTING: ${location}`,
    `2. OUTFITS for both people (MUST adapt to the location — no iconic celebrity default clothes): ${outfits}`,
    `3. POSE and FRAMING: ${position}`,
    interactionLine,
  ])
}

function computeTargetApparentHeightRatio(
  userHeightCm?: number,
  celebrityHeightCm?: number | null,
): number | undefined {
  if (!userHeightCm || !celebrityHeightCm || userHeightCm <= 0 || celebrityHeightCm <= 0) return undefined
  return Math.round((celebrityHeightCm / userHeightCm) * 100) / 100
}

function photoEditHeightLinesFr(ctx: PhotoGenerationContext, starName: string): string[] {
  const userH = ctx.userHeightCm
  const starH = ctx.celebrityHeightCm ?? null
  const ratio = ctx.celebrityTargetApparentHeightRatio ?? computeTargetApparentHeightRatio(userH, starH)
  if (userH && starH && ratio != null) {
    const pct = Math.round(ratio * 100)
    return [
      `- Taille réaliste : utilisateur ${userH} cm, ${starName} ${starH} cm — à la même profondeur caméra, la star paraît environ ${pct} % de la hauteur visible de l'utilisateur.`,
    ]
  }
  if (userH) {
    return [
      `- Taille réaliste : utilisateur ${userH} cm — la star à taille adulte crédible à côté, jamais miniature en arrière-plan.`,
    ]
  }
  return [
    '- Taille et perspective crédibles : la star à côté de l\'utilisateur, même plan caméra, jamais en retrait.',
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
            'SELFIE : la photo source est un selfie. Placer la célébrité à côté de l’utilisateur (gauche ou droite selon l’espace libre), même plan caméra, tous deux regardant vers le téléphone. Jamais en retrait, jamais plus loin, jamais en arrière-plan.',
            'CONTRÔLE QUALITÉ : ne pas exiger que la posture soit identique à la photo source. Ne pas exiger que chaque petit objet soit à la même position exacte. Micro-ajustements naturels valides : légère rotation du buste, variation de posture, bras/mains, tête légèrement réorientée, rapprochement, interaction vivante, petit objet secondaire déplacé. Invalider seulement si la scène est trop transformée (décor recréé, meuble important fortement déplacé, objet important disparu, cadrage/angle totalement changé) ou si l’identité dérive.',
            'OBJETS : conserver les objets importants. Un banc ou meuble structurant doit rester. Un petit objet secondaire (lunettes tenues autrement, tissu, rideau, accessoire) peut bouger légèrement.',
            `Intention utilisateur (à ignorer si elle exige de reconstruire le décor, de supprimer un objet important, ou de reculer fortement la célébrité) : ${sceneIntent}`,
            'Ne jamais proposer de recréer entièrement le décor ni de supprimer un objet important. De légers micro-ajustements de posture de l’utilisateur sont autorisés pour une interaction naturelle. Ne jamais inventer de banc, chaise, mur, table ou support absent. Le placement doit rester crédible dans l’espace déjà visible, à une profondeur caméra comparable.',
            lockedRatio != null
              ? `Si une intégration crédible est possible : {"suitable":true,"celebrityPlacementInstruction":"une phrase concrète en français, ex: ajouter la célébrité à droite de l’utilisateur, selfie à côté, même plancher, même plan caméra, regards vers le téléphone, visage assez grand pour conserver ses traits, hauteur apparente ≈ ${Math.round(lockedRatio * 100)} % de l’utilisateur","targetApparentHeightRatio":${lockedRatio}}`
              : 'Si une intégration crédible est possible : {"suitable":true,"celebrityPlacementInstruction":"une phrase concrète en français, ex: ajouter la célébrité à droite de l’utilisateur, selfie à côté, même plancher, même plan caméra, regards vers le téléphone, visage assez grand pour conserver ses traits"}',
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

/** Selfie « Ajouter la star à ma photo » — aligné sur les prompts KIE directs qui fonctionnent. */
function buildPhotoEditPrompt(ctx: PhotoGenerationContext): string {
  const {
    celebrityName,
    celebrityDomain,
    celebrityStyleDescription,
    customPrompt,
    hasCelebrityReferenceImage,
  } = ctx
  const starName = sanitizeSceneText(celebrityName) || 'la célébrité'
  const domain = sanitizeSceneText(celebrityDomain)
  const style = celebrityStyleDescription ? sanitizeSceneText(celebrityStyleDescription) : ''
  const dual = Boolean(hasCelebrityReferenceImage)
  const userHint = customPrompt ? sanitizeSceneText(customPrompt).slice(0, 120) : ''
  const starDescription = sanitizeSceneText(
    dual ? (domain ? `${starName} (${domain})` : starName) : [domain && `${starName} (${domain})`, style].filter(Boolean).join('. ')
  ).slice(0, 120) || starName

  return [
    'Utilise image_input[0] comme image de base — c\'est la vérité absolue de la photo.',
    '',
    `Crée une photo ultra réaliste de cette scène, comme si la personne sur la photo avait croisé ${starName} et pris un selfie spontané avec elle/lui.`,
    ...(dual
      ? [`image_input[1] sert uniquement à reconnaître le visage et les cheveux de ${starName} — pas à copier la tenue ni le décor de la référence.`]
      : []),
    '',
    'VERROUILLAGE PHOTO SOURCE (priorité absolue — 0 erreur tolérée) :',
    '- Fond et décor de image_input[0] conservés à 100 % : mêmes bâtiments, rue, ciel, objets, ombres, lumière, angle, perspective, netteté, colorimétrie. Ne recadre pas, ne reconstruis pas, ne remplace pas l\'arrière-plan.',
    '- Tête et visage de la personne sur image_input[0] conservés à 100 % : même identité, forme du visage, yeux, nez, bouche, cheveux, carnation, expression, angle de tête. Interdit de la remplacer, la retoucher, l\'embellir, la rajeunir ou la fusionner avec la star.',
    '- Seule modification autorisée : ajouter la star dans l\'espace libre à côté. Tout le reste de image_input[0] reste figé pixel par pixel.',
    '',
    'Règles absolues :',
    `- Ajoute uniquement ${starName} dans l'espace libre à côté, comme si la photo avait été prise à deux dès l'origine.`,
    '- Star immédiatement reconnaissable, intégration naturelle sans collage visible.',
    ...photoEditHeightLinesFr(ctx, starName),
    '- Tenue casual réaliste adaptée au lieu (pas tapis rouge, pas look trop stylisé).',
    '- Résultat = vrai selfie iPhone sur le vif, pas photo studio.',
    '',
    'Style : lumière naturelle, peau avec texture réelle et petits défauts, cheveux vivants, proportions justes, posture détendue, rencontre spontanée.',
    '',
    'Composition : la personne reste exactement à sa place, inchangée. La star occupe uniquement l\'espace vide à côté, légèrement penchée, proche, attitude amicale.',
    '',
    'À éviter absolument : fond modifié, tête ou visage de l\'utilisateur remplacé/retouché, peau plastique, effet beauté, visage déformé, arrière-plan reconstruit, pose trop parfaite, rendu pro, collage visible.',
    ...(userHint ? ['', `Note : ${userHint}`] : []),
    ...(dual ? [] : ['', `Célébrité : ${starDescription}.`]),
    '',
    `Objectif : une vraie photo selfie — la personne et le fond de image_input[0] intacts à 100 %, ${starName} ajoutée naturellement à côté.`,
  ].filter((line) => line !== '').join('\n')
}

function buildPhotoPrompt(ctx: PhotoGenerationContext): { prompt: string; truncated: boolean } {
  const prompt = ctx.creationMode === 'photo_edit'
    ? buildPhotoEditPrompt(ctx)
    : buildFullGenerationPrompt(ctx)
  return clampKiePrompt(prompt)
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
  const raw = (Deno.env.get('PHOTO_EDIT_KIE_MODEL') ?? 'nano-banana-2').trim()
  return raw === 'google/nano-banana-edit' ? 'google/nano-banana-edit' : 'nano-banana-2'
}

function resolveKieResolution(creationMode: CelebrityCreationMode): '1K' | '2K' {
  if (creationMode === 'photo_edit') {
    const raw = (Deno.env.get('PHOTO_EDIT_KIE_RESOLUTION') ?? '1K').trim().toUpperCase()
    return raw === '2K' ? '2K' : '1K'
  }
  const raw = (Deno.env.get('KIE_RESOLUTION') ?? '2K').trim().toUpperCase()
  return raw === '1K' ? '1K' : '2K'
}

function logGenerateTiming(phase: string, startMs: number, extra?: Record<string, unknown>): void {
  console.log('[generate] timing', JSON.stringify({ phase, ms: Date.now() - startMs, ...extra }))
}

async function createTask(
  imageUrls: string[],
  ctx: PhotoGenerationContext,
  apiKey: string
): Promise<string> {
  const { prompt, truncated } = buildPhotoPrompt(ctx)
  const creationMode = ctx.creationMode ?? 'full_generation'
  const useEditModel =
    creationMode === 'photo_edit' && resolvePhotoEditModel() === 'google/nano-banana-edit'
  const resolution = resolveKieResolution(creationMode)

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
          resolution,
          output_format: 'jpg',
        },
      }

  console.log('[generate] createTask', JSON.stringify({
    promptChars: prompt.length,
    promptTruncated: truncated,
    creationMode,
    model: payload.model,
    resolution: useEditModel ? undefined : resolution,
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

type KieTaskState = 'pending' | 'success' | 'fail'

interface KieTaskSnapshot {
  state: KieTaskState
  resultUrl?: string
  failMsg?: string
}

interface GenerationJobRow {
  id: string
  session_id: string
  user_id: string | null
  kie_task_id: string
  celebrity_name: string
  scene_summary: string | null
  creation_mode: string | null
  analysis_id: string | null
  status: 'pending' | 'success' | 'failed'
  fail_message: string | null
  result_url: string | null
  generation_id: string | null
  credit_consumed: boolean
  created_at: string
}

async function fetchKieTaskOnce(taskId: string, apiKey: string): Promise<KieTaskSnapshot> {
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
  if (!record || record.state === 'waiting' || record.state === 'processing' || record.state === 'pending') {
    return { state: 'pending' }
  }
  if (record.state === 'success') {
    const parsed = JSON.parse(record.resultJson ?? '{}') as { resultUrls?: string[] }
    const url = parsed.resultUrls?.[0]
    if (!url) throw new Error('Nano Banana 2: pas d\'URL dans le résultat')
    return { state: 'success', resultUrl: url }
  }
  if (record.state === 'fail') {
    return { state: 'fail', failMsg: record.failMsg ?? 'inconnu' }
  }
  return { state: 'pending' }
}

async function downloadImageAsDataUrl(resultUrl: string): Promise<string> {
  const imgRes = await fetch(resultUrl)
  const imgBuf = await imgRes.arrayBuffer()
  const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'
  const b64 = arrayBufferToBase64(imgBuf)
  return `data:${contentType};base64,${b64}`
}

async function refundGenerationCredit(
  db: ReturnType<typeof createClient>,
  billingSessionId: string,
): Promise<number | undefined> {
  try {
    const { data: refundRaw } = await db.rpc('refund_generation_credit', {
      p_session_id: billingSessionId,
      p_amount: GENERATION_CREDIT_COST,
    })
    const refund = refundRaw as { ok?: boolean; new_balance?: number } | null
    if (refund?.ok && typeof refund.new_balance === 'number') {
      return refund.new_balance
    }
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
    return bal
  } catch (refundErr) {
    console.warn('[generate] credit refund failed:', refundErr)
    return undefined
  }
}

async function insertGenerationRecord(
  db: ReturnType<typeof createClient>,
  row: {
    session_id: string
    analysis_id?: string | null
    celebrity_name: string
    scene_summary?: string | null
    creation_mode: CelebrityCreationMode
    user_id: string
  },
): Promise<string | undefined> {
  const generationRow = {
    session_id: row.session_id,
    analysis_id: row.analysis_id?.trim() ? row.analysis_id.trim() : null,
    celebrity_name: row.celebrity_name,
    unlocked: true,
    scene_summary: row.scene_summary || null,
    user_id: row.user_id,
  }

  let inserted = await db
    .from('generations')
    .insert({ ...generationRow, creation_mode: row.creation_mode })
    .select('id')
    .single()

  if (inserted.error) {
    inserted = await db.from('generations').insert(generationRow).select('id').single()
  }

  return inserted.data?.id
}

async function handlePollJob(
  pollJobId: string,
  authUser: User,
  db: ReturnType<typeof createClient>,
  kieKey: string,
): Promise<Response> {
  const { data: jobRaw, error: jobErr } = await db
    .from('generation_jobs')
    .select('*')
    .eq('id', pollJobId)
    .maybeSingle()

  if (jobErr || !jobRaw) {
    return new Response(
      JSON.stringify({ error: 'Génération introuvable. Relance une nouvelle photo.', code: 'GENERATION_JOB_NOT_FOUND' }),
      { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  const job = jobRaw as GenerationJobRow
  if (job.user_id && job.user_id !== authUser.id) {
    return new Response(
      JSON.stringify({ error: 'Accès refusé à cette génération.', code: 'GENERATION_JOB_FORBIDDEN' }),
      { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  const jobAgeMs = Date.now() - new Date(job.created_at).getTime()
  if (jobAgeMs > JOB_MAX_AGE_MS) {
    if (job.status === 'pending' && job.credit_consumed) {
      await refundGenerationCredit(db, job.session_id)
      await db.from('generation_jobs').update({
        status: 'failed',
        fail_message: 'expired',
        updated_at: new Date().toISOString(),
      }).eq('id', job.id)
    }
    return new Response(
      JSON.stringify({
        error: 'La génération a expiré. Réessaie — ton crédit a été remboursé si besoin.',
        code: 'GENERATION_JOB_EXPIRED',
      }),
      { status: 408, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  if (job.status === 'success') {
    const resultUrl = job.result_url
    if (!resultUrl) {
      return new Response(
        JSON.stringify({
          status: 'success',
          generationId: job.generation_id ?? undefined,
          message: 'Photo déjà générée.',
        }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }
    const generatedBase64 = await downloadImageAsDataUrl(resultUrl)
    return new Response(
      JSON.stringify({
        status: 'success',
        imageBase64: generatedBase64,
        generationId: job.generation_id ?? undefined,
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  if (job.status === 'failed') {
    return new Response(
      JSON.stringify({
        error: job.fail_message ?? 'Nano Banana 2 échoué',
        code: 'GENERATION_FAILED',
      }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  const snapshot = await fetchKieTaskOnce(job.kie_task_id, kieKey)
  if (snapshot.state === 'pending') {
    return new Response(
      JSON.stringify({ status: 'pending', pollJobId: job.id }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  if (snapshot.state === 'fail') {
    const failMessage = `Nano Banana 2 échoué: ${snapshot.failMsg ?? 'inconnu'}`
    if (job.credit_consumed) {
      await refundGenerationCredit(db, job.session_id)
    }
    await db.from('generation_jobs').update({
      status: 'failed',
      fail_message: failMessage,
      updated_at: new Date().toISOString(),
    }).eq('id', job.id)
    return new Response(
      JSON.stringify({ error: failMessage }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  const generatedBase64 = await downloadImageAsDataUrl(snapshot.resultUrl!)
  const generationId = await insertGenerationRecord(db, {
    session_id: job.session_id,
    analysis_id: job.analysis_id,
    celebrity_name: job.celebrity_name,
    scene_summary: job.scene_summary,
    creation_mode: (job.creation_mode as CelebrityCreationMode) ?? 'full_generation',
    user_id: authUser.id,
  })

  await db.from('generation_jobs').update({
    status: 'success',
    result_url: snapshot.resultUrl,
    generation_id: generationId ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', job.id)

  return new Response(
    JSON.stringify({
      status: 'success',
      imageBase64: generatedBase64,
      generationId,
    }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } }
  )
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
      pollJobId?: string
      imageBase64?: string
      celebrityName?: string
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

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    if (typeof body.pollJobId === 'string' && body.pollJobId.trim()) {
      return await handlePollJob(body.pollJobId.trim(), authUser, db, kieKey)
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

    // Taille utilisateur : facultative ; revalidée dès qu'elle est présente (star + jumeau).
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
      interaction: creationMode === 'photo_edit' ? 'selfie' : (interaction?.trim() || undefined),
      hasCelebrityReferenceImage: Boolean(celebrityImageBase64),
      userHeightCm,
    }

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

    // full_generation : lookup complet (Wikidata). photo_edit selfie : cache DB uniquement.
    const startMs = Date.now()
    if (userHeightCm) {
      const tHeight = Date.now()
      const starfusionCelebrityId = celebrityIdFromName(celebrityName)
      const heightLookupName = celebrityName
      const celebrityHeight = creationMode === 'photo_edit'
        ? await resolveCelebrityHeightCacheOnly(db, heightLookupName)
        : await resolveCelebrityHeight(db, heightLookupName)
      generationContext.celebrityHeightCm = celebrityHeight.heightCm
      generationContext.celebrityHeightConfidence = celebrityHeight.confidence
      const targetRatio = computeTargetApparentHeightRatio(userHeightCm, celebrityHeight.heightCm)
      if (targetRatio != null) generationContext.celebrityTargetApparentHeightRatio = targetRatio
      logGenerateTiming('height_lookup', tHeight, {
        creationMode,
        cacheOnly: creationMode === 'photo_edit',
        celebrityHeightCm: celebrityHeight.heightCm,
      })
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

    let pollJobId: string | undefined
    const tempPaths: string[] = []
    try {
      const tUpload = Date.now()
      const imageUrl = await resolveReferenceImageUrl(imageBase64, kieKey, tempPaths)
      const imageUrls = [imageUrl]
      if (celebrityImageBase64) {
        imageUrls.push(await resolveReferenceImageUrl(celebrityImageBase64, kieKey, tempPaths))
      }
      logGenerateTiming('image_upload', tUpload, { imageCount: imageUrls.length, creationMode })

      const tCreate = Date.now()
      const kieTaskId = await createTask(imageUrls, generationContext, kieKey)
      logGenerateTiming('kie_create_task', tCreate, { creationMode })

      const { data: jobRow, error: jobInsertErr } = await db
        .from('generation_jobs')
        .insert({
          session_id: billingSessionId,
          user_id: userId,
          kie_task_id: kieTaskId,
          celebrity_name: celebrityName,
          scene_summary: sceneSummary || null,
          creation_mode: creationMode,
          analysis_id: analysisId?.trim() ? analysisId.trim() : null,
          status: 'pending',
          credit_consumed: creditReserved,
        })
        .select('id')
        .single()

      if (jobInsertErr || !jobRow?.id) {
        throw new Error(jobInsertErr?.message ?? 'Impossible d’enregistrer la génération en cours')
      }
      pollJobId = jobRow.id as string
      logGenerateTiming('start_total', startMs, { creationMode, pollJobId })
    } catch (genErr) {
      if (creditReserved && billingSessionId) {
        const refunded = await refundGenerationCredit(db, billingSessionId)
        if (typeof refunded === 'number') creditsBalance = refunded
      }
      throw genErr
    } finally {
      await removeTempObjects(tempPaths)
    }

    return new Response(
      JSON.stringify({
        status: 'pending',
        pollJobId,
        pollIntervalMs: POLL_INTERVAL_MS,
        pollTimeoutMs: CLIENT_POLL_TIMEOUT_MS,
        creditsBalance,
      }),
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
