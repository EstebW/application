import type { CelebrityResult } from './types'
import { formatKieError } from './kie-errors'

const KIE_CLAUDE_URL = 'https://api.kie.ai/claude/v1/messages'
const ANALYZE_MODEL = 'claude-opus-4-7'

function toRawBase64(base64: string) {
  return base64.replace(/^data:image\/\w+;base64,/, '')
}

function getMime(base64: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  if (base64.startsWith('data:image/png')) return 'image/png'
  if (base64.startsWith('data:image/webp')) return 'image/webp'
  if (base64.startsWith('data:image/gif')) return 'image/gif'
  return 'image/jpeg'
}

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

  const choices = d.choices as Array<{ message?: { content?: string } }> | undefined
  if (choices?.[0]?.message?.content) return choices[0].message.content

  if (d.data && typeof d.data === 'object') {
    return extractTextFromKieResponse(d.data)
  }

  return ''
}

function extractJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.trim()

  try {
    return JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    // continue
  }

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim()) as Record<string, unknown>
    } catch {
      // continue
    }
  }

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
  }

  throw new Error('Impossible de parser la réponse de Claude')
}

function mapToCelebrityResult(parsed: Record<string, unknown>): CelebrityResult {
  if (typeof parsed.error === 'string') {
    throw new Error(`Claude : ${parsed.error}`)
  }

  const traits = parsed.common_traits
  const traitsList = Array.isArray(traits)
    ? traits.filter((t): t is string => typeof t === 'string')
    : []

  return {
    name: typeof parsed.celebrity_name === 'string' ? parsed.celebrity_name : 'Célébrité inconnue',
    celebrity_domain: typeof parsed.celebrity_domain === 'string' ? parsed.celebrity_domain : '',
    score: typeof parsed.similarity_percentage === 'number' ? parsed.similarity_percentage : 75,
    traits: traitsList,
    celebrity_style_description:
      typeof parsed.celebrity_style_description === 'string' ? parsed.celebrity_style_description : '',
    fun_fact: typeof parsed.fun_fact === 'string' ? parsed.fun_fact : '',
  }
}

export async function analyzeCelebrityFace(
  imageBase64: string,
  apiKey: string
): Promise<CelebrityResult> {
  const rawBase64 = toRawBase64(imageBase64)
  const mediaType = getMime(imageBase64)

  const kieRes = await fetch(KIE_CLAUDE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
              source: { type: 'base64', media_type: mediaType, data: rawBase64 },
            },
            { type: 'text', text: ANALYZE_PROMPT },
          ],
        },
      ],
    }),
  })

  if (!kieRes.ok) {
    const errBody = await kieRes.text()
    throw new Error(formatKieError(`kie.ai Claude ${kieRes.status} — ${errBody}`))
  }

  const kieData = await kieRes.json()
  const raw = extractTextFromKieResponse(kieData)

  if (!raw) {
    console.error('[analyze] unexpected response shape:', JSON.stringify(kieData))
    throw new Error('Réponse vide de Claude')
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[analyze] Claude raw:', raw)
  }

  const parsed = extractJsonObject(raw)
  return mapToCelebrityResult(parsed)
}
