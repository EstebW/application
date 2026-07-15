export interface AccountAnalysis {
  id: string
  celebrity_name: string
  score: number
  traits: string[]
  description: string | null
  created_at: string
}

export interface AccountGeneration {
  id: string
  celebrity_name: string
  unlocked: boolean
  scene_summary: string | null
  created_at: string
  analysis_id: string | null
}

export interface AccountTransaction {
  id: string
  amount: number
  reason: string
  created_at: string
}

export interface AccountData {
  sessionId: string
  email: string | null
  firstName: string | null
  creditsBalance: number
  subscriptionPlan: string | null
  subscriptionExpiresAt: string | null
  analyses: AccountAnalysis[]
  generations: AccountGeneration[]
  transactions: AccountTransaction[]
}
