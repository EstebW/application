import type { CelebrityResult } from './types'
import { formatKieError } from './kie-errors'
import { buildCelebrityResultFromAnalysis, extractJsonObject } from './twin-result'

export { buildCelebrityResultFromAnalysis, extractJsonObject } from './twin-result'

const KIE_API_BASE = 'https://api.kie.ai'
const ANALYZE_MODEL = 'gemini-3-flash'
const ANALYZE_ENDPOINT = '/gemini-3-flash/v1/chat/completions'

/** Température basse pour stabiliser l'analyse structurée (si supportée par kie.ai). */
const ANALYZE_TEMPERATURE = 0.2

const MORPHOLOGY_SYSTEM = `Tu es le moteur d'analyse morphologique de StarFusion.
Tu décris UNIQUEMENT la structure visuelle du visage fourni.
Tu ne nommes AUCUNE célébrité.
Tu ne fais AUCUNE déduction sur l'origine ethnique, la religion, l'orientation sexuelle, la santé, les opinions politiques, la personnalité ou l'intelligence.
Tu réponds UNIQUEMENT par un objet JSON valide, sans markdown.`

const MORPHOLOGY_PROMPT = `Analyse précisément le visage sur cette photo. Ignore autant que possible coiffure, barbe, lunettes, vêtements, décor, expression, sourire, lumière et maquillage.

Décris les caractéristiques STRUCTURELLES stables :

Réponds UNIQUEMENT avec ce JSON :
{
  "faceShape": "forme globale + rapport largeur/longueur",
  "forehead": "largeur, hauteur, structure",
  "eyebrows": "forme, épaisseur, orientation, distance aux yeux",
  "eyes": "forme, taille relative, espacement, orientation, ouverture, position",
  "nose": "longueur relative, largeur, forme, projection, rapports",
  "cheekbones": "largeur, position, définition",
  "jawChin": "mâchoire (largeur, angle, définition) + menton (largeur, forme, projection)",
  "mouth": "largeur, forme, proportions des lèvres, distance nez-bouche",
  "facialProportions": "tiers du visage et rapports yeux/nez/bouche/mâchoire/menton",
  "error": null
}

Si aucun visage exploitable : {"error":"visage non détecté"}`

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

function buildMatchPrompt(faceAnalysisJson: string): string {
  return `Voici l'analyse morphologique déjà établie du visage utilisateur (à respecter comme base) :
${faceAnalysisJson}

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
}

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
      temperature: ANALYZE_TEMPERATURE,
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

async function callWithOptionalRetry(
  messages: ChatMessage[],
  apiKey: string,
  label: string,
): Promise<Record<string, unknown>> {
  try {
    const raw = await callKieVision(messages, apiKey)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[analyze] ${label} raw:`, raw.slice(0, 1200))
    }
    return extractJsonObject(raw)
  } catch (firstErr) {
    const retryMessages: ChatMessage[] = [
      ...messages,
      {
        role: 'user',
        content: 'Ta réponse précédente était invalide. Renvoie UNIQUEMENT l\'objet JSON demandé, sans markdown ni texte autour.',
      },
    ]
    try {
      const raw = await callKieVision(retryMessages, apiKey)
      return extractJsonObject(raw)
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr))
    }
  }
}

/**
 * Analyse « Trouve ton jumeau » :
 * 1) morphologie seule
 * 2) candidats + sous-scores
 * puis score StarFusion + Top 3 calculés côté backend.
 */
export async function analyzeCelebrityFace(
  imageBase64: string,
  apiKey: string
): Promise<CelebrityResult> {
  const imageUrl = toDataUrl(imageBase64)

  const morphologyParsed = await callWithOptionalRetry(
    [
      { role: 'system', content: MORPHOLOGY_SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: MORPHOLOGY_PROMPT },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    apiKey,
    'morphology',
  )

  if (typeof morphologyParsed.error === 'string' && morphologyParsed.error) {
    throw new Error(`Analyse : ${morphologyParsed.error}`)
  }

  const matchParsed = await callWithOptionalRetry(
    [
      { role: 'system', content: MATCH_SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: buildMatchPrompt(JSON.stringify(morphologyParsed)) },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    apiKey,
    'match',
  )

  return buildCelebrityResultFromAnalysis(matchParsed)
}
