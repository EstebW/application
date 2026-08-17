/**
 * Pourcentage affiché pendant une génération.
 *
 * Nano Banana / kie.ai ne renvoie pas de % pour ce modèle : le seul signal
 * fiable est le temps déjà passé sur l’appel `generate` (upload + attente KIE,
 * jusqu’à 5 min). La barre suit donc l’avancement réel de la requête, sans
 * sprinter à 85 % en quelques secondes ni rester bloquée.
 */

export const GENERATION_PREP_MS = 15_000
export const GENERATION_TYPICAL_MS = 80_000
export const GENERATION_SLOW_MS = 180_000
export const GENERATION_MAX_MS = 300_000

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function round1(n: number) {
  return Math.round(n * 10) / 10
}

function easeOut(t: number) {
  return 1 - (1 - clamp(t, 0, 1)) ** 1.35
}

/** 3–96 % tant que la génération n’est pas terminée. 100 % uniquement à la fin. */
export function generationProgressFromElapsed(elapsedMs: number): number {
  const ms = Math.max(0, elapsedMs)

  if (ms < GENERATION_PREP_MS) {
    return round1(3 + 15 * (ms / GENERATION_PREP_MS))
  }

  if (ms < GENERATION_TYPICAL_MS) {
    const t = (ms - GENERATION_PREP_MS) / (GENERATION_TYPICAL_MS - GENERATION_PREP_MS)
    return round1(18 + 52 * easeOut(t))
  }

  if (ms < GENERATION_SLOW_MS) {
    const t = (ms - GENERATION_TYPICAL_MS) / (GENERATION_SLOW_MS - GENERATION_TYPICAL_MS)
    return round1(70 + 18 * t)
  }

  const t = (ms - GENERATION_SLOW_MS) / (GENERATION_MAX_MS - GENERATION_SLOW_MS)
  return round1(88 + 8 * clamp(t, 0, 1))
}

/** Étapes UI : préparation → attente KIE → finalisation seulement à la fin. */
export function generationStepFromElapsed(elapsedMs: number, complete = false): 0 | 1 | 2 {
  if (complete) return 2
  if (elapsedMs < GENERATION_PREP_MS) return 0
  return 1
}
