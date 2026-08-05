import { NextResponse } from 'next/server'
import type {
  CelebrityCreationMode,
  PhotoGenerationContext,
  PhotoGenerationMode,
  PhotoScene,
} from '@/lib/types'
import { createServerClient } from '@/lib/supabase'
import { generateCelebrityPhoto } from '@/lib/kie-nanobanana'
import { getInteractionPrompt } from '@/lib/interactions'
import { resolveCelebrityHeight } from '@/lib/celebrity-height'
import { isValidUserHeightCm, MAX_USER_HEIGHT_CM, MIN_USER_HEIGHT_CM } from '@/lib/height'

type ValidatedGenerationInput = Pick<
  PhotoGenerationContext,
  'mode' | 'creationMode' | 'scene' | 'customPrompt' | 'interaction' | 'userHeightCm'
>

/** Revalide côté serveur : le front n'est jamais la seule source de vérité. */
function validateGenerationInput(body: {
  generationMode?: PhotoGenerationMode
  creationMode?: string
  photoScene?: PhotoScene
  customPrompt?: string
  interaction?: string
  userHeightCm?: number
}): ValidatedGenerationInput {
  if (body.creationMode && body.creationMode !== 'full_generation' && body.creationMode !== 'photo_edit') {
    throw new Error('creationMode invalide (attendu "full_generation" ou "photo_edit")')
  }
  const creationMode: CelebrityCreationMode =
    body.creationMode === 'photo_edit' ? 'photo_edit' : 'full_generation'

  if (body.interaction !== undefined && !getInteractionPrompt(body.interaction)) {
    throw new Error('interaction inconnue')
  }
  const interaction = body.interaction?.trim() || undefined

  // Facultative : le parcours « jumeau célèbre » ne l'envoie jamais.
  if (body.userHeightCm !== undefined && !isValidUserHeightCm(body.userHeightCm)) {
    throw new Error(
      `userHeightCm invalide (entier attendu entre ${MIN_USER_HEIGHT_CM} et ${MAX_USER_HEIGHT_CM} cm)`
    )
  }
  const userHeightCm = isValidUserHeightCm(body.userHeightCm) ? body.userHeightCm : undefined

  const mode = body.generationMode ?? (body.customPrompt ? 'custom' : 'presets')

  if (creationMode === 'photo_edit') {
    // La photo importée EST la scène : accepter un photoScene mélangerait les deux modes.
    if (body.photoScene) {
      throw new Error('photoScene interdit en mode photo_edit (la photo importée est la scène)')
    }
    return {
      mode,
      creationMode,
      customPrompt: body.customPrompt?.trim() || undefined,
      interaction,
      userHeightCm,
    }
  }

  if (mode === 'custom') {
    const prompt = body.customPrompt?.trim() ?? ''
    if (prompt.length < 20) {
      throw new Error('customPrompt requis (minimum 20 caractères)')
    }
    return { mode: 'custom', creationMode, customPrompt: prompt, interaction, userHeightCm }
  }

  const scene = body.photoScene
  if (!scene?.location?.trim() || !scene?.outfits?.trim() || !scene?.position?.trim()) {
    throw new Error('photoScene (lieu, tenues, position) requis')
  }
  return { mode: 'presets', creationMode, scene, interaction, userHeightCm }
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
      celebrityImageBase64?: string
      generationMode?: PhotoGenerationMode
      creationMode?: string
      photoScene?: PhotoScene
      customPrompt?: string
      interaction?: string
      /** Dérivé du nom côté serveur : la valeur envoyée par le client n'est jamais utilisée */
      celebrityId?: string
      userHeightCm?: number
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
      celebrityImageBase64,
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
      creationMode: generationInput.creationMode,
      scene: generationInput.scene,
      customPrompt: generationInput.customPrompt,
      interaction: generationInput.interaction,
      hasCelebrityReferenceImage: Boolean(celebrityImageBase64),
      userHeightCm: generationInput.userHeightCm,
    }

    // Taille de la star : toujours résolue côté serveur à partir du nom,
    // jamais acceptée depuis le client.
    if (generationInput.userHeightCm) {
      const celebrityHeight = await resolveCelebrityHeight(celebrityName)
      generationContext.celebrityHeightCm = celebrityHeight.heightCm
      generationContext.celebrityHeightConfidence = celebrityHeight.confidence
    }

    const kieKey = process.env.KIE_API_KEY?.trim()

    // Clé locale → Nano Banana 2 directement via kie.ai
    if (kieKey) {
      const generatedBase64 = await generateCelebrityPhoto(
        imageBase64,
        generationContext,
        kieKey,
        celebrityImageBase64
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
