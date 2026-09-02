import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GOOGLE_GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_ANALYSIS_GEMINI_MODEL = 'gemini-3.7-flash'
const DEFAULT_ANALYSIS_GEMINI_FALLBACK_MODEL = 'gemini-3.6-flash'
const ANALYSIS_PROVIDER = 'google_direct'
const ANALYZE_TEMPERATURE = 0.2
const ANALYZE_MAX_ATTEMPTS = 3
const ANALYZE_RETRY_DELAY_MS = 2_000
const ANALYZE_JSON_RETRY_TEXT =
  'Ta réponse précédente était invalide. Renvoie UNIQUEMENT l\'objet JSON demandé, sans markdown ni texte autour.'
const ANALYSIS_POLL_INTERVAL_MS = 2_500
const ANALYSIS_POLL_TIMEOUT_MS = 300_000
const ANALYSIS_JOB_RETRY_MS = 90_000
const ANALYSIS_JOB_ABSOLUTE_MAX_MS = 600_000
const ANALYSIS_TRANSIENT_COOLDOWN_MS = 8_000


// ── Score StarFusion (inline — Deno ne peut pas importer lib/) ──────────────

const FEATURE_SCORE_KEYS = [
  'facialProportions',
  'faceShape',
  'eyes',
  'jawChin',
  'nose',
  'cheekbones',
  'mouth',
  'eyebrows',
] as const

type FeatureScoreKey = (typeof FEATURE_SCORE_KEYS)[number]
type FeatureScores = Record<FeatureScoreKey, number>

const STARFUSION_SCORE_WEIGHTS: Record<FeatureScoreKey, number> = {
  facialProportions: 0.2,
  faceShape: 0.2,
  eyes: 0.15,
  jawChin: 0.15,
  nose: 0.1,
  cheekbones: 0.08,
  mouth: 0.07,
  eyebrows: 0.05,
}

function clampScore(value: unknown): number | null {
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, n))
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.min(100, value))
}

function parseFeatureScores(raw: unknown): FeatureScores | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const out = {} as FeatureScores
  for (const key of FEATURE_SCORE_KEYS) {
    const v = clampScore(obj[key])
    if (v === null) return null
    out[key] = v
  }
  return out
}

function calculateStarFusionSimilarityScore(featureScores: FeatureScores): number {
  let total = 0
  for (const key of FEATURE_SCORE_KEYS) {
    total += featureScores[key] * STARFUSION_SCORE_WEIGHTS[key]
  }
  return Math.round(total)
}

