/**
 * Résolution de la taille d'une célébrité — SERVEUR UNIQUEMENT.
 *
 * Le projet n'a pas de catalogue de célébrités : la fiche taille est indexée
 * par un identifiant dérivé du nom (voir `celebrityIdFromName`) et stockée dans
 * `celebrity_heights`, qui sert à la fois de base et de cache (y compris de
 * cache négatif pour ne pas relancer une recherche à chaque génération).
 *
 * Sources réelles, jamais une valeur inventée par un modèle de langage :
 *   1. Wikidata, propriété P2048 « taille » (donnée structurée) → verified
 *   2. Intro de l'article Wikipédia, texte parsé (m / cm / pieds-pouces) → probable
 *
 * Variables d'environnement (toutes facultatives) :
 *   CELEBRITY_HEIGHT_LOOKUP_DISABLED=1  → désactive les appels réseau
 *   CELEBRITY_HEIGHT_USER_AGENT         → User-Agent envoyé à Wikimedia
 */

import { createServerClient } from './supabase'
import {
  celebrityIdFromName,
  extractHeightsFromText,
  normalizeCelebrityHeightCm,
  reconcileHeightCandidates,
  unknownCelebrityHeight,
  HEIGHT_SOURCES_TOLERANCE_CM,
  type CelebrityHeight,
  type CelebrityHeightConfidence,
  type HeightCandidate,
} from './height'

const DEFAULT_UA = 'StarFusion/1.0 (https://starfusion.app; celebrity height lookup)'
const LOOKUP_TIMEOUT_MS = 4000
const MEMORY_TTL_MS = 30 * 60 * 1000
/** Une célébrité sans taille fiable n'est re-cherchée qu'après ce délai. */
const RETRY_UNKNOWN_AFTER_MS = 7 * 24 * 60 * 60 * 1000
const MAX_LOOKUP_ATTEMPTS = 3

const memoryCache = new Map<string, { value: CelebrityHeight; expiresAt: number }>()

function userAgent(): string {
  return process.env.CELEBRITY_HEIGHT_USER_AGENT?.trim() || DEFAULT_UA
}

function lookupEnabled(): boolean {
  return process.env.CELEBRITY_HEIGHT_LOOKUP_DISABLED?.trim() !== '1'
}

/** Log structuré — le projet n'a pas d'outil d'analytics, la sortie serveur fait foi. */
function logHeightEvent(event: string, payload: Record<string, unknown>) {
  console.log(`[celebrity-height] ${event}`, JSON.stringify(payload))
}

/** Panne de transport (réseau, timeout, 429 Wikimedia) — à ne pas confondre
 *  avec « la célébrité n'a pas de taille connue ». */
class HeightLookupTransportError extends Error {}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': userAgent() },
      signal,
    })
  } catch (err) {
    throw new HeightLookupTransportError(err instanceof Error ? err.message : 'fetch failed')
  }
  if (!res.ok) throw new HeightLookupTransportError(`HTTP ${res.status}`)
  return (await res.json()) as T
}

// ── Source 1 : Wikidata (P2048) ───────────────────────────────────────────────

const WIKIDATA_UNITS_TO_CM: Record<string, number> = {
  Q11573: 100, // mètre
  Q174728: 1, // centimètre
  Q174789: 0.1, // millimètre
  Q3710: 30.48, // pied
  Q218593: 2.54, // pouce
}

interface WikidataSearchResponse {
  search?: { id?: string }[]
}

interface WikidataEntitiesResponse {
  entities?: Record<
    string,
    {
      claims?: Record<
        string,
        {
          mainsnak?: {
            datavalue?: { value?: { amount?: string; unit?: string; id?: string } }
          }
        }[]
      >
    }
  >
}

function heightFromClaim(claim: {
  mainsnak?: { datavalue?: { value?: { amount?: string; unit?: string } } }
}): number | null {
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
  const search = await fetchJson<WikidataSearchResponse>(searchUrl, signal)
  const ids = (search.search ?? []).map((s) => s.id).filter((id): id is string => Boolean(id))
  if (ids.length === 0) return null

  const entitiesUrl =
    'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims' +
    `&ids=${ids.join('|')}`
  const entities = await fetchJson<WikidataEntitiesResponse>(entitiesUrl, signal)
  if (!entities.entities) return null

  for (const id of ids) {
    const claims = entities.entities[id]?.claims
    if (!claims) continue
    // P31 « nature de l'élément » doit valoir Q5 (être humain) : évite de
    // récupérer la taille d'un bâtiment ou d'un film homonyme.
    const isHuman = (claims.P31 ?? []).some(
      (c) => c.mainsnak?.datavalue?.value?.id === 'Q5'
    )
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

// ── Source 2 : intro de l'article Wikipédia ───────────────────────────────────

interface WikiExtractResponse {
  query?: { pages?: Record<string, { title?: string; extract?: string }> }
}

async function fetchWikipediaHeight(
  lang: 'fr' | 'en',
  name: string,
  signal: AbortSignal
): Promise<HeightCandidate | null> {
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=extracts` +
    `&explaintext=1&exintro=1&redirects=1&titles=${encodeURIComponent(name)}`
  const data = await fetchJson<WikiExtractResponse>(url, signal)
  const pages = data.query?.pages
  if (!pages) return null

  for (const page of Object.values(pages)) {
    const extract = page.extract
    if (!extract) continue
    const candidates = extractHeightsFromText(extract)
    if (candidates.length === 0) continue
    // Plusieurs valeurs unitées dans l'intro = ambigu (dates, distances…) :
    // on ne retient que le cas non ambigu.
    if (candidates.length > 1) continue
    return {
      heightCm: candidates[0],
      sourceUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title ?? name)}`,
      confidence: 'probable',
    }
  }

  return null
}

