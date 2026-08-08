const STORAGE_KEY = 'sf_checkout_return'

export type CheckoutReturnContext = {
  returnTo: 'home' | 'dashboard'
  appMode?: 'match' | 'custom' | null
  generationId?: string
  /** Snapshot minimal pour reprendre le funnel après redirect Stripe */
  celebrity?: {
    name: string
    score: number
    traits?: string[]
    description?: string
    imageUrl?: string
  } | null
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
      // Évite de faire exploser sessionStorage avec des data-URL photo
      delete out[key]
    }
  }
  return out
}

export function saveCheckoutReturnContext(ctx: Omit<CheckoutReturnContext, 'createdAt'>) {
  try {
    const payload = trimLargeStrings({
      ...ctx,
      createdAt: Date.now(),
    } as CheckoutReturnContext & Record<string, unknown>)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // private mode / quota / unavailable — on retente sans images
    try {
      const { photoPreview: _p, basePhoto: _b, ...rest } = ctx
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...rest, createdAt: Date.now() })
      )
    } catch {
      // ignore
    }
  }
}

export function readCheckoutReturnContext(): CheckoutReturnContext | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CheckoutReturnContext
  } catch {
    return null
  }
}

export function clearCheckoutReturnContext() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