function rankCandidatesByScore<T extends { featureScores: FeatureScores }>(
  candidates: T[],
): Array<T & { score: number }> {
  return candidates
    .map((c) => ({ ...c, score: calculateStarFusionSimilarityScore(c.featureScores) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const dProp = b.featureScores.facialProportions - a.featureScores.facialProportions
      if (dProp !== 0) return dProp
      return b.featureScores.faceShape - a.featureScores.faceShape
    })
}

function buildExplanationFromSimilarities(similarities: string[], differences: string[]): string {
  const sims = similarities.filter((s) => typeof s === 'string' && s.trim()).slice(0, 3)
  const diffs = differences.filter((s) => typeof s === 'string' && s.trim()).slice(0, 2)

  if (sims.length === 0) {
    return 'La ressemblance repose sur plusieurs traits de structure faciale observés sur la photo.'
  }

  let text = ''
  if (sims.length === 1) {
    text = `Le point commun le plus marqué : ${sims[0].replace(/\.$/, '')}.`
  } else if (sims.length === 2) {
    text = `Votre ressemblance se concentre particulièrement autour de ${sims[0].replace(/\.$/, '')}, ainsi que ${sims[1].replace(/\.$/, '')}.`
  } else {
    text = `Votre ressemblance se concentre particulièrement autour de ${sims[0].replace(/\.$/, '')}. ${sims[1].replace(/\.$/, '')}, tandis que ${sims[2].replace(/\.$/, '')} renforce encore la similarité.`
  }

  if (diffs.length > 0) {
    text += ` ${diffs[0].replace(/\.$/, '')} explique en partie pourquoi le score n'est pas maximal.`
  }

  return text
}

// ── Prompts Gemini ──────────────────────────────────────────────────────────

const MATCH_SYSTEM = `Tu es le moteur d'analyse morphologique de StarFusion.

Ton objectif est d'identifier les célébrités dont la STRUCTURE FACIALE ressemble le plus au visage fourni.

Tu dois analyser le visage avant de penser à des célébrités.
Ne fais pas un choix basé sur une impression générale.
Ne sélectionne pas la célébrité la plus populaire ni celle qui a la même coiffure.

Ignore autant que possible : coiffure, couleur des cheveux, barbe, lunettes, vêtements, décor, expression, sourire, lumière, maquillage.

Compare au minimum 8 candidats en interne, puis retourne exactement les 3 meilleurs.

Pour chaque finaliste, retourne des sous-scores 0–100 (similarité VISUELLE relative, PAS une preuve biométrique ni un % d'identité) pour :
faceShape, eyes, eyebrows, nose, jawChin, cheekbones, mouth, facialProportions

Ne retourne PAS de score global : il sera calculé par le backend.

Sois spécifique au visage observé. Évite les formulations génériques.
N'invente aucune caractéristique non visible.
Aucune inférence sensible (ethnicité, religion, santé, etc.).

Réponds UNIQUEMENT par un objet JSON valide, sans markdown.`

const COMBINED_ANALYZE_PROMPT = `Analyse d'abord en interne la structure faciale stable sur cette photo (forme, yeux, nez, mâchoire, proportions — ignore coiffure, barbe, lunettes, vêtements, décor, expression, lumière).

En t'appuyant sur cette analyse ET sur la photo, trouve les 3 célébrités (vraies personnalités identifiables) dont la structure faciale colle le mieux.

Réponds UNIQUEMENT avec ce JSON :
{
  "candidates": [
    {
      "name": "Prénom Nom",
      "celebrity_domain": "Acteur",
      "celebrity_style_description": "style vestimentaire / allure de la star — SANS décrire le visage de l'utilisateur",
      "featureScores": {
        "faceShape": 88,
        "eyes": 91,
        "eyebrows": 78,
        "nose": 81,
        "jawChin": 85,
        "cheekbones": 84,
        "mouth": 74,
        "facialProportions": 90
      },
      "strongestSimilarities": [
        "similitude concrète 1",
        "similitude concrète 2",
        "similitude concrète 3"
      ],
      "mainDifferences": [
        "différence concrète 1",
        "différence concrète 2"
      ]
    }
  ]
}

Règles :
- exactement 3 candidats dans "candidates"
- celebrity_domain en français court (Acteur, Chanteur, Sportif, Mannequin, Humoriste, Influenceur, etc.)
- featureScores : nombres 0–100, cohérents avec l'analyse
- strongestSimilarities : 3 traits STRUCTURELS précis
- mainDifferences : 1 à 3 différences structurelles
- si aucun visage : {"error":"visage non détecté"}`

// ── Helpers image + Gemini Google (transport uniquement) ────────────────────

function toRawBase64(base64: string) {
  return base64.replace(/^data:image\/\w+;base64,/, '')
}

function getMime(base64: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  if (base64.startsWith('data:image/png')) return 'image/png'
  if (base64.startsWith('data:image/webp')) return 'image/webp'
  if (base64.startsWith('data:image/gif')) return 'image/gif'
  return 'image/jpeg'
}

function resolveAnalysisGeminiModel(): string {
  const raw = Deno.env.get('ANALYSIS_GEMINI_MODEL')?.trim()
  return raw || DEFAULT_ANALYSIS_GEMINI_MODEL
}

function resolveAnalysisGeminiModels(): string[] {
  const primary = resolveAnalysisGeminiModel()
  const fallback = Deno.env.get('ANALYSIS_GEMINI_FALLBACK_MODEL')?.trim() || DEFAULT_ANALYSIS_GEMINI_FALLBACK_MODEL
  const models = [primary]
  if (fallback && fallback !== primary) models.push(fallback)
  return models
}

function shouldFallbackGeminiModel(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('not found') ||
    lower.includes('resource_exhausted') ||
    /\b404\b/.test(lower) ||
    /\b429\b/.test(lower) ||
    /\b503\b/.test(lower)
  )
}

