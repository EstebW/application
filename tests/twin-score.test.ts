import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildExplanationFromSimilarities,
  calculateStarFusionSimilarityScore,
  parseFeatureScores,
  rankCandidatesByScore,
  STARFUSION_SCORE_WEIGHTS,
  type FeatureScores,
} from '../lib/twin-score.ts'

const sampleScores = (overrides: Partial<FeatureScores> = {}): FeatureScores => ({
  facialProportions: 90,
  faceShape: 88,
  eyes: 91,
  jawChin: 85,
  nose: 81,
  cheekbones: 84,
  mouth: 74,
  eyebrows: 78,
  ...overrides,
})

describe('twin-score', () => {
  it('weights sum to 1', () => {
    const sum = Object.values(STARFUSION_SCORE_WEIGHTS).reduce((a, b) => a + b, 0)
    assert.ok(Math.abs(sum - 1) < 1e-9)
  })

  it('calculates StarFusion score from feature scores', () => {
    const score = calculateStarFusionSimilarityScore(sampleScores())
    assert.equal(score, 86)
  })

  it('clamps and rejects invalid feature scores', () => {
    assert.equal(parseFeatureScores(null), null)
    assert.equal(parseFeatureScores({ faceShape: 50 }), null)
    assert.deepEqual(
      parseFeatureScores({
        ...sampleScores(),
        eyes: '91',
      }),
      sampleScores({ eyes: 91 }),
    )
    assert.deepEqual(
      parseFeatureScores({
        ...sampleScores({ eyes: 150, mouth: -5 }),
      }),
      sampleScores({ eyes: 100, mouth: 0 }),
    )
  })

  it('ranks Top 3 by computed score', () => {
    const ranked = rankCandidatesByScore([
      { name: 'B', featureScores: sampleScores({ facialProportions: 70, faceShape: 70, eyes: 70, jawChin: 70, nose: 70, cheekbones: 70, mouth: 70, eyebrows: 70 }) },
      { name: 'A', featureScores: sampleScores() },
      { name: 'C', featureScores: sampleScores({ facialProportions: 60, faceShape: 60, eyes: 60, jawChin: 60, nose: 60, cheekbones: 60, mouth: 60, eyebrows: 60 }) },
    ])
    assert.equal(ranked[0].name, 'A')
    assert.equal(ranked[1].name, 'B')
    assert.equal(ranked[2].name, 'C')
    assert.ok(ranked[0].score >= ranked[1].score)
  })

  it('breaks score ties deterministically', () => {
    const flat = sampleScores({
      facialProportions: 80,
      faceShape: 80,
      eyes: 80,
      jawChin: 80,
      nose: 80,
      cheekbones: 80,
      mouth: 80,
      eyebrows: 80,
    })
    const ranked = rankCandidatesByScore([
      { name: 'LowProp', featureScores: { ...flat, facialProportions: 70, faceShape: 90 } },
      { name: 'HighProp', featureScores: { ...flat, facialProportions: 90, faceShape: 70 } },
    ])
    assert.equal(ranked[0].score, ranked[1].score)
    assert.equal(ranked[0].name, 'HighProp')
  })

  it('builds a specific explanation from similarities', () => {
    const text = buildExplanationFromSimilarities(
      ['forme et espacement des yeux proches', 'proportions générales similaires', 'structure de mâchoire comparable'],
      ['le nez diffère légèrement'],
    )
    assert.match(text, /regard|yeux|proportions|mâchoire/i)
    assert.match(text, /nez|score/i)
    assert.doesNotMatch(text, /charismatique|intense/)
  })

  it('rejects incomplete Gemini feature payloads', () => {
    assert.equal(
      parseFeatureScores({
        faceShape: 88,
        eyes: 91,
        // missing other keys
      }),
      null,
    )
  })
})
