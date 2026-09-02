import { NextRequest, NextResponse } from 'next/server'
import {
  PORTRAIT_MAX_REVIEWED,
  buildCommonsPortraitSearchUrl,
  buildPortraitPickBody,
  buildPortraitPickKieMessages,
  commonsFilePathUrl,
  parseCommonsPortraitResponse,
  parsePortraitPick,
  rankPortraitCandidates,
  type PortraitCandidate,
} from '@/lib/celebrity-portrait'
import {
  extractGoogleGeminiText,
  googleGeminiAnalyzeUrl,
  resolveAnalysisGeminiModels,
} from '@/lib/google-gemini-analyze'
import { extractTextFromVisionResponse } from '@/lib/kie-vision-response'

const KIE_PORTRAIT_URL = 'https://api.kie.ai/gemini-3-flash/v1/chat/completions'

export const runtime = 'edge'

const UA = 'StarFusion/1.0 (https://starfusion.app; celebrity portrait lookup)'
const MAX_PORTRAIT_BYTES = 4 * 1024 * 1024

type FetchedImage = { mimeType: string; data: string }

async function fetchAsBase64(url: string): Promise<FetchedImage | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null
  const buffer = await res.arrayBuffer()
  if (buffer.byteLength > MAX_PORTRAIT_BYTES) return null
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return {
    mimeType: res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg',
    data: btoa(binary),
  }
}

async function fetchCandidates(name: string, signal?: AbortSignal): Promise<PortraitCandidate[]> {
  const res = await fetch(buildCommonsPortraitSearchUrl(name), {
    headers: { Accept: 'application/json', 'User-Agent': UA },
    signal,
  })
  if (!res.ok) return []
  return parseCommonsPortraitResponse(await res.json())
}

type AuthMode = 'header' | 'query'

function geminiRequest(model: string, apiKey: string, body: string, mode: AuthMode) {
  const url = mode === 'query'
    ? `${googleGeminiAnalyzeUrl(model)}?key=${encodeURIComponent(apiKey)}`
    : googleGeminiAnalyzeUrl(model)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (mode === 'header') headers['x-goog-api-key'] = apiKey
  return fetch(url, { method: 'POST', headers, body })
}

/** Les clés AIza passent en en-tête ; les clés AQ. d'AI Studio passent souvent en `?key=`. */
async function pickWithGemini(
  name: string,
  images: FetchedImage[],
  apiKey: string,
): Promise<{ index: number; reason: string } | null> {
  const body = JSON.stringify(buildPortraitPickBody({ celebrityName: name, images }))
  const modes: AuthMode[] = apiKey.startsWith('AQ.') ? ['query', 'header'] : ['header', 'query']

  for (const model of resolveAnalysisGeminiModels()) {
    for (const mode of modes) {
      try {
        const res = await geminiRequest(model, apiKey, body, mode)
        if (!res.ok) {
          const detail = await res.text()
          console.warn('[celebrity-portrait] gemini', model, mode, res.status, detail.slice(0, 180))
          continue
        }
        const pick = parsePortraitPick(extractGoogleGeminiText(await res.json()), images.length)
        if (pick) return pick
        console.warn('[celebrity-portrait] gemini', model, mode, 'réponse inexploitable')
      } catch (err) {
        console.warn('[celebrity-portrait] gemini', model, mode, err instanceof Error ? err.message : err)
      }
    }
  }
  return null
}

/** Repli : même modèle vision que l'analyse de composition, déjà provisionné via KIE_API_KEY. */
async function pickWithKie(
  name: string,
  images: FetchedImage[],
  apiKey: string,
): Promise<{ index: number; reason: string } | null> {
  try {
    const res = await fetch(KIE_PORTRAIT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: buildPortraitPickKieMessages({ celebrityName: name, images }),
        stream: false,
        temperature: 0,
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      console.warn('[celebrity-portrait] kie', res.status, detail.slice(0, 180))
      return null
    }
    const pick = parsePortraitPick(extractTextFromVisionResponse(await res.json()), images.length)
    if (!pick) console.warn('[celebrity-portrait] kie réponse inexploitable')
    return pick
  } catch (err) {
    console.warn('[celebrity-portrait] kie', err instanceof Error ? err.message : err)
    return null
  }
}

async function pickBestPortrait(
  name: string,
  images: FetchedImage[],
): Promise<{ index: number; reason: string } | null> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim()
  const kieKey = process.env.KIE_API_KEY?.trim()

  // Les clés AQ. d'AI Studio sont refusées par l'API REST native (API_KEY_INVALID).
  // On passe alors par kie.ai, déjà utilisé pour l'analyse de composition.
  if (geminiKey && !geminiKey.startsWith('AQ.')) {
    const pick = await pickWithGemini(name, images, geminiKey)
    if (pick) return pick
  }
  if (kieKey) {
    const pick = await pickWithKie(name, images, kieKey)
    if (pick) return pick
  }
  if (geminiKey?.startsWith('AQ.')) {
    return pickWithGemini(name, images, geminiKey)
  }
  return null
}

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')?.trim()
  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }
  const fallbackUrl = req.nextUrl.searchParams.get('fallback')?.trim() || null

  try {
    const ranked = rankPortraitCandidates(
      await fetchCandidates(name, req.signal),
      name,
      PORTRAIT_MAX_REVIEWED,
    )
    if (!ranked.length) {
      return NextResponse.json({ imageUrl: fallbackUrl, dataUrl: null, pickedBy: 'none' })
    }

    const thumbs = await Promise.all(ranked.map((c) => fetchAsBase64(c.thumbUrl)))
    const reviewed = ranked
      .map((candidate, index) => ({ candidate, image: thumbs[index] }))
      .filter((entry): entry is { candidate: PortraitCandidate; image: FetchedImage } =>
        entry.image !== null)

    if (!reviewed.length) {
      return NextResponse.json({ imageUrl: fallbackUrl, dataUrl: null, pickedBy: 'none' })
    }

    const pick = await pickBestPortrait(name, reviewed.map((entry) => entry.image))

    const chosen = reviewed[pick?.index ?? 0]!
    const imageUrl = commonsFilePathUrl(chosen.candidate.fileName)
    const full = await fetchAsBase64(imageUrl)

    return NextResponse.json({
      imageUrl,
      // La vignette déjà téléchargée évite de repartir sans référence.
      dataUrl: `data:${(full ?? chosen.image).mimeType};base64,${(full ?? chosen.image).data}`,
      pickedBy: pick ? 'ai' : 'heuristic',
      reason: pick?.reason ?? '',
      reviewedCount: reviewed.length,
    })
  } catch {
    return NextResponse.json(
      { imageUrl: fallbackUrl, dataUrl: null, pickedBy: 'none' },
      { status: 502 },
    )
  }
}
