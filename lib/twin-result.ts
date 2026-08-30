import type { CelebrityResult, TwinRunnerUp } from './types.ts'
import {
  buildExplanationFromSimilarities,
  parseFeatureScores,
  rankCandidatesByScore,
  type FeatureScoreKey,
  type FeatureScores,
} from './twin-score.ts'

export function extractJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.trim()

  try {
    return JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    // continue
  }

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim()) as Record<string, unknown>
    } catch {
      // continue
    }
  }

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
  }

  if (/can't help|can't identify|cannot identify|facial recognition|i don't do|refus/i.test(cleaned)) {
    throw new Error('L\'IA a refusé l\'analyse. Réessaie avec une autre photo.')
  }

  throw new Error('Impossible de parser la réponse du modèle')
}

function parseStringList(raw: unknown, max = 5): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.trim())
    .slice(0, max)
}

interface RawCandidate {
  name: string
  celebrity_domain: string
  celebrity_style_description: string
  featureScores: FeatureScores
  strongestSimilarities: string[]
  mainDifferences: string[]
}

function readField(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key]
  }
  return undefined
}

function normalizeFeatureScoresInput(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const obj = raw as Record<string, unknown>
  const aliases: Record<string, FeatureScoreKey> = {
    face_shape: 'faceShape',
    facial_proportions: 'facialProportions',
    jaw_chin: 'jawChin',
    cheek_bones: 'cheekbones',
  }
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const normalizedKey = aliases[key] ?? key
    out[normalizedKey] = value
  }
  return out
}

function parseCandidates(parsed: Record<string, unknown>): RawCandidate[] {
  if (typeof parsed.error === 'string') {
    throw new Error(`Analyse : ${parsed.error}`)
  }

  const list = parsed.candidates
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('Aucun candidat exploitable renvoyé par l\'analyse')
  }

  const out: RawCandidate[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const c = item as Record<string, unknown>
    const nameRaw = readField(c, 'name', 'celebrity_name', 'celebrityName')
    const name = typeof nameRaw === 'string' ? nameRaw.trim() : ''
    if (!name) continue
    const featureScores = parseFeatureScores(
      normalizeFeatureScoresInput(readField(c, 'featureScores', 'feature_scores')),
    )
    if (!featureScores) continue

    const strongestSimilarities = parseStringList(
      readField(c, 'strongestSimilarities', 'strongest_similarities', 'similarities'),
      3,
    )
    const mainDifferences = parseStringList(
      readField(c, 'mainDifferences', 'main_differences', 'differences'),
      3,
    )
    if (strongestSimilarities.length === 0) continue

    out.push({
      name,
      celebrity_domain: String(readField(c, 'celebrity_domain', 'celebrityDomain', 'domain') ?? '').trim(),
      celebrity_style_description: String(
        readField(c, 'celebrity_style_description', 'celebrityStyleDescription', 'style_description') ?? '',
      ).trim(),
      featureScores,
      strongestSimilarities,
      mainDifferences,
    })
  }

  if (out.length === 0) {
    throw new Error('Aucun candidat valide après validation des sous-scores')
  }

  return out
}

/** Transforme la réponse Gemini + scoring backend en CelebrityResult compatible UI. */
export function buildCelebrityResultFromAnalysis(parsed: Record<string, unknown>): CelebrityResult {
  const rawCandidates = parseCandidates(parsed)
  const ranked = rankCandidatesByScore(rawCandidates)
  const top3 = ranked.slice(0, 3)
  const winner = top3[0]

  const runnersUp: TwinRunnerUp[] = top3.slice(1).map((c) => ({
    name: c.name,
    celebrity_domain: c.celebrity_domain,
    score: c.score,
    featureScores: c.featureScores,
    strongestSimilarities: c.strongestSimilarities,
    mainDifferences: c.mainDifferences,
  }))

  return {
    name: winner.name,
    celebrity_domain: winner.celebrity_domain,
    score: winner.score,
    traits: winner.strongestSimilarities.slice(0, 3),
    celebrity_style_description: winner.celebrity_style_description,
    fun_fact: buildExplanationFromSimilarities(
      winner.strongestSimilarities,
      winner.mainDifferences,
    ),
    featureScores: winner.featureScores,
    runnersUp,
  }
}
