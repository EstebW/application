/**
 * LEGACY — désactivé.
 * Les crédits ne sont plus accordés ici (faille : mint sans Stripe).
 * Utiliser uniquement /api/stripe/checkout + webhook.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  return new Response(
    JSON.stringify({
      error: 'Endpoint désactivé. Utilise le paiement Stripe (Checkout).',
      code: 'PAYMENT_EDGE_DISABLED',
    }),
    {
      status: 410,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    },
  )
})
