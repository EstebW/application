import type { InteractionOption } from './types'

/**
 * Interactions proposées dans le parcours « Choisis ta star ».
 * Toujours facultatives : en mode photo_edit elles ne doivent jamais justifier
 * de déformer la photo d'origine.
 */
export const INTERACTION_OPTIONS: InteractionOption[] = [
  {
    id: 'selfie',
    label: 'Selfie',
    prompt: 'both looking at the phone camera as if taking a selfie together, heads close',
  },
  {
    id: 'side_by_side',
    label: 'Côte à côte',
    prompt: 'standing casually side by side, close enough to look like they are together',
  },
  {
    id: 'arm_shoulder',
    label: 'Bras sur l\'épaule',
    prompt: 'the celebrity resting one arm loosely over the user\'s shoulder in a friendly way',
  },
  {
    id: 'seated',
    label: 'Assis ensemble',
    prompt: 'both seated next to each other, relaxed posture',
  },
  {
    id: 'candid',
    label: 'Pris sur le vif',
    prompt: 'a candid unposed moment, neither of them fully facing the camera',
  },
]

export function getInteractionPrompt(id?: string): string | undefined {
  if (!id) return undefined
  return INTERACTION_OPTIONS.find((o) => o.id === id)?.prompt
}

export function getInteractionLabel(id?: string): string | undefined {
  if (!id) return undefined
  return INTERACTION_OPTIONS.find((o) => o.id === id)?.label
}
