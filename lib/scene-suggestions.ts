import { getInteractionPrompt } from './interactions.ts'
import { heightConsistencyBlock } from './height-prompt.ts'
import type { CelebrityCreationMode, PhotoGenerationContext, PhotoScene } from './types.ts'

export { heightConsistencyBlock }

interface SceneSuggestions {
  locations: string[]
  outfits: string[]
  positions: string[]
}

export const SCENE_SUGGESTION_COUNT = 4

/**
 * Lieux du quotidien, drôles mais simples — 2 personnes, un décor lisible,
 * un accessoire max. Évite feu, foule, miroir, micro devant le visage,
 * costumes et texte minuscule : Nano Banana reste fidèle plus facilement.
 */
export const SIMPLE_FUNNY_LOCATIONS = [
  'Laverie automatique, panier à linge entre vous deux',
  'Rayon canapés IKEA, vous testez le modèle trop sérieusement',
  'File du McDo, sacs kraft à la main',
  'Caisse automatique du supermarché, un article refuse de passer',
  'Arrêt de bus vide, abri en plastique, lumière du jour',
  'Cuisine, pain grillé trop cuit, assiettes empilées',
  'Escalator de centre commercial, sacs de courses',
  'Salle d\'attente chez le médecin, magazines sur les genoux',
  'Parking de supermarché, caddie à côté de vous',
  'Cuisine de bureau, micro-ondes ouvert, barquette à la main',
  'Boulangerie, sacs de pain chaud',
  'Banc de parc, sac de courses au sol',
  'Rayon céréales du supermarché, vous hésitez trop longtemps',
  'Hall d\'immeuble, vous attendez l\'ascenseur',
  'Terrasse de café, deux tasses, lumière du jour',
  'Magasin de meubles, étagère à monter, notice à l\'envers',
  'Station-service, deux cafés machine, voiture en fond',
  'Comptoir du pressing, ticket à la main',
  'Jardinerie, un petit pot de basilic trop cher',
  'Métro, vous tenez la même barre',
  'Magasin de chaussures, boîtes ouvertes autour de vous',
  'Fast-food intérieur, barquettes et serviettes',
  'File de la Poste, ticket à la main',
  'Aire d\'autoroute, table en plastique, sandwich triangle',
  'Superette, porte du frigo ouverte',
  'Laverie de quartier, linge plié sur la table',
  'Rayon produits ménagers, vous comparez deux flacons identiques',
  'Salle de pause, distributeur de snacks coincé',
]

/** Tenues civiles toujours mixables avec n'importe quel lieu du pool. */
export const SIMPLE_FUNNY_OUTFITS = [
  'Jean, t-shirt et sneakers, looks de tous les jours',
  'Sweat et baskets, tenues de dimanche',
  'Veste légère, jean et tennis',
  'Looks un peu froissés, comme après une journée dehors',
  'T-shirt, jean et baskets adaptés au lieu',
  'Jean, sneakers et sweat, looks de sortie entre potes',
]

export const SIMPLE_FUNNY_POSITIONS = [
  'Debout côte à côte, regard caméra un peu trop sérieux',
  'Assis l\'un à côté de l\'autre, un peu trop droits',
  'Tu montres quelque chose du doigt, la star hoche la tête',
  'Photo souvenir, sourires un peu forcés',
  'Vous vous penchez tous les deux vers le même objet',
  'Un bras posé amicalement sur l\'épaule',
  'Vous attendez, mains dans les poches, regard caméra',
  'Tu expliques avec les mains, la star écoute poliment',
]

