import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CUSTOM_PROMPT_EXAMPLES } from '../lib/scene-suggestions.ts'
import {
  buildSafetyRetryPrompt,
  isGoogleSafetyBlockedMessage,
  isProhibitedPromptContent,
  isReasonableCustomPrompt,
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

describe('prompt libre raisonnable', () => {
  it('accepte scènes absurdes / soirée', () => {
    assert.equal(isReasonableCustomPrompt('une photo le soir à 22h'), true)
    assert.equal(isReasonableCustomPrompt('photo sexy au bar'), true)
    for (const example of CUSTOM_PROMPT_EXAMPLES) {
      assert.equal(isReasonableCustomPrompt(example), true, example)
    }
  })

  it('refuse contenu réellement interdit', () => {
    assert.equal(isProhibitedPromptContent('photo nue au bar'), true)
    assert.equal(isReasonableCustomPrompt('photo nue au bar'), false)
    assert.equal(isReasonableCustomPrompt('porno avec la star'), false)
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

  it('refuse le retry si customPrompt interdit', () => {
    assert.equal(isSafetyRetryEligible(presetCtx, true), false)
  })

  it('autorise preset sans customPrompt', () => {
    assert.equal(isSafetyRetryEligible(presetCtx, false), true)
  })

  it('autorise customPrompt raisonnable', () => {
    const prompt = 'une photo le soir à 22h'
    assert.equal(
      isSafetyRetryEligible(
        { celebrityName: 'Star', mode: 'custom', customPrompt: prompt },
        true,
      ),
      true,
    )
  })

  it('autorise note photo_edit raisonnable', () => {
    assert.equal(
      isSafetyRetryEligible(
        {
          celebrityName: 'Star',
          mode: 'presets',
          creationMode: 'photo_edit',
          customPrompt: 'star un peu plus à droite, sourire naturel',
        },
        true,
      ),
      true,
    )
  })

  it('refuse customPrompt interdit', () => {
    assert.equal(
      isSafetyRetryEligible(
        { celebrityName: 'Star', mode: 'custom', customPrompt: 'photo nue au bar' },
        true,
      ),
      false,
    )
  })

  it('refuse customPrompt sans texte', () => {
    assert.equal(
      isSafetyRetryEligible({ ...presetCtx, mode: 'custom', interaction: 'selfie' }, true),
      false,
    )
  })
})

describe('buildSafetyRetryPrompt', () => {
  it('inclut le préambule fiction et la demande user en mode custom', () => {
    const prompt = buildSafetyRetryPrompt({
      celebrityName: 'Ryan Gosling',
      mode: 'custom',
      customPrompt: 'une photo le soir à 22h',
      interaction: 'side_by_side',
    })
    assert.match(prompt, /STARFUSION — HARMLESS FICTION/)
    assert.match(prompt, /User scene request: une photo le soir à 22h/)
    assert.match(prompt, /StarFusion user request/)
    assert.match(prompt, /humorous or absurd spirit/)
  })

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
    assert.ok(prompt.length <= 2400)
    assert.match(prompt, /SAFE RETRY — ORDINARY EVERYDAY PHOTO/)
    assert.match(prompt, /FRONT CAMERA RESULT ONLY/)
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
