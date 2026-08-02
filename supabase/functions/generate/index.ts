import { createClient, type User } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getAuthUser(req: Request): Promise<User | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const jwt = authHeader.slice('Bearer '.length).trim()
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!jwt || jwt === anon) return null
  const url = Deno.env.get('SUPABASE_URL')
  if (!url || !anon) return null
  try {
    const client = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await client.auth.getUser(jwt)
    if (error || !data.user) return null
    return data.user
  } catch {
    return null
  }
}

function bindUserId(authUser: User | null, bodyUserId?: string): string | undefined {
  if (authUser?.id) return authUser.id
  return bodyUserId?.trim() || undefined
}

const KIE_API_BASE = 'https://api.kie.ai'
const KIE_FILE_API_BASE = 'https://kieai.redpandaai.co'
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 90_000
const GENERATION_CREDIT_COST = 1

/** Les erreurs Postgrest/Supabase sont des objets simples, pas des `Error` — sans
 *  ça, `err instanceof Error` échoue et masque le vrai message derrière "Erreur interne". */
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null) {
    const rec = err as Record<string, unknown>
    if (typeof rec.message === 'string' && rec.message) {
      const details = typeof rec.details === 'string' && rec.details ? ` — ${rec.details}` : ''
      const hint = typeof rec.hint === 'string' && rec.hint ? ` (hint: ${rec.hint})` : ''
      return `${rec.message}${details}${hint}`
    }
  }
  return String(err)
}

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
  hasCelebrityReferenceImage?: boolean
}

function sanitizeSceneText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

type DbClient = ReturnType<typeof createClient>
type SessionRow = { id: string; credits_balance?: number | null; user_id?: string | null; email?: string | null }

/** Session de facturation isolée par user — refuse les sessions anonymes déjà polluées. */
async function resolveBillingSession(
  db: DbClient,
  opts: { sessionId?: string; userId?: string; email?: string }
): Promise<SessionRow | null> {
  const { sessionId, userId, email } = opts
  const normalizedEmail = email?.trim().toLowerCase() || null
  const nowIso = new Date().toISOString()

  if (userId) {
    const { data: owned } = await db
      .from('sessions')
      .select('id, credits_balance, user_id, email')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (owned) return owned as SessionRow

    if (sessionId) {
      const { data: anon } = await db
        .from('sessions')
        .select('id, credits_balance, user_id, email')
        .eq('id', sessionId)
        .maybeSingle()
      if (anon && !anon.user_id) {
        const [a, g] = await Promise.all([
          db.from('analyses').select('id', { count: 'exact', head: true }).eq('session_id', sessionId),
          db.from('generations').select('id', { count: 'exact', head: true }).eq('session_id', sessionId),
        ])
        const dirty = (a.count ?? 0) > 0 || (g.count ?? 0) > 0
        if (!dirty) {
          await db
            .from('sessions')
            .update({
              user_id: userId,
              owned_at: nowIso,
              credits_balance: 0,
              ...(normalizedEmail ? { email: normalizedEmail } : {}),
            })
            .eq('id', sessionId)
          return { ...(anon as SessionRow), user_id: userId, credits_balance: 0 }
        }
      }
    }

    const { data: created } = await db
      .from('sessions')
      .insert({
        user_id: userId,
        email: normalizedEmail,
        credits_balance: 0,
        owned_at: nowIso,
      })
      .select('id, credits_balance, user_id, email')
      .single()
    return (created as SessionRow) ?? null
  }

  if (sessionId) {
    const { data } = await db
      .from('sessions')
      .select('id, credits_balance, user_id, email')
      .eq('id', sessionId)
      .maybeSingle()
    if (data) return data as SessionRow
  }

  return null
}

/** Critère #1 : identité faciale INTÉGRALE.
 *  Avec 2 images, Person A et Person B sont verrouillés à égalité. */
