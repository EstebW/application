import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

function getPublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ''
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? ''
  return { url, anonKey }
}

let browserClient: SupabaseClient<Database> | null = null

function getBrowserClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient

  const { url, anonKey } = getPublicConfig()
  if (!url || !anonKey) {
    throw new Error('Configuration Supabase manquante (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY)')
  }

  browserClient = createClient<Database>(url, anonKey)
  return browserClient
}

/** Client browser — initialisation lazy (safe au build Vercel) */
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    const client = getBrowserClient()
    const value = Reflect.get(client, prop, client)
    return typeof value === 'function' ? value.bind(client) : value
  },
})

/** Client serveur — service role si dispo, sinon anon */
export function createServerClient() {
  const { url, anonKey } = getPublicConfig()
  if (!url || !anonKey) {
    throw new Error('Configuration Supabase manquante (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY)')
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || anonKey
  return createClient<Database>(url, key, {
    auth: { persistSession: false },
  })
}
