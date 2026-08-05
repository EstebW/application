/**
 * Exécution : npm test
 * Node 24 lit le TypeScript nativement — aucun runner supplémentaire à installer.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  celebrityIdFromName,
  extractHeightsFromText,
  feetInchesToCm,
  isValidUserHeightCm,
  normalizeCelebrityHeightCm,
  parseUserHeightCm,
  reconcileHeightCandidates,
} from '../lib/height.ts'
import { heightConsistencyBlock } from '../lib/height-prompt.ts'
import type { PhotoGenerationContext } from '../lib/types.ts'

describe('identifiant de célébrité', () => {
  it('est stable malgré la casse, les accents et la ponctuation', () => {
    assert.equal(celebrityIdFromName('Béyoncé'), 'beyonce')
    assert.equal(celebrityIdFromName('  BEYONCE  '), 'beyonce')
    assert.equal(celebrityIdFromName('Lionel Messi'), 'lionel-messi')
    assert.equal(celebrityIdFromName("Zendaya's"), 'zendaya-s')
  })

  it('renvoie une chaîne vide pour un nom sans caractère exploitable', () => {
    assert.equal(celebrityIdFromName('!!!'), '')
  })
})

describe('taille utilisateur', () => {
  it('accepte un entier dans les bornes', () => {
    assert.equal(parseUserHeightCm('175'), 175)
    assert.equal(parseUserHeightCm(175), 175)
    assert.equal(parseUserHeightCm(' 120 '), 120)
    assert.equal(parseUserHeightCm('220'), 220)
  })

  it('refuse hors bornes, décimales et texte', () => {
    assert.equal(parseUserHeightCm('119'), null)
    assert.equal(parseUserHeightCm('221'), null)
    assert.equal(parseUserHeightCm('175.5'), null)
    assert.equal(parseUserHeightCm('1m75'), null)
    assert.equal(parseUserHeightCm(''), null)
    assert.equal(parseUserHeightCm(undefined), null)
    assert.equal(isValidUserHeightCm(175.5), false)
  })
})

describe('normalisation des tailles de célébrités', () => {
  it('arrondit au centimètre entier', () => {
    assert.equal(normalizeCelebrityHeightCm(170.4), 170)
    assert.equal(normalizeCelebrityHeightCm(170.6), 171)
  })

  it('écarte les valeurs aberrantes', () => {
    assert.equal(normalizeCelebrityHeightCm(17), null)
    assert.equal(normalizeCelebrityHeightCm(999), null)
    assert.equal(normalizeCelebrityHeightCm(Number.NaN), null)
  })

  it('convertit les pieds et pouces', () => {
    assert.equal(Math.round(feetInchesToCm(6, 1)), 185)
    assert.equal(Math.round(feetInchesToCm(5, 7)), 170)
  })
})

describe('extraction depuis un texte', () => {
  it('lit les mètres, centimètres et pieds-pouces', () => {
    assert.deepEqual(extractHeightsFromText('Il mesure 1,70 m.'), [170])
    assert.deepEqual(extractHeightsFromText('height of 185 cm'), [185])
    assert.deepEqual(extractHeightsFromText('standing 6 ft 1 in tall'), [185])
  })

  it('ignore un nombre sans unité', () => {
    assert.deepEqual(extractHeightsFromText('né en 1987, 185 buts'), [])
  })
})

describe('recoupement des sources', () => {
  const wikidata = { heightCm: 170, sourceUrl: 'https://wikidata/Q615', confidence: 'verified' as const }

  it('reste verified quand les sources concordent', () => {
    const result = reconcileHeightCandidates('lionel-messi', [
      { heightCm: 169, sourceUrl: 'https://fr.wikipedia.org/x', confidence: 'probable' },
      wikidata,
    ])
    assert.equal(result.heightCm, 170)
    assert.equal(result.confidence, 'verified')
    assert.equal(result.sourceUrl, 'https://wikidata/Q615')
    assert.ok(result.verifiedAt)
  })

  it('dégrade en probable quand les sources divergent', () => {
    const result = reconcileHeightCandidates('lionel-messi', [
      wikidata,
      { heightCm: 178, sourceUrl: 'https://fr.wikipedia.org/x', confidence: 'probable' },
    ])
    assert.equal(result.heightCm, 170)
    assert.equal(result.confidence, 'probable')
  })

  it('renvoie unknown sans candidat exploitable', () => {
    const result = reconcileHeightCandidates('inconnu', [])
    assert.equal(result.heightCm, null)
    assert.equal(result.confidence, 'unknown')
    assert.equal(result.verifiedAt, null)
  })
})

describe('bloc de prompt', () => {
  const base: PhotoGenerationContext = {
    celebrityName: 'Lionel Messi',
    celebrityDomain: 'Sportif',
    mode: 'presets',
  }

  it('est absent quand aucune taille n\'est renseignée (parcours jumeau célèbre)', () => {
    assert.deepEqual(heightConsistencyBlock(base), [])
  })

  it('injecte les deux tailles quand elles sont connues', () => {
    const text = heightConsistencyBlock({ ...base, userHeightCm: 182, celebrityHeightCm: 170 }).join('\n')
    assert.match(text, /PHYSICAL HEIGHT, SCALE AND PERSPECTIVE CONSISTENCY/)
    assert.match(text, /user's real height is 182 centimeters/)
    assert.match(text, /celebrity's real height is 170 centimeters/)
  })

  it('bascule sur la contrainte souple quand la taille de la star est inconnue', () => {
    const text = heightConsistencyBlock({ ...base, userHeightCm: 182, celebrityHeightCm: null }).join('\n')
    assert.match(text, /PHYSICAL SCALE AND PERSPECTIVE CONSISTENCY/)
    assert.match(text, /exact verified height is currently unavailable/)
    assert.doesNotMatch(text, /celebrity's real height is/)
  })

  it('interdit de redimensionner l\'utilisateur en mode photo_edit', () => {
    const text = heightConsistencyBlock({
      ...base,
      creationMode: 'photo_edit',
      userHeightCm: 182,
      celebrityHeightCm: 170,
    }).join('\n')
    assert.match(text, /existing body in the uploaded photograph is immutable/)
    assert.match(text, /Do not resize, stretch, reconstruct or alter the user/)
  })
})
