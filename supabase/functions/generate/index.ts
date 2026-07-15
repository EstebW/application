import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const KIE_API_BASE = 'https://api.kie.ai'
const KIE_FILE_API_BASE = 'https://kieai.redpandaai.co'
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 90_000
const GENERATION_CREDIT_COST = 1

function buildSceneSummary(ctx: PhotoGenerationContext): string {
  if (ctx.mode === 'custom' && ctx.customPrompt) {
    return ctx.customPrompt.slice(0, 200)
  }
  if (ctx.scene) {
    return [ctx.scene.location, ctx.scene.outfits, ctx.scene.position]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 200)
  }
  return ''
}

function stripDataUrl(base64: string) {
  return base64.replace(/^data:image\/\w+;base64,/, '')
}

function getMime(base64: string) {
  if (base64.startsWith('data:image/png')) return 'image/png'
  if (base64.startsWith('data:image/webp')) return 'image/webp'
  return 'image/jpeg'
}

function getExt(mime: string) {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

interface PhotoScene {
  location: string
  outfits: string
  position: string
}

interface PhotoGenerationContext {
  celebrityName: string
  celebrityDomain: string
  celebrityStyleDescription?: string
  traits?: string[]
  funFact?: string
  mode: 'presets' | 'custom'
  scene?: PhotoScene
  customPrompt?: string
}

function sanitizeSceneText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function buildPhotoPrompt(ctx: PhotoGenerationContext): string {
  const {
    celebrityName,
    celebrityDomain,
    celebrityStyleDescription,
    traits,
    funFact,
    mode,
    scene,
    customPrompt,
  } = ctx

  const domain = sanitizeSceneText(celebrityDomain)
  const style = celebrityStyleDescription ? sanitizeSceneText(celebrityStyleDescription) : ''
  const traitsLine = traits?.map(sanitizeSceneText).filter(Boolean).join(', ') ?? ''
  const mood = funFact ? sanitizeSceneText(funFact) : ''

  const subjectLines = [
    '- Person A: the person from the reference image (preserve face identity and likeness).',
    `- Person B: ${celebrityName}${domain ? `, known as a ${domain}` : ''}.`,
    style ? `- Celebrity iconic look: ${style}.` : '',
    traitsLine ? `- Shared visual traits / vibe: ${traitsLine}.` : '',
    mood ? `- Scene mood / energy: ${mood}.` : '',
  ]

  const requirements = [
    'REQUIREMENTS:',
    '- Both faces clearly visible, natural expressions, magazine-quality lighting.',
    '- Respect the user instructions — do not replace them with generic alternatives.',
    '- Tasteful, family-friendly, public event photography.',
  ]

  if (mode === 'custom' && customPrompt) {
    const userPrompt = sanitizeSceneText(customPrompt)
    return [
      'Photorealistic celebrity photo. Follow the USER PROMPT exactly — user instructions override any default styling.',
      '',
      'USER PROMPT (MANDATORY — must be clearly visible in the final image):',
      userPrompt,
      '',
      'SUBJECTS:',
      ...subjectLines,
      '',
      ...requirements,
    ].filter(Boolean).join('\n')
  }

  if (!scene) throw new Error('photoScene requis en mode presets')

  const location = sanitizeSceneText(scene.location)
  const outfits = sanitizeSceneText(scene.outfits)
  const position = sanitizeSceneText(scene.position)

  return [
    'Photorealistic celebrity event photo. Follow the USER SCENE BRIEF exactly — user choices override any default styling.',
    '',
    'USER SCENE BRIEF (MANDATORY — must be clearly visible in the final image):',
    `1. LOCATION / SETTING: ${location}`,
    `2. OUTFITS for both people: ${outfits}`,
    `3. POSE and FRAMING: ${position}`,
    '',
    'SUBJECTS:',
    ...subjectLines,
    '',
    ...requirements,
  ].filter(Boolean).join('\n')
}

function base64ToBytes(base64: string): Uint8Array {
  const raw = stripDataUrl(base64)
  const bin = atob(raw)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function extractUploadUrl(data: {
  fileUrl?: string
  downloadUrl?: string
} | undefined): string | undefined {
  return data?.fileUrl ?? data?.downloadUrl
}

async function uploadToSupabaseStorage(imageBase64: string): Promise<string | null> {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null

  try {
    const db = createClient(url, key, { auth: { persistSession: false } })
    const mime = getMime(imageBase64)
    const ext = getExt(mime)
    const path = `refs/${crypto.randomUUID()}.${ext}`
    const bytes = base64ToBytes(imageBase64)

    const { error } = await db.storage.from('temp-images').upload(path, bytes, {
      contentType: mime,
      upsert: false,
    })

    if (error) {
      console.warn('[generate] Supabase storage upload failed:', error.message)
      return null
    }

    const { data } = db.storage.from('temp-images').getPublicUrl(path)
    return data.publicUrl
  } catch (err) {
    console.warn('[generate] Supabase storage upload error:', err)
    return null
  }
}

async function uploadUrlToKie(fileUrl: string, apiKey: string): Promise<string | null> {
  const res = await fetch(`${KIE_FILE_API_BASE}/api/file-url-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      fileUrl,
      uploadPath: 'mon-jumeau-celebre',
      fileName: `ref-${Date.now()}.jpg`,
    }),
  })

  const json = await res.json() as {
    code?: number
    msg?: string
    data?: { fileUrl?: string; downloadUrl?: string }
  }

  const imageUrl = extractUploadUrl(json.data)
  if (json.code === 200 && imageUrl) return imageUrl

  console.warn('[generate] kie url upload failed:', JSON.stringify(json))
  return null
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 8192
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, chunk as unknown as number[])
  }
  return btoa(binary)
}

async function uploadBase64ToKie(imageBase64: string, apiKey: string): Promise<string> {
  const mime = getMime(imageBase64)
  const ext = getExt(mime)
  const fileName = `ref-${Date.now()}.${ext}`
  const base64Data = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:${mime};base64,${stripDataUrl(imageBase64)}`

  const res = await fetch(`${KIE_FILE_API_BASE}/api/file-base64-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      base64Data,
      uploadPath: 'mon-jumeau-celebre',
      fileName,
    }),
  })

  const json = await res.json() as {
    success?: boolean
    code?: number
    msg?: string
    data?: { fileUrl?: string; downloadUrl?: string; filePath?: string }
  }

  const imageUrl = extractUploadUrl(json.data)
  if (!imageUrl || json.code !== 200) {
    console.error('[generate] kie base64 upload failed:', JSON.stringify(json))
    throw new Error(`kie.ai upload: ${json.msg ?? 'URL manquante'} (code ${json.code ?? res.status})`)
  }

  return imageUrl
}

async function resolveReferenceImageUrl(imageBase64: string, apiKey: string): Promise<string> {
  const publicUrl = await uploadToSupabaseStorage(imageBase64)
  if (publicUrl) {
    const kieUrl = await uploadUrlToKie(publicUrl, apiKey)
    if (kieUrl) return kieUrl
    return publicUrl
  }

  return uploadBase64ToKie(imageBase64, apiKey)
}

async function createTask(
  imageUrl: string,
  ctx: PhotoGenerationContext,
  apiKey: string
): Promise<string> {
  const prompt = buildPhotoPrompt(ctx)
  console.log('[nano-banana-2] prompt:', prompt)

  const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'nano-banana-2',
      input: {
        prompt,
        image_input: [imageUrl],
        aspect_ratio: '4:3',
        resolution: '2K',
        output_format: 'jpg',
      },
    }),
  })

  const json = await res.json() as { code: number; msg: string; data?: { taskId: string } }
  if (json.code !== 200 || !json.data?.taskId) {
    throw new Error(`kie.ai create task: ${json.msg} (code ${json.code})`)
  }
  return json.data.taskId
}

async function pollTask(taskId: string, apiKey: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))

    const res = await fetch(
      `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    const json = await res.json() as {
      code: number
      msg?: string
      data?: { state: string; resultJson?: string; failMsg?: string }
    }
    if (json.code !== 200) {
      throw new Error(`kie.ai poll: ${json.msg ?? 'erreur'} (code ${json.code})`)
    }
    const record = json.data
    if (!record) continue

    if (record.state === 'success') {
      const parsed = JSON.parse(record.resultJson ?? '{}') as { resultUrls?: string[] }
      const url = parsed.resultUrls?.[0]
      if (!url) throw new Error('Nano Banana 2: pas d\'URL dans le résultat')
      return url
    }
    if (record.state === 'fail') {
      throw new Error(`Nano Banana 2 échoué: ${record.failMsg ?? 'inconnu'}`)
    }
  }
  throw new Error('Nano Banana 2: timeout 90 secondes')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const kieKey = Deno.env.get('KIE_API_KEY')
    if (!kieKey) throw new Error('KIE_API_KEY non configurée dans les secrets Supabase')

    const { imageBase64, celebrityName, celebrityDomain, celebrityStyleDescription, celebrityTraits, funFact, generationMode, photoScene, customPrompt, sessionId, analysisId } = await req.json() as {
      imageBase64: string
      celebrityName: string
      celebrityDomain?: string
      celebrityStyleDescription?: string
      celebrityTraits?: string[]
      funFact?: string
      generationMode?: 'presets' | 'custom'
      photoScene?: PhotoScene
      customPrompt?: string
      sessionId?: string
      analysisId?: string
    }

    if (!imageBase64 || !celebrityName) throw new Error('imageBase64 et celebrityName requis')

    const mode = generationMode ?? (customPrompt ? 'custom' : 'presets')
    if (mode === 'custom') {
      if (!customPrompt?.trim() || customPrompt.trim().length < 20) {
        throw new Error('customPrompt requis (minimum 20 caractères)')
      }
    } else if (!photoScene?.location?.trim() || !photoScene?.outfits?.trim() || !photoScene?.position?.trim()) {
      throw new Error('photoScene (lieu, tenues, position) requis')
    }

    const generationContext: PhotoGenerationContext = {
      celebrityName,
      celebrityDomain: celebrityDomain ?? '',
      celebrityStyleDescription: celebrityStyleDescription ?? '',
      traits: Array.isArray(celebrityTraits)
        ? celebrityTraits.filter((t): t is string => typeof t === 'string')
        : undefined,
      funFact: typeof funFact === 'string' ? funFact : undefined,
      mode,
      scene: mode === 'presets' ? photoScene : undefined,
      customPrompt: mode === 'custom' ? customPrompt?.trim() : undefined,
    }

    const sceneSummary = buildSceneSummary(generationContext)

    if (sessionId) {
      const db = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { persistSession: false } }
      )
      const { data: session } = await db
        .from('sessions')
        .select('credits_balance')
        .eq('id', sessionId)
        .single()

      const balance = session?.credits_balance ?? 0
      if (balance < GENERATION_CREDIT_COST) {
        return new Response(
          JSON.stringify({ error: 'Crédits insuffisants. Achète un pack pour générer une photo.' }),
          { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }
    }

    const imageUrl = await resolveReferenceImageUrl(imageBase64, kieKey)
    const taskId = await createTask(imageUrl, generationContext, kieKey)
    const resultUrl = await pollTask(taskId, kieKey)

    const imgRes = await fetch(resultUrl)
    const imgBuf = await imgRes.arrayBuffer()
    const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'
    const b64 = arrayBufferToBase64(imgBuf)
    const generatedBase64 = `data:${contentType};base64,${b64}`

    let generationId: string | undefined
    let creditsBalance: number | undefined

    if (sessionId) {
      try {
        const db = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          { auth: { persistSession: false } }
        )

        const { data: session } = await db
          .from('sessions')
          .select('credits_balance')
          .eq('id', sessionId)
          .single()

        const currentBalance = session?.credits_balance ?? 0
        const newBalance = currentBalance - GENERATION_CREDIT_COST

        const { data } = await db
          .from('generations')
          .insert({
            session_id: sessionId,
            analysis_id: analysisId ?? null,
            celebrity_name: celebrityName,
            unlocked: true,
            scene_summary: sceneSummary || null,
          })
          .select('id')
          .single()

        generationId = data?.id

        await db
          .from('sessions')
          .update({ credits_balance: newBalance })
          .eq('id', sessionId)

        await db.from('credit_transactions').insert({
          session_id: sessionId,
          amount: -GENERATION_CREDIT_COST,
          reason: 'generation',
          reference_id: generationId ?? null,
        })

        creditsBalance = newBalance
      } catch (dbErr) {
        console.warn('[generate] DB update failed:', dbErr)
      }
    }

    return new Response(
      JSON.stringify({ imageBase64: generatedBase64, generationId, creditsBalance }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne'
    console.error('[generate]', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
