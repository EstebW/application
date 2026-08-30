/**
 * Parsing / assemblage du résultat d'analyse « Trouve ton jumeau ».
 * Isolé de kie-analyze pour rester testable sans appels réseau.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateStarFusionSimilarityScore,
  parseFeatureScores,
  rankCandidatesByScore,
  buildExplanationFromSimilarities,
  type FeatureScores,
} from '../lib/twin-score.ts'
import { buildCelebrityResultFromAnalysis } from '../lib/twin-result.ts'

function extractJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.trim()
  try {
    return JSON.parse(cleaned) as Record<string, unknown>
  } catch { /* continue */ }
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return JSON.parse(fenced[1].trim()) as Record<string, unknown>
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
  throw new Error('Impossible de parser la réponse du modèle')
}

function buildFromCandidates(parsed: Record<string, unknown>) {
  if (typeof parsed.error === 'string') throw new Error(`Analyse : ${parsed.error}`)
  const list = parsed.candidates
  if (!Array.isArray(list) || list.length === 0) throw new Error('Aucun candidat')

  const raw = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const c = item as Record<string, unknown>
    const name = typeof c.name === 'string' ? c.name.trim() : ''
    const featureScores = parseFeatureScores(c.featureScores)
    if (!name || !featureScores) continue
    const strongestSimilarities = Array.isArray(c.strongestSimilarities)
      ? c.strongestSimilarities.filter((t): t is string => typeof t === 'string')
      : []
    if (!strongestSimilarities.length) continue
    raw.push({
      name,
      featureScores,
      strongestSimilarities,
      mainDifferences: Array.isArray(c.mainDifferences)
        ? c.mainDifferences.filter((t): t is string => typeof t === 'string')
        : [],
    })
  }
  if (!raw.length) throw new Error('Aucun candidat valide')
  const ranked = rankCandidatesByScore(raw)
  const winner = ranked[0]
  return {
    name: winner.name,
    score: winner.score,
    runnersUp: ranked.slice(1, 3),
    fun_fact: buildExplanationFromSimilarities(winner.strongestSimilarities, winner.mainDifferences),
  }
}

const scores = (o: Partial<FeatureScores> = {}): FeatureScores => ({
  facialProportions: 90, faceShape: 88, eyes: 91, jawChin: 85,
  nose: 81, cheekbones: 84, mouth: 74, eyebrows: 78, ...o,
})

describe('twin result assembly', () => {
  it('extracts JSON from fenced markdown', () => {
    assert.deepEqual(extractJsonObject('```json\n{"candidates":[]}\n```'), { candidates: [] })
  })

  it('builds ranked Top 3 with backend score', () => {
    const result = buildFromCandidates({
      candidates: [
        {
          name: 'Second',
          featureScores: scores({
            facialProportions: 70, faceShape: 70, eyes: 70, jawChin: 70,
            nose: 70, cheekbones: 70, mouth: 70, eyebrows: 70,
          }),
          strongestSimilarities: ['yeux', 'nez', 'bouche'],
        },
        {
          name: 'Winner',
          featureScores: scores(),
          strongestSimilarities: ['regard', 'proportions', 'mâchoire'],
          mainDifferences: ['nez'],
        },
        {
          name: 'Third',
          featureScores: scores({
            facialProportions: 60, faceShape: 60, eyes: 60, jawChin: 60,
            nose: 60, cheekbones: 60, mouth: 60, eyebrows: 60,
          }),
          strongestSimilarities: ['forme', 'pommettes', 'sourcils'],
        },
      ],
    })
    assert.equal(result.name, 'Winner')
    assert.equal(result.score, calculateStarFusionSimilarityScore(scores()))
    assert.equal(result.runnersUp.length, 2)
    assert.equal(result.runnersUp[0].name, 'Second')
  })

  it('rejects empty or invalid payloads', () => {
    assert.throws(() => buildFromCandidates({ candidates: [] }))
    assert.throws(() => buildFromCandidates({ error: 'visage non détecté' }), /visage non détecté/)
    assert.throws(() => buildFromCandidates({
      candidates: [{ name: 'X', featureScores: { eyes: 90 }, strongestSimilarities: ['a'] }],
    }))
  })

  it('accepte snake_case et scores string via buildCelebrityResultFromAnalysis', () => {
    const result = buildCelebrityResultFromAnalysis({
      candidates: [{
        name: 'Jean Dujardin',
        celebrity_domain: 'Acteur',
        feature_scores: {
          face_shape: '88',
          eyes: 91,
          eyebrows: 78,
          nose: 81,
          jaw_chin: 85,
          cheekbones: 84,
          mouth: 74,
          facial_proportions: 90,
        },
        strongest_similarities: ['yeux', 'mâchoire', 'proportions'],
        main_differences: ['nez'],
      }],
    })
    assert.equal(result.name, 'Jean Dujardin')
    assert.ok(result.score > 0)
  })
})
