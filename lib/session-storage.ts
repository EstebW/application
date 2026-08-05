import { isValidUserHeightCm } from './height'

const SESSION_KEY = 'mjc_session_id'
const EMAIL_KEY = 'mjc_email'
const HAS_GENERATION_KEY = 'mjc_has_generation'
const USER_HEIGHT_KEY = 'mjc_user_height_cm'

export function getStoredSessionId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(SESSION_KEY)
}

export function setStoredSessionId(sessionId: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(SESSION_KEY, sessionId)
}

export function getStoredEmail(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(EMAIL_KEY)
}

export function setStoredEmail(email: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(EMAIL_KEY, email)
}

export function hasCompletedGeneration(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(HAS_GENERATION_KEY) === '1'
}

export function setHasCompletedGeneration() {
  if (typeof window === 'undefined') return
  localStorage.setItem(HAS_GENERATION_KEY, '1')
}

/** Taille déclarée — préremplit le champ lors des parcours suivants. */
export function getStoredUserHeightCm(): number | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(USER_HEIGHT_KEY)
  if (!raw) return null
  const value = Number(raw)
  return isValidUserHeightCm(value) ? value : null
}

export function setStoredUserHeightCm(heightCm: number) {
  if (typeof window === 'undefined') return
  if (!isValidUserHeightCm(heightCm)) return
  localStorage.setItem(USER_HEIGHT_KEY, String(heightCm))
}

export function clearStoredSession() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(EMAIL_KEY)
  localStorage.removeItem(HAS_GENERATION_KEY)
  localStorage.removeItem(USER_HEIGHT_KEY)
}