function redactSecrets(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, 'REDACTED')
    .replace(/key=[^&\s"']+/gi, 'key=REDACTED')
}

function vendorErrorPreview(bodyText: string, data: unknown): string {
  if (data && typeof data === 'object') {
    const err = data as { error?: { message?: string } }
    if (err.error?.message) return redactSecrets(err.error.message).slice(0, 400)
  }
  return redactSecrets(bodyText).slice(0, 400)
}

function extractTextFromResponse(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const d = data as Record<string, unknown>

  const messageContentToString = (content: unknown): string => {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .map((block) => {
          if (!block || typeof block !== 'object') return ''
          const b = block as Record<string, unknown>
          if (typeof b.text === 'string') return b.text
          if (typeof b.content === 'string') return b.content
          return ''
        })
        .filter(Boolean)
        .join('\n')
    }
    if (content && typeof content === 'object') {
      const c = content as Record<string, unknown>
      if (typeof c.text === 'string') return c.text
    }
    return ''
  }

  const choices = d.choices as Array<{ message?: { content?: unknown } }> | undefined
  if (choices?.[0]?.message?.content != null) {
    const text = messageContentToString(choices[0].message.content)
    if (text) return text
  }

  const candidates = d.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined
  if (candidates?.[0]?.content?.parts?.length) {
    const text = candidates[0].content.parts
      .map((p) => p?.text ?? '')
      .filter(Boolean)
      .join('\n')
    if (text) return text
  }

  if (typeof d.text === 'string' && d.text) return d.text
  if (typeof d.output === 'string' && d.output) return d.output
  if (typeof d.result === 'string' && d.result) return d.result

  if (typeof d.data === 'string' && d.data.trim()) {
    try {
      return extractTextFromResponse(JSON.parse(d.data))
    } catch {
      return d.data
    }
  }

  if (d.data && typeof d.data === 'object') return extractTextFromResponse(d.data)
  return ''
}

function extractJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.trim()
  try {
    return JSON.parse(cleaned) as Record<string, unknown>
  } catch { /* continue */ }
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim()) as Record<string, unknown>
    } catch { /* continue */ }
  }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
  }
  if (/can't help|can't identify|cannot identify|facial recognition|i don't do|refus/i.test(cleaned)) {
    throw new Error('L\'IA a refusé l\'analyse. Réessaie avec une autre photo.')
  }
  throw new Error('Impossible de parser la réponse du modèle')
}

