/**
 * Exécution : npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  GENERATION_MAX_MS,
  GENERATION_PREP_MS,
  GENERATION_SLOW_MS,
  GENERATION_TYPICAL_MS,
  generationProgressFromElapsed,
  generationStepFromElapsed,
} from '../lib/generation-progress.ts'

describe('progression de génération', () => {
  it('reste basse pendant la préparation au lieu de sprinter vers 85 %', () => {
    assert.ok(generationProgressFromElapsed(0) >= 3)
    assert.ok(generationProgressFromElapsed(8_000) < 20)
    assert.ok(generationProgressFromElapsed(GENERATION_PREP_MS) < 25)
  })

  it('avance encore après 15 s et ne plafonne pas à 85 %', () => {
    const atTypical = generationProgressFromElapsed(GENERATION_TYPICAL_MS)
    const atSlow = generationProgressFromElapsed(GENERATION_SLOW_MS)
    const atMax = generationProgressFromElapsed(GENERATION_MAX_MS)
    assert.ok(atTypical > 60 && atTypical < 80)
    assert.ok(atSlow > atTypical)
    assert.ok(atMax > atSlow)
    assert.ok(atMax <= 96)
  })

  it('ne atteint jamais 100 % tant que la génération n’est pas finie', () => {
    assert.ok(generationProgressFromElapsed(GENERATION_MAX_MS + 60_000) <= 96)
  })

  it('garde l’étape d’attente jusqu’à la fin réelle', () => {
    assert.equal(generationStepFromElapsed(5_000), 0)
    assert.equal(generationStepFromElapsed(40_000), 1)
    assert.equal(generationStepFromElapsed(200_000), 1)
    assert.equal(generationStepFromElapsed(40_000, true), 2)
  })
})
