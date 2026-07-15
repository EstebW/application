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
          email: string | null
          first_name: string | null
          user_id: string | null
          credits_balance: number
          subscription_plan: string | null
          subscription_expires_at: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          user_agent?: string | null
          ip_hash?: string | null
          email?: string | null
          first_name?: string | null
          user_id?: string | null
          credits_balance?: number
          subscription_plan?: string | null
          subscription_expires_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['sessions']['Insert']>
        Relationships: []
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
        Relationships: []
      }
      generations: {
        Row: {
          id: string
          session_id: string
          analysis_id: string | null
          celebrity_name: string
          unlocked: boolean
          scene_summary: string | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          analysis_id?: string | null
          celebrity_name: string
          unlocked?: boolean
          scene_summary?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['generations']['Insert']>
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          session_id: string
          generation_id: string | null
          amount_cents: number
          currency: string
          method: string | null
          plan: string | null
          credits_granted: number | null
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
          plan?: string | null
          credits_granted?: number | null
          status?: 'pending' | 'completed' | 'failed'
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['payments']['Insert']>
        Relationships: []
      }
      credit_transactions: {
        Row: {
          id: string
          session_id: string
          amount: number
          reason: 'payment' | 'generation' | 'refund' | 'bonus'
          reference_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          amount: number
          reason: 'payment' | 'generation' | 'refund' | 'bonus'
          reference_id?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['credit_transactions']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
