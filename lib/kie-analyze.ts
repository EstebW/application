import type { CelebrityResult } from './types'
import { isTransientKieError } from './kie-errors.ts'
import { buildCelebrityResultFromAnalysis, extractJsonObject } from './twin-result.ts'
import {
  callGoogleGeminiAnalyze,
  resolveAnalysisGeminiModel,
} from './google-gemini-analyze.ts'

export { buildCelebrityResultFromAnalysis, extractJsonObject } from './twin-result.ts'

export const MATCH_SYSTEM = `Tu es le moteur d'analyse morphologique de StarFusion.

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

export const COMBINED_ANALYZE_PROMPT = `Analyse d'abord en interne la structure faciale stable sur cette photo (forme, yeux, nez, mâchoire, proportions — ignore coiffure, barbe, lunettes, vêtements, décor, expression, lumière).

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

const ANALYZE_TEMPERATURE = 0.2
const ANALYZE_MAX_ATTEMPTS = 2
const ANALYZE_RETRY_DELAY_MS = 1_500
const ANALYZE_JSON_RETRY_TEXT =
  'Ta réponse précédente était invalide. Renvoie UNIQUEMENT l\'objet JSON demandé, sans markdown ni texte autour.'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callGeminiVision(
  imageBase64: string,
  apiKey: string,
  extraUserText?: string,
): Promise<string> {
  return await callGoogleGeminiAnalyze({
    systemInstruction: MATCH_SYSTEM,
    userText: COMBINED_ANALYZE_PROMPT,
    imageBase64,
    extraUserText,
    apiKey,
    model: resolveAnalysisGeminiModel(),
    temperature: ANALYZE_TEMPERATURE,
  })
}

async function callGeminiVisionWithRetry(imageBase64: string, apiKey: string): Promise<string> {
  let lastErr: Error | undefined
  for (let attempt = 1; attempt <= ANALYZE_MAX_ATTEMPTS; attempt++) {
    try {
      return await callGeminiVision(imageBase64, apiKey)
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      const transient = isTransientKieError(lastErr.message)
      if (!transient || attempt === ANALYZE_MAX_ATTEMPTS) throw lastErr
      await delay(ANALYZE_RETRY_DELAY_MS * attempt)
    }
  }
  throw lastErr ?? new Error('Analyse interrompue')
}

async function callWithOptionalRetry(
  imageBase64: string,
  apiKey: string,
  label: string,
): Promise<Record<string, unknown>> {
  try {
    const raw = await callGeminiVisionWithRetry(imageBase64, apiKey)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[analyze] ${label} raw:`, raw.slice(0, 1200))
    }
    return extractJsonObject(raw)
  } catch (firstErr) {
    const firstMessage = firstErr instanceof Error ? firstErr.message : String(firstErr)
    if (isTransientKieError(firstMessage)) {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr))
    }
    try {
      const raw = await callGeminiVision(imageBase64, apiKey, ANALYZE_JSON_RETRY_TEXT)
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
  const parsed = await callWithOptionalRetry(imageBase64, apiKey, 'combined')

  if (typeof parsed.error === 'string' && parsed.error) {
    throw new Error(`Analyse : ${parsed.error}`)
  }

  return buildCelebrityResultFromAnalysis(parsed)
}