function isTransientKieError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('worker_resource_limit') ||
    lower.includes('not having enough compute resources') ||
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    /\b429\b/.test(lower) ||
    /\b502\b/.test(lower) ||
    /\b503\b/.test(lower) ||
    lower.includes('temporarily unavailable') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('resource_exhausted') ||
    lower.includes('overloaded')
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callGoogleGeminiVision(
  imageBase64: string,
  apiKey: string,
  extraUserText?: string,
  model = resolveAnalysisGeminiModel(),
): Promise<string> {
  const started = Date.now()
  const url = `${GOOGLE_GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`
  let httpStatus = 0
  let bodyText = ''
  let data: unknown

  const contents: Array<Record<string, unknown>> = [
    {
      role: 'user',
      parts: [
        { text: COMBINED_ANALYZE_PROMPT },
        {
          inlineData: {
            mimeType: getMime(imageBase64),
            data: toRawBase64(imageBase64),
          },
        },
      ],
    },
  ]
  if (extraUserText) {
    contents.push({ role: 'user', parts: [{ text: extraUserText }] })
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: MATCH_SYSTEM }] },
        contents,
        generationConfig: {
          temperature: ANALYZE_TEMPERATURE,
          responseMimeType: 'application/json',
        },
      }),
    })

    httpStatus = res.status
    bodyText = await res.text()
    try {
      data = JSON.parse(bodyText)
    } catch {
      data = undefined
    }

    if (!res.ok) {
      const err = data as { error?: { message?: string; status?: string } } | undefined
      throw new Error(
        `google_gemini ${model} ${res.status}${err?.error?.status ? ` ${err.error.status}` : ''} — ${vendorErrorPreview(bodyText, data)}`,
      )
    }

    const raw = extractTextFromResponse(data)
    if (!raw) {
      console.error('[analyze] empty model text, response preview:', redactSecrets(bodyText).slice(0, 800))
      throw new Error('Réponse vide du modèle')
    }

    console.log('[analyze]', {
      analysis_provider: ANALYSIS_PROVIDER,
      analysis_model: model,
      analysis_duration_ms: Date.now() - started,
      analysis_success: true,
    })
    return raw
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[analyze]', {
      analysis_provider: ANALYSIS_PROVIDER,
      analysis_model: model,
      analysis_duration_ms: Date.now() - started,
      analysis_success: false,
      analysis_provider_error: {
        http_status: httpStatus || undefined,
        error_type: (data as { error?: { status?: string } } | undefined)?.error?.status
          ?? (err instanceof Error ? err.name : 'Error'),
        vendor_message: redactSecrets(message).slice(0, 400),
      },
    })
    throw err instanceof Error ? err : new Error(message)
  }
}

async function callGoogleGeminiVisionWithFallback(
  imageBase64: string,
  apiKey: string,
  extraUserText?: string,
): Promise<string> {
  const models = resolveAnalysisGeminiModels()
  let lastErr: Error | undefined
  for (let i = 0; i < models.length; i++) {
    try {
      return await callGoogleGeminiVision(imageBase64, apiKey, extraUserText, models[i])
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      const canFallback = i < models.length - 1 && shouldFallbackGeminiModel(lastErr.message)
      if (!canFallback) throw lastErr
      console.warn(
        '[analyze] falling back Gemini model',
        models[i],
        '->',
        models[i + 1],
        lastErr.message.slice(0, 200),
      )
    }
  }
  throw lastErr ?? new Error('Analyse interrompue')
}

async function callGeminiVisionWithRetry(imageBase64: string, apiKey: string): Promise<string> {
  let lastErr: Error | undefined
  for (let attempt = 1; attempt <= ANALYZE_MAX_ATTEMPTS; attempt++) {
    try {
      return await callGoogleGeminiVisionWithFallback(imageBase64, apiKey)
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      if (!isTransientKieError(lastErr.message) || attempt === ANALYZE_MAX_ATTEMPTS) {
        throw lastErr
      }
      console.warn('[analyze] transient Gemini error, retry', attempt, lastErr.message.slice(0, 200))
      await delay(ANALYZE_RETRY_DELAY_MS * attempt)
    }
  }
  throw lastErr ?? new Error('Analyse interrompue')
}

async function callWithOptionalRetry(
  imageBase64: string,
  apiKey: string,
): Promise<Record<string, unknown>> {
  try {
    const raw = await callGeminiVisionWithRetry(imageBase64, apiKey)
    return extractJsonObject(raw)
  } catch (firstErr) {
    const firstMessage = firstErr instanceof Error ? firstErr.message : String(firstErr)
    if (isTransientKieError(firstMessage)) {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr))
    }
    try {
      const raw = await callGoogleGeminiVisionWithFallback(imageBase64, apiKey, ANALYZE_JSON_RETRY_TEXT)
      return extractJsonObject(raw)
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr))
    }
  }
}

