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
    const body = await req.json() as {
      sessionId?: string
      email?: string
      firstName?: string
    }

    const { sessionId, email, firstName } = body

    // Validate required fields — only return 400 for client errors
    if (!email?.trim()) {
      return new Response(
        JSON.stringify({ error: 'email requis' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      return new Response(
        JSON.stringify({ error: 'Email invalide' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Save to DB — non-blocking: if it fails, still let the user through
    if (sessionId) {
      try {
        const db = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          { auth: { persistSession: false } }
        )

        const { error: dbError } = await db
          .from('sessions')
          .update({
            email: email.toLowerCase().trim(),
            first_name: firstName?.trim() ?? null,
          })
          .eq('id', sessionId)

        if (dbError) {
          // Log for debugging but don't block the user
          console.warn('[register] DB update failed (schema may be missing columns):', getErrorMessage(dbError))
        }
      } catch (dbErr) {
        console.warn('[register] DB exception:', getErrorMessage(dbErr))
        // Non-blocking — user continues regardless
      }
    } else {
      console.warn('[register] No sessionId — email not persisted:', email)
    }

    // Always return success if email is valid — DB persistence is best-effort
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = getErrorMessage(err)
    console.error('[register] Unexpected error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
