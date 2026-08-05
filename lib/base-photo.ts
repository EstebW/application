/**
 * Validation de la photo de base du mode « Ajouter la star à ma photo ».
 *
 * Deux niveaux :
 * - erreurs bloquantes : format, poids, image illisible, dimensions trop faibles ;
 * - avertissements non bloquants : cadrage serré, image sombre ou floue.
 *
 * Un critère visuel incertain ne bloque jamais l'utilisateur : on avertit.
 */

/** Aligné sur les formats déjà acceptés par les autres uploads du projet. */
export const ACCEPTED_BASE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Le bucket temp-images accepte 30 Mo, mais 10 Mo suffisent et évitent les envois lents. */
export const MAX_BASE_PHOTO_BYTES = 10 * 1024 * 1024

const MIN_SIDE_PX = 512
const DARK_MEAN_THRESHOLD = 45
const BLUR_VARIANCE_THRESHOLD = 90
const TIGHT_FACE_RATIO = 0.22

export interface BasePhotoValidation {
  ok: boolean
  /** Message bloquant — l'utilisateur doit changer de photo */
  error?: string
  /** Messages informatifs — l'utilisateur peut continuer */
  warnings: string[]
  width?: number
  height?: number
}

export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(mb < 10 ? 1 : 0)} Mo`
}

export function validateBasePhotoFile(file: File): { ok: boolean; error?: string } {
  if (!ACCEPTED_BASE_PHOTO_TYPES.includes(file.type as (typeof ACCEPTED_BASE_PHOTO_TYPES)[number])) {
    return { ok: false, error: 'Format non pris en charge. Utilise un fichier JPEG, PNG ou WebP.' }
  }
  if (file.size > MAX_BASE_PHOTO_BYTES) {
    return {
      ok: false,
      error: `Photo trop lourde (${formatBytes(file.size)}). Maximum ${formatBytes(MAX_BASE_PHOTO_BYTES)}.`,
    }
  }
  return { ok: true }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode failed'))
    img.src = src
  })
}

/** Luminance moyenne + variance des différences voisines (proxy de netteté). */
function analysePixels(img: HTMLImageElement): { mean: number; variance: number } | null {
  const targetWidth = 240
  const scale = Math.min(1, targetWidth / img.naturalWidth)
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  ctx.drawImage(img, 0, 0, w, h)

  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, w, h).data
  } catch {
    return null
  }

  const gray = new Float32Array(w * h)
  let sum = 0
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    const v = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]
    gray[i] = v
    sum += v
  }
  const mean = sum / (w * h)

  // Variance du laplacien 4-voisins : faible = image floue.
  let lapSum = 0
  let lapSqSum = 0
  let count = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const lap = gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w] - 4 * gray[i]
      lapSum += lap
      lapSqSum += lap * lap
      count++
    }
  }
  if (count === 0) return { mean, variance: Number.POSITIVE_INFINITY }
  const lapMean = lapSum / count
  const variance = lapSqSum / count - lapMean * lapMean

  return { mean, variance }
}

type FaceDetectorLike = {
  detect: (source: HTMLImageElement) => Promise<{ boundingBox: { width: number; height: number } }[]>
}

/** FaceDetector n'existe que sur certains navigateurs : purement optionnel. */
async function analyseFraming(img: HTMLImageElement): Promise<string | null> {
  const ctor = (window as unknown as {
    FaceDetector?: new (opts?: { fastMode?: boolean }) => FaceDetectorLike
  }).FaceDetector
  if (!ctor) return null

  try {
    const detector = new ctor({ fastMode: true })
    const faces = await detector.detect(img)
    if (faces.length === 0) {
      return 'Aucun visage détecté avec certitude. Vérifie que ton visage est bien visible.'
    }
    const area = img.naturalWidth * img.naturalHeight
    const biggest = faces.reduce((max, f) => {
      const a = f.boundingBox.width * f.boundingBox.height
      return a > max ? a : max
    }, 0)
    if (biggest / area > TIGHT_FACE_RATIO) {
      return 'La photo semble assez serrée. La star risque d\'être difficile à intégrer naturellement.'
    }
    if (faces.length > 1) {
      return 'Plusieurs visages détectés. Une seule personne principale donne un meilleur résultat.'
    }
  } catch {
    return null
  }
  return null
}

/** Analyse la photo déjà encodée en data URL (ou URL blob). */
export async function validateBasePhotoSource(src: string): Promise<BasePhotoValidation> {
  const warnings: string[] = []

  let img: HTMLImageElement
  try {
    img = await loadImage(src)
  } catch {
    return { ok: false, error: 'Impossible de lire cette image. Essaie un autre fichier.', warnings }
  }

  const { naturalWidth: width, naturalHeight: height } = img
  if (!width || !height) {
    return { ok: false, error: 'Impossible de lire cette image. Essaie un autre fichier.', warnings }
  }
  if (Math.min(width, height) < MIN_SIDE_PX) {
    return {
      ok: false,
      error: `Photo trop petite (${width}×${height} px). Il faut au moins ${MIN_SIDE_PX} px sur le plus petit côté.`,
      warnings,
      width,
      height,
    }
  }

  const pixels = analysePixels(img)
  if (pixels) {
    if (pixels.mean < DARK_MEAN_THRESHOLD) {
      warnings.push('La photo est très sombre. Le rendu risque d\'être moins réaliste.')
    }
    if (pixels.variance < BLUR_VARIANCE_THRESHOLD) {
      warnings.push('La photo semble un peu floue. Une photo nette donne un meilleur résultat.')
    }
  }

  const framing = await analyseFraming(img)
  if (framing) warnings.push(framing)

  return { ok: true, warnings, width, height }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') resolve(result)
      else reject(new Error('read failed'))
    }
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
}
