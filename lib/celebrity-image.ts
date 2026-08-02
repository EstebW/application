/** Prénom affiché sous le portrait (premier mot du nom). */
export function getCelebrityFirstName(fullName: string): string {
  const trimmed = fullName.trim()
  if (!trimmed) return ''
  return trimmed.split(/\s+/)[0] ?? trimmed
}

const cache = new Map<string, string | null>()

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

/** Prefetch sans bloquer l’UI (ex. dès que le nom est connu après l’analyse). */
export function prefetchCelebrityImage(name: string): void {
  void resolveCelebrityImageUrl(name)
}
