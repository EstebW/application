/**
 * Appelle une Supabase Edge Function.
 * La clé anon est publique (NEXT_PUBLIC_) — c'est attendu côté client.
 * Les secrets sensibles (KIE_API_KEY, service role) restent dans les Edge Functions.
 */

const FUNCTIONS_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1'

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export async function callFunction<T = unknown>(
  name: string,
  body?: Record<string, unknown>
): Promise<T> {
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