/** Prompts libres complets — mêmes contraintes de rendu que les scènes guidées. */
export const CUSTOM_PROMPT_EXAMPLES = [
  'Dans une laverie automatique, panier à linge entre vous, jean et sneakers, photo souvenir un peu trop sérieuse.',
  'Rayon canapés IKEA, vous êtes assis trop droits, tenues de tous les jours, regard caméra grave.',
  'File du McDo, sacs kraft à la main, t-shirt et jean, vous attendez comme si de rien n\'était.',
  'Caisse automatique du supermarché, un article refuse de passer, looks casual, tu expliques avec les mains.',
  'Arrêt de bus vide, abri en plastique, sweat et baskets, debout côte à côte un peu trop sérieux.',
  'Cuisine, pain grillé trop cuit, tenues de dimanche, vous vous penchez vers le grille-pain.',
  'Parking de supermarché, caddie à côté, jean et sneakers, photo souvenir de colonie.',
  'Terrasse de café en journée, deux tasses, veste légère, assis l\'un à côté de l\'autre.',
  'Hall d\'immeuble, vous attendez l\'ascenseur, looks froissés, mains dans les poches.',
  'Boulangerie, sacs de pain chaud, t-shirt et jean, tu montres la vitrine du doigt.',
  'Salle d\'attente chez le médecin, magazines sur les genoux, tenues casual, un peu trop droits.',
  'Aire d\'autoroute, table en plastique, sandwich triangle, photo souvenir forcée.',
]

export function pickN<T>(items: readonly T[], n: number, random: () => number = Math.random): T[] {
  const copy = items.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const current = copy[i]!
    copy[i] = copy[j]!
    copy[j] = current
  }
  return copy.slice(0, Math.min(n, copy.length))
}

/** Tire un set de propositions — indépendant de la star, stable si on passe un RNG. */
export function pickSceneSuggestions(
  count = SCENE_SUGGESTION_COUNT,
  random: () => number = Math.random,
): SceneSuggestions {
  return {
    locations: pickN(SIMPLE_FUNNY_LOCATIONS, count, random),
    outfits: pickN(SIMPLE_FUNNY_OUTFITS, count, random),
    positions: pickN(SIMPLE_FUNNY_POSITIONS, count, random),
  }
}

export function pickCustomPromptExamples(
  count = SCENE_SUGGESTION_COUNT,
  random: () => number = Math.random,
): string[] {
  return pickN(CUSTOM_PROMPT_EXAMPLES, count, random)
}

export function sceneFromSuggestions(suggestions: SceneSuggestions): PhotoScene {
  return {
    location: suggestions.locations[0] ?? '',
    outfits: suggestions.outfits[0] ?? '',
    position: suggestions.positions[0] ?? '',
  }
}

/** Conservé pour compat : le métier de la star n'influence plus les propositions. */
export function getSceneSuggestions(_celebrityDomain?: string): SceneSuggestions {
  return pickSceneSuggestions()
}

export function getDefaultScene(_celebrityDomain?: string): PhotoScene {
  return sceneFromSuggestions(pickSceneSuggestions())
}

/** Nettoie le texte utilisateur pour limiter les blocages du filtre kie.ai */
function sanitizeSceneText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** KIE Nano Banana refuse au-delà de 5000 caractères (prompt interne, pas le champ UI). */
export const KIE_PROMPT_MAX_CHARS = 4900

type PromptSectionKind = 'protected' | 'secondary' | 'other'

interface PromptSection {
  kind: PromptSectionKind
  text: string
}

const PROTECTED_SECTION_HEADER =
  /^(ABSOLUTE PRIORITY — FACIAL IDENTITY LOCK|FACIAL IDENTITY LOCK|PERSON A HARD LOCK|PERSON B HARD LOCK|FINAL IDENTITY CHECK|PLACEMENT — COMPOSITION ANALYSIS|USER SCENE BRIEF|USER SCENE PROMPT|KEEP THE USER PHOTO SCENE|PLACEMENT|PHYSICAL HEIGHT|PHYSICAL SCALE|SCALE:|PHOTOREALISM|NATURAL MOMENT LOCK|SELFIE LOCK|SELFIE POV|VERROUILLAGE PHOTO SOURCE)/i
const SECONDARY_SECTION_HEADER =
  /^(SCENE REQUIREMENTS|FINAL MANDATORY CHECK|SUBJECTS:)/i
