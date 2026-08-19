import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_PHOTO_ASPECT_RATIO,
  isValidPhotoAspectRatio,
  normalizePhotoAspectRatio,
} from '../lib/photo-format.ts'

describe('format photo', () => {
  it('accepte les ratios proposés dans l’UI', () => {
    for (const ratio of ['auto', '1:1', '4:3', '3:4', '16:9', '9:16']) {
      assert.equal(isValidPhotoAspectRatio(ratio), true)
    }
  })

  it('refuse les ratios hors liste', () => {
    assert.equal(isValidPhotoAspectRatio('21:9'), false)
    assert.equal(isValidPhotoAspectRatio(''), false)
  })

  it('retombe sur le défaut si invalide', () => {
    assert.equal(normalizePhotoAspectRatio(undefined), DEFAULT_PHOTO_ASPECT_RATIO)
    assert.equal(normalizePhotoAspectRatio('2:1'), DEFAULT_PHOTO_ASPECT_RATIO)
    assert.equal(normalizePhotoAspectRatio('9:16'), '9:16')
  })
})
