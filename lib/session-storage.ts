const SESSION_KEY = 'mjc_session_id'
const EMAIL_KEY = 'mjc_email'
const HAS_GENERATION_KEY = 'mjc_has_generation'

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

export function clearStoredSession() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(EMAIL_KEY)
  localStorage.removeItem(HAS_GENERATION_KEY)
}
