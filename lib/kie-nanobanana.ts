import type { PhotoGenerationContext } from './types'
import { buildPhotoPrompt } from './scene-suggestions'
import { formatKieError } from './kie-errors'
import { createServerClient } from './supabase'

const KIE_API_BASE = 'https://api.kie.ai'
const KIE_FILE_API_BASE = 'https://kieai.redpandaai.co'
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 90_000

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

function base64ToBytes(base64: string): Uint8Array {
  const raw = stripDataUrl(base64)
  const bin = Buffer.from(raw, 'base64')
  return new Uint8Array(bin)
}

function extractUploadUrl(data: {
  fileUrl?: string
  downloadUrl?: string
} | undefined): string | undefined {
  return data?.fileUrl ?? data?.downloadUrl
}

async function uploadToSupabaseStorage(imageBase64: string): Promise<string | null> {
  try {
    const db = createServerClient()
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
    code?: number
    msg?: string
    data?: { fileUrl?: string; downloadUrl?: string }
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

  if (process.env.NODE_ENV === 'development') {
    console.log('[nano-banana-2] prompt:', prompt)
  }

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
    throw new Error(formatKieError(`kie.ai create task: ${json.msg} (code ${json.code})`))
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
      throw new Error(formatKieError(`kie.ai poll: ${json.msg ?? 'erreur'} (code ${json.code})`))
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
      throw new Error(formatKieError(`Nano Banana 2: ${record.failMsg ?? 'échec de génération'}`))
    }
  }
  throw new Error('Nano Banana 2: timeout 90 secondes')
}

export async function generateCelebrityPhoto(
  imageBase64: string,
  ctx: PhotoGenerationContext,
  apiKey: string
): Promise<string> {
  const imageUrl = await resolveReferenceImageUrl(imageBase64, apiKey)
  const taskId = await createTask(imageUrl, ctx, apiKey)
  const resultUrl = await pollTask(taskId, apiKey)

  const imgRes = await fetch(resultUrl)
  const imgBuf = await imgRes.arrayBuffer()
  const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'
  const b64 = Buffer.from(imgBuf).toString('base64')
  return `data:${contentType};base64,${b64}`
}
