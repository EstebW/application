import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
  if (typeof d.text === 'string') return d.text
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
  throw new Error('Impossible de parser la réponse du modèle')
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
      reasoning_effort: 'medium',
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
  if (!raw) throw new Error('Réponse vide du modèle')
  return raw
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
      kieKey
    )

    console.log(`[analyze] ${ANALYZE_MODEL} raw:`, raw)

    const parsed = extractJsonObject(raw)
    if (typeof parsed.error === 'string') throw new Error(`Analyse : ${parsed.error}`)

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
