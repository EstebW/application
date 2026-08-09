import { createClient, type User } from '@supabase/supabase-js'

/**
 * Résout l’utilisateur depuis le header Authorization Bearer (JWT).
 * Ne jamais faire confiance à un userId envoyé dans le body seul.
 */
export async function getRequestAuthUser(req: Request): Promise<User | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const jwt = authHeader.slice('Bearer '.length).trim()
  if (!jwt) return null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anon) return null
  if (jwt === anon) return null

  try {
    const client = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await client.auth.getUser(jwt)
    if (error || !data.user) return null
    return data.user
  } catch {
    return null
  }
}

export async function requireRequestAuthUser(req: Request): Promise<User | Response> {
  const user = await getRequestAuthUser(req)
  if (!user) {
    return Response.json({ error: 'Connexion requise' }, { status: 401 })
  }
  return user
}
