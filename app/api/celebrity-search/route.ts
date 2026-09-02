import { NextRequest, NextResponse } from 'next/server'
import {
  isSearchableCelebrityQuery,
  searchCelebritiesOnWikipedia,
} from '@/lib/celebrity-search'

export const runtime = 'edge'

const UA = 'StarFusion/1.0 (https://starfusion.app; celebrity portrait lookup)'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q') ?? ''

  if (!isSearchableCelebrityQuery(query)) {
    return NextResponse.json({ results: [] })
  }

  try {
    const results = await searchCelebritiesOnWikipedia(query, UA, req.signal)
    return NextResponse.json(
      { results },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' } },
    )
  } catch {
    return NextResponse.json({ results: [], error: 'search_failed' }, { status: 502 })
  }
}
