import { supabase } from '@/lib/supabase'

/** Headers Authorization pour les routes API Next (JWT utilisateur). */
export async function getClientAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`
    }
  } catch {
    // ignore
  }
  return headers
}
