import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const KIE_API_BASE = 'https://api.kie.ai'
const ANALYZE_MODEL = 'gemini-3-flash'
const ANALYZE_ENDPOINT = '/gemini-3-flash/v1/chat/completions'
const ANALYZE_TEMPERATURE = 0.2
const ANALYZE_KIE_MAX_ATTEMPTS = 3
const ANALYZE_KIE_RETRY_DELAY_MS = 1_500

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

// ── Helpers kie.ai ──────────────────────────────────────────────────────────

function toRawBase64(base64: string) {
  return base64.replace(/^data:image\/\w+;base64,/, '')
}

function getMime(base64: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  if (base64.startsWith('data:image/png')) return 'image/png'
  if (base64.startsWith('data:image/webp')) return 'image/webp'
  if (base64.startsWith('data:image/gif')) return 'image/gif'
  return 'image/jpeg'
}

function toDataUrl(base64: string): string {
  if (base64.startsWith('data:')) return base64
  return `data:${getMime(base64)};base64,${toRawBase64(base64)}`
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
    lower.includes('overloaded')
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callKieVision(messages: unknown[], apiKey: string): Promise<string> {
  const res = await fetch(`${KIE_API_BASE}${ANALYZE_ENDPOINT}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      stream: false,
      reasoning_effort: 'low',
      temperature: ANALYZE_TEMPERATURE,
    }),
  })

  const bodyText = await res.text()
  let data: unknown
  try {
    data = JSON.parse(bodyText)
  } catch {
    throw new Error(`kie.ai ${ANALYZE_MODEL} ${res.status} — ${bodyText}`)
  }

  if (!res.ok) {
    const err = data as { error?: { message?: string }; msg?: string }
    throw new Error(`kie.ai ${ANALYZE_MODEL} ${res.status} — ${err.error?.message ?? err.msg ?? bodyText}`)
  }

  const parsed = data as { code?: number; msg?: string }
  if (typeof parsed.code === 'number' && parsed.code !== 200) {
    throw new Error(`kie.ai ${ANALYZE_MODEL} — ${parsed.msg ?? 'erreur'}`)
  }

  const raw = extractTextFromResponse(data)
  if (!raw) {
    console.error('[analyze] empty model text, response preview:', bodyText.slice(0, 800))
    throw new Error('Réponse vide du modèle')
  }
  return raw
}

async function callKieVisionWithRetry(messages: unknown[], apiKey: string): Promise<string> {
  let lastErr: Error | undefined
  for (let attempt = 1; attempt <= ANALYZE_KIE_MAX_ATTEMPTS; attempt++) {
    try {
      return await callKieVision(messages, apiKey)
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      if (!isTransientKieError(lastErr.message) || attempt === ANALYZE_KIE_MAX_ATTEMPTS) {
        throw lastErr
      }
      console.warn('[analyze] transient KIE error, retry', attempt, lastErr.message.slice(0, 200))
      await delay(ANALYZE_KIE_RETRY_DELAY_MS * attempt)
    }
  }
  throw lastErr ?? new Error('Analyse interrompue')
}

async function callWithOptionalRetry(
  messages: unknown[],
  apiKey: string,
): Promise<Record<string, unknown>> {
  try {
    const raw = await callKieVisionWithRetry(messages, apiKey)
    return extractJsonObject(raw)
  } catch (firstErr) {
    const retryMessages = [
      ...messages,
      {
        role: 'user',
        content: 'Ta réponse précédente était invalide. Renvoie UNIQUEMENT l\'objet JSON demandé, sans markdown ni texte autour.',
      },
    ]
    try {
      const raw = await callKieVisionWithRetry(retryMessages, apiKey)
      return extractJsonObject(raw)
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr))
    }
  }
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
    const kieKey = Deno.env.get('KIE_API_KEY')
    if (!kieKey) throw new Error('KIE_API_KEY non configurée dans les secrets Supabase')

    const { imageBase64, sessionId, userId } = await req.json() as {
      imageBase64: string
      sessionId?: string
      userId?: string
    }

    if (!imageBase64) throw new Error('imageBase64 requis')

    const imageUrl = toDataUrl(imageBase64)
    const startMs = Date.now()

    const parsed = await callWithOptionalRetry(
      [
        { role: 'system', content: MATCH_SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: COMBINED_ANALYZE_PROMPT },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      kieKey,
    )

    console.log('[analyze] timing ms:', Date.now() - startMs)
    console.log('[analyze] candidates:', JSON.stringify(parsed).slice(0, 800))

    if (typeof parsed.error === 'string' && parsed.error) {
      throw new Error(`Analyse : ${parsed.error}`)
    }

    const result = buildCelebrityResult(parsed)

    let analysisId: string | undefined
    if (sessionId || userId) {
      try {
        const db = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          { auth: { persistSession: false } }
        )

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

        if (writeSessionId) {
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
            analysisId = fallback?.id
          } else {
            analysisId = data?.id
          }
        }
      } catch (dbErr) {
        console.warn('[analyze] DB insert failed:', dbErr)
      }
    }

    return new Response(
      JSON.stringify({ ...result, analysisId }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne'
    console.error('[analyze] final error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
