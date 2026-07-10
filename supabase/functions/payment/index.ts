import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const { sessionId, generationId, method } = await req.json() as {
      sessionId: string
      generationId?: string
      method: string
    }

    if (!sessionId) throw new Error('sessionId requis')

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    )

    // Create payment record
    const { data: payment, error } = await db
      .from('payments')
      .insert({
        session_id: sessionId,
        generation_id: generationId ?? null,
        amount_cents: 199,
        currency: 'EUR',
        method,
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) throw error

    // Mark completed (mock — Stripe webhook would do this in production)
    await db.from('payments').update({ status: 'completed' }).eq('id', payment.id)

    // Unlock generation
    if (generationId) {
      await db.from('generations').update({ unlocked: true }).eq('id', generationId)
    }

    return new Response(
      JSON.stringify({ paymentId: payment.id, status: 'completed' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
