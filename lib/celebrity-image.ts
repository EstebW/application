/** Prénom affiché sous le portrait (premier mot du nom). */
export function getCelebrityFirstName(fullName: string): string {
  const trimmed = fullName.trim()
  if (!trimmed) return ''
  return trimmed.split(/\s+/)[0] ?? trimmed
}

const cache = new Map<string, string | null>()
const dataUrlCache = new Map<string, string | null>()

const WIKI_UA = 'StarFusion/1.0 (https://starfusion.app; celebrity portrait lookup)'
const WIKI_MAX_PORTRAIT_BYTES = 4 * 1024 * 1024

type WikiSummary = {
  type?: string
  thumbnail?: { source?: string }
  originalimage?: { source?: string }
}

async function isWikiImageWithinSizeLimit(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': WIKI_UA } })
    if (!res.ok) return false
    const len = res.headers.get('content-length')
    if (!len) return true
    const bytes = parseInt(len, 10)
    return Number.isFinite(bytes) && bytes <= WIKI_MAX_PORTRAIT_BYTES
  } catch {
    return false
  }
}

async function resolveWikiPortraitUrl(data: WikiSummary): Promise<string | null> {
  const original = data.originalimage?.source ?? null
  const thumbnail = data.thumbnail?.source ?? null
  if (original && await isWikiImageWithinSizeLimit(original)) return original
  if (thumbnail) return thumbnail
  return original
}

async function fetchWikiThumb(lang: 'fr' | 'en', title: string): Promise<string | null> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': WIKI_UA },
  })
  if (!res.ok) return null
  const data = (await res.json()) as WikiSummary
  if (data.type === 'disambiguation') return null
  return resolveWikiPortraitUrl(data)
}

/** Portrait Wikipedia FR puis EN — utilisable côté serveur ou client (via /api). */
export async function fetchCelebrityWikiImageUrl(name: string): Promise<string | null> {
  const trimmed = name.trim()
  if (!trimmed) return null
  const fr = await fetchWikiThumb('fr', trimmed)
  if (fr) return fr
  return fetchWikiThumb('en', trimmed)
}

/**
 * Résout une URL de portrait pour une célébrité (Wikipedia FR puis EN).
 * Utilise le cache mémoire pour éviter les appels répétés.
 */
export async function resolveCelebrityImageUrl(name: string): Promise<string | null> {
  const key = name.trim().toLowerCase()
  if (!key) return null
  if (cache.has(key)) return cache.get(key) ?? null

  try {
    const res = await fetch(`/api/celebrity-image?name=${encodeURIComponent(name.trim())}`)
    if (!res.ok) {
      cache.set(key, null)
      return null
    }
    const data = (await res.json()) as { url?: string | null }
    const url = data.url ?? null
    cache.set(key, url)
    return url
  } catch {
    cache.set(key, null)
    return null
  }
}

/** Convertit un portrait Wikipedia en data URL (fallback client si l’edge n’a pas la 2e ref). */
export async function resolveCelebrityImageDataUrl(name: string): Promise<string | null> {
  const key = name.trim().toLowerCase()
  if (!key) return null
  if (dataUrlCache.has(key)) return dataUrlCache.get(key) ?? null

  try {
    const res = await fetch(`/api/celebrity-image?name=${encodeURIComponent(name.trim())}&format=dataurl`)
    if (!res.ok) {
      dataUrlCache.set(key, null)
      return null
    }
    const data = (await res.json()) as { dataUrl?: string | null }
    const dataUrl = data.dataUrl ?? null
    dataUrlCache.set(key, dataUrl)
    return dataUrl
  } catch {
    dataUrlCache.set(key, null)
    return null
  }
}

/** Prefetch sans bloquer l’UI (ex. dès que le nom est connu après l’analyse). */
export function prefetchCelebrityImage(name: string): void {
  void resolveCelebrityImageUrl(name)
}
