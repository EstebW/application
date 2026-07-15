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
  return message
}
