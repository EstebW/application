import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const KIE_CLAUDE_URL = 'https://api.kie.ai/claude/v1/messages'
const ANALYZE_MODEL = 'claude-opus-4-7'

const ANALYZE_PROMPT = `Tu es un expert en analyse faciale et en culture pop mondiale.

Analyse le visage sur cette photo et détermine à quelle célébrité mondiale connue cette personne ressemble le plus.

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans texte avant ou après :
{
  "celebrity_name": "Prénom Nom",
  "celebrity_domain": "Acteur",
  "similarity_percentage": 84,
  "common_traits": ["trait 1", "trait 2", "trait 3"],
  "celebrity_style_description": "style visuel iconique de la célébrité",
  "fun_fact": "une phrase fun"
}

Règles :
- similarity_percentage entre 65 et 95
- célébrité très connue mondialement
- si visage non visible : {"error":"visage non détecté"}`

function toRawBase64(base64: string) {
  return base64.replace(/^data:image\/\w+;base64,/, '')
}

function getMime(base64: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  if (base64.startsWith('data:image/png')) return 'image/png'
  if (base64.startsWith('data:image/webp')) return 'image/webp'
  if (base64.startsWith('data:image/gif')) return 'image/gif'
  return 'image/jpeg'
}

function extractTextFromKieResponse(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const d = data as Record<string, unknown>
  const content = d.content
  if (Array.isArray(content)) {
    const parts = content
      .map((block) => {
        if (!block || typeof block !== 'object') return ''
        const b = block as { type?: string; text?: string }
        if (b.type === 'text' && typeof b.text === 'string') return b.text
        return ''
      })
      .filter(Boolean)
    if (parts.length) return parts.join('\n')
  }
  if (typeof d.text === 'string') return d.text
  if (d.data && typeof d.data === 'object') return extractTextFromKieResponse(d.data)
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
  throw new Error('Impossible de parser la réponse de Claude')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const kieKey = Deno.env.get('KIE_API_KEY')
    if (!kieKey) throw new Error('KIE_API_KEY non configurée dans les secrets Supabase')

    const { imageBase64, sessionId } = await req.json() as {
      imageBase64: string
      sessionId?: string
    }

    if (!imageBase64) throw new Error('imageBase64 requis')

    const kieRes = await fetch(KIE_CLAUDE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kieKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: ANALYZE_MODEL,
        max_tokens: 600,
        stream: false,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: getMime(imageBase64),
                  data: toRawBase64(imageBase64),
                },
              },
              { type: 'text', text: ANALYZE_PROMPT },
            ],
          },
        ],
      }),
    })

    if (!kieRes.ok) {
      const errBody = await kieRes.text()
      throw new Error(`kie.ai Claude ${kieRes.status} — ${errBody}`)
    }

    const kieData = await kieRes.json()
    const raw = extractTextFromKieResponse(kieData)
    if (!raw) {
      console.error('[analyze] unexpected response:', JSON.stringify(kieData))
      throw new Error('Réponse vide de Claude')
    }

    console.log('[analyze] Claude raw:', raw)

    const parsed = extractJsonObject(raw)
    if (typeof parsed.error === 'string') throw new Error(`Claude : ${parsed.error}`)

    const result = {
      name: typeof parsed.celebrity_name === 'string' ? parsed.celebrity_name : 'Célébrité inconnue',
      celebrity_domain: typeof parsed.celebrity_domain === 'string' ? parsed.celebrity_domain : '',
      score: typeof parsed.similarity_percentage === 'number' ? parsed.similarity_percentage : 75,
      traits: Array.isArray(parsed.common_traits)
        ? parsed.common_traits.filter((t): t is string => typeof t === 'string')
        : [],
      celebrity_style_description:
        typeof parsed.celebrity_style_description === 'string' ? parsed.celebrity_style_description : '',
      fun_fact: typeof parsed.fun_fact === 'string' ? parsed.fun_fact : '',
    }

    let analysisId: string | undefined
    if (sessionId) {
      try {
        const db = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          { auth: { persistSession: false } }
        )
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
      } catch { /* non-blocking */ }
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
