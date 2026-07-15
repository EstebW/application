import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { analyzeCelebrityFace } from '@/lib/kie-analyze'

async function callSupabaseAnalyze(body: Record<string, unknown>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Configuration Supabase manquante')

  const res = await fetch(`${url}/functions/v1/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({})) as { error?: string }
  if (!res.ok) throw new Error(data.error ?? `Supabase analyze HTTP ${res.status}`)
  return data
}

export async function POST(req: Request) {
  try {
    const { imageBase64, sessionId } = await req.json() as {
      imageBase64: string
      sessionId?: string
    }

    if (!imageBase64) {
      return NextResponse.json({ error: 'imageBase64 requis' }, { status: 400 })
    }

    const kieKey = process.env.KIE_API_KEY?.trim()

    let result
    if (kieKey) {
      result = await analyzeCelebrityFace(imageBase64, kieKey)
    } else {
      result = await callSupabaseAnalyze({ imageBase64, sessionId })
      return NextResponse.json(result)
    }

    let analysisId: string | undefined
    if (sessionId) {
      try {
        const db = createServerClient()
        const { data } = await db
          .from('analyses')
          .insert({
            session_id: sessionId,
            celebrity_name: result.name,
            score: result.score,
            traits: result.traits,
            description: result.fun_fact ?? null,
          })
          .select('id')
          .single()
        analysisId = data?.id
      } catch (dbErr) {
        console.warn('[api/analyze] DB insert failed:', dbErr instanceof Error ? dbErr.message : dbErr)
      }
    }

    return NextResponse.json({ ...result, analysisId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne'
    console.error('[api/analyze]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
