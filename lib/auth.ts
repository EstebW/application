import { supabase } from '@/lib/supabase'

export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
  })
  if (error) throw error
  return data
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })
  if (error) throw error
  return data
}

/**
 * Connexion / inscription Google via Supabase OAuth.
 * Redirige vers Google puis revient sur `/auth/callback?next=…`.
 */
export async function signInWithGoogle(nextPath = '/dashboard') {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getAuthUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export function formatAuthError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials')) {
    return 'Email ou mot de passe incorrect.'
  }
  if (lower.includes('user already registered')) {
    return 'Un compte existe déjà avec cet email. Connecte-toi.'
  }
  if (lower.includes('password') && lower.includes('6')) {
    return 'Le mot de passe doit contenir au moins 6 caractères.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Confirme ton email avant de te connecter.'
  }
  if (lower.includes('provider is not enabled') || lower.includes('unsupported provider')) {
    return 'Connexion Google pas encore activée. Utilise email / mot de passe.'
  }
  if (lower.includes('oauth') || lower.includes('access_denied')) {
    return 'Connexion Google annulée ou refusée.'
  }
  return message
}
