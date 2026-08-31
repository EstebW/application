import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { COMBINED_ANALYZE_PROMPT, MATCH_SYSTEM } from '../lib/kie-analyze.ts'
import {
  ANALYSIS_PROVIDER,
  DEFAULT_ANALYSIS_GEMINI_MODEL,
  buildGoogleGeminiAnalyzeBody,
  googleGeminiAnalyzeUrl,
  resolveAnalysisGeminiModel,
} from '../lib/google-gemini-analyze.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Hash figé du prompt d'analyse (MATCH_SYSTEM + COMBINED_ANALYZE_PROMPT). Toute modification accidentelle doit faire échouer ce test. */
export const ANALYZE_PROMPT_SHA256 =
  'fa6cc8cd0d522da8643ed27d9af5bfba6378fa8b563353f4f5c1ceaad346be55'

function extractTemplateConst(source: string, name: string): string {
  const marker = `const ${name} = \``
  const start = source.indexOf(marker)
  if (start < 0) throw new Error(`const ${name} introuvable`)
  const contentStart = start + marker.length
  const end = source.indexOf('`', contentStart)
  if (end < 0) throw new Error(`fin de ${name} introuvable`)
  return source.slice(contentStart, end)
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

describe('prompt analyse figé (non-régression provider Google)', () => {
  it('MATCH_SYSTEM et COMBINED_ANALYZE_PROMPT identiques entre Next.js et Edge Function', () => {
    const edgeSrc = readFileSync(join(ROOT, 'supabase/functions/analyze/index.ts'), 'utf8')
    assert.equal(extractTemplateConst(edgeSrc, 'MATCH_SYSTEM'), MATCH_SYSTEM)
    assert.equal(extractTemplateConst(edgeSrc, 'COMBINED_ANALYZE_PROMPT'), COMBINED_ANALYZE_PROMPT)
  })

  it('hash SHA-256 du prompt d’analyse inchangé', () => {
    const payload = `${MATCH_SYSTEM}\n---\n${COMBINED_ANALYZE_PROMPT}`
    assert.equal(sha256(payload), ANALYZE_PROMPT_SHA256)
  })
})

describe('transport Gemini Google (analyse)', () => {
  it('modèle par défaut gemini-3.7-flash', () => {
    assert.equal(DEFAULT_ANALYSIS_GEMINI_MODEL, 'gemini-3.7-flash')
    assert.equal(resolveAnalysisGeminiModel({}), 'gemini-3.7-flash')
    assert.equal(resolveAnalysisGeminiModel({ ANALYSIS_GEMINI_MODEL: '  gemini-x  ' }), 'gemini-x')
    assert.equal(ANALYSIS_PROVIDER, 'google_direct')
  })

  it('URL REST officielle generateContent', () => {
    assert.equal(
      googleGeminiAnalyzeUrl('gemini-3.7-flash'),
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent',
    )
  })

  it('envoie le prompt inchangé + image inlineData sans recadrer', () => {
    const image = 'data:image/jpeg;base64,abc123'
    const body = buildGoogleGeminiAnalyzeBody({
      systemInstruction: MATCH_SYSTEM,
      userText: COMBINED_ANALYZE_PROMPT,
      imageBase64: image,
      temperature: 0.2,
    })
    const sys = body.systemInstruction as { parts: Array<{ text: string }> }
    assert.equal(sys.parts[0].text, MATCH_SYSTEM)
    const contents = body.contents as Array<{ parts: Array<Record<string, unknown>> }>
    assert.equal(contents[0].parts[0].text, COMBINED_ANALYZE_PROMPT)
    const inline = contents[0].parts[1].inlineData as { mimeType: string; data: string }
    assert.equal(inline.mimeType, 'image/jpeg')
    assert.equal(inline.data, 'abc123')
  })
})
