/**
 * Appelle une Supabase Edge Function ou une route API locale.
 * La clé anon est publique (NEXT_PUBLIC_) — c'est attendu côté client.
 * Les secrets sensibles (KIE_API_KEY, service role) restent côté serveur.
 */

const FUNCTIONS_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1'

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// Fonctions exécutées localement via Next.js API (Nano Banana 2 + KIE_API_KEY)
const LOCAL_API_FUNCTIONS = new Set(['generate', 'analyze'])

export async function callFunction<T = unknown>(
  name: string,
  body?: Record<string, unknown>
): Promise<T> {
  if (LOCAL_API_FUNCTIONS.has(name)) {
    const res = await fetch(`/api/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => `HTTP ${res.status}`)
      throw new Error(text)
    }

    return res.json() as Promise<T>
  }

  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`)
    throw new Error(text)
  }

  return res.json() as Promise<T>
}
