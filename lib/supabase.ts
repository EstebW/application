import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Browser-safe client (anon key)
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

// Server-side client — uses service role key when available for API routes
export function createServerClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? supabaseAnonKey
  return createClient<Database>(supabaseUrl, key, {
    auth: { persistSession: false },
  })
}
