import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildSafetyRetryPrompt,
  isGoogleSafetyBlockedMessage,
  isSafetyRetryEligible,
} from '../lib/generation-safety.ts'

describe('détection safety Google', () => {
  it('détecte un refus policy explicite', () => {
    assert.equal(
      isGoogleSafetyBlockedMessage('Request violates Generative AI Prohibited Use policy'),
      true,
    )
    assert.equal(
      isGoogleSafetyBlockedMessage('The image was filtered out by Google safety'),
      true,
    )
  })

  it('ne transforme pas « No images found » seul en safety', () => {
    assert.equal(isGoogleSafetyBlockedMessage('No images found in AI response'), false)
    assert.equal(isGoogleSafetyBlockedMessage('kie.ai poll: timeout'), false)
    assert.equal(isGoogleSafetyBlockedMessage('insufficient balance code 402'), false)
  })

  it('accepte No images found seulement avec marqueur Google', () => {
    assert.equal(
      isGoogleSafetyBlockedMessage('No images found in AI response — filtered out by policy'),
      true,
    )
  })
})

describe('éligibilité retry safety', () => {
  const presetCtx = {
    celebrityName: 'Test Star',
    mode: 'presets' as const,
    creationMode: 'full_generation' as const,
    scene: { location: 'Parc', outfits: 'Casual', position: 'Debout' },
    interaction: 'side_by_side',
  }

  it('refuse le retry si customPrompt', () => {
    assert.equal(isSafetyRetryEligible(presetCtx, true), false)
  })

  it('autorise preset sans customPrompt', () => {
    assert.equal(isSafetyRetryEligible(presetCtx, false), true)
  })

  it('refuse customPrompt libre même avec interaction', () => {
    assert.equal(
      isSafetyRetryEligible({ ...presetCtx, mode: 'custom', interaction: 'selfie' }, true),
      false,
    )
  })
})

describe('buildSafetyRetryPrompt', () => {
  it('reste court et neutre', () => {
    const prompt = buildSafetyRetryPrompt({
      celebrityName: 'Ryan Gosling',
      mode: 'presets',
      creationMode: 'full_generation',
      interaction: 'selfie',
      scene: {
        location: 'Parc',
        outfits: 'Casual',
        position: 'Selfie POV',
      },
    })
    assert.ok(prompt.length <= 1800)
    assert.match(prompt, /SAFE RETRY — ORDINARY EVERYDAY PHOTO/)
    assert.match(prompt, /FRONT CAMERA RESULT ONLY/)
    assert.doesNotMatch(prompt, /sexual|violent|hateful|illegal/i)
    assert.doesNotMatch(prompt, /No sexual/)
  })

  it('conserve le placement photo_edit', () => {
    const prompt = buildSafetyRetryPrompt({
      celebrityName: 'Star',
      mode: 'presets',
      creationMode: 'photo_edit',
      interaction: 'selfie',
      celebrityPlacementInstruction: 'Ajouter à droite, même plan caméra',
    })
    assert.match(prompt, /preserve the source photo structure/)
    assert.match(prompt, /Placement: Ajouter à droite/)
  })
})
