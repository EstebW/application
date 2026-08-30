/**
 * Audit pré-déploiement : prompt photo_edit le plus long possible (customPrompt 600 chars).
 * Vérifie que clampKiePrompt ne supprime aucun bloc critique.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildPhotoEditPrompt,
  buildPhotoPrompt,
  clampKiePrompt,
  KIE_PROMPT_MAX_CHARS,
} from '../lib/scene-suggestions.ts'
import type { PhotoGenerationContext } from '../lib/types.ts'

const CRITICAL_CHECKS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'Person A identity lock', pattern: /PERSON A HARD LOCK/i },
  { name: 'Person B identity lock', pattern: /PERSON B HARD LOCK/i },
  { name: 'hairline', pattern: /hairline/i },
  { name: 'no beautify/morph', pattern: /No morph, blend, beautify/i },
  { name: 'PLACEMENT header', pattern: /PLACEMENT — COMPOSITION ANALYSIS/ },
  { name: 'celebrityPlacementInstruction', pattern: /même plan caméra/i },
  { name: 'PHOTOREALISM', pattern: /PHOTOREALISM/ },
  { name: 'pores', pattern: /visible pores/i },
  { name: 'grain/noise/sharpness', pattern: /Grain, noise, compression, sharpness/i },
  {
    name: 'NEVER sharper rule',
    pattern: /NEVER look sharper, cleaner, smoother, better lit or more professionally retouched than the user/,
  },
  { name: 'NATURAL MOMENT LOCK', pattern: /NATURAL MOMENT LOCK \(photo_edit\)/ },
  { name: 'FINAL IDENTITY CHECK', pattern: /FINAL IDENTITY CHECK/ },
  { name: 'SELFIE POV', pattern: /SELFIE POV LOCK \(photo_edit\)/ },
]

function worstPhotoEditContext(customPrompt: string): PhotoGenerationContext {
  return {
    celebrityName: 'Jean-Michel Jarre Extraordinaire',
    celebrityDomain: 'Musicien, compositeur et pionnier de la musique électronique internationale',
    celebrityStyleDescription: 'Look très détaillé avec lunettes signature, cheveux longs, veste de scène et accessoires lumineux',
    mode: 'custom',
    creationMode: 'photo_edit',
    customPrompt,
    interaction: 'selfie',
    hasCelebrityReferenceImage: true,
    celebrityPlacementInstruction:
      'Ajouter la célébrité à droite de l’utilisateur, même plancher, même plan caméra, regards cohérents avec la photo source, visage assez grand pour conserver ses traits, hauteur apparente environ 93 pourcent',
    userHeightCm: 182,
    celebrityHeightCm: 170,
    celebrityTargetApparentHeightRatio: 170 / 182,
  }
}

describe('audit prompt photo_edit (pire cas)', () => {
  it('reste sous 4900 chars sans clamp et conserve tous les blocs critiques', () => {
    const custom600 = 'Z'.repeat(600)
    const ctx = worstPhotoEditContext(custom600)
    const raw = buildPhotoEditPrompt(ctx)
    const { prompt, truncated } = clampKiePrompt(raw)
    const viaBuild = buildPhotoPrompt(ctx)

    assert.equal(viaBuild, prompt)
    assert.ok(
      raw.length <= KIE_PROMPT_MAX_CHARS,
      `prompt brut trop long: ${raw.length} > ${KIE_PROMPT_MAX_CHARS} — le clamp ne doit pas être nécessaire`,
    )
    assert.equal(truncated, false, 'clamp ne doit pas tronquer le pire cas photo_edit')

    for (const { name, pattern } of CRITICAL_CHECKS) {
      assert.match(raw, pattern, `manquant dans le brut: ${name}`)
      assert.match(prompt, pattern, `manquant après clamp: ${name}`)
    }
  })
})