type AnalysisJobRow = {
  id: string
  session_id: string | null
  user_id: string | null
  image_base64: string | null
  status: 'pending' | 'processing' | 'success' | 'failed'
  result_json: Record<string, unknown> | null
  fail_message: string | null
  analysis_id: string | null
  created_at: string
  updated_at: string
}

async function reloadAnalysisJob(
  db: ReturnType<typeof createClient>,
  pollJobId: string,
): Promise<AnalysisJobRow | null> {
  const { data } = await db
    .from('analysis_jobs')
    .select('*')
    .eq('id', pollJobId)
    .maybeSingle()
  return (data as AnalysisJobRow | null) ?? null
}

async function recoverStaleProcessingJob(
  db: ReturnType<typeof createClient>,
  job: AnalysisJobRow,
): Promise<AnalysisJobRow> {
  const ageMs = Date.now() - new Date(job.updated_at).getTime()
  const totalAgeMs = Date.now() - new Date(job.created_at).getTime()

  if (job.status !== 'processing' || ageMs <= ANALYSIS_JOB_RETRY_MS) {
    return job
  }

  if (!job.image_base64 || totalAgeMs > ANALYSIS_JOB_ABSOLUTE_MAX_MS) {
    await db.from('analysis_jobs').update({
      status: 'failed',
      fail_message: 'L\'analyse a pris trop de temps. Réessaie dans un instant.',
      image_base64: null,
      updated_at: new Date().toISOString(),
    }).eq('id', job.id)
    return {
      ...job,
      status: 'failed',
      fail_message: 'L\'analyse a pris trop de temps. Réessaie dans un instant.',
      image_base64: null,
    }
  }

  console.warn('[analyze] recovering stale processing job:', job.id, 'ageMs:', ageMs)
  await db.from('analysis_jobs').update({
    status: 'pending',
    updated_at: new Date().toISOString(),
  }).eq('id', job.id).eq('status', 'processing')

  return {
    ...job,
    status: 'pending',
  }
}

async function persistAnalysisRecord(
  db: ReturnType<typeof createClient>,
  sessionId: string | null | undefined,
  userId: string | null | undefined,
  result: ReturnType<typeof buildCelebrityResult>,
): Promise<string | undefined> {
  if (!sessionId && !userId) return undefined

  let writeSessionId = sessionId ?? null
  if (userId) {
    const { data: owned } = await db
      .from('sessions')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (owned?.id) writeSessionId = owned.id as string
  }

  if (!writeSessionId) return undefined

  const row: Record<string, unknown> = {
    session_id: writeSessionId,
    celebrity_name: result.name,
    score: result.score,
    traits: result.traits,
    description: result.fun_fact ?? null,
  }
  if (userId) row.user_id = userId

  const { data, error } = await db.from('analyses').insert(row).select('id').single()

  if (error && userId) {
    const { data: fallback } = await db
      .from('analyses')
      .insert({
        session_id: writeSessionId,
        celebrity_name: result.name,
        score: result.score,
        traits: result.traits,
        description: result.fun_fact ?? null,
      })
      .select('id')
      .single()
    return fallback?.id as string | undefined
  }

  return data?.id as string | undefined
}

