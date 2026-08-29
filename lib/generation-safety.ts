/**
 * Détection safety Google + retry preset — miroir de supabase/functions/generate/index.ts
 * pour tests Node. Garder aligné avec l’edge function.
 */
import { SELFIE_POV_INTERACTION_PROMPT, getInteractionPrompt } from './interactions.ts'
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
  interaction?: string
  hasCelebrityReferenceImage?: boolean
  celebrityPlacementInstruction?: string
  userHeightCm?: number
  celebrityHeightCm?: number | null
  celebrityTargetApparentHeightRatio?: number
}

export function isSafetyRetryEligible(
  ctx: StoredRetryContext,
  hasCustomPrompt: boolean,
): boolean {
  if (hasCustomPrompt) return false
  return (
    ctx.mode === 'presets' ||
    ctx.creationMode === 'photo_edit' ||
    ctx.sceneSource === 'user_photo' ||
    Boolean(getInteractionPrompt(ctx.interaction))
  )
}

function sanitize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function buildSafetyRetryInteractionLine(ctx: StoredRetryContext): string {
  if (ctx.interaction === 'selfie') return SELFIE_POV_INTERACTION_PROMPT
  return getInteractionPrompt(ctx.interaction) ?? 'Natural friendly presence beside each other.'
}

export function buildSafetyRetryPrompt(ctx: StoredRetryContext): string {
  const starName = sanitize(ctx.celebrityName) || 'the celebrity'
  const lines = [
    'SAFE RETRY — ORDINARY EVERYDAY PHOTO.',
    '',
    'Create the same harmless, family-friendly everyday photo requested by the StarFusion preset.',
    'Preserve both identities from the reference images.',
    'Preserve the same scene, interaction, perspective and requested placement.',
    'Natural casual clothing, realistic proportions, ordinary friendly body language.',
    'Authentic amateur smartphone appearance with natural lighting, skin texture, grain and imperfections.',
    'Do not change the requested scenario or invent a different context.',
    '',
    `Celebrity: ${starName}.`,
    `Interaction: ${buildSafetyRetryInteractionLine(ctx)}`,
  ]
  if (ctx.creationMode === 'photo_edit') {
    lines.push(
      'Mode: preserve the source photo structure; add the celebrity beside the user only.',
      'Do not reframe the source image or invent a visible phone device.',
    )
  } else if (ctx.sceneSource === 'user_photo') {
    lines.push('Scene: keep the same place, lighting and atmosphere as the user reference photo.')
  } else if (ctx.mode === 'presets' && ctx.scene) {
    lines.push(
      `Location: ${sanitize(ctx.scene.location)}`,
      `Outfits: ${sanitize(ctx.scene.outfits)}`,
      `Pose/framing: ${sanitize(ctx.scene.position)}`,
    )
  }
  if (ctx.userHeightCm) lines.push(`User height: ${ctx.userHeightCm} cm`)
  if (ctx.celebrityHeightCm) lines.push(`Celebrity height: ${ctx.celebrityHeightCm} cm`)
  if (ctx.celebrityPlacementInstruction) {
    lines.push(`Placement: ${sanitize(ctx.celebrityPlacementInstruction)}`)
  }
  const prompt = lines.join('\n')
  return prompt.length <= 1800 ? prompt : prompt.slice(0, 1800)
}
