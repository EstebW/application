/**
 * Score de ressemblance StarFusion — parcours « Trouve ton jumeau » uniquement.
 * Les sous-scores viennent de Gemini ; le score global est TOUJOURS calculé ici.
 */

export const FEATURE_SCORE_KEYS = [
  'facialProportions',
  'faceShape',
  'eyes',
  'jawChin',
  'nose',
  'cheekbones',
  'mouth',
  'eyebrows',
] as const

export type FeatureScoreKey = (typeof FEATURE_SCORE_KEYS)[number]

export type FeatureScores = Record<FeatureScoreKey, number>

/** Pondérations facilement recalibrables — total = 1.0 */
export const STARFUSION_SCORE_WEIGHTS: Record<FeatureScoreKey, number> = {
  facialProportions: 0.2,
  faceShape: 0.2,
  eyes: 0.15,
  jawChin: 0.15,
  nose: 0.1,
  cheekbones: 0.08,
  mouth: 0.07,
  eyebrows: 0.05,
}

export const FEATURE_SCORE_LABELS_FR: Record<FeatureScoreKey, string> = {
  facialProportions: 'Proportions du visage',
  faceShape: 'Forme du visage',
  eyes: 'Regard',
  jawChin: 'Mâchoire',
  nose: 'Nez',
  cheekbones: 'Pommettes',
  mouth: 'Bouche',
  eyebrows: 'Sourcils',
}

export function clampScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.min(100, value))
}

export function parseFeatureScores(raw: unknown): FeatureScores | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const out = {} as FeatureScores
  for (const key of FEATURE_SCORE_KEYS) {
    const v = clampScore(obj[key])
    if (v === null) return null
    out[key] = v
  }
  return out
}

/** Score StarFusion 0–100, arrondi à l'entier le plus proche. */
export function calculateStarFusionSimilarityScore(featureScores: FeatureScores): number {
  let total = 0
  for (const key of FEATURE_SCORE_KEYS) {
    total += featureScores[key] * STARFUSION_SCORE_WEIGHTS[key]
  }
  return Math.round(total)
}

export function rankCandidatesByScore<T extends { featureScores: FeatureScores }>(
  candidates: T[],
): Array<T & { score: number }> {
  return candidates
    .map((c) => ({ ...c, score: calculateStarFusionSimilarityScore(c.featureScores) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      // Tie-break déterministe : proportions puis forme du visage
      const dProp = b.featureScores.facialProportions - a.featureScores.facialProportions
      if (dProp !== 0) return dProp
      return b.featureScores.faceShape - a.featureScores.faceShape
    })
}

/** Top N sous-scores les plus élevés, pour l'UI. */
export function topFeatureHighlights(
  featureScores: FeatureScores,
  limit = 4,
): Array<{ key: FeatureScoreKey; label: string; score: number }> {
  return FEATURE_SCORE_KEYS
    .map((key) => ({
      key,
      label: FEATURE_SCORE_LABELS_FR[key],
      score: featureScores[key],
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function buildExplanationFromSimilarities(
  similarities: string[],
  differences: string[],
): string {
  const sims = similarities.filter((s) => typeof s === 'string' && s.trim()).slice(0, 3)
  const diffs = differences.filter((s) => typeof s === 'string' && s.trim()).slice(0, 2)

  if (sims.length === 0) {
    return 'La ressemblance repose sur plusieurs traits de structure faciale observés sur la photo.'
  }

  let text = ''
  if (sims.length === 1) {
    text = `Le point commun le plus marqué : ${sims[0].replace(/\.$/, '')}.`
  } else if (sims.length === 2) {
    text = `Votre ressemblance se concentre particulièrement autour de ${sims[0].replace(/\.$/, '')}, ainsi que ${sims[1].replace(/\.$/, '')}.`
  } else {
    text = `Votre ressemblance se concentre particulièrement autour de ${sims[0].replace(/\.$/, '')}. ${sims[1].replace(/\.$/, '')}, tandis que ${sims[2].replace(/\.$/, '')} renforce encore la similarité.`
  }

  if (diffs.length > 0) {
    text += ` ${diffs[0].replace(/\.$/, '')} explique en partie pourquoi le score n'est pas maximal.`
  }

  return text
}
