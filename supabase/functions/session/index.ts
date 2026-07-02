import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as Record<string, unknown>).message)
  }
  return String(err)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    const userAgent = req.headers.get('user-agent') ?? null

    const { data, error } = await db
      .from('sessions')
      .insert({ user_agent: userAgent })
      .select('id')
      .single()

    if (error) {
      console.error('[session] DB error:', getErrorMessage(error))
      // Return a fallback client-side UUID if DB fails (graceful degradation)
      const fallbackId = crypto.randomUUID()
      console.warn('[session] Using fallback UUID:', fallbackId, '— check if sessions table exists')
      return new Response(
        JSON.stringify({ sessionId: fallbackId, fallback: true }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ sessionId: data.id }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = getErrorMessage(err)
    console.error('[session] Unexpected error:', message)
    // Always return a usable sessionId so the app doesn't get stuck
    const fallbackId = crypto.randomUUID()
    return new Response(
      JSON.stringify({ sessionId: fallbackId, fallback: true }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
