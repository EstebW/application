import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { extractTextFromVisionResponse } from '../lib/kie-vision-response.ts'

describe('extractTextFromVisionResponse', () => {
  it('lit content string OpenAI', () => {
    const text = extractTextFromVisionResponse({
      choices: [{ message: { content: '{"candidates":[]}' } }],
    })
    assert.equal(text, '{"candidates":[]}')
  })

  it('lit content array multimodal', () => {
    const text = extractTextFromVisionResponse({
      choices: [{
        message: {
          content: [{ type: 'text', text: '{"candidates":[{"name":"Test"}]}' }],
        },
      }],
    })
    assert.match(text, /Test/)
  })

  it('lit format Gemini candidates.parts', () => {
    const text = extractTextFromVisionResponse({
      candidates: [{ content: { parts: [{ text: '{"candidates":[]}' }] } }],
    })
    assert.equal(text, '{"candidates":[]}')
  })

  it('déplie data string KIE', () => {
    const text = extractTextFromVisionResponse({
      code: 200,
      data: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
    })
    assert.equal(text, 'ok')
  })
})
