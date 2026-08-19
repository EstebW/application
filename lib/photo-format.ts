/** Formats supportés par KIE Nano Banana 2 (sous-ensemble UX). */
export const PHOTO_ASPECT_RATIOS = [
  'auto',
  '1:1',
  '4:3',
  '3:4',
  '16:9',
  '9:16',
] as const

export type PhotoAspectRatio = (typeof PHOTO_ASPECT_RATIOS)[number]

export const DEFAULT_PHOTO_ASPECT_RATIO: PhotoAspectRatio = '4:3'

export interface PhotoAspectRatioOption {
  id: PhotoAspectRatio
  label: string
  hint: string
}

export const PHOTO_ASPECT_RATIO_OPTIONS: PhotoAspectRatioOption[] = [
  { id: 'auto', label: 'Auto', hint: 'Comme ta photo source' },
  { id: '1:1', label: 'Carré', hint: '1:1 · fil Instagram' },
  { id: '4:3', label: 'Classique', hint: '4:3 · photo standard' },
  { id: '3:4', label: 'Portrait', hint: '3:4 · vertical' },
  { id: '16:9', label: 'Paysage', hint: '16:9 · écran large' },
  { id: '9:16', label: 'Story', hint: '9:16 · Reels / TikTok' },
]

export function isValidPhotoAspectRatio(value: unknown): value is PhotoAspectRatio {
  return typeof value === 'string' && (PHOTO_ASPECT_RATIOS as readonly string[]).includes(value)
}

export function normalizePhotoAspectRatio(value: unknown): PhotoAspectRatio {
  return isValidPhotoAspectRatio(value) ? value : DEFAULT_PHOTO_ASPECT_RATIO
}
