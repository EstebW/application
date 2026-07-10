export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string
          created_at: string
          user_agent: string | null
          ip_hash: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          user_agent?: string | null
          ip_hash?: string | null
        }
        Update: Partial<Database['public']['Tables']['sessions']['Insert']>
      }
      analyses: {
        Row: {
          id: string
          session_id: string
          celebrity_name: string
          score: number
          traits: string[]
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          celebrity_name: string
          score: number
          traits: string[]
          description?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['analyses']['Insert']>
      }
      generations: {
        Row: {
          id: string
          session_id: string
          analysis_id: string | null
          celebrity_name: string
          unlocked: boolean
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          analysis_id?: string | null
          celebrity_name: string
          unlocked?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['generations']['Insert']>
      }
      payments: {
        Row: {
          id: string
          session_id: string
          generation_id: string | null
          amount_cents: number
          currency: string
          method: string | null
          status: 'pending' | 'completed' | 'failed'
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          generation_id?: string | null
          amount_cents: number
          currency?: string
          method?: string | null
          status?: 'pending' | 'completed' | 'failed'
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['payments']['Insert']>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
