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
  /** null pour les générations créées avant l'ajout du choix de mode */
  creation_mode?: 'full_generation' | 'photo_edit' | null
}

export interface AccountTransaction {
  id: string
  amount: number
  reason: string
  created_at: string
  /** Libellé lisible (ex. « Abonnement hebdomadaire », « Photo avec Messi ») */
  label?: string | null
  reference_id?: string | null
}

export interface AccountData {
  sessionId: string
  email: string | null
  firstName: string | null
  creditsBalance: number
  subscriptionPlan: string | null
  subscriptionExpiresAt: string | null
  /** Client Stripe lié au compte — requis pour le Customer Portal */
  stripeCustomerId?: string | null
  /** Taille déclarée — absente tant que l'utilisateur n'a pas fait le parcours « Choisis ta star » */
  heightCm?: number | null
  /** Rôle résolu côté serveur (table user_roles) — affichage uniquement */
  role?: 'user' | 'admin' | 'super_admin'
  /** Bypass paywall / crédits — source de vérité serveur, jamais inventé côté client */
  hasUnlimitedAccess?: boolean
  analyses: AccountAnalysis[]
  generations: AccountGeneration[]
  transactions: AccountTransaction[]
}

function accountIsUnlimited(account: AccountData): boolean {
  if (account.hasUnlimitedAccess === true) return true
  return account.role === 'super_admin'
}

/**
 * Compte déjà actif (crédits ou achat passé) : pas de teaser flouté « déverrouiller son jumeau ».
 */
export function accountCanSkipTwinUnlock(account: AccountData | null | undefined): boolean {
  if (!account) return false
  if (accountIsUnlimited(account)) return true
  if (account.creditsBalance > 0) return true
  return account.transactions.some((t) => t.amount > 0)
}

/** Peut révéler le jumeau sans repasser par la page paiement. */
export function accountCanRevealTwin(account: AccountData | null | undefined): boolean {
  if (!account) return false
  if (accountIsUnlimited(account)) return true
  return account.creditsBalance > 0
}
