/**
 * Transport Google Gemini (analyse faciale uniquement).
 * Ne change ni le prompt, ni le schéma JSON, ni le scoring StarFusion.
 */

import { extractTextFromVisionResponse } from './kie-vision-response.ts'

export const ANALYSIS_PROVIDER = 'google_direct'
export const DEFAULT_ANALYSIS_GEMINI_MODEL = 'gemini-3.7-flash'
export const GOOGLE_GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

export function resolveAnalysisGeminiModel(
  env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {},
): string {
  const raw = env.ANALYSIS_GEMINI_MODEL?.trim()
  return raw || DEFAULT_ANALYSIS_GEMINI_MODEL
}

export function toRawBase64(base64: string) {
  return base64.replace(/^data:image\/\w+;base64,/, '')
}

export function getAnalyzeImageMime(
  base64: string,
): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  if (base64.startsWith('data:image/png')) return 'image/png'
  if (base64.startsWith('data:image/webp')) return 'image/webp'
  if (base64.startsWith('data:image/gif')) return 'image/gif'
  return 'image/jpeg'
}

export function googleGeminiAnalyzeUrl(model: string): string {
  return `${GOOGLE_GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`
}

function redactSecrets(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, 'REDACTED')
    .replace(/key=[^&\s"']+/gi, 'key=REDACTED')
}

function vendorErrorPreview(bodyText: string, data: unknown): string {
  if (data && typeof data === 'object') {
    const err = data as { error?: { message?: string; status?: string; code?: number } }
    if (err.error?.message) return redactSecrets(err.error.message).slice(0, 400)
  }
  return redactSecrets(bodyText).slice(0, 400)
}

export function extractGoogleGeminiText(data: unknown): string {
  return extractTextFromVisionResponse(data)
}

export function googleGeminiFinishReason(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const d = data as {
    candidates?: Array<{ finishReason?: string; finish_reason?: string }>
    promptFeedback?: { blockReason?: string }
  }
  return (
    d.candidates?.[0]?.finishReason
    ?? d.candidates?.[0]?.finish_reason
    ?? d.promptFeedback?.blockReason
  )
}

export function buildGoogleGeminiAnalyzeBody(opts: {
  systemInstruction: string
  userText: string
  imageBase64: string
  extraUserText?: string
  temperature: number
}): Record<string, unknown> {
  const userParts: Array<Record<string, unknown>> = [
    { text: opts.userText },
    {
      inlineData: {
        mimeType: getAnalyzeImageMime(opts.imageBase64),
        data: toRawBase64(opts.imageBase64),
      },
    },
  ]

  const contents: Array<Record<string, unknown>> = [
    { role: 'user', parts: userParts },
  ]

  if (opts.extraUserText) {
    contents.push({ role: 'user', parts: [{ text: opts.extraUserText }] })
  }

  return {
    systemInstruction: { parts: [{ text: opts.systemInstruction }] },
    contents,
    generationConfig: {
      temperature: opts.temperature,
      responseMimeType: 'application/json',
    },
  }
}

export async function callGoogleGeminiAnalyze(opts: {
  systemInstruction: string
  userText: string
  imageBase64: string
  extraUserText?: string
  apiKey: string
  model: string
  temperature: number
}): Promise<string> {
  const started = Date.now()
  const url = googleGeminiAnalyzeUrl(opts.model)
  let httpStatus = 0
  let bodyText = ''
  let data: unknown

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': opts.apiKey,
      },
      body: JSON.stringify(buildGoogleGeminiAnalyzeBody({
        systemInstruction: opts.systemInstruction,
        userText: opts.userText,
        imageBase64: opts.imageBase64,
        extraUserText: opts.extraUserText,
        temperature: opts.temperature,
      })),
    })

    httpStatus = res.status
    bodyText = await res.text()
    try {
      data = JSON.parse(bodyText)
    } catch {
      data = undefined
    }

    if (!res.ok) {
      const err = data as { error?: { message?: string; status?: string } } | undefined
      throw new Error(
        `google_gemini ${opts.model} ${res.status}${err?.error?.status ? ` ${err.error.status}` : ''} — ${vendorErrorPreview(bodyText, data)}`,
      )
    }

    const finishReason = googleGeminiFinishReason(data)
    const raw = extractGoogleGeminiText(data)
    if (!raw) {
      throw new Error(
        finishReason
          ? `Réponse vide du modèle (${finishReason})`
          : 'Réponse vide du modèle',
      )
    }

    console.log('[analyze]', {
      analysis_provider: ANALYSIS_PROVIDER,
      analysis_model: opts.model,
      analysis_duration_ms: Date.now() - started,
      analysis_success: true,
    })

    return raw
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[analyze]', {
      analysis_provider: ANALYSIS_PROVIDER,
      analysis_model: opts.model,
      analysis_duration_ms: Date.now() - started,
      analysis_success: false,
      analysis_provider_error: {
        http_status: httpStatus || undefined,
        error_type: (data as { error?: { status?: string } } | undefined)?.error?.status
          ?? (err instanceof Error ? err.name : 'Error'),
        vendor_message: redactSecrets(message).slice(0, 400),
      },
    })
    throw err instanceof Error ? err : new Error(message)
  }
}
