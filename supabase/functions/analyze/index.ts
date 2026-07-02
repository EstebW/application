import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Strip the "data:image/xxx;base64," prefix — Claude wants raw base64 bytes
function toRawBase64(base64: string) {
  return base64.replace(/^data:image\/\w+;base64,/, '')
}

// Detect MIME type from data URL or default to jpeg
function getMime(base64: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  if (base64.startsWith('data:image/png')) return 'image/png'
  if (base64.startsWith('data:image/webp')) return 'image/webp'
  if (base64.startsWith('data:image/gif')) return 'image/gif'
  return 'image/jpeg'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const kieKey = Deno.env.get('KIE_API_KEY')
    if (!kieKey) throw new Error('KIE_API_KEY manquante dans les secrets Supabase')

    const { imageBase64, sessionId } = await req.json() as {
      imageBase64: string
      sessionId?: string
    }

    if (!imageBase64) throw new Error('imageBase64 requis')

    const rawBase64 = toRawBase64(imageBase64)
    const mediaType = getMime(imageBase64)

    // ── Claude Opus 4.7 vision via kie.ai (Anthropic Messages API) ───────────
    // Endpoint: https://api.kie.ai/claude/v1/messages
    // Format image : { type: "image", source: { type: "base64", media_type, data } }
    // stream doit être false pour recevoir une réponse JSON classique
    const kieRes = await fetch('https://api.kie.ai/claude/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${kieKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        max_tokens: 400,
        stream: false,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: rawBase64,
                },
              },
              {
                type: 'text',
                text: `Tu es un expert en analyse faciale et en culture pop mondiale.

Analyse attentivement le visage sur cette photo et détermine à quelle célébrité mondiale connue cette personne ressemble le plus (acteur, actrice, chanteur, chanteuse, sportif...).

Réponds UNIQUEMENT en JSON valide, sans texte avant ou après :
{
  "celebrity_name": "Prénom Nom de la célébrité",
  "celebrity_domain": "Actrice / Chanteur / Sportif...",
  "similarity_percentage": 84,
  "common_traits": [
    "Structure des pommettes similaire",
    "Forme des yeux comparable",
    "Ligne de mâchoire identique"
  ],
  "celebrity_style_description": "Description du style visuel iconique de cette célébrité pour générer une image dans son style",
  "fun_fact": "Une phrase fun qui compare les deux personnes"
}

Important :
- Le pourcentage doit être entre 65 et 95
- Choisis toujours une célébrité très connue mondialement
- Si le visage n'est pas clairement visible, renvoie {"error": "visage non détecté"}`,
              },
            ],
          },
        ],
      }),
    })

    // Log exact kie.ai error for debugging
    if (!kieRes.ok) {
      const errBody = await kieRes.text()
      console.error(`[analyze] kie.ai Claude HTTP ${kieRes.status}:`, errBody)
      throw new Error(`kie.ai Claude ${kieRes.status} — ${errBody}`)
    }

    const kieData = await kieRes.json()

    // Claude Anthropic Messages API response: content[0].text
    const raw: string = kieData?.content?.[0]?.text ?? ''
    if (!raw) {
      console.error('[analyze] Empty response from Claude:', JSON.stringify(kieData))
      throw new Error('Réponse vide de Claude Opus')
    }

    const jsonStr = raw.replace(/```json|```/g, '').trim()

    let parsed: {
      celebrity_name?: string
      celebrity_domain?: string
      similarity_percentage?: number
      common_traits?: string[]
      celebrity_style_description?: string
      fun_fact?: string
      error?: string
    }
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      console.error('[analyze] JSON parse error, raw:', jsonStr)
      throw new Error('Impossible de parser la réponse de Claude')
    }

    if (parsed.error) throw new Error(`Claude : ${parsed.error}`)

    // Map Anthropic response fields → internal CelebrityResult shape
    const result = {
      name: parsed.celebrity_name ?? 'Célébrité inconnue',
      celebrity_domain: parsed.celebrity_domain ?? '',
      score: parsed.similarity_percentage ?? 75,
      traits: parsed.common_traits ?? [],
      celebrity_style_description: parsed.celebrity_style_description ?? '',
      fun_fact: parsed.fun_fact ?? '',
    }

    // ── Log in Supabase (non-blocking) ──────────────────────────────────────
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
