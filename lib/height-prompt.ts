import type { PhotoGenerationContext } from './types'

/**
 * Contrainte de taille réelle — parcours « Choisis ta star » uniquement.
 *
 * Le bloc n'existe que si l'utilisateur a renseigné sa taille : le parcours
 * « jumeau célèbre » n'envoie jamais userHeightCm et n'est donc pas impacté.
 * Sans taille de star fiable, on retombe sur une contrainte visuelle souple
 * plutôt que de bloquer la génération.
 *
 * Module volontairement sans import exécutable : il doit rester copiable tel
 * quel dans l'Edge Function `generate` (Deno ne peut pas importer lib/).
 */
export function heightConsistencyBlock(ctx: PhotoGenerationContext): string[] {
  const { userHeightCm, celebrityHeightCm, creationMode } = ctx
  if (!userHeightCm) return []

  const photoEditLines =
    creationMode === 'photo_edit'
      ? [
          '',
          'The user\'s existing body in the uploaded photograph is immutable.',
          '',
          'Do not resize, stretch, reconstruct or alter the user to enforce the stated height.',
          '',
          'Use the user\'s visible body and the declared height only as a reference for calculating the celebrity\'s physically believable scale.',
          '',
          'Adapt the added celebrity to the original photograph, not the original user to the celebrity.',
          '',
          'Preserve the original framing, perspective, camera angle and user pixels whenever possible.',
        ]
      : []

  if (!celebrityHeightCm) {
    return [
      'PHYSICAL SCALE AND PERSPECTIVE CONSISTENCY:',
      '',
      `The user's real height is ${userHeightCm} centimeters.`,
      '',
      'The celebrity\'s exact verified height is currently unavailable.',
      '',
      'Use realistic human proportions and a plausible visual scale based on the scene, while preserving the user\'s known height.',
      '',
      'Do not exaggerate the size or dominance of the celebrity.',
      'Do not deform, stretch or compress either body.',
      'Keep both people coherent with the same ground plane, camera perspective, distance, posture, footwear and environment.',
      '',
      'Treat the celebrity\'s relative height as a soft visual constraint and prioritize a physically believable composition.',
      ...photoEditLines,
    ]
  }

  return [
    'PHYSICAL HEIGHT, SCALE AND PERSPECTIVE CONSISTENCY:',
    '',
    `The user's real height is ${userHeightCm} centimeters.`,
    `The celebrity's real height is ${celebrityHeightCm} centimeters.`,
    '',
    'Respect the real-world height difference between the user and the celebrity.',
    '',
    'Use these measurements as physical constraints, not as a reason to create a rigid or unnatural pose.',
    '',
    'If both people are standing on the same ground plane and at a similar distance from the camera, their visible difference in height must correspond naturally to their real measurements.',
    '',
    'Keep the scale of the entire body coherent. Adjust the full body proportionally, including head position, shoulder level, torso, hips, legs and feet.',
    '',
    'Do not resize only the head, face, torso or legs.',
    'Do not make the celebrity larger or taller because they are famous.',
    'Do not make the user shorter or taller simply to improve the composition.',
    'Do not stretch, compress or deform either body.',
    '',
    'Account naturally for:',
    '- camera perspective;',
    '- distance from the camera;',
    '- lens distortion;',
    '- posture;',
    '- bent knees;',
    '- body lean;',
    '- hairstyle;',
    '- footwear;',
    '- uneven ground;',
    '- one person standing slightly in front of the other.',
    '',
    'Both people must remain connected to the same believable ground plane, with coherent foot placement, body scale, horizon, camera height and perspective.',
    '',
    'When one person is closer to the camera, their apparent size may change naturally, but the underlying physical scale must remain consistent with their real height.',
    '',
    'If the feet or full bodies are not visible, infer the difference subtly through shoulder height, head position, body scale and perspective. Do not force an exaggerated visible height difference.',
    '',
    'A small real-life height difference must remain subtle.',
    'A larger height difference must be visible but never caricatured.',
    '',
    'The final result must look as if both people were genuinely photographed together by the same camera at the same moment.',
    ...photoEditLines,
  ]
}
