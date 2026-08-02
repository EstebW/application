import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

const UA = 'StarFusion/1.0 (https://starfusion.app; celebrity portrait lookup)'

type WikiSummary = {
  type?: string
  thumbnail?: { source?: string }
  originalimage?: { source?: string }
}

async function fetchWikiThumb(lang: 'fr' | 'en', title: string): Promise<string | null> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
    next: { revalidate: 86400 },
  })
  if (!res.ok) return null
  const data = (await res.json()) as WikiSummary
  if (data.type === 'disambiguation') return null
  return data.thumbnail?.source || data.originalimage?.source || null
}

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')?.trim()
  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }

  try {
    const fr = await fetchWikiThumb('fr', name)
    if (fr) return NextResponse.json({ url: fr })

    const en = await fetchWikiThumb('en', name)
    if (en) return NextResponse.json({ url: en })

    return NextResponse.json({ url: null })
  } catch {
    return NextResponse.json({ url: null }, { status: 502 })
  }
}
