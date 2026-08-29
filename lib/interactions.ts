import type { InteractionOption } from './types'

/**
 * Interactions proposées dans le parcours « Choisis ta star ».
 * Toujours facultatives : en mode photo_edit elles ne doivent jamais justifier
 * de déformer la photo d'origine.
 */
/** Formulation POV explicite — évite la lecture « photo de quelqu'un en train de prendre un selfie ». */
export const SELFIE_POV_INTERACTION_PROMPT =
  'SELFIE POV / FRONT CAMERA RESULT ONLY: generate the image as if it was captured directly by the user\'s smartphone front camera at arm\' length. This is the resulting selfie image, not a third-person photo of someone taking a selfie. Never show the phone device in the frame. Never show the user holding the phone. Both people should be close to the camera, looking toward the phone lens, with natural selfie perspective, slightly imperfect framing, and authentic casual smartphone composition.'

export const INTERACTION_OPTIONS: InteractionOption[] = [
  {
    id: 'selfie',
    label: 'Selfie',
    prompt: SELFIE_POV_INTERACTION_PROMPT,
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