function facePreservationBlock(hasCelebrityReferenceImage: boolean): string[] {
  const dual = hasCelebrityReferenceImage
  return [
    '⚠️⚠️ ABSOLUTE PRIORITY — DUAL FACIAL IDENTITY LOCK ⚠️⚠️',
    dual
      ? 'This task is an IDENTITY-PRESERVING COMPOSITE EDIT using TWO reference photos. It is NOT face generation, NOT face redesign, NOT beautification, NOT a likeness reinterpretation.'
      : 'This task is an IDENTITY-PRESERVING EDIT of Person A from the reference photo. Person A\'s face must stay pixel-faithful to the reference.',
    '',
    'image_input ORDER:',
    dual
      ? '- image_input[0] = Person A (USER) — ground-truth face #1'
      : '- image_input[0] = Person A (USER) — ground-truth face',
    dual ? '- image_input[1] = Person B (CELEBRITY) — ground-truth face #2' : '',
    '',
    'PERSON A (USER) — HARD LOCK:',
    '- Copy Person A\'s face EXACTLY from image_input[0]: bone structure, eyes, eyebrows, nose, lips, jawline, cheeks, ears, hairline, skin tone, freckles/marks, age.',
    '- Do NOT redraw, reinvent, morph, average, smooth, beautify, age-shift, or "improve" Person A\'s face.',
    '- Do NOT blend Person A with Person B. Zero facial feature transfer in either direction.',
    '- Allowed changes for Person A ONLY: body pose, outfit, hands, and scene lighting falling on an UNCHANGED face.',
    '',
    ...(dual
      ? [
          'PERSON B (CELEBRITY) — HARD LOCK (SAME STRENGTH AS PERSON A):',
          '- Copy Person B\'s face EXACTLY from image_input[1]: same identity, same features, same hair as in that photo.',
          '- Do NOT invent a generic celebrity face. Do NOT use prior knowledge of the celebrity if it conflicts with image_input[1].',
          '- Do NOT beautify, morph, blend with Person A, or replace Person B with a different person.',
          '- Allowed changes for Person B ONLY: body pose, outfit, and scene lighting falling on an UNCHANGED face.',
          '',
          'FAILURE CONDITIONS (either one fails the whole result):',
          '- Person A is not instantly recognizable as the exact same person as image_input[0].',
          '- Person B is not instantly recognizable as the exact same person as image_input[1].',
          '- Any face-swap artifact, melted features, hybrid face, or "AI beauty filter" look on either person.',
        ]
      : [
          'FAILURE CONDITION:',
          '- Person A is not instantly recognizable as the exact same person as image_input[0] → FAILED, even if the scene is perfect.',
          '- Prefer keeping Person A\'s face unchanged over perfect scene composition.',
        ]),
  ].filter((line) => line !== '')
}

/** Anti-"AI look" : photo smartphone amateur, indiscernable d'une vraie photo. */
function photorealismBlock(): string[] {
  return [
    'PHOTOREALISM — AUTHENTIC AMATEUR SMARTPHONE PHOTO (highest visual priority after face locks):',
    'Generate a photo that is completely indistinguishable from a genuine amateur smartphone picture taken in real life.',
    'The image must NEVER look AI-generated, CGI, rendered, edited, or professionally photographed.',
    '',
    'STYLE:',
    '- Authentic smartphone photography; natural candid moment.',
    '- Slightly imperfect framing; slight handheld camera shake; tiny motion blur when appropriate.',
    '- Natural facial expressions (not exaggerated, not perfect).',
    '- Realistic human skin with pores, texture, small blemishes and imperfections — NO beauty filter.',
    '- Natural eye reflections; slight phone-lens distortion; automatic smartphone HDR (mild, not overcooked).',
    '- Mild digital noise and compression artifacts; realistic white balance; slightly inconsistent exposure.',
    '- Natural clothing wrinkles; random real background details.',
    '- Real-life lighting ONLY — environment light must affect subjects naturally, with genuine shadows and reflections.',
    '- Imperfect focus consistency.',
    '',
    'COMPOSITION:',
    '- Spontaneous: as if someone quickly pulled out their phone and captured a real moment without preparation.',
    '- Must NOT feel posed or professionally composed.',
    '',
    'PEOPLE:',
    '- Body proportions, hands, teeth, hair and facial features completely natural.',
    '- Subtle human asymmetry; avoid exaggerated smiles or perfect poses.',
    '- Hands/fingers/ears/eyes anatomically correct — no extra fingers, warped ears, or glassy doll eyes.',
    '',
    'CAMERA:',
    '- Looks taken on an iPhone or recent Android smartphone, default Camera app, automatic mode.',
    '',
    'NEGATIVE / FORBIDDEN LOOK:',
    '- No CGI, no AI look, no studio lighting, no cinematic lighting, no beauty filter, no glamour photography.',
    '- No influencer aesthetic, no ultra-sharp details, no fake bokeh, no perfect symmetry, no wax/plastic skin.',
    '- No overprocessed HDR, no unrealistic colors, no commercial / fashion / magazine photography.',
    '- No unnatural facial expressions.',
    '',
    'VARIATION:',
    '- Randomize camera angle, focal length, distance, lighting, expressions, posture, head orientation, framing, background activity, object placement, and slight imperfections so each generation feels like a different real-life moment.',
    '- Final result should be impossible to distinguish from a genuine Snapchat / BeReal / Instagram Stories / smartphone gallery photo.',
    '',
    'SCENE FIDELITY — FOLLOW THE USER BRIEF LITERALLY:',
    '- Execute the requested location, outfits, and pose EXACTLY as described. Do not substitute a generic VIP / red-carpet / yacht / gala stock scene.',
    '- If the brief is quirky, funny, or specific, KEEP that specificity — originality is the point.',
    '- Do not "upgrade" the scene into a cliché celebrity photoshoot unless the user asked for that.',
  ]
}

