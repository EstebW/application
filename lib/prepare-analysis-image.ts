/** Taille max côté long pour l'analyse faciale — suffisant pour la morphologie, allège le payload KIE. */
export const ANALYSIS_IMAGE_MAX_SIDE = 1280

/** Seuil base64 (~600 Ko) en dessous duquel on ne recompresse pas. */
const SKIP_RECOMPRESS_BELOW_CHARS = 600_000

/**
 * Redimensionne et compresse la selfie avant envoi à l'edge `analyze`.
 * Réduit timeouts et erreurs WORKER_RESOURCE_LIMIT sur grosses photos mobile.
 */
export async function prepareAnalysisImage(
  dataUrl: string,
  maxSide = ANALYSIS_IMAGE_MAX_SIDE,
): Promise<string> {
  if (typeof document === 'undefined') return dataUrl
  if (dataUrl.length < SKIP_RECOMPRESS_BELOW_CHARS && !dataUrl.startsWith('data:image/png')) {
    return dataUrl
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const longest = Math.max(img.width, img.height)
      const scale = longest > maxSide ? maxSide / longest : 1
      if (scale >= 1 && dataUrl.length < SKIP_RECOMPRESS_BELOW_CHARS) {
        resolve(dataUrl)
        return
      }

      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.88))
    }
    img.onerror = () => reject(new Error('Impossible de préparer la photo pour l\'analyse'))
    img.src = dataUrl
  })
}
