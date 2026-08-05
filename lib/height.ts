/**
 * Tailles (utilisateur + célébrité) — module pur, partagé client / serveur.
 *
 * Aucune dépendance Next, Supabase ou DOM : la logique est dupliquée à
 * l'identique dans l'Edge Function `generate` (Deno ne peut pas importer `lib/`).
 */

/** Bornes du champ saisi par l'utilisateur (parcours « Choisis ta star »). */
export const MIN_USER_HEIGHT_CM = 120
export const MAX_USER_HEIGHT_CM = 220

/**
 * Bornes de plausibilité pour une taille récupérée automatiquement.
 * Plus large que le champ utilisateur : on ne veut pas rejeter une vraie
 * célébrité très petite ou très grande (basketteurs, etc.).
 */
export const MIN_CELEBRITY_HEIGHT_CM = 120
export const MAX_CELEBRITY_HEIGHT_CM = 260

/** Écart toléré entre deux sources sérieuses avant de dégrader la confiance. */
export const HEIGHT_SOURCES_TOLERANCE_CM = 2

export type CelebrityHeightConfidence = 'verified' | 'probable' | 'unknown'

/** Fiche taille d'une célébrité — toujours accompagnée de son origine et de sa date. */
export interface CelebrityHeight {
  celebrityId: string
  heightCm: number | null
  sourceUrl: string | null
  /** ISO 8601 — date de la vérification, jamais une valeur sans date */
  verifiedAt: string | null
  confidence: CelebrityHeightConfidence
}

/** Candidat renvoyé par un fournisseur avant recoupement. */
export interface HeightCandidate {
  heightCm: number
  sourceUrl: string
  /** Une donnée structurée (Wikidata) prime sur un texte d'article */
  confidence: Exclude<CelebrityHeightConfidence, 'unknown'>
}

export function unknownCelebrityHeight(celebrityId: string): CelebrityHeight {
  return { celebrityId, heightCm: null, sourceUrl: null, verifiedAt: null, confidence: 'unknown' }
}

/**
 * Identifiant stable d'une célébrité.
 * Le projet n'a pas de catalogue : l'id est dérivé du nom, insensible à la
 * casse, aux accents et à la ponctuation, pour que « Béyoncé » et « beyonce »
 * partagent la même fiche taille.
 */
export function celebrityIdFromName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

/** Saisie utilisateur → entier en centimètres, ou null si invalide. */
export function parseUserHeightCm(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return isValidUserHeightCm(raw) ? raw : null
  }
  if (typeof raw !== 'string') return null
  const digits = raw.trim().replace(/\s+/g, '')
  if (!/^\d{2,3}$/.test(digits)) return null
  const value = Number(digits)
  return isValidUserHeightCm(value) ? value : null
}

export function isValidUserHeightCm(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_USER_HEIGHT_CM &&
    value <= MAX_USER_HEIGHT_CM
  )
}

/** Arrondit au centimètre entier et écarte les valeurs aberrantes. */
export function normalizeCelebrityHeightCm(value: number): number | null {
  if (!Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded < MIN_CELEBRITY_HEIGHT_CM || rounded > MAX_CELEBRITY_HEIGHT_CM) return null
  return rounded
}

export function feetInchesToCm(feet: number, inches = 0): number {
  return feet * 30.48 + inches * 2.54
}

/**
 * Extrait les tailles plausibles d'un texte libre (résumé Wikipédia).
 * Seules les valeurs explicitement unitées sont retenues : un « 185 » nu
 * dans une phrase n'est jamais une taille.
 */
export function extractHeightsFromText(text: string): number[] {
  const found: number[] = []
  const push = (cm: number | null) => {
    if (cm !== null && !found.includes(cm)) found.push(cm)
  }

  // 1,85 m / 1.85 mètre
  for (const m of Array.from(text.matchAll(/(\d)[.,](\d{2})\s?(?:m\b|m[eè]tres?\b)/gi))) {
    push(normalizeCelebrityHeightCm(Number(`${m[1]}.${m[2]}`) * 100))
  }
  // 185 cm / 185 centimètres
  for (const m of Array.from(text.matchAll(/(\d{3})\s?(?:cm\b|centim[eè]tres?\b)/gi))) {
    push(normalizeCelebrityHeightCm(Number(m[1])))
  }
  // 6 ft 1 in / 6 feet 1 inch / 6'1" / 6′1″
  for (const m of Array.from(text.matchAll(
    /(\d)\s?(?:ft\b|feet\b|foot\b|['’′])\s?(\d{1,2})?\s?(?:in\b|inch(?:es)?\b|["”″])?/gi
  ))) {
    const inches = m[2] ? Number(m[2]) : 0
    if (inches > 11) continue
    push(normalizeCelebrityHeightCm(feetInchesToCm(Number(m[1]), inches)))
  }

  return found
}

/**
 * Recoupe les candidats de plusieurs fournisseurs.
 * - une seule source structurée → verified
 * - deux sources cohérentes      → verified
 * - deux sources divergentes     → la plus fiable, marquée probable
 * - aucune source                → unknown
 */
export function reconcileHeightCandidates(
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
