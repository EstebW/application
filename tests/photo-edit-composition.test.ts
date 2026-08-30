import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildPhotoEditCompositionAnalysisText,
  COMPOSITION_TIGHT_FRAMING_LINES,
  COMPOSITION_UNSUITABLE_LAST_RESORT_LINES,
  parseCompositionResult,
} from '../lib/photo-edit-composition.ts'

describe('analyse composition photo_edit', () => {
  it('interdit de refuser un selfie serré uniquement faute d’espace vide', () => {
    const text = buildPhotoEditCompositionAnalysisText({
      starName: 'Macron',
      sceneIntent: 'selfie spontané',
      heightBlock: ['Utilisateur : 175 cm', 'Célébrité : 180 cm'],
      lockedRatio: 180 / 175,
    })

    assert.match(text, /NE suffit PAS à déclarer la photo unsuitable/i)
    assert.match(text, /selfie serré|visage serré/i)
    assert.match(text, /bord gauche ou droit du cadre/i)
    assert.match(text, /partie de son corps soit naturellement hors cadre/i)
    assert.match(text, /DERNIER RECOURS/i)
    assert.doesNotMatch(text, /zones réellement disponibles pour une deuxième personne/i)
  })

  it('inclut la politique cadrage serré dans les constantes exportées', () => {
    const policy = COMPOSITION_TIGHT_FRAMING_LINES.join('\n')
    assert.match(policy, /Ne jamais miniaturiser Person B/)
    assert.match(policy, /Ne jamais déplacer ou modifier le visage de Person A/)
  })

  it('accepte suitable:true pour un placement partiel depuis le bord (selfie serré crédible)', () => {
    const result = parseCompositionResult({
      suitable: true,
      celebrityPlacementInstruction:
        'Selfie serré : ajouter depuis le bord droit, visage et épaules visibles au même plan, légère inclinaison vers Person A, haut du torse partiellement hors cadre',
    })
    assert.equal(result.suitable, true)
    if (result.suitable) {
      assert.match(result.celebrityPlacementInstruction, /bord droit/i)
    }
  })

  it('ne confond pas unsuitable explicite avec un placement bord cadre valide', () => {
    assert.deepEqual(
      parseCompositionResult({ suitable: false, reason: 'SOURCE_PHOTO_UNSUITABLE' }),
      { suitable: false },
    )
    assert.match(
      COMPOSITION_UNSUITABLE_LAST_RESORT_LINES.join('\n'),
      /altérer l'identité de Person A/,
    )
  })
})
