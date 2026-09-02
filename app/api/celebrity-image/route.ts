import { NextRequest, NextResponse } from 'next/server'
import {
  fetchCelebrityWikiImageUrl,
  isAllowedCelebrityImageUrl,
} from '@/lib/celebrity-image'

export const runtime = 'edge'

const UA = 'StarFusion/1.0 (https://starfusion.app; celebrity portrait lookup)'

/** Aligné sur la limite de portrait de l'Edge Function generate. */
const MAX_PORTRAIT_BYTES = 4 * 1024 * 1024

async function wikiImageToDataUrl(imageUrl: string): Promise<string | null> {
  const res = await fetch(imageUrl, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null
  const buffer = await res.arrayBuffer()
  if (buffer.byteLength > MAX_PORTRAIT_BYTES) return null
  const bytes = new Uint8Array(buffer)
  const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return `data:${mime};base64,${btoa(binary)}`
}

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')?.trim()
  const directUrl = req.nextUrl.searchParams.get('url')?.trim()
  const format = req.nextUrl.searchParams.get('format')

  // Portrait déjà choisi dans la recherche de stars : on convertit cette image précise.
  if (directUrl) {
    if (!isAllowedCelebrityImageUrl(directUrl)) {
      return NextResponse.json({ error: 'url not allowed' }, { status: 400 })
    }
    try {
      const dataUrl = await wikiImageToDataUrl(directUrl)
      return NextResponse.json({ url: directUrl, dataUrl })
    } catch {
      return NextResponse.json({ url: directUrl, dataUrl: null }, { status: 502 })
    }
  }

  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }

  try {
    const url = await fetchCelebrityWikiImageUrl(name)
    if (!url) return NextResponse.json({ url: null, dataUrl: null })

    if (format === 'dataurl') {
      const dataUrl = await wikiImageToDataUrl(url)
      return NextResponse.json({ url, dataUrl })
    }

    return NextResponse.json({ url })
  } catch {
    return NextResponse.json({ url: null, dataUrl: null }, { status: 502 })
  }
}
