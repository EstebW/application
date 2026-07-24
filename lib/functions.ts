/**
 * Appelle une Supabase Edge Function.
 * La clé anon est publique (NEXT_PUBLIC_) — c'est attendu côté client.
 * Les secrets sensibles (KIE_API_KEY, service role) restent côté Edge Functions.
 */

const FUNCTIONS_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1'

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

/**
 * Erreur enrichie avec le status HTTP réel et le code d'erreur métier (si fourni
 * par l'Edge Function), pour éviter toute confusion entre une vraie erreur
 * "crédits app insuffisants" (status 402 + code APP_CREDITS_INSUFFICIENT) et
 * une erreur du fournisseur IA (kie.ai) dont le message peut aussi contenir
 * des mots comme "402" ou "credit" sans rapport avec le compte de l'utilisateur.
 */
export class FunctionCallError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'FunctionCallError'
    this.status = status
    this.code = code
  }
}

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
    let message = text
    let code: string | undefined
    try {
      const parsed = JSON.parse(text) as { error?: string; code?: string }
      if (parsed.error) message = parsed.error
      code = parsed.code
    } catch {
      // pas du JSON
    }
    throw new FunctionCallError(message, res.status, code)
  }

  return res.json() as Promise<T>
}
