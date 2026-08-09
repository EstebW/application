/**
 * Rôles applicatifs StarFusion.
 * Source de vérité : table `user_roles` (lecture service-role uniquement).
 * Le client ne peut jamais s’auto-attribuer un rôle.
 */

export const APP_ROLES = ['user', 'admin', 'super_admin'] as const

export type AppRole = (typeof APP_ROLES)[number]

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (APP_ROLES as readonly string[]).includes(value)
}

export function normalizeAppRole(value: unknown): AppRole {
  return isAppRole(value) ? value : 'user'
}

/** Accès admin (réservé — pas de bypass crédits aujourd’hui). */
export function isAdmin(role: AppRole | null | undefined): boolean {
  return role === 'admin' || role === 'super_admin'
}

export function isSuperAdmin(role: AppRole | null | undefined): boolean {
  return role === 'super_admin'
}

/**
 * Bypass paywall / crédits / débit.
 * Utiliser uniquement après résolution serveur du rôle (jamais depuis un body client).
 */
export function hasUnlimitedAccess(role: AppRole | null | undefined): boolean {
  return isSuperAdmin(role)
}

export type RoleBearer = {
  role?: AppRole | null
  hasUnlimitedAccess?: boolean | null
}

/** Helper UI : lit le flag renvoyé par l’edge `account` (affichage seulement). */
export function accountHasUnlimitedAccess(account: RoleBearer | null | undefined): boolean {
  if (!account) return false
  if (account.hasUnlimitedAccess === true) return true
  return hasUnlimitedAccess(account.role)
}
