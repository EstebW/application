/**
 * Prompt d'analyse de composition photo_edit — miroir testable de supabase/functions/generate/index.ts
 * (le deploy edge reste autonome ; garder les blocs synchronisés).
 */

export interface CompositionAnalysisInput {
  starName: string
  sceneIntent: string
  heightBlock: string[]
  lockedRatio?: number
}

export type CompositionAnalysis =
  | { suitable: true; celebrityPlacementInstruction: string; targetApparentHeightRatio?: number }
  | { suitable: false }

/** Politique cadrage serré — ne pas refuser faute d'espace vide. */
export const COMPOSITION_TIGHT_FRAMING_LINES = [
  'CADRAGE SERRÉ / PEU D\'ESPACE VIDE — NE PAS REFUSER SEUL POUR ÇA :',
  'Un selfie serré ou l\'absence d\'un grand espace vide NE suffit PAS à déclarer la photo unsuitable.',
  'Pour une photo serrée, privilégier dans cet ordre :',
  '1) ajouter la célébrité depuis le bord gauche ou droit du cadre ;',
  '2) cadrer naturellement seulement sa tête / épaules / haut du torse si le cadrage source est serré ;',
  '3) permettre qu\'une petite partie de son corps soit naturellement hors cadre ;',
  '4) permettre une légère inclinaison vers Person A ;',
  '5) permettre un léger chevauchement naturel des silhouettes/épaules si physiquement crédible.',
  'TYPE DE CADRAGE : la célébrité doit respecter le type de cadrage de la photo source (selfie visage serré → visage/épaules serrés ; buste → buste ; plein pied → plein pied).',
  'Ne jamais miniaturiser Person B pour la faire rentrer. Ne jamais déplacer ou modifier le visage de Person A.',
  'Le but n\'est PAS de faire rentrer artificiellement tout le corps de la célébrité.',
] as const

export const COMPOSITION_UNSUITABLE_LAST_RESORT_LINES = [
  'SOURCE_PHOTO_UNSUITABLE = DERNIER RECOURS UNIQUEMENT si même une insertion partielle naturelle depuis un bord du cadre est impossible sans :',
  '- altérer l\'identité de Person A,',
  '- reconstruire fortement la scène,',
  '- créer une perspective physiquement incohérente,',
  '- ou rendre le visage de Person B trop petit pour préserver son identité.',
  'Si unsuitable : {"suitable":false,"reason":"SOURCE_PHOTO_UNSUITABLE"}',
] as const

export function buildPhotoEditCompositionAnalysisText(input: CompositionAnalysisInput): string {
  const { starName, sceneIntent, heightBlock, lockedRatio } = input
  return [
    `Analyse la PHOTO SOURCE. La célébrité à ajouter s’appelle ${starName}.`,
    '',
    'TAILLE ET PROFONDEUR :',
    ...heightBlock,
    'Ne pas estimer ni inventer une taille à partir de la photo source. Utiliser uniquement les mesures ci-dessus. Ne pas inventer targetApparentHeightRatio si une valeur verrouillée est fournie.',
    '',
    'Détermine : position de l’utilisateur ; orientation et posture ; type de cadrage (visage serré / buste / plein pied) ; perspective ; profondeur ; distance caméra ; objets importants ; comment ajouter une deuxième personne à profondeur comparable — y compris depuis les bords du cadre si peu d’espace vide.',
    'IDENTITÉ FACIALE : le visage de la célébrité doit rester assez grand pour conserver ses traits. Même plan caméra que Person A. Ne jamais résoudre la composition en miniaturisant Person B en arrière-plan.',
    ...COMPOSITION_TIGHT_FRAMING_LINES,
    '',
    'CADRAGE / POV : ne présume pas que la source est déjà un selfie front-camera. Si c\'en est un : conserver exactement sa perspective. Sinon : ne pas transformer la photo en vue troisième personne ni reconstruire le cadrage ; ajouter la star à proximité crédible de l\'utilisateur, même plan caméra quand possible. Jamais montrer de téléphone ni inventer que l\'utilisateur tient un téléphone visible. Les regards doivent rester cohérents avec la photo source.',
    'CONTRÔLE QUALITÉ : ne pas exiger que la posture soit identique à la photo source. Micro-ajustements naturels valides : légère rotation du buste, tête réorientée, rapprochement, interaction vivante. Invalider seulement si la scène est trop transformée (décor recréé, meuble important déplacé, cadrage/angle totalement changé) ou si l’identité dérive.',
    'OBJETS : conserver les objets importants. Un petit objet secondaire peut bouger légèrement.',
    `Intention utilisateur (à ignorer si elle exige de reconstruire le décor, de supprimer un objet important, ou de reculer fortement la célébrité) : ${sceneIntent}`,
    'Ne jamais proposer de recréer entièrement le décor ni de supprimer un objet important. Ne jamais inventer de support absent. Le placement peut utiliser les bords du cadre et un cadrage partiel crédible.',
    lockedRatio != null
      ? `Si une intégration crédible est possible : {"suitable":true,"celebrityPlacementInstruction":"ex selfie serré : ajouter depuis le bord droit, visage et épaules visibles au même plan, légère inclinaison vers Person A, haut du torse pouvant dépasser légèrement du cadre, regards cohérents avec la photo source, hauteur apparente ≈ ${Math.round(lockedRatio * 100)} % de l'utilisateur","targetApparentHeightRatio":${lockedRatio}}`
      : 'Si une intégration crédible est possible : {"suitable":true,"celebrityPlacementInstruction":"ex selfie serré : ajouter depuis le bord droit, visage et épaules visibles au même plan, légère inclinaison vers Person A, haut du torse pouvant dépasser légèrement du cadre, regards cohérents avec la photo source"}',
    ...COMPOSITION_UNSUITABLE_LAST_RESORT_LINES,
  ].join('\n')
}

export function parseCompositionResult(
  raw: Record<string, unknown>,
  lockedRatio?: number,
): CompositionAnalysis {
  if (raw.suitable === false || raw.reason === 'SOURCE_PHOTO_UNSUITABLE') {
    return { suitable: false }
  }
  const instruction = typeof raw.celebrityPlacementInstruction === 'string'
    ? raw.celebrityPlacementInstruction.trim().slice(0, 400)
    : ''
  if (raw.suitable === true && instruction) {
    const ratioFromRaw = typeof raw.targetApparentHeightRatio === 'number'
      && Number.isFinite(raw.targetApparentHeightRatio)
      ? raw.targetApparentHeightRatio
      : undefined
    const targetRatio = lockedRatio ?? ratioFromRaw
    return {
      suitable: true,
      celebrityPlacementInstruction: instruction,
      ...(targetRatio != null ? { targetApparentHeightRatio: targetRatio } : {}),
    }
  }
  throw new Error('Analyse de composition invalide')
}
