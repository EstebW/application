/**
 * Exécution : npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  ANALYSIS_FACE_MS,
  ANALYSIS_MATCH_MS,
  ANALYSIS_MAX_MS,
  ANALYSIS_SLOW_MS,
  analysisProgressFromElapsed,
  analysisStepFromElapsed,
} from '../lib/analysis-progress.ts'

describe('progression d’analyse faciale', () => {
  it('reste basse pendant les premières secondes au lieu de sprinter vers 90 %', () => {
    assert.ok(analysisProgressFromElapsed(0) >= 3)
    assert.ok(analysisProgressFromElapsed(3_600) < 25)
    assert.ok(analysisProgressFromElapsed(ANALYSIS_FACE_MS) < 35)
  })

  it('avance encore après la morphologie et ne plafonne pas à 90 %', () => {
    const atMatch = analysisProgressFromElapsed(ANALYSIS_MATCH_MS)
    const atSlow = analysisProgressFromElapsed(ANALYSIS_SLOW_MS)
    const atMax = analysisProgressFromElapsed(ANALYSIS_MAX_MS)
    assert.ok(atMatch > 60 && atMatch < 80)
    assert.ok(atSlow > atMatch)
    assert.ok(atMax > atSlow)
    assert.ok(atMax <= 99)
  })

  it('ne atteint jamais 100 % tant que l’analyse n’est pas finie', () => {
    assert.ok(analysisProgressFromElapsed(ANALYSIS_MAX_MS + 30_000) <= 99)
  })

  it('garde le classement jusqu’à la fin réelle', () => {
    assert.equal(analysisStepFromElapsed(4_000), 0)
    assert.equal(analysisStepFromElapsed(12_000), 1)
    assert.equal(analysisStepFromElapsed(40_000), 2)
    assert.equal(analysisStepFromElapsed(12_000, true), 3)
  })
})
