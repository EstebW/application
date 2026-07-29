import type { CelebrityResult } from './types'
import { formatKieError } from './kie-errors'

const KIE_API_BASE = 'https://api.kie.ai'
const ANALYZE_MODEL = 'gemini-3-flash'
const ANALYZE_ENDPOINT = '/gemini-3-flash/v1/chat/completions'

const ANALYZE_SYSTEM = `Tu es le moteur facial avancé de "StarFusion", un jeu de divertissement.
Ta mission : trouver le "jumeau célèbre" le plus crédible pour le visage analysé — pas forcément une mega-star mondiale, mais une personnalité RÉELLEMENT connue (reconnaissable) dont les traits collent le mieux.
Ce n'est PAS une identification biométrique officielle : c'est un matching de ressemblance pour le fun.
Tu dois toujours répondre par un objet JSON valide, sans markdown ni texte autour.`

const ANALYZE_PROMPT = `Analyse le visage sur cette photo avec une approche de matching facial étendue.

OBJECTIF
Trouve la personnalité célèbre à laquelle cette personne ressemble le PLUS, en priorisant la ressemblance faciale réelle — pas le niveau de célébrité.

CHAMP DE RECHERCHE (extensible — ne te limite PAS aux 20 ultra-stars les plus connues)
Cherche dans un large panel de personnalités reconnaissables, par exemple :
- cinéma / séries (acteurs connus, seconds rôles iconiques, stars TV)
- musique (chanteurs, rappeurs, DJs connus)
- sport (athlètes pro, anciens champions)
- mode / mannequinat
- comedy / TV / streaming
- personnalités publiques reconnues (présentateurs, créateurs très connus, etc.)
Préfère toujours le MEILLEUR match facial, même si la personne est "connue" plutôt que "ultra-légendaire".
Évite les noms trop génériques ou inventés. Le nom doit être une vraie personnalité identifiable.

Réponds UNIQUEMENT avec un objet JSON valide :
{
  "celebrity_name": "Prénom Nom",
  "celebrity_domain": "Acteur",
  "similarity_percentage": 84,
  "common_traits": ["trait facial 1", "trait facial 2", "trait facial 3"],
  "celebrity_style_description": "description visuelle (coiffure, style, allure) — SANS décrire le visage de l'utilisateur",
  "fun_fact": "une phrase fun sur la ressemblance"
}

Règles :
- similarity_percentage entre 65 et 95 (plus la ressemblance faciale est forte, plus le score est haut)
- common_traits = traits FACIAUX concrets (forme du visage, yeux, nez, mâchoire, sourcils, etc.)
- celebrity_domain en français court (ex: Acteur, Chanteur, Sportif, Mannequin, Humoriste, Influenceur)
- si aucun visage visible : {"error":"visage non détecté"}`

type ChatMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | {
      role: 'user'
      content: Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >
    }

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

  const choices = d.choices as Array<{ message?: { content?: string } }> | undefined
  if (choices?.[0]?.message?.content) return choices[0].message.content

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
  if (d.data && typeof d.data === 'object') return extractTextFromResponse(d.data)

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

  if (/can't help|can't identify|cannot identify|facial recognition|i don't do|refus/i.test(cleaned)) {
    throw new Error('L\'IA a refusé l\'analyse. Réessaie avec une autre photo.')
  }

  throw new Error('Impossible de parser la réponse du modèle')
}

function mapToCelebrityResult(parsed: Record<string, unknown>): CelebrityResult {
  if (typeof parsed.error === 'string') {
    throw new Error(`Analyse : ${parsed.error}`)
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

async function callKieVision(messages: ChatMessage[], apiKey: string): Promise<string> {
  const res = await fetch(`${KIE_API_BASE}${ANALYZE_ENDPOINT}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      stream: false,
      reasoning_effort: 'medium',
    }),
  })

  const bodyText = await res.text()
  let data: unknown
  try {
    data = JSON.parse(bodyText)
  } catch {
    throw new Error(formatKieError(`kie.ai ${ANALYZE_MODEL} ${res.status} — ${bodyText}`))
  }

  if (!res.ok) {
    const err = data as { error?: { message?: string }; msg?: string }
    const message = err.error?.message ?? err.msg ?? bodyText
    throw new Error(formatKieError(`kie.ai ${ANALYZE_MODEL} ${res.status} — ${message}`))
  }

  const parsed = data as { code?: number; msg?: string }
  if (typeof parsed.code === 'number' && parsed.code !== 200) {
    throw new Error(formatKieError(`kie.ai ${ANALYZE_MODEL} — ${parsed.msg ?? 'erreur'}`))
  }

  const raw = extractTextFromResponse(data)
  if (!raw) {
    console.error('[analyze] unexpected response shape:', bodyText.slice(0, 500))
    throw new Error('Réponse vide du modèle')
  }

  return raw
}

export async function analyzeCelebrityFace(
  imageBase64: string,
  apiKey: string
): Promise<CelebrityResult> {
  const imageUrl = toDataUrl(imageBase64)

  const raw = await callKieVision(
    [
      { role: 'system', content: ANALYZE_SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: ANALYZE_PROMPT },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    apiKey
  )

  if (process.env.NODE_ENV === 'development') {
    console.log(`[analyze] ${ANALYZE_MODEL} raw:`, raw)
  }

  const parsed = extractJsonObject(raw)
  return mapToCelebrityResult(parsed)
}