async function runAnalysisJob(jobId: string, apiKey: string): Promise<void> {
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: claimed } = await db
    .from('analysis_jobs')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle()

  const job = claimed as AnalysisJobRow | null
  if (!job?.image_base64) return

  const startMs = Date.now()
  try {
    const parsed = await callWithOptionalRetry(job.image_base64, apiKey)
    console.log('[analyze] job timing ms:', Date.now() - startMs, 'jobId:', jobId)
    console.log('[analyze] candidates:', JSON.stringify(parsed).slice(0, 800))

    if (typeof parsed.error === 'string' && parsed.error) {
      throw new Error(`Analyse : ${parsed.error}`)
    }

    const result = buildCelebrityResult(parsed)
    const analysisId = await persistAnalysisRecord(db, job.session_id, job.user_id, result)

    await db.from('analysis_jobs').update({
      status: 'success',
      result_json: { ...result, analysisId },
      analysis_id: analysisId ?? null,
      image_base64: null,
      fail_message: null,
      updated_at: new Date().toISOString(),
    }).eq('id', jobId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne'
    if (isTransientKieError(message)) {
      console.warn('[analyze] job transient, reset pending:', jobId, message.slice(0, 200))
      await db.from('analysis_jobs').update({
        status: 'pending',
        fail_message: message,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId)
      return
    }
    console.error('[analyze] job failed:', jobId, message)
    await db.from('analysis_jobs').update({
      status: 'failed',
      fail_message: message,
      image_base64: null,
      updated_at: new Date().toISOString(),
    }).eq('id', jobId)
  }
}

async function handlePollJob(
  pollJobId: string,
  apiKey: string,
): Promise<Response> {
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  let job = await reloadAnalysisJob(db, pollJobId)

  if (!job) {
    return new Response(
      JSON.stringify({ error: 'Analyse introuvable. Relance une nouvelle photo.' }),
      { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }

  job = await recoverStaleProcessingJob(db, job)

  if (
    job.status === 'failed'
    && job.image_base64
    && isTransientKieError(job.fail_message ?? '')
  ) {
    await db.from('analysis_jobs').update({
      status: 'pending',
      updated_at: new Date().toISOString(),
    }).eq('id', job.id)
    job = { ...job, status: 'pending' }
  }

  if (job.status === 'success' && job.result_json) {
    return new Response(
      JSON.stringify({ status: 'success', ...job.result_json }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }

  if (job.status === 'failed') {
    return new Response(
      JSON.stringify({ status: 'failed', error: job.fail_message ?? 'Analyse échouée' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }

  if (job.status === 'pending') {
    const sinceUpdateMs = Date.now() - new Date(job.updated_at).getTime()
    const coolingDown = Boolean(
      job.fail_message
      && isTransientKieError(job.fail_message)
      && sinceUpdateMs < ANALYSIS_TRANSIENT_COOLDOWN_MS,
    )

    if (!coolingDown) {
      try {
        await runAnalysisJob(pollJobId, apiKey)
      } catch (err) {
        console.warn('[analyze] inline poll processing error:', err instanceof Error ? err.message : err)
      }
    }

    job = await reloadAnalysisJob(db, pollJobId)
    if (job?.status === 'success' && job.result_json) {
      return new Response(
        JSON.stringify({ status: 'success', ...job.result_json }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } },
      )
    }
    if (job?.status === 'failed') {
      return new Response(
        JSON.stringify({ status: 'failed', error: job.fail_message ?? 'Analyse échouée' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
      )
    }
  }

  return new Response(
    JSON.stringify({ status: 'pending', pollJobId }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } },
  )
}

async function handleStartAnalysis(
  imageBase64: string,
  sessionId: string | undefined,
  userId: string | undefined,
  apiKey: string,
): Promise<Response> {
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: jobRow, error: insertErr } = await db
    .from('analysis_jobs')
    .insert({
      session_id: sessionId ?? null,
      user_id: userId ?? null,
      image_base64: imageBase64,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertErr || !jobRow?.id) {
    throw new Error(insertErr?.message ?? 'Impossible d\'enregistrer l\'analyse en cours')
  }

  const pollJobId = jobRow.id as string

  return new Response(
    JSON.stringify({
      status: 'pending',
      pollJobId,
      pollIntervalMs: ANALYSIS_POLL_INTERVAL_MS,
      pollTimeoutMs: ANALYSIS_POLL_TIMEOUT_MS,
    }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } },
  )
}

function parseStringList(raw: unknown, max = 5): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.trim())
    .slice(0, max)
}

function readField(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key]
  }
  return undefined
}

function normalizeFeatureScoresInput(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const obj = raw as Record<string, unknown>
  const aliases: Record<string, FeatureScoreKey> = {
    face_shape: 'faceShape',
    facial_proportions: 'facialProportions',
    jaw_chin: 'jawChin',
    cheek_bones: 'cheekbones',
  }
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    out[aliases[key] ?? key] = value
  }
  return out
}

function buildCelebrityResult(parsed: Record<string, unknown>) {
  if (typeof parsed.error === 'string') throw new Error(`Analyse : ${parsed.error}`)

  const list = parsed.candidates
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('Aucun candidat exploitable renvoyé par l\'analyse')
  }

  const rawCandidates: Array<{
    name: string
    celebrity_domain: string
    celebrity_style_description: string
    featureScores: FeatureScores
    strongestSimilarities: string[]
    mainDifferences: string[]
  }> = []

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const c = item as Record<string, unknown>
    const nameRaw = readField(c, 'name', 'celebrity_name', 'celebrityName')
    const name = typeof nameRaw === 'string' ? nameRaw.trim() : ''
    if (!name) continue
    const featureScores = parseFeatureScores(
      normalizeFeatureScoresInput(readField(c, 'featureScores', 'feature_scores')),
    )
    if (!featureScores) continue
    const strongestSimilarities = parseStringList(
      readField(c, 'strongestSimilarities', 'strongest_similarities', 'similarities'),
      3,
    )
    if (strongestSimilarities.length === 0) continue
    rawCandidates.push({
      name,
      celebrity_domain: String(readField(c, 'celebrity_domain', 'celebrityDomain', 'domain') ?? '').trim(),
      celebrity_style_description: String(
        readField(c, 'celebrity_style_description', 'celebrityStyleDescription', 'style_description') ?? '',
      ).trim(),
      featureScores,
      strongestSimilarities,
      mainDifferences: parseStringList(
        readField(c, 'mainDifferences', 'main_differences', 'differences'),
        3,
      ),
    })
  }

  if (rawCandidates.length === 0) {
    console.warn('[analyze] no valid candidates after validation:', JSON.stringify(parsed).slice(0, 800))
    throw new Error('Aucun candidat valide après validation des sous-scores')
  }

  const ranked = rankCandidatesByScore(rawCandidates)
  const top3 = ranked.slice(0, 3)
  const winner = top3[0]

  return {
    name: winner.name,
    celebrity_domain: winner.celebrity_domain,
    score: winner.score,
    traits: winner.strongestSimilarities.slice(0, 3),
    celebrity_style_description: winner.celebrity_style_description,
    fun_fact: buildExplanationFromSimilarities(
      winner.strongestSimilarities,
      winner.mainDifferences,
    ),
    featureScores: winner.featureScores,
    runnersUp: top3.slice(1).map((c) => ({
      name: c.name,
      celebrity_domain: c.celebrity_domain,
      score: c.score,
      featureScores: c.featureScores,
      strongestSimilarities: c.strongestSimilarities,
      mainDifferences: c.mainDifferences,
    })),
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiKey) throw new Error('GEMINI_API_KEY non configurée dans les secrets Supabase')

    const body = await req.json() as {
      pollJobId?: string
      imageBase64?: string
      sessionId?: string
      userId?: string
    }

    if (typeof body.pollJobId === 'string' && body.pollJobId.trim()) {
      return await handlePollJob(body.pollJobId.trim(), geminiKey)
    }

    if (!body.imageBase64) throw new Error('imageBase64 requis')

    return await handleStartAnalysis(body.imageBase64, body.sessionId, body.userId, geminiKey)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne'
    console.error('[analyze] final error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }
})
