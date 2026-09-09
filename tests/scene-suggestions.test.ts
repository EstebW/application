/**
 * Exécution : npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isReasonableCustomPrompt } from '../lib/generation-safety.ts'
import {
  CUSTOM_PROMPT_EXAMPLES,
  SCENE_SUGGESTION_COUNT,
  SIMPLE_FUNNY_LOCATIONS,
  pickCustomPromptExamples,
  pickN,
  pickSceneSuggestions,
  sceneFromSuggestions,
} from '../lib/scene-suggestions.ts'

function seeded(values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]!
}

describe('propositions de scènes', () => {
  it('tire un sous-ensemble déterministe, sans doublon', () => {
    const random = seeded([0.9, 0.1, 0.4, 0.7])
    const first = pickN(['a', 'b', 'c', 'd'], 2, random)
    const second = pickN(['a', 'b', 'c', 'd'], 2, seeded([0.9, 0.1, 0.4, 0.7]))
    assert.deepEqual(first, second)
    assert.equal(first.length, 2)
    assert.equal(new Set(first).size, 2)
    for (const item of first) assert.ok(['a', 'b', 'c', 'd'].includes(item))
  })

  it('ignore le métier de la star : même pool pour tout le monde', () => {
    const random = seeded([0.2, 0.8, 0.1, 0.5, 0.9, 0.3, 0.4, 0.7, 0.6])
    const a = pickSceneSuggestions(SCENE_SUGGESTION_COUNT, random)
    const b = pickSceneSuggestions(SCENE_SUGGESTION_COUNT, seeded([0.2, 0.8, 0.1, 0.5, 0.9, 0.3, 0.4, 0.7, 0.6]))
    assert.deepEqual(a, b)
    assert.equal(a.locations.length, SCENE_SUGGESTION_COUNT)
    assert.equal(a.outfits.length, SCENE_SUGGESTION_COUNT)
    assert.equal(a.positions.length, SCENE_SUGGESTION_COUNT)
  })

  it('reste dans le pool du quotidien, sans costume ni micro', () => {
    const joined = SIMPLE_FUNNY_LOCATIONS.join(' ')
    assert.match(joined, /Laverie/)
    assert.match(joined, /IKEA/)
    assert.doesNotMatch(joined, /tapis rouge/i)
    assert.doesNotMatch(joined, /karaoke/i)
    assert.doesNotMatch(joined, /micro-brosse|microphone/i)
  })

  it('préremplit la scène guidée avec le premier tirage', () => {
    const suggestions = {
      locations: ['Laverie automatique, panier à linge entre vous deux'],
      outfits: ['Jean, t-shirt et sneakers, looks de tous les jours'],
      positions: ['Debout côte à côte, regard caméra un peu trop sérieux'],
    }
    assert.deepEqual(sceneFromSuggestions(suggestions), {
      location: suggestions.locations[0],
      outfits: suggestions.outfits[0],
      position: suggestions.positions[0],
    })
  })

  it('les prompts libres d’exemple restent raisonnables et assez longs', () => {
    for (const example of CUSTOM_PROMPT_EXAMPLES) {
      assert.ok(example.trim().length >= 20, example)
      assert.equal(isReasonableCustomPrompt(example), true, example)
    }
    const picked = pickCustomPromptExamples(4, seeded([0.1, 0.4, 0.7, 0.2]))
    assert.equal(picked.length, 4)
    assert.equal(new Set(picked).size, 4)
  })
})
