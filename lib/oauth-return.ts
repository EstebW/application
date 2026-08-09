/** Contexte funnel sauvegardé avant redirect Google OAuth. */

const STORAGE_KEY = 'sf_oauth_return'

export type OAuthReturnContext = {
  intent: 'funnel' | 'dashboard'
  sessionId?: string
  appMode?: 'match' | 'custom' | null
  celebrity?: {
    name: string
    score: number
    traits?: string[]
    celebrity_domain?: string
    celebrity_style_description?: string
    fun_fact?: string
  } | null
  celebrityPhoto?: string
  photoPreview?: string
  analysisId?: string
  creationMode?: 'full_generation' | 'photo_edit'
  basePhoto?: string
  userHeightCm?: number
  createdAt: number
}

const MAX_INLINE_BYTES = 80_000

function trimLargeStrings<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj }
  for (const key of Object.keys(out)) {
    const v = out[key]
    if (typeof v === 'string' && v.length > MAX_INLINE_BYTES) {
      delete out[key]
    }
  }
  return out
}

export function saveOAuthReturnContext(ctx: Omit<OAuthReturnContext, 'createdAt'>) {
  try {
    const payload = trimLargeStrings({
      ...ctx,
      createdAt: Date.now(),
    } as OAuthReturnContext & Record<string, unknown>)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    try {
      const { photoPreview: _p, basePhoto: _b, celebrityPhoto: _c, ...rest } = ctx
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...rest, createdAt: Date.now() })
      )
    } catch {
      // ignore
    }
  }
}

export function readOAuthReturnContext(): OAuthReturnContext | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as OAuthReturnContext
    if (!parsed?.intent) return null
    // Expire après 1h
    if (Date.now() - (parsed.createdAt || 0) > 60 * 60 * 1000) {
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearOAuthReturnContext() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
