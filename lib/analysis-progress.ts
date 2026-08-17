/**
 * Pourcentage affiché pendant l’analyse faciale.
 *
 * L’edge `analyze` enchaîne deux appels Gemini (morphologie, puis match)
 * sans renvoyer de %. Le seul signal fiable est le temps déjà passé sur
 * la requête. 100 % uniquement quand le jumeau est vraiment calculé.
 */

export const ANALYSIS_FACE_MS = 8_000
export const ANALYSIS_MATCH_MS = 18_000
export const ANALYSIS_SLOW_MS = 35_000
export const ANALYSIS_MAX_MS = 60_000

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function round1(n: number) {
  return Math.round(n * 10) / 10
}

function easeOut(t: number) {
  return 1 - (1 - clamp(t, 0, 1)) ** 1.35
}

/** 3–96 % tant que l’analyse n’est pas terminée. */
export function analysisProgressFromElapsed(elapsedMs: number): number {
  const ms = Math.max(0, elapsedMs)

  if (ms < ANALYSIS_FACE_MS) {
    return round1(3 + 25 * (ms / ANALYSIS_FACE_MS))
  }

  if (ms < ANALYSIS_MATCH_MS) {
    const t = (ms - ANALYSIS_FACE_MS) / (ANALYSIS_MATCH_MS - ANALYSIS_FACE_MS)
    return round1(28 + 42 * easeOut(t))
  }

  if (ms < ANALYSIS_SLOW_MS) {
    const t = (ms - ANALYSIS_MATCH_MS) / (ANALYSIS_SLOW_MS - ANALYSIS_MATCH_MS)
    return round1(70 + 18 * t)
  }

  const t = (ms - ANALYSIS_SLOW_MS) / (ANALYSIS_MAX_MS - ANALYSIS_SLOW_MS)
  return round1(88 + 8 * clamp(t, 0, 1))
}

/**
 * 0 morphologie → 1 comparaison → 2 classement.
 * L’étape « jumeau trouvé » n’apparaît qu’à la fin réelle.
 */
export function analysisStepFromElapsed(elapsedMs: number, complete = false): 0 | 1 | 2 | 3 {
  if (complete) return 3
  if (elapsedMs < ANALYSIS_FACE_MS) return 0
  if (elapsedMs < ANALYSIS_MATCH_MS) return 1
  return 2
}
