import type { PhotoGenerationContext } from './types'

/**
 * Contrainte de taille réelle — parcours « Choisis ta star » et « Trouve ton jumeau ».
 *
 * Le bloc n'existe que si l'utilisateur a renseigné sa taille. Sans taille de star
 * fiable, on retombe sur une contrainte visuelle souple plutôt que de bloquer
 * la génération.
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
          "The user's existing body in the uploaded photograph is immutable.",
          'Do not resize, stretch, reconstruct or alter the user to enforce the stated height.',
          "Use the user's visible body and the declared height only as a reference for calculating the celebrity's physically believable scale.",
          'Adapt the added celebrity to the original photograph, not the original user to the celebrity.',
        ]
      : []

  if (!celebrityHeightCm) {
    return [
      'PHYSICAL SCALE AND PERSPECTIVE CONSISTENCY:',
      `The user's real height is ${userHeightCm} centimeters.`,
      "The celebrity's exact verified height is currently unavailable.",
      "Use realistic adult scale. Do not exaggerate the celebrity's size. Keep both people on the same ground plane.",
      ...photoEditLines,
    ]
  }

  return [
    'PHYSICAL HEIGHT, SCALE AND PERSPECTIVE CONSISTENCY:',
    `The user's real height is ${userHeightCm} centimeters.`,
    `The celebrity's real height is ${celebrityHeightCm} centimeters.`,
    'Respect the real-world height difference. Scale the full body, not just the head. Do not make the celebrity larger because they are famous, and do not resize the user to improve composition.',
    'Keep both people on a shared ground plane. If feet are hidden, infer scale from shoulders and head. Small real differences stay subtle.',
    ...photoEditLines,
  ]
}
