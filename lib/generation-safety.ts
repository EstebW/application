/**
 * Détection safety Google + retry preset — miroir de supabase/functions/generate/index.ts
 * pour tests Node. Garder aligné avec l’edge function.
 */
import { getInteractionPrompt } from './interactions.ts'
import type { CelebrityCreationMode } from './types.ts'

export const GOOGLE_SAFETY_MARKERS = [
  'prohibited use',
  'filtered out',
  'violated google',
  'blocked by google',
  'generative ai prohibited use policy',
  'safety filter',
] as const

export function hasGoogleSafetyMarker(lower: string): boolean {
  if (GOOGLE_SAFETY_MARKERS.some((m) => lower.includes(m))) return true
  if (lower.includes('safety') && lower.includes('google')) return true
  return false
}

export function isGoogleSafetyBlockedMessage(msg: string): boolean {
  const lower = msg.toLowerCase()
  if (hasGoogleSafetyMarker(lower)) return true
  if (lower.includes('no images found in ai response') && hasGoogleSafetyMarker(lower)) {
    return true
  }
  return false
}

export type StoredRetryContext = {
  celebrityName: string
  celebrityDomain?: string
  mode: 'presets' | 'custom'
  creationMode?: CelebrityCreationMode
  sceneSource?: 'invented' | 'user_photo'
  scene?: { location: string; outfits: string; position: string }
  customPrompt?: string
  interaction?: string
  hasCelebrityReferenceImage?: boolean
  celebrityPlacementInstruction?: string
  userHeightCm?: number
  celebrityHeightCm?: number | null
  celebrityTargetApparentHeightRatio?: number
}

/** Limite UI / exemples StarFusion — prompts libres raisonnables. */
export const REASONABLE_CUSTOM_MAX_CHARS = 600

/** Contenu réellement interdit — pas l'humour absurde ou « limite mais drôle ». */
const PROHIBITED_PROMPT_PATTERNS = [
  /\b(nu|nue|nus|nues|naked|nude|nudité|nudite|nudity)\b/i,
  /\b(porn|porno|xxx|hentai|onlyfans)\b/i,
  /\b(fellation|pénis|penis|vagin|orgasm|intercourse|blowjob|handjob)\b/i,
  /\b(gore|décapit|decapit|dismember|massacre|torture)\b/i,
  /\b(pédoph|pedoph|child porn|cp\b)/i,
  /\b(nazi|racist slur|white power|heil hitler)\b/i,
  /\b(suicide bomb|terror attack|school shooting)\b/i,
] as const

export function isProhibitedPromptContent(text: string): boolean {
  return PROHIBITED_PROMPT_PATTERNS.some((pattern) => pattern.test(text))
}

/** Prompt libre raisonnable — scènes absurdes / drôles OK, contenu explicite interdit. */
export function isReasonableCustomPrompt(text: string | undefined): boolean {
  if (!text?.trim()) return false
  const t = text.trim()
  if (t.length > REASONABLE_CUSTOM_MAX_CHARS) return false
  if (isProhibitedPromptContent(t)) return false
  return true
}

/** @deprecated Utiliser isReasonableCustomPrompt */
export const isInnocuousCustomPrompt = isReasonableCustomPrompt

export function isSafetyRetryEligible(
  ctx: StoredRetryContext,
  hasCustomPrompt: boolean,
): boolean {
  if (hasCustomPrompt) {
    if (!isReasonableCustomPrompt(ctx.customPrompt)) return false
    return ctx.mode === 'custom' || ctx.creationMode === 'photo_edit'
  }
  return (
    ctx.mode === 'presets' ||
    ctx.creationMode === 'photo_edit' ||
    ctx.sceneSource === 'user_photo' ||
    Boolean(getInteractionPrompt(ctx.interaction))
  )
}
