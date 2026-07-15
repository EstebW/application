import { NextResponse } from 'next/server'
import type { PhotoGenerationContext, PhotoGenerationMode, PhotoScene } from '@/lib/types'
import { createServerClient } from '@/lib/supabase'
import { generateCelebrityPhoto } from '@/lib/kie-nanobanana'

function validateGenerationInput(body: {
  generationMode?: PhotoGenerationMode
  photoScene?: PhotoScene
  customPrompt?: string
}): Pick<PhotoGenerationContext, 'mode' | 'scene' | 'customPrompt'> {
  const mode = body.generationMode ?? (body.customPrompt ? 'custom' : 'presets')

  if (mode === 'custom') {
    const prompt = body.customPrompt?.trim() ?? ''
    if (prompt.length < 20) {
      throw new Error('customPrompt requis (minimum 20 caractères)')
    }
    return { mode: 'custom', customPrompt: prompt }
  }

  const scene = body.photoScene
  if (!scene?.location?.trim() || !scene?.outfits?.trim() || !scene?.position?.trim()) {
    throw new Error('photoScene (lieu, tenues, position) requis')
  }
  return { mode: 'presets', scene }
}

async function callSupabaseGenerate(body: Record<string, unknown>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Configuration Supabase manquante')
  }

  const res = await fetch(`${url}/functions/v1/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({})) as { error?: string }
  if (!res.ok) {
    throw new Error(data.error ?? `Supabase generate HTTP ${res.status}`)
  }
  return data
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      imageBase64: string
      celebrityName: string
      celebrityDomain?: string
      celebrityStyleDescription?: string
      celebrityTraits?: string[]
      funFact?: string
      generationMode?: PhotoGenerationMode
      photoScene?: PhotoScene
      customPrompt?: string
      sessionId?: string
      analysisId?: string
    }

    const {
      imageBase64,
      celebrityName,
      celebrityDomain,
      celebrityStyleDescription,
      celebrityTraits,
      funFact,
      sessionId,
      analysisId,
    } = body

    if (!imageBase64 || !celebrityName) {
      return NextResponse.json(
        { error: 'imageBase64 et celebrityName requis' },
        { status: 400 }
      )
    }

    const generationInput = validateGenerationInput(body)

    const generationContext: PhotoGenerationContext = {
      celebrityName,
      celebrityDomain: celebrityDomain ?? '',
      celebrityStyleDescription: celebrityStyleDescription ?? '',
      traits: Array.isArray(celebrityTraits)
        ? celebrityTraits.filter((t): t is string => typeof t === 'string')
        : undefined,
      funFact: typeof funFact === 'string' ? funFact : undefined,
      mode: generationInput.mode,
      scene: generationInput.scene,
      customPrompt: generationInput.customPrompt,
    }

    const kieKey = process.env.KIE_API_KEY?.trim()

    // Clé locale → Nano Banana 2 directement via kie.ai
    if (kieKey) {
      const generatedBase64 = await generateCelebrityPhoto(
        imageBase64,
        generationContext,
        kieKey
      )

      let generationId: string | undefined
      if (sessionId) {
        try {
          const db = createServerClient()
          const { data } = await db
            .from('generations')
            .insert({
              session_id: sessionId,
              analysis_id: analysisId ?? null,
              celebrity_name: celebrityName,
              unlocked: false,
            })
            .select('id')
            .single()
          generationId = data?.id
        } catch (dbErr) {
          console.warn('[api/generate] DB insert failed:', dbErr instanceof Error ? dbErr.message : dbErr)
        }
      }

      return NextResponse.json({ imageBase64: generatedBase64, generationId })
    }

    // Sinon → Edge Function Supabase (nécessite bucket temp-images OU fonction redéployée)
    const result = await callSupabaseGenerate(body)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne'
    console.error('[api/generate]', message)

    const hint = message.includes('Bucket not found')
      ? ' Créez le bucket "temp-images" dans Supabase (SQL Editor) ou ajoutez KIE_API_KEY dans .env.local.'
      : ''

    return NextResponse.json({ error: message + hint }, { status: 500 })
  }
}