const OTHER_SECTION_HEADER =
  /^(WARDROBE|MODE:|IMAGE ORDER|GOAL:|INTERACTION:|LIGHTING:|FORBIDDEN|PRIORITY \d)/i

function classifySectionHeader(line: string): PromptSectionKind | null {
  if (PROTECTED_SECTION_HEADER.test(line)) return 'protected'
  if (SECONDARY_SECTION_HEADER.test(line)) return 'secondary'
  if (OTHER_SECTION_HEADER.test(line)) return 'other'
  return null
}

function splitPromptSections(prompt: string): PromptSection[] {
  const lines = prompt.split('\n')
  const sections: PromptSection[] = []
  let kind: PromptSectionKind = 'other'
  let current: string[] = []

  const flush = () => {
    if (current.length === 0) return
    sections.push({ kind, text: current.join('\n') })
    current = []
  }

  for (const line of lines) {
    const headerKind = classifySectionHeader(line)
    if (headerKind) {
      flush()
      kind = headerKind
    }
    current.push(line)
  }
  flush()
  return sections
}

function joinPromptSections(sections: PromptSection[]): string {
  return sections
    .map((section) => section.text)
    .filter((text) => text.trim().length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

function trimProtectedSectionsToFit(sections: PromptSection[], maxChars: number): string {
  const parsed = sections.map((section) => {
    const newline = section.text.indexOf('\n')
    if (newline < 0) return { header: section.text, body: '' }
    return { header: section.text.slice(0, newline), body: section.text.slice(newline + 1) }
  })
  const headerCost = parsed.reduce((sum, part, index) => (
    sum + part.header.length + (index > 0 || part.body ? 1 : 0)
  ), 0)
  let budget = maxChars - headerCost
  if (budget < 0) {
    let out = ''
    for (const part of parsed) {
      const next = out ? `${out}\n${part.header}` : part.header
      if (next.length > maxChars) break
      out = next
    }
    return out
  }
  return parsed.map((part) => {
    const body = part.body.slice(0, Math.max(0, budget))
    budget -= body.length
    return body ? `${part.header}\n${body}` : part.header
  }).join('\n')
}

/**
 * Garde-fou KIE : ne coupe jamais en tête du prompt (ce qui supprimait le brief).
 * On retire d'abord les sections secondaires, puis le texte non protégé.
 */
export function clampKiePrompt(
  prompt: string,
  maxChars = KIE_PROMPT_MAX_CHARS,
): { prompt: string; truncated: boolean } {
  if (prompt.length <= maxChars) return { prompt, truncated: false }

  let sections = splitPromptSections(prompt).filter((section) => section.kind !== 'secondary')
  let next = joinPromptSections(sections)
  if (next.length <= maxChars) return { prompt: next, truncated: true }

  let overflow = next.length - maxChars
  for (let i = sections.length - 1; i >= 0 && overflow > 0; i--) {
    if (sections[i].kind !== 'other') continue
    const originalLen = sections[i].text.length
    const kept = sections[i].text.slice(0, Math.max(0, originalLen - overflow)).trimEnd()
    sections[i] = { ...sections[i], text: kept }
    overflow -= originalLen - kept.length
  }
  sections = sections.filter((section) => section.text.trim().length > 0)
  next = joinPromptSections(sections)
  if (next.length <= maxChars) return { prompt: next, truncated: true }

  const protectedSections = sections.filter((section) => section.kind === 'protected')
  const otherSections = sections.filter((section) => section.kind === 'other')
  let rebuilt = joinPromptSections(protectedSections)
  if (rebuilt.length > maxChars) {
    rebuilt = trimProtectedSectionsToFit(protectedSections, maxChars)
  }
  for (const section of otherSections) {
    if (rebuilt.length >= maxChars) break
    const separator = rebuilt ? '\n' : ''
    const room = maxChars - rebuilt.length - separator.length
    if (room <= 0) break
    rebuilt += separator + (section.text.length <= room ? section.text : section.text.slice(0, room))
  }
  if (rebuilt.length > maxChars) rebuilt = rebuilt.slice(0, maxChars)
  return { prompt: rebuilt, truncated: true }
}

/** Critère #1 : identité faciale INTÉGRALE.
 *  Avec 2 images, Person A et Person B sont verrouillés à égalité.
 *  Parcours « jumeau » (1 image) : verrouillage maximal contre le morphing vers la star. */
function facePreservationBlock(hasCelebrityReferenceImage: boolean): string[] {
  const dual = hasCelebrityReferenceImage
  return [
    'ABSOLUTE PRIORITY — FACIAL IDENTITY LOCK:',
    dual
      ? 'IDENTITY-PRESERVING COMPOSITE with TWO reference photos. Not face generation, not beautification, not lookalike casting.'
      : "IDENTITY-PRESERVING EDIT of Person A from image_input[0]. Never transfer the celebrity's look onto Person A.",
    dual
      ? '- image_input[0] = Person A (USER). image_input[1] = Person B (CELEBRITY).'
      : '- image_input[0] = Person A (USER) — sole identity source for Person A.',
    'NON-NEGOTIABLE: copy faces from reference images. Do not invent, average, or beautify faces.',
    'FACE COPY, NOT REDRAW: transplant the exact reference faces. A similar, prettier, or younger face is a FAIL.',
    'Exactly two people in the photo: Person A and Person B. No extra faces.',
    'PERSON A HARD LOCK:',
    '- 100% same face as image_input[0]: bone structure, face width, jaw, eyes, nose, lips, skin, age, marks.',
    '- HAIR LOCK: exact color, texture, length, volume, parting, hairline, style. Do not restyle to match the celebrity.',
    '- ZERO FACE EDITS: no morph, blend, beautify, slim, puff, average, makeup or age change.',
    '- Allowed: pose, clothes (unless kept), hands, body. Light may hit the face without reshaping it.',
    ...(dual
      ? [
          'PERSON B HARD LOCK:',
          '- Copy face and hair from image_input[1] exactly. Same 100% lock and ZERO FACE EDITS as Person A.',
          '- Person B must be instantly recognizable as the same person as image_input[1]. Clothes from image_input[1] are NOT locked — dress for the scene.',
          'FAIL if either face is not instantly the same person, if Person A hair/face width drifted, or if Person B keeps iconic clothes when the scene is casual.',
        ]
      : [
          'PERSON B is a different person. Never nudge Person A toward Person B.',
          'FAIL if Person A is not the same person as image_input[0], if hair/face width changed, or if Person A looks like a hybrid with the celebrity.',
        ]),
  ]
}

function facePreservationClosingBlock(hasCelebrityReferenceImage: boolean): string[] {
  const dual = hasCelebrityReferenceImage
  return [
    'FINAL IDENTITY CHECK (before output):',
    dual
      ? '- Person A must match image_input[0] and Person B must match image_input[1] at 100%. If either face drifted, regenerate internally until both match.'
      : '- Person A must match image_input[0] exactly. Person B must look like a distinct celebrity, not a morph of Person A.',
    '- Reject any result where faces look AI-smoothed, swapped, averaged, redrawn, or younger/prettier than the references.',
  ]
}

/** Anti-"AI look" : photo smartphone amateur, indiscernable d'une vraie photo. */
function photorealismBlock(celebrityName: string): string[] {
  const celeb = sanitizeSceneText(celebrityName) || 'the celebrity'
  return [
    'PHOTOREALISM — amateur smartphone snap (after face locks):',
    `Ordinary phone-gallery photo with ${celeb}: candid, slightly soft, not studio, glamour, influencer, editorial, CGI, or a polished composite.`,
    'No beauty filter, no AI-smooth skin, no porcelain/waxy/plastic finish, no airbrush. Skin must look like unretouched real skin — that ordinary texture is what makes the photo beautiful and believable.',
    'KEEP each reference face\'s real skin: visible pores, uneven tone, under-eye texture, fine lines, facial asymmetry, existing marks. Do not invent new moles, scars, or distinctive marks. Do not swap in a generic smooth face. Realistic hair. Slight grain, compression, imperfect candid framing.',
    `BOTH people share the source photo's grain, softness, sharpness, noise, exposure, white balance and non-retouched skin. ${celeb} must never look smoother, cleaner, sharper, or more retouched than the user.`,
    'Natural spontaneous expressions and body language — without changing who they are. Follow the USER SCENE BRIEF literally.',
  ]
}

function naturalMomentBlock(): string[] {
  return [
    'NATURAL MOMENT LOCK: the result must look like a genuine candid shared moment between two real people already together, not two subjects placed side by side.',
    'Relaxed posture, subtle torso rotation, slight lean/head tilt, natural asymmetry, believable proximity. A slight lean-in or arm around shoulder/waist/back is allowed if it improves realism. Small BODY pose tweaks OK — never a face redesign.',
    'Avoid stiff, static, symmetrical, overly frontal/centered, or cutout-next-to-user poses. Expressions unforced but identity-locked. Realism = photographic texture AND living interaction, SAME two faces as the references.',
  ]
}

const REASONABLE_CUSTOM_MAX_CHARS = 600

/** Verrouillage facial compact pour photo_edit (mêmes règles, moins de redondance). */
function photoEditFacePreservationBlock(dual: boolean): string[] {
  return [
    'ABSOLUTE PRIORITY — FACIAL IDENTITY LOCK:',
    dual
      ? 'Copy faces from image_input[0] (Person A) and image_input[1] (Person B). No generation, beautification, morphing, or lookalike casting.'
      : "Copy Person A from image_input[0] only. Never transfer the celebrity's look onto Person A.",
    'Exactly two people. No extra faces.',
    'PERSON A HARD LOCK:',
    '- Match image_input[0]: bone structure, face width, jaw, eyes, nose, lips, skin, age, marks.',
    '- HAIR LOCK: exact color, texture, length, volume, parting, hairline, style. No celebrity restyle.',
    '- No morph, blend, beautify, slim, puff, or average with the celebrity.',
    ...(dual
      ? [
          'PERSON B HARD LOCK:',
          '- Copy face and hair from image_input[1] exactly — instantly recognizable, not a generic lookalike.',
          '- Clothes from image_input[1] NOT locked — dress for the scene.',
        ]
      : ['PERSON B is a different person. Never nudge Person A toward Person B.']),
  ]
}

/** Photoréalisme photo_edit — aligné sur photorealismBlock(), calé sur image_input[0]. */
function photoEditPhotorealismBlock(): string[] {
  return [
    'PHOTOREALISM — match source photo (amateur smartphone, not studio/CGI):',
    'No beauty filter, AI-smooth skin, porcelain/waxy/plastic finish, or airbrush.',
    'Natural imperfections only: visible pores, slight uneven tone, subtle under-eye texture, fine lines, facial asymmetry.',
    'Do not invent new moles, scars, or distinctive marks. Hair: individual strands and small flyaways.',
    'Grain, noise, compression, sharpness, exposure, white balance and softness must match image_input[0] exactly.',
    'The celebrity must NEVER look sharper, cleaner, smoother, better lit or more professionally retouched than the user.',
  ]
}

function photoEditNaturalMomentBlock(starName: string): string[] {
  const celeb = sanitizeSceneText(starName) || 'the celebrity'
  return [
    'NATURAL MOMENT LOCK (photo_edit):',
    'Credible interaction, natural asymmetry, believable proximity — not two cutouts side by side.',
    `${celeb} may lean slightly toward Person A; relaxed shoulders, spontaneous expression. Avoid stiff/symmetrical/ad-style poses.`,
    'Person A stays unchanged. Person B adapts to Person A — never the reverse.',
  ]
}

/**
 * Tenues adaptées au lieu — pas aux habits iconiques de la star
 * (ex. Macron en costard dans un parc → tenue civile décontractée).
 */
function sceneAdaptiveWardrobeBlock(celebrityName: string): string[] {
  const celeb = sanitizeSceneText(celebrityName) || 'the celebrity'
  return [
    'WARDROBE: dress BOTH people for THIS location and outfit brief.',
    `Ignore ${celeb}'s iconic / stage / suit / jersey look and any clothes in the reference photos. Casual place = casual clothes unless the brief asks otherwise.`,
  ]
}

const MAX_CELEBRITY_NAME_CHARS = 80
const MAX_CELEBRITY_DOMAIN_CHARS = 80
const MAX_SCENE_FIELD_CHARS = 220

function boundPromptField(text: string, maxChars: number): string {
  const cleaned = sanitizeSceneText(text)
  return cleaned.length <= maxChars ? cleaned : cleaned.slice(0, maxChars)
}

/**
 * Bloc POV selfie — injecté quand interaction === 'selfie'.
 * full_generation : vraie logique caméra frontale.
 * photo_edit : préserve le cadrage source, sans inventer de téléphone visible.
 */
export function selfiePovBlock(
  interaction: string | undefined,
  creationMode: CelebrityCreationMode = 'full_generation',
): string[] {
  if (interaction !== 'selfie') return []

  if (creationMode === 'photo_edit') {
    return [
      'SELFIE POV LOCK (photo_edit):',
      '- If image_input[0] is already front-camera selfie POV: keep that exact perspective — do not reframe.',
      '- If NOT a selfie POV: do NOT force third-person view or impossible reframe; keep natural proximity and gazes toward the implicit camera/lens.',
      '- Never show a phone. Never show the user holding a phone.',
    ]
  }

  return [
    'SELFIE POV / FRONT CAMERA RESULT ONLY:',
    '- Generate as if captured directly by the user\'s smartphone front camera at arm\' length.',
    '- This is the resulting selfie image, NOT a third-person photo of someone taking a selfie.',
    '- Never show the phone device in the frame. Never show the user holding the phone.',
    '- Both people close to the camera, looking toward the phone lens.',
    '- Natural selfie perspective, slightly imperfect framing, authentic casual smartphone composition.',
  ]
}

/**
 * Prompt « Créer une nouvelle photo » — scènes guidées ou prompt libre utilisateur.
 * Le modèle recompose la scène en gardant l'identité de l'utilisateur.
 */
export function buildFullGenerationPrompt(ctx: PhotoGenerationContext): string {
  const {
    celebrityName,
    celebrityDomain,
    celebrityStyleDescription,
    funFact,
    mode,
    scene,
    customPrompt,
    interaction,
    hasCelebrityReferenceImage,
    sceneSource,
  } = ctx

  const dual = Boolean(hasCelebrityReferenceImage)
  const starName = boundPromptField(celebrityName, MAX_CELEBRITY_NAME_CHARS) || 'the celebrity'
  const domain = boundPromptField(celebrityDomain, MAX_CELEBRITY_DOMAIN_CHARS)
  const style = celebrityStyleDescription ? sanitizeSceneText(celebrityStyleDescription) : ''
  const mood = !dual && funFact ? sanitizeSceneText(funFact) : ''

  const celebrityLine = dual
    ? `- Person B: ${starName}${domain ? `, ${domain}` : ''}. Clothes = scene-adapted, not from image_input[1].`
    : `- Person B (CELEBRITY): ${starName}${domain ? `, ${domain}` : ''} — separate person beside Person A. Dress for the scene, not their iconic look.`
  const styleLine = !dual && style
    ? `- Optional Person B fashion vibe (LOW priority — override with location-appropriate clothes if the scene is casual): ${style}.`
    : ''
  const moodLine = mood ? `- Scene mood / energy only (NOT faces, NOT Person A's hair): ${mood}.` : ''

  const interactionPrompt = getInteractionPrompt(interaction)
  const interactionLine = interactionPrompt
    ? `4. INTERACTION between the two people: ${sanitizeSceneText(interactionPrompt)}.`
    : ''

  const heightSection = heightConsistencyBlock(ctx).join('\n')
  const closingBlocks = [
    heightSection,
    ...selfiePovBlock(interaction, ctx.creationMode ?? 'full_generation'),
    ...photorealismBlock(starName),
    ...naturalMomentBlock(),
    ...sceneAdaptiveWardrobeBlock(starName),
  ].filter(Boolean)

  const wrap = (sceneBlock: string[]) => [
    ...facePreservationBlock(dual),
    celebrityLine,
    styleLine,
    moodLine,
    '',
    ...sceneBlock,
    '',
    ...closingBlocks,
    '',
    ...facePreservationClosingBlock(dual),
  ].filter((line) => line !== '').join('\n')

  if (sceneSource === 'user_photo') {
    return wrap([
      'KEEP THE USER PHOTO SCENE (full_generation — not a pixel-locked edit):',
      '- image_input[0] is BOTH Person A identity AND the scene to keep.',
      '- Recreate a NEW candid photo of Person A with the celebrity in the SAME place, lighting, time of day, and overall atmosphere as image_input[0].',
      '- Keep Person A’s clothes from the source photo unless a tiny natural adjustment is needed.',
      '- Dress the celebrity to belong in that same real setting — not a studio, not a red carpet.',
      '- Do NOT invent a new location (no karaoke, IKEA, festival, etc.).',
      '- Do NOT rebuild the environment from scratch.',
      interactionLine,
    ])
  }

  if (mode === 'custom' && customPrompt) {
    const header = 'USER SCENE PROMPT (apply to setting/outfits/pose ONLY — faces stay locked; follow literally):'
    const skeleton = wrap([header, '', interactionLine])
    const remaining = KIE_PROMPT_MAX_CHARS - skeleton.length - 1
    const userPrompt = sanitizeSceneText(customPrompt).slice(0, Math.max(0, remaining))
    return wrap([header, userPrompt, interactionLine])
  }

  if (!scene) {
    throw new Error('photoScene requis en mode presets')
  }

  const location = boundPromptField(scene.location, MAX_SCENE_FIELD_CHARS)
  const outfits = boundPromptField(scene.outfits, MAX_SCENE_FIELD_CHARS)
  const position = boundPromptField(scene.position, MAX_SCENE_FIELD_CHARS)

  return wrap([
    'USER SCENE BRIEF (setting/outfits/pose ONLY — faces stay locked; follow literally):',
    `1. LOCATION / SETTING: ${location}`,
    `2. OUTFITS for both people (MUST adapt to the location — no iconic celebrity default clothes): ${outfits}`,
    `3. POSE and FRAMING: ${position}`,
    interactionLine,
  ])
}

function computeTargetApparentHeightRatio(
  userHeightCm?: number,
  celebrityHeightCm?: number | null,
): number | undefined {
  if (!userHeightCm || !celebrityHeightCm || userHeightCm <= 0 || celebrityHeightCm <= 0) return undefined
  return Math.round((celebrityHeightCm / userHeightCm) * 100) / 100
}

function photoEditHeightLinesFr(ctx: PhotoGenerationContext, starName: string): string[] {
  const userH = ctx.userHeightCm
  const starH = ctx.celebrityHeightCm ?? null
  const ratio = ctx.celebrityTargetApparentHeightRatio ?? computeTargetApparentHeightRatio(userH, starH)
  if (userH && starH && ratio != null) {
    const pct = Math.round(ratio * 100)
    return [
      `- Taille réaliste : utilisateur ${userH} cm, ${starName} ${starH} cm — à la même profondeur caméra, la star paraît environ ${pct} % de la hauteur visible de l'utilisateur.`,
    ]
  }
  if (userH) {
    return [
      `- Taille réaliste : utilisateur ${userH} cm — la star à taille adulte crédible à côté, jamais miniature en arrière-plan.`,
    ]
  }
  return [
    '- Taille et perspective crédibles : la star à côté de l\'utilisateur, même plan caméra, jamais en retrait.',
  ]
}

/**
 * Prompt selfie « Ajouter la star à ma photo » — fidélité faciale + intégration physique crédible.
 */
export function buildPhotoEditPrompt(ctx: PhotoGenerationContext): string {
  const {
    celebrityName,
    celebrityDomain,
    celebrityStyleDescription,
    customPrompt,
    hasCelebrityReferenceImage,
    interaction,
    celebrityPlacementInstruction,
  } = ctx
  const starName = sanitizeSceneText(celebrityName) || 'la célébrité'
  const domain = sanitizeSceneText(celebrityDomain)
  const style = celebrityStyleDescription ? sanitizeSceneText(celebrityStyleDescription) : ''
  const dual = Boolean(hasCelebrityReferenceImage)
  const userHint = customPrompt
    ? sanitizeSceneText(customPrompt).slice(0, REASONABLE_CUSTOM_MAX_CHARS)
    : ''
  const starDescription = sanitizeSceneText(
    dual ? (domain ? `${starName} (${domain})` : starName) : [domain && `${starName} (${domain})`, style].filter(Boolean).join('. ')
  ).slice(0, 120) || starName
  const placementLines = celebrityPlacementInstruction
    ? [
        'PLACEMENT — COMPOSITION ANALYSIS:',
        `- ${sanitizeSceneText(celebrityPlacementInstruction)}`,
      ]
    : []

  return [
    ...photoEditFacePreservationBlock(dual),
    '',
    `Add ${starName} to image_input[0] as if they were always in the photo.`,
    ...(dual
      ? [`image_input[1] = face/hair ref for ${starName} only — not clothes or background.`]
      : []),
    '',
    'VERROUILLAGE PHOTO SOURCE:',
    'Preserve image_input[0] structurally and visually — Person A identity, hair, body, position, environment unchanged.',
    'Only tiny LOCAL changes for the added celebrity: occlusion, contact shadows, reflected light, overlapping edges, local grain/noise match.',
    'Never reconstruct the scene, move important objects, beautify Person A, or alter Person A\'s face.',
    '',
    ...placementLines,
    ...(placementLines.length > 0 ? [''] : []),
    `- Integrate ${starName} naturally beside Person A — recognizable, no visible collage.`,
    ...photoEditHeightLinesFr(ctx, starName),
    '- Casual scene-appropriate clothes (not red carpet).',
    '',
    ...photoEditPhotorealismBlock(),
    '',
    ...photoEditNaturalMomentBlock(starName),
    '',
    ...selfiePovBlock(interaction ?? 'selfie', 'photo_edit'),
    ...(userHint ? ['', `Note utilisateur : ${userHint}`] : []),
    ...(dual ? [] : ['', `Célébrité : ${starDescription}.`]),
    '',
    ...facePreservationClosingBlock(dual),
  ].filter((line) => line !== '').join('\n')
}

/**
 * Dispatcher : choisit le prompt selon l'approche de création.
 * Sans creationMode (historique / parcours « jumeau célèbre »), on reste en full_generation.
 */
export function buildPhotoPrompt(ctx: PhotoGenerationContext): string {
  const prompt = ctx.creationMode === 'photo_edit'
    ? buildPhotoEditPrompt(ctx)
    : buildFullGenerationPrompt(ctx)
  return clampKiePrompt(prompt).prompt
}

/** Retry safety : même prompt qualité + préfixe court PG-13 (pas un prompt minimaliste). */
export function buildSafetyRetryPhotoPrompt(ctx: PhotoGenerationContext): string {
  const prefix = 'SAFE RETRY — preserve both reference faces and the requested scene exactly; PG-13, fully clothed adults.\n\n'
  return clampKiePrompt(prefix + buildPhotoPrompt(ctx)).prompt
}
