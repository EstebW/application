import type { CelebrityResult, TwinRunnerUp } from './types'
import {
  buildExplanationFromSimilarities,
  parseFeatureScores,
  rankCandidatesByScore,
  type FeatureScores,
} from './twin-score'

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
    const name = typeof c.name === 'string' ? c.name.trim() : ''
    if (!name) continue
    const featureScores = parseFeatureScores(c.featureScores)
    if (!featureScores) continue

    const strongestSimilarities = parseStringList(c.strongestSimilarities, 3)
    const mainDifferences = parseStringList(c.mainDifferences, 3)
    if (strongestSimilarities.length === 0) continue

    out.push({
      name,
      celebrity_domain: typeof c.celebrity_domain === 'string' ? c.celebrity_domain.trim() : '',
      celebrity_style_description:
        typeof c.celebrity_style_description === 'string' ? c.celebrity_style_description.trim() : '',
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