// ── Cache base de données ─────────────────────────────────────────────────────

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

function rowToHeight(row: HeightRow): CelebrityHeight {
  return {
    celebrityId: row.celebrity_id,
    heightCm: row.height_cm,
    sourceUrl: row.source_url,
    verifiedAt: row.verified_at,
    confidence: row.confidence,
  }
}

type Db = ReturnType<typeof createServerClient>

function getDb(): Db | null {
  try {
    return createServerClient()
  } catch {
    return null
  }
}

async function readRow(db: Db, celebrityId: string): Promise<HeightRow | null> {
  const { data, error } = await db
    .from('celebrity_heights')
    .select('celebrity_id, height_cm, source_url, verified_at, confidence, manual_override, lookup_attempts, last_attempt_at')
    .eq('celebrity_id', celebrityId)
    .maybeSingle()
  if (error) return null
  return (data as HeightRow | null) ?? null
}

async function writeRow(
  db: Db,
  celebrityId: string,
  displayName: string,
  height: CelebrityHeight,
  attempts: number
): Promise<void> {
  const { error } = await db.from('celebrity_heights').upsert(
    {
      celebrity_id: celebrityId,
      display_name: displayName,
      height_cm: height.heightCm,
      source_url: height.sourceUrl,
      verified_at: height.verifiedAt,
      confidence: height.confidence,
      lookup_attempts: attempts,
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'celebrity_id' }
  )
  if (error) {
    logHeightEvent('cache_write_failed', { celebrityId, error: error.message })
  }
}

function shouldRetryLookup(row: HeightRow): boolean {
  if (row.manual_override) return false
  if (row.height_cm !== null) return false
  if (row.lookup_attempts >= MAX_LOOKUP_ATTEMPTS) return false
  if (!row.last_attempt_at) return true
  return Date.now() - new Date(row.last_attempt_at).getTime() > RETRY_UNKNOWN_AFTER_MS
}

// ── API publique ──────────────────────────────────────────────────────────────

/**
 * Renvoie la taille connue d'une célébrité. Ne jette jamais : une taille
 * introuvable devient simplement `confidence: 'unknown'` et la génération
 * continue avec une contrainte de proportions plus souple.
 */
export async function resolveCelebrityHeight(celebrityName: string): Promise<CelebrityHeight> {
  const celebrityId = celebrityIdFromName(celebrityName)
  if (!celebrityId) return unknownCelebrityHeight('')

  const cached = memoryCache.get(celebrityId)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const db = getDb()
  let attempts = 0

  if (db) {
    const row = await readRow(db, celebrityId)
    if (row) {
      attempts = row.lookup_attempts
      if (!shouldRetryLookup(row)) {
        const value = rowToHeight(row)
        memoryCache.set(celebrityId, { value, expiresAt: Date.now() + MEMORY_TTL_MS })
        if (value.heightCm === null) {
          logHeightEvent('missing_cached', { celebrityId, attempts })
        }
        return value
      }
    }
  }

  if (!lookupEnabled()) {
    return unknownCelebrityHeight(celebrityId)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS)
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
        logHeightEvent('sources_conflict', {
          celebrityId,
          spread,
          candidates: candidates.map((c) => ({ heightCm: c.heightCm, sourceUrl: c.sourceUrl })),
        })
      }
    }
  } catch (err) {
    transportFailed = true
    resolved = unknownCelebrityHeight(celebrityId)
    logHeightEvent('lookup_transport_error', {
      celebrityId,
      error: err instanceof Error ? err.message : String(err),
    })
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

  memoryCache.set(celebrityId, { value: resolved, expiresAt: Date.now() + MEMORY_TTL_MS })
  if (db) {
    await writeRow(db, celebrityId, celebrityName.trim().slice(0, 120), resolved, attempts + 1)
  }

  return resolved
}

/** Utilisé par le script d'administration — la valeur manuelle n'est jamais écrasée. */
export async function setCelebrityHeightManually(
  celebrityName: string,
  heightCm: number,
  sourceUrl?: string
): Promise<CelebrityHeight> {
  const celebrityId = celebrityIdFromName(celebrityName)
  const normalized = normalizeCelebrityHeightCm(heightCm)
  if (!celebrityId || normalized === null) {
    throw new Error('Nom ou taille invalide (taille attendue entre 120 et 260 cm)')
  }

  const db = getDb()
  if (!db) throw new Error('Configuration Supabase manquante')

  const now = new Date().toISOString()
  const value: CelebrityHeight = {
    celebrityId,
    heightCm: normalized,
    sourceUrl: sourceUrl ?? null,
    verifiedAt: now,
    confidence: 'verified',
  }

  const { error } = await db.from('celebrity_heights').upsert(
    {
      celebrity_id: celebrityId,
      display_name: celebrityName.trim().slice(0, 120),
      height_cm: value.heightCm,
      source_url: value.sourceUrl,
      verified_at: value.verifiedAt,
      confidence: 'verified',
      manual_override: true,
      updated_at: now,
    },
    { onConflict: 'celebrity_id' }
  )
  if (error) throw new Error(error.message)

  memoryCache.set(celebrityId, { value, expiresAt: Date.now() + MEMORY_TTL_MS })
  logHeightEvent('manual_override', { celebrityId, heightCm: value.heightCm, sourceUrl })
  return value
}
