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

/** Préambule injecté en tête de TOUS les prompts — réduit les faux positifs Google. */
export function harmlessFictionPreambleBlock(): string[] {
  return [
    'STARFUSION — HARMLESS FICTION / FAN ENTERTAINMENT:',
    '- Fictional comedy fan-photo for entertainment only — not a real event, not news, not fraud.',
    '- Two fully clothed adults in an ordinary or lightly absurd humorous setting (PG-13).',
    '- Silly, awkward, or edgy-comedy scenarios are OK if playful and non-explicit.',
    '- Absurd everyday places (toilets, McDrive, karaoke, laundromat, escape room) = comedy, fully clothed.',
    '- No nudity, explicit content, violence, hate, illegal activity, or minors.',
    '- Time-of-day words (soir, 22h, night, evening) = natural ambient lighting in everyday places.',
    '- Celebrity likeness is a fictional composite for fun — preserve reference faces only.',
  ]
}

/** Version courte pour photo_edit (prompt déjà long). */
export function harmlessFictionPreambleCompactBlock(): string[] {
  return [
    'STARFUSION — harmless fictional fan-photo (PG-13, fully clothed adults, comedy OK, not real news).',
  ]
}

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

function sanitize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function buildSafetyRetryInteractionLine(ctx: StoredRetryContext): string {
  if (ctx.interaction === 'selfie') return SELFIE_POV_INTERACTION_PROMPT
  return getInteractionPrompt(ctx.interaction) ?? 'Natural friendly presence beside each other.'
}

export function buildSafetyRetryPrompt(ctx: StoredRetryContext): string {
  const starName = sanitize(ctx.celebrityName) || 'the celebrity'
  const requestLabel = ctx.mode === 'custom'
    ? 'the StarFusion user request'
    : 'the StarFusion preset'
  const lines = [
    ...harmlessFictionPreambleBlock(),
    '',
    'SAFE RETRY — ORDINARY EVERYDAY PHOTO.',
    '',
    `Create the same harmless, family-friendly everyday photo requested by ${requestLabel}.`,
    'Keep the same humorous or absurd spirit if the request is playful — stay PG-13 and fully clothed.',
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
  } else if (ctx.mode === 'custom' && ctx.customPrompt) {
    lines.push(`User scene request: ${sanitize(ctx.customPrompt)}`)
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
  const RETRY_PROMPT_MAX_CHARS = 2400
  return prompt.length <= RETRY_PROMPT_MAX_CHARS ? prompt : prompt.slice(0, RETRY_PROMPT_MAX_CHARS)
}
