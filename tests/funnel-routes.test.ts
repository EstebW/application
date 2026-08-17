/**
 * Exécution : npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  funnelPath,
  funnelPaymentPath,
  parseFunnelPath,
  safeFunnelStep,
} from '../lib/funnel-routes.ts'

describe('URLs du funnel', () => {
  it('mappe chaque étape jumeau vers un chemin unique', () => {
    assert.equal(funnelPath('modeChoice', null), '/')
    assert.equal(funnelPath('hero', 'match'), '/jumeau')
    assert.equal(funnelPath('analyzing', 'match'), '/jumeau/analyse')
    assert.equal(funnelPath('teaser', 'match'), '/jumeau/teaser')
    assert.equal(funnelPath('success', 'match'), '/jumeau/succes')
  })

  it('mappe chaque étape Choisis ta star vers un chemin unique', () => {
    assert.equal(funnelPath('creationChoice', 'custom'), '/star')
    assert.equal(funnelPath('customCelebrity', 'custom'), '/star/celebrite')
    assert.equal(funnelPath('basePhoto', 'custom'), '/star/selfie')
    assert.equal(funnelPath('customize', 'custom'), '/star/scene')
  })

  it('reparse les chemins vers l’étape et le mode', () => {
    assert.deepEqual(parseFunnelPath('/'), { step: 'modeChoice', appMode: null })
    assert.deepEqual(parseFunnelPath('/jumeau/paiement'), { step: 'payment', appMode: 'match' })
    assert.deepEqual(parseFunnelPath('/star/selfie/'), { step: 'basePhoto', appMode: 'custom' })
  })

  it('renvoie le paiement du bon parcours', () => {
    assert.equal(funnelPaymentPath('match'), '/jumeau/paiement')
    assert.equal(funnelPaymentPath('custom'), '/star/paiement')
  })

  it('ramène une URL profonde sans données vers une étape sûre', () => {
    assert.equal(
      safeFunnelStep('analyzing', 'match', {
        photoPreview: '',
        celebrity: null,
        generationRequest: null,
        generatedImage: '',
      }),
      'hero',
    )
    assert.equal(
      safeFunnelStep('customize', 'custom', {
        photoPreview: '',
        celebrity: null,
        generationRequest: null,
        generatedImage: '',
      }),
      'creationChoice',
    )
  })
})