function buildPhotoPrompt(ctx: PhotoGenerationContext): string {
  const {
    celebrityName,
    celebrityDomain,
    celebrityStyleDescription,
    funFact,
    mode,
    scene,
    customPrompt,
    hasCelebrityReferenceImage,
  } = ctx

  const dual = Boolean(hasCelebrityReferenceImage)
  const domain = sanitizeSceneText(celebrityDomain)
  const style = celebrityStyleDescription ? sanitizeSceneText(celebrityStyleDescription) : ''
  // Ne jamais injecter les traits de ressemblance — ils poussent au morphing.
  const mood = !dual && funFact ? sanitizeSceneText(funFact) : ''

  const subjectLines = [
    dual
      ? '- Person A = face locked from image_input[0]. Person B = face locked from image_input[1].'
      : '- Person A (USER): face locked from image_input[0] — identity preserved exactly.',
    dual
      ? `- Person B name label only (do not reinvent the face): ${celebrityName}${domain ? `, ${domain}` : ''}.`
      : `- Person B (CELEBRITY): ${celebrityName}${domain ? `, ${domain}` : ''} — believable likeness beside Person A, WITHOUT changing Person A\'s face.`,
    !dual && style ? `- Celebrity styling for Person B only (clothes/hair vibe, NOT Person A\'s face): ${style}.` : '',
    mood ? `- Scene mood / energy only (NOT faces): ${mood}.` : '',
  ]

  const requirements = [
    'SCENE REQUIREMENTS (secondary to face locks, but must still obey the brief):',
    '- Both people clearly visible in ONE cohesive real photograph.',
    '- Natural bodies/poses; faces remain identity-locked as above.',
    '- Tasteful, family-friendly content.',
    '- Single photo — not a collage, not a side-by-side split, not a face-swap glitch.',
    '- If anything conflicts with the face locks, DROP the conflicting detail and KEEP the faces.',
  ]

  const finalReminder = dual
    ? [
        'FINAL MANDATORY CHECK:',
        '1) Compare Person A\'s output face to image_input[0] — must be the same person, unedited identity.',
        '2) Compare Person B\'s output face to image_input[1] — must be the same person, unedited identity.',
        '3) Does it look like a raw smartphone snap (Snapchat/BeReal/Stories), NOT AI/CGI/studio/glamour? If not, fix realism.',
        '4) Does the scene match the user brief specifically (not a generic celebrity cliché)? If not, fix the scene.',
        '5) Face integrity > scene beauty, but face locks AND amateur-phone realism AND brief fidelity are all required.',
      ]
    : [
        'FINAL MANDATORY CHECK:',
        '1) Compare Person A\'s output face to image_input[0] — must look like an unedited crop of the same face.',
        '2) Does it look like a raw smartphone snap (Snapchat/BeReal/Stories), NOT AI/CGI/studio/glamour? If not, fix realism.',
        '3) Does the scene match the user brief specifically? If not, fix the scene.',
        '4) Face integrity > scene beauty, but face lock AND amateur-phone realism AND brief fidelity are all required.',
      ]

  const opener = dual
    ? 'IDENTITY-PRESERVING COMPOSITE: keep BOTH reference faces exactly intact while placing Person A and Person B together in a NEW scene that faithfully matches the user brief — output must look like a genuine amateur smartphone photo.'
    : 'IDENTITY-PRESERVING EDIT: keep Person A\'s face exactly intact from the reference while placing them in a scene with a celebrity — output must look like a genuine amateur smartphone photo that faithfully matches the user brief.'

  if (mode === 'custom' && customPrompt) {
    const userPrompt = sanitizeSceneText(customPrompt)
    return [
      opener,
      '',
      ...facePreservationBlock(dual),
      '',
      ...photorealismBlock(),
      '',
      'USER SCENE PROMPT (apply to setting/outfits/pose ONLY — faces stay locked; follow literally):',
      userPrompt,
      '',
      'SUBJECTS:',
      ...subjectLines,
      '',
      ...requirements,
      '',
      ...finalReminder,
    ].filter(Boolean).join('\n')
  }

  if (!scene) throw new Error('photoScene requis en mode presets')

  const location = sanitizeSceneText(scene.location)
  const outfits = sanitizeSceneText(scene.outfits)
  const position = sanitizeSceneText(scene.position)

  return [
    opener,
    '',
    ...facePreservationBlock(dual),
    '',
    ...photorealismBlock(),
    '',
    'USER SCENE BRIEF (setting/outfits/pose ONLY — faces stay locked; follow literally):',
    `1. LOCATION / SETTING: ${location}`,
    `2. OUTFITS for both people: ${outfits}`,
    `3. POSE and FRAMING: ${position}`,
    '',
    'SUBJECTS:',
    ...subjectLines,
    '',
    ...requirements,
    '',
    ...finalReminder,
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
      uploadPath: 'starfusion',
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
      uploadPath: 'starfusion',
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
  imageUrls: string[],
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
        image_input: imageUrls,
        aspect_ratio: 'auto',
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

    const authUser = await getAuthUser(req)
    const body = await req.json() as {
      imageBase64: string
      celebrityName: string
      celebrityDomain?: string
      celebrityStyleDescription?: string
      celebrityTraits?: string[]
      funFact?: string
      celebrityImageBase64?: string
      generationMode?: 'presets' | 'custom'
      photoScene?: PhotoScene
      customPrompt?: string
      sessionId?: string
      analysisId?: string
      userId?: string
      email?: string
    }

    const {
      imageBase64,
      celebrityName,
      celebrityDomain,
      celebrityStyleDescription,
      celebrityTraits,
      funFact,
      celebrityImageBase64,
      generationMode,
      photoScene,
      customPrompt,
      sessionId,
      analysisId,
    } = body
    const userId = bindUserId(authUser, body.userId)
    const email = authUser?.email ?? body.email

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
      hasCelebrityReferenceImage: Boolean(celebrityImageBase64),
    }

    const sceneSummary = buildSceneSummary(generationContext)

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    const billingSession = (sessionId || userId || email?.trim())
      ? await resolveBillingSession(db, { sessionId, userId, email })
      : null
    const billingSessionId = billingSession?.id ?? sessionId

    if (billingSessionId) {
      const balance = billingSession?.credits_balance ?? 0
      if (balance < GENERATION_CREDIT_COST) {
        return new Response(
          JSON.stringify({
            error: 'Crédits insuffisants. Achète un pack pour générer une photo.',
            code: 'APP_CREDITS_INSUFFICIENT',
          }),
          { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }
    }

    const imageUrl = await resolveReferenceImageUrl(imageBase64, kieKey)
    const imageUrls = [imageUrl]
    if (celebrityImageBase64) {
      imageUrls.push(await resolveReferenceImageUrl(celebrityImageBase64, kieKey))
    }
    const taskId = await createTask(imageUrls, generationContext, kieKey)
    const resultUrl = await pollTask(taskId, kieKey)

    const imgRes = await fetch(resultUrl)
    const imgBuf = await imgRes.arrayBuffer()
    const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'
    const b64 = arrayBufferToBase64(imgBuf)
    const generatedBase64 = `data:${contentType};base64,${b64}`

    let generationId: string | undefined
    let creditsBalance: number | undefined

    if (billingSessionId) {
      try {
        const { data: session } = await db
          .from('sessions')
          .select('credits_balance')
          .eq('id', billingSessionId)
          .single()

        const currentBalance = session?.credits_balance ?? 0
        const newBalance = currentBalance - GENERATION_CREDIT_COST

        const { data } = await db
          .from('generations')
          .insert({
            session_id: billingSessionId,
            // "" n'est pas un UUID Postgres valide — même piège que payment/index.ts.
            analysis_id: analysisId?.trim() ? analysisId.trim() : null,
            celebrity_name: celebrityName,
            unlocked: true,
            scene_summary: sceneSummary || null,
            ...(userId ? { user_id: userId } : {}),
          })
          .select('id')
          .single()

        generationId = data?.id

        await db
          .from('sessions')
          .update({ credits_balance: newBalance })
          .eq('id', billingSessionId)

        await db.from('credit_transactions').insert({
          session_id: billingSessionId,
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
    const message = getErrorMessage(err)
    console.error('[generate]', message)

    // Erreur côté fournisseur IA (kie.ai) : ex. leur propre code 402 pour
    // solde insuffisant sur LEUR compte. Ne jamais confondre avec les
    // crédits de l'utilisateur (APP_CREDITS_INSUFFICIENT ci-dessus, status 402).
    const lower = message.toLowerCase()
    const isKieVendorCreditError =
      lower.includes('kie.ai') && (lower.includes('code 402') || lower.includes('insufficient') || lower.includes('balance'))

    return new Response(
      JSON.stringify({
        error: message,
        code: isKieVendorCreditError ? 'KIE_VENDOR_INSUFFICIENT' : undefined,
      }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
