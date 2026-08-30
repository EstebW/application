import { NextRequest, NextResponse } from 'next/server'
import { fetchCelebrityWikiImageUrl } from '@/lib/celebrity-image'

export const runtime = 'edge'

const UA = 'StarFusion/1.0 (https://starfusion.app; celebrity portrait lookup)'

async function wikiImageToDataUrl(imageUrl: string): Promise<string | null> {
  const res = await fetch(imageUrl, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null
  const bytes = new Uint8Array(await res.arrayBuffer())
  const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return `data:${mime};base64,${btoa(binary)}`
}

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')?.trim()
  const format = req.nextUrl.searchParams.get('format')
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
