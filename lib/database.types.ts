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
          owned_at: string | null
          /** Taille déclarée par l'utilisateur, en centimètres */
          height_cm: number | null
          stripe_customer_id: string | null
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
          owned_at?: string | null
          height_cm?: number | null
          stripe_customer_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['sessions']['Insert']>
        Relationships: []
      }
      celebrity_heights: {
        Row: {
          celebrity_id: string
          display_name: string
          height_cm: number | null
          source_url: string | null
          verified_at: string | null
          confidence: 'verified' | 'probable' | 'unknown'
          manual_override: boolean
          lookup_attempts: number
          last_attempt_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          celebrity_id: string
          display_name: string
          height_cm?: number | null
          source_url?: string | null
          verified_at?: string | null
          confidence?: 'verified' | 'probable' | 'unknown'
          manual_override?: boolean
          lookup_attempts?: number
          last_attempt_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['celebrity_heights']['Insert']>
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
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          stripe_invoice_id: string | null
          stripe_subscription_id: string | null
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
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_invoice_id?: string | null
          stripe_subscription_id?: string | null
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
