import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const KIE_BASE = 'https://api.kie.ai'
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 90_000

// ── helpers ──────────────────────────────────────────────────────────────────

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

// ── Upload to Supabase Storage ────────────────────────────────────────────────

async function uploadImage(imageBase64: string): Promise<{ url: string; path: string }> {
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )
  const mime = getMime(imageBase64)
  const ext = getExt(mime)
  const path = `ref/${Date.now()}-${crypto.randomUUID()}.${ext}`
  const raw = Uint8Array.from(atob(stripDataUrl(imageBase64)), (c) => c.charCodeAt(0))

  const { error } = await db.storage
    .from('temp-images')
    .upload(path, raw, { contentType: mime })

  if (error) throw new Error(`Supabase upload failed: ${error.message}`)

  const { data } = db.storage.from('temp-images').getPublicUrl(path)
  return { url: data.publicUrl, path }
}

async function deleteImage(path: string) {
  try {
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )
    await db.storage.from('temp-images').remove([path])
  } catch { /* non-critical */ }
}

// ── kie.ai Nano Banana 2 ──────────────────────────────────────────────────────

async function createTask(
  imageUrl: string,
  celebrityName: string,
  apiKey: string,
  celebrityStyleDescription?: string
): Promise<string> {
  const styleContext = celebrityStyleDescription
    ? ` The celebrity ${celebrityName} is dressed in their iconic style: ${celebrityStyleDescription}.`
    : ''
  const prompt = `Photorealistic photo of the person from the reference image standing right next to ${celebrityName} at a glamorous celebrity event or red carpet.${styleContext} Both people are clearly and fully visible, smiling naturally at the camera. Professional celebrity magazine photography, cinematic studio lighting, elegant blurred background. Keep the reference person's face, skin tone, and appearance completely faithful to the reference image. Hyper-realistic, 8K quality.`

  const res = await fetch(`${KIE_BASE}/api/v1/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'google/nano-banana-2',
      input: {
        prompt,
        image_input: [imageUrl],
        aspect_ratio: '4:3',
        resolution: '1K',
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
      `${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    const json = await res.json() as {
      code: number
      data?: { state: string; resultJson?: string; failMsg?: string }
    }
    const record = json.data
    if (!record) continue

    if (record.state === 'success') {
      const parsed = JSON.parse(record.resultJson ?? '{}') as { resultUrls?: string[] }
      const url = parsed.resultUrls?.[0]
      if (!url) throw new Error('Nano Banana: pas d\'URL dans le résultat')
      return url
    }
    if (record.state === 'fail') {
      throw new Error(`Nano Banana échoué: ${record.failMsg ?? 'inconnu'}`)
    }
    // waiting / queuing / generating → keep polling
  }
  throw new Error('Nano Banana: timeout 90 secondes')
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  let uploadedPath: string | undefined

  try {
    const kieKey = Deno.env.get('KIE_API_KEY')
    if (!kieKey) throw new Error('KIE_API_KEY non configurée dans les secrets Supabase')

    const { imageBase64, celebrityName, celebrityStyleDescription, sessionId, analysisId } = await req.json() as {
      imageBase64: string
      celebrityName: string
      celebrityStyleDescription?: string
      sessionId?: string
      analysisId?: string
    }

    if (!imageBase64 || !celebrityName) throw new Error('imageBase64 et celebrityName requis')

    // 1. Upload reference image → public URL
    const { url: imageUrl, path } = await uploadImage(imageBase64)
    uploadedPath = path

    // 2. Create task + poll
    const taskId = await createTask(imageUrl, celebrityName, kieKey, celebrityStyleDescription)
    const resultUrl = await pollTask(taskId, kieKey)

    // 3. Cleanup reference image (privacy)
    await deleteImage(path)
    uploadedPath = undefined

    // 4. Fetch result image and return as base64
    const imgRes = await fetch(resultUrl)
    const imgBuf = await imgRes.arrayBuffer()
    const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'
    const b64 = btoa(String.fromCharCode(...new Uint8Array(imgBuf)))
    const generatedBase64 = `data:${contentType};base64,${b64}`

    // 5. Log generation in Supabase (non-blocking)
    let generationId: string | undefined
    if (sessionId) {
      try {
        const db = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          { auth: { persistSession: false } }
        )
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
      } catch { /* non-blocking */ }
    }

    return new Response(
      JSON.stringify({ imageBase64: generatedBase64, generationId }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    if (uploadedPath) await deleteImage(uploadedPath)
    const message = err instanceof Error ? err.message : 'Erreur interne'
    console.error('[generate]', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
