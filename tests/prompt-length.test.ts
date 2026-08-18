/**
 * KIE Nano Banana refuse les prompts > 5000 caractères.
 * Le champ UI vide n'empêche pas un prompt interne trop long.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildFullGenerationPrompt,
  buildPhotoEditPrompt,
  buildPhotoPrompt,
  clampKiePrompt,
  KIE_PROMPT_MAX_CHARS,
} from '../lib/scene-suggestions.ts'
import type { PhotoGenerationContext } from '../lib/types.ts'

const longPlacement = 'Ajouter la célébrité immédiatement à droite de l’utilisateur, mêmes pieds au sol, profondeur caméra comparable, interaction naturelle, visage assez grand pour conserver ses traits, '.repeat(8)

const worstPhotoEdit: PhotoGenerationContext = {
  celebrityName: 'Jean-Michel Jarre Extraordinaire',
  celebrityDomain: 'Musicien, compositeur et pionnier de la musique électronique',
  celebrityStyleDescription: 'Look très détaillé avec lunettes, cheveux, veste et accessoires de scène',
  mode: 'custom',
  creationMode: 'photo_edit',
  customPrompt: 'Une note optionnelle assez longue pour tester le plafond interne du prompt. '.repeat(10),
  interaction: 'arm_shoulder',
  hasCelebrityReferenceImage: true,
  celebrityPlacementInstruction: longPlacement,
  userHeightCm: 182,
  celebrityHeightCm: 170,
  celebrityTargetApparentHeightRatio: 170 / 182,
}

const worstFullGen: PhotoGenerationContext = {
  celebrityName: 'Jean-Michel Jarre Extraordinaire',
  celebrityDomain: 'Musicien, compositeur et pionnier de la musique électronique',
  celebrityStyleDescription: 'Look très détaillé avec lunettes, cheveux, veste et accessoires de scène',
  funFact: 'A joué devant des millions de personnes sur des places publiques.',
  mode: 'presets',
  creationMode: 'full_generation',
  hasCelebrityReferenceImage: true,
  userHeightCm: 182,
  celebrityHeightCm: 170,
  interaction: 'arm_shoulder',
  scene: {
    location: 'Toilettes VIP du festival, vous vous lavez les mains en silence gêné',
    outfits: 'Smoking froissé + chaussettes Mickey qui dépassent',
    position: 'Tous les deux coincés devant le même miroir, regards caméra',
  },
}

describe('longueur des prompts KIE', () => {
  it('reste sous la limite pour photo_edit même avec placement + tailles + note', () => {
    const raw = buildPhotoEditPrompt(worstPhotoEdit)
    const prompt = buildPhotoPrompt(worstPhotoEdit)
    assert.ok(raw.length <= KIE_PROMPT_MAX_CHARS, `photo_edit brut ${raw.length} > ${KIE_PROMPT_MAX_CHARS}`)
    assert.ok(prompt.length <= KIE_PROMPT_MAX_CHARS, `photo_edit ${prompt.length} > ${KIE_PROMPT_MAX_CHARS}`)
    assert.match(prompt, /SOURCE photo/)
    assert.match(prompt, /PLACEMENT/)
    assert.match(prompt, /PHOTOREALISM/)
    assert.match(prompt, /SELFIE LOCK/)
    assert.match(prompt, /same camera plane/)
    assert.match(prompt, /close natural proximity/)
    assert.match(prompt, /non-distinctive imperfections/)
    assert.match(prompt, /AI-smooth skin/)
    assert.doesNotMatch(prompt, /NATURAL MOMENT LOCK/)
    assert.match(prompt, /unrelated fashion style/)
    assert.match(prompt, /182/)
  })

  it('reste sous la limite pour full_generation avec scène guidée', () => {
    const prompt = buildPhotoPrompt(worstFullGen)
    assert.ok(prompt.length <= KIE_PROMPT_MAX_CHARS, `full_generation ${prompt.length} > ${KIE_PROMPT_MAX_CHARS}`)
    assert.match(prompt, /USER SCENE BRIEF/)
    assert.match(prompt, /Toilettes VIP/)
  })

  it('garde USER SCENE PROMPT même avec un customPrompt énorme', () => {
    const prompt = buildPhotoPrompt({
      ...worstFullGen,
      mode: 'custom',
      customPrompt: `TOKEN_SCENE_UNIQUE ${'x'.repeat(8000)}`,
      scene: undefined,
    })
    assert.ok(prompt.length <= KIE_PROMPT_MAX_CHARS)
    assert.match(prompt, /USER SCENE PROMPT/)
    assert.match(prompt, /TOKEN_SCENE_UNIQUE/)
  })

  it('borne une location trop longue sans déclencher le clamp', () => {
    const raw = buildFullGenerationPrompt({
      ...worstFullGen,
      scene: {
        location: `Toilettes VIP ${'x'.repeat(5000)}`,
        outfits: 'Smoking froissé',
        position: 'Devant le miroir',
      },
    })
    const { truncated } = clampKiePrompt(raw)
    assert.ok(raw.length <= KIE_PROMPT_MAX_CHARS)
    assert.equal(truncated, false)
    assert.match(raw, /USER SCENE BRIEF/)
    assert.match(raw, /Toilettes VIP/)
    assert.ok(!raw.includes('x'.repeat(300)))
  })
})

describe('clampKiePrompt', () => {
  it('conserve le verrouillage d’identité et le USER SCENE BRIEF', () => {
    const oversized = [
      'ABSOLUTE PRIORITY — FACIAL IDENTITY LOCK:',
      'IDENTITY_TOKEN_UNIQUE keep this lock',
      'PERSON A HARD LOCK:',
      'PERSON_A_LOCK_TOKEN',
      'PHOTOREALISM — amateur smartphone snap (after face locks):',
      'PHOTOREALISM_TOKEN_UNIQUE',
      'NATURAL MOMENT LOCK: TOKEN_MOMENT_UNIQUE',
      'WARDROBE: filler:',
      'z'.repeat(5000),
      'USER SCENE BRIEF (setting/outfits/pose ONLY — faces stay locked; follow literally):',
      '1. LOCATION / SETTING: TOKEN_BRIEF_UNIQUE',
    ].join('\n')
    assert.ok(oversized.length > KIE_PROMPT_MAX_CHARS)

    const { prompt, truncated } = clampKiePrompt(oversized)
    assert.equal(truncated, true)
    assert.ok(prompt.length <= KIE_PROMPT_MAX_CHARS)
    assert.match(prompt, /FACIAL IDENTITY LOCK/)
    assert.match(prompt, /IDENTITY_TOKEN_UNIQUE/)
    assert.match(prompt, /PERSON A HARD LOCK/)
    assert.match(prompt, /PERSON_A_LOCK_TOKEN/)
    assert.match(prompt, /PHOTOREALISM_TOKEN_UNIQUE/)
    assert.match(prompt, /TOKEN_MOMENT_UNIQUE/)
    assert.match(prompt, /USER SCENE BRIEF/)
    assert.match(prompt, /TOKEN_BRIEF_UNIQUE/)
    assert.notEqual(prompt, oversized.slice(0, KIE_PROMPT_MAX_CHARS))
  })

  it('retire SUBJECTS avant de toucher au placement', () => {
    const oversized = [
      'IDENTITY LOCK',
      'y'.repeat(3000),
      'SUBJECTS:',
      'z'.repeat(3000),
      'PLACEMENT (follow this, not a generic empty-space insert):',
      'TOKEN_PLACEMENT_UNIQUE à droite de l’utilisateur',
    ].join('\n')
    assert.ok(oversized.length > KIE_PROMPT_MAX_CHARS)

    const { prompt, truncated } = clampKiePrompt(oversized)
    assert.equal(truncated, true)
    assert.ok(prompt.length <= KIE_PROMPT_MAX_CHARS)
    assert.match(prompt, /TOKEN_PLACEMENT_UNIQUE/)
    assert.doesNotMatch(prompt, /^SUBJECTS:/m)
  })
})
