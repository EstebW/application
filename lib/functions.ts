/**
 * Appelle une Supabase Edge Function.
 * Utilise le JWT utilisateur s'il est connecté (sinon la clé anon).
 */

import { supabase } from '@/lib/supabase'

const FUNCTIONS_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1'

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

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
  let token = ANON_KEY
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) token = session.access_token
  } catch {
    // fallback anon
  }

  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`)
    let message = text
    let code: string | undefined
    try {
      const parsed = JSON.parse(text) as { error?: string; code?: string; message?: string }
      if (parsed.error) message = parsed.error
      else if (parsed.message) message = parsed.message
      code = parsed.code
    } catch {
      // texte brut
    }
    throw new FunctionCallError(message, res.status, code)
  }

  return res.json() as Promise<T>
}
