import { getInteractionPrompt } from './interactions.ts'
import { heightConsistencyBlock } from './height-prompt.ts'
import type { PhotoGenerationContext, PhotoScene } from './types.ts'

export { heightConsistencyBlock }

interface SceneSuggestions {
  locations: string[]
  outfits: string[]
  positions: string[]
}

/** Suggestions originales — drôles, décalées, mémorables (pas de clichés VIP). */
const DOMAIN_PRESETS: { match: RegExp; suggestions: SceneSuggestions }[] = [
  {
    match: /acteur|actrice|cinéma|cinema|film|réalisat/i,
    suggestions: {
      locations: [
        'Toilettes VIP du festival, vous vous lavez les mains en silence gêné',
        'Siège arrière d\'un Uber noir à 3h, GPS qui recalcule en boucle',
        'File du McDo drive à Cannes, rouleaux de scénario sur le tableau de bord',
        'Cabine d\'essayage H&M, rideau mal fermé, mannequin en carton témoin',
      ],
      outfits: [
        'Smoking froissé + chaussettes Mickey qui dépassent',
        'Peignoir d\'hôtel croisé avec un badge « EXTRA №47 »',
        'Costumes de super-héros IKEA mal ajustés, masques sur le front',
        'Tenue de tapis rouge… et crocs roses assortis',
      ],
      positions: [
        'Tu lui tends un autographe… qu\'il doit signer pour toi',
        'Vous lisez le même script à l\'envers, très concentrés',
        'Selfie flash parking souterrain, yeux mi-clos de surprise',
        'Tu lui mimes sa scène culte, il te note sur 10 avec les doigts',
      ],
    },
  },
  {
    match: /chanteur|chanteuse|musique|rappeur|rappeuse|artiste/i,
    suggestions: {
      locations: [
        'Cabine karaoke 2€ la chanson, micro collé de trop près',
        'Rayon instruments d\'un magasin, ukulélé hors de prix à la main',
        'File d\'attente du merch, tote bag « WORLD TOUR » encore plié',
        'Toit d\'immeuble à minuit, enceinte Bluetooth qui crache',
      ],
      outfits: [
        'Sweats tour 2014 trop petits, numéros de places collés sur le torse',
        'Paillettes de scène + jean dad et sandales de randonnée',
        'Costumes blancs façon boy band, cravates de travers',
        'Oreilles de chat LED + veste de smoking',
      ],
      positions: [
        'Duo air-guitare ultra sérieux face à un miroir de salle de bain',
        'Tu tends le micro-brosse à dents, la star chuchote le refrain',
        'Battle de danse ratée dans un couloir d\'hôtel',
        'Vous choisirez le pire filtre TikTok ensemble, pouces en l\'air',
      ],
    },
  },
  {
    match: /sportif|sport|football|basket|tennis|athlète|athlete/i,
    suggestions: {
      locations: [
        'File des toilettes du stade à la mi-temps, maillots trempés',
        'Parking du centre d\'entraînement, caddie de courses entre vous',
        'Distributeur de boissons cassé, pièces coincées, regard caméra',
        'Banc de touche vide sous la pluie, bâche de secours sur la tête',
      ],
      outfits: [
        'Ton faux maillot floqué « LÉGENDE » à côté du vrai',
        'Survêtements assortis taille XS et XXL',
        'Tenue de conf presse + short de foot et chaussettes montantes',
        'Médailles en chocolat autour du cou, très fières',
      ],
      positions: [
        'Tu rates le high-five trois fois d\'affilée, la star attend',
        'Pose « célébration iconique » mais tu as mis le mauvais genou',
        'Comparatif biceps ridicule face à un miroir de vestiaire',
        'Tu tiens le trophée en plastique, la star applaudit poliment',
      ],
    },
  },
  {
    match: /mannequin|mode|top model|fashion/i,
    suggestions: {
      locations: [
        'Cabine d\'essayage Zara, pile de vêtements plus haute que vous',
        'Escalator du centre commercial, pose éditoriale bloquée au milieu',
        'File du Starbucks en trench XXL sur un pyjama à motifs',
        'Parking souterrain, flash brutal façon paparazzi discount',
      ],
      outfits: [
        'Look couture parfait… baskets de gym sales',
        'Le même manteau porté à l\'envers « volontairement »',
        'Accessoires de luxe + sac plastique du supermarché',
        'Lunettes XXL, un verre manquant, attitude fashion week',
      ],
      positions: [
        'Walk fashion ultra lent… vers les toilettes du mall',
        'Critique d\'une vitrine comme au front row, smoothie à la main',
        'Vous êtes coincés dans la même écharpe XXL',
        'Pose « deadpan magazine » pendant qu\'un enfant vous photographie',
      ],
    },
  },
]

const DEFAULT_SUGGESTIONS: SceneSuggestions = {
  locations: [
    'Victoire d\'escape room, chronomètre à 00:01, accessoire absurde brandi',
    'Cuisine ouverte, gâteau raté en feu (discret), extincteur prêt',
    'Rayon IKEA canapés, vous testez le « Lithem » avec trop de sérieux',
    'Laverie automatique 23h, panier à linge entre vous deux',
  ],
  // Tenues civiles / adaptées au quotidien — pas de costard VIP par défaut
  outfits: [
    'Jean + sneakers + sweat / veste légère, looks de sortie entre potes',
    'Tenues casual décontractées (t-shirt, jean, baskets) adaptées au lieu',
    'Looks premium froissés genre « on a dormi dans l\'avion » — toujours civils',
    'Matching pajamas soyeux + lunettes de soleil indoor',
  ],
  positions: [
    'Serment secret hors-cadre, petit doigt croisé, regard caméra grave',
    'Tu expliques un plan de génie avec les mains, la star doute fort',
    'Photo souvenir comme en colonie de vacances, pouces forcés',
    'Vous cachez un gâteau surprise derrière le dos… qui fuit',
  ],
}

export function getSceneSuggestions(celebrityDomain: string): SceneSuggestions {
  const preset = DOMAIN_PRESETS.find((p) => p.match.test(celebrityDomain))
  return preset?.suggestions ?? DEFAULT_SUGGESTIONS
}

export function getDefaultScene(celebrityDomain: string): PhotoScene {
  const s = getSceneSuggestions(celebrityDomain)
  return {
    location: s.locations[0],
    outfits: s.outfits[0],
    position: s.positions[0],
  }
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
  /^(ABSOLUTE PRIORITY — FACIAL IDENTITY LOCK|FACIAL IDENTITY LOCK|PERSON A HARD LOCK|PERSON B HARD LOCK|USER SCENE BRIEF|USER SCENE PROMPT|KEEP THE USER PHOTO SCENE|PLACEMENT|PHYSICAL HEIGHT|PHYSICAL SCALE|SCALE:|PHOTOREALISM|NATURAL MOMENT LOCK|SELFIE LOCK|VERROUILLAGE PHOTO SOURCE)/i
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
      ? 'IDENTITY-PRESERVING COMPOSITE with TWO reference photos. Not face generation, not beautification.'
      : "IDENTITY-PRESERVING EDIT of Person A from image_input[0]. Never transfer the celebrity's look onto Person A.",
    dual
      ? '- image_input[0] = Person A (USER). image_input[1] = Person B (CELEBRITY).'
      : '- image_input[0] = Person A (USER) — sole identity source for Person A.',
    'PERSON A HARD LOCK:',
    '- Same person as image_input[0]: bone structure, face width, jaw, eyes, nose, lips, skin, age, marks.',
    '- HAIR LOCK: exact color, texture, length, volume, parting, hairline, style. Do not restyle to match the celebrity.',
    '- Do not morph, blend, beautify, slim, puff, or average Person A with the celebrity.',
    '- Allowed for Person A: pose, clothes (unless kept), hands, scene lighting on an UNCHANGED face and hair.',
    ...(dual
      ? [
          'PERSON B HARD LOCK:',
          '- Copy face and hair from image_input[1]. Do not invent a generic lookalike. Clothes from image_input[1] are NOT locked — dress for the scene.',
          'FAIL if either face is not instantly the same person, if Person A hair/face width drifted, or if Person B keeps iconic clothes when the scene is casual.',
        ]
      : [
          'PERSON B is a different person. Never nudge Person A toward Person B.',
          'FAIL if Person A is not the same person as image_input[0], if hair/face width changed, or if Person A looks like a hybrid with the celebrity.',
        ]),
  ]
}

/** Anti-"AI look" : photo smartphone amateur, indiscernable d'une vraie photo. */
function photorealismBlock(celebrityName: string): string[] {
  const celeb = sanitizeSceneText(celebrityName) || 'the celebrity'
  return [
    'PHOTOREALISM — amateur smartphone snap (after face locks):',
    `Ordinary phone-gallery photo with ${celeb}: candid, slightly soft, not studio, glamour, influencer, editorial, CGI, or a polished composite.`,
    'No beauty filter, no AI-smooth skin, no porcelain/waxy/plastic finish, no airbrush. Skin must look like unretouched real skin — that ordinary texture is what makes the photo beautiful and believable.',
    'Natural non-distinctive imperfections only: visible pores, slight uneven tone, subtle under-eye texture, fine lines, facial asymmetry. Do not invent new moles, scars, or distinctive marks. Realistic hair. Slight grain, compression, imperfect candid framing.',
    `BOTH people share the source photo's grain, softness, sharpness, noise, exposure, white balance and non-retouched skin. ${celeb} must never look smoother, cleaner, sharper, or more retouched than the user.`,
    'Natural spontaneous expressions and body language. Follow the USER SCENE BRIEF literally.',
  ]
}

function naturalMomentBlock(): string[] {
  return [
    'NATURAL MOMENT LOCK: the result must look like a genuine candid shared moment between two real people already together, not two subjects placed side by side.',
    'Relaxed posture, subtle torso rotation, slight lean/head tilt, natural asymmetry, believable proximity. A slight lean-in or arm around shoulder/waist/back is allowed if it improves realism. Small pose tweaks OK for a believable instant.',
    'Avoid stiff, static, symmetrical, overly frontal/centered, or cutout-next-to-user poses. Expressions unforced. Realism = photographic texture AND living human interaction.',
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
 * Prompt selfie « Ajouter la star à ma photo » — formulé comme les tests KIE directs
 * (préservation stricte de la photo source + star dans l'espace libre).
 */
export function buildPhotoEditPrompt(ctx: PhotoGenerationContext): string {
  const {
    celebrityName,
    celebrityDomain,
    celebrityStyleDescription,
    customPrompt,
    hasCelebrityReferenceImage,
  } = ctx
  const starName = sanitizeSceneText(celebrityName) || 'la célébrité'
  const domain = sanitizeSceneText(celebrityDomain)
  const style = celebrityStyleDescription ? sanitizeSceneText(celebrityStyleDescription) : ''
  const dual = Boolean(hasCelebrityReferenceImage)
  const userHint = customPrompt ? sanitizeSceneText(customPrompt).slice(0, 120) : ''
  const starDescription = sanitizeSceneText(
    dual ? (domain ? `${starName} (${domain})` : starName) : [domain && `${starName} (${domain})`, style].filter(Boolean).join('. ')
  ).slice(0, 120) || starName

  return [
    'Utilise image_input[0] comme image de base — c\'est la vérité absolue de la photo.',
    '',
    `Crée une photo ultra réaliste de cette scène, comme si la personne sur la photo avait croisé ${starName} et pris un selfie spontané avec elle/lui.`,
    ...(dual
      ? [`image_input[1] sert uniquement à reconnaître le visage et les cheveux de ${starName} — pas à copier la tenue ni le décor de la référence.`]
      : []),
    '',
    'VERROUILLAGE PHOTO SOURCE (priorité absolue — 0 erreur tolérée) :',
    '- Fond et décor de image_input[0] conservés à 100 % : mêmes bâtiments, rue, ciel, objets, ombres, lumière, angle, perspective, netteté, colorimétrie. Ne recadre pas, ne reconstruis pas, ne remplace pas l\'arrière-plan.',
    '- Tête et visage de la personne sur image_input[0] conservés à 100 % : même identité, forme du visage, yeux, nez, bouche, cheveux, carnation, expression, angle de tête. Interdit de la remplacer, la retoucher, l\'embellir, la rajeunir ou la fusionner avec la star.',
    '- Seule modification autorisée : ajouter la star dans l\'espace libre à côté. Tout le reste de image_input[0] reste figé pixel par pixel.',
    '',
    'Règles absolues :',
    `- Ajoute uniquement ${starName} dans l'espace libre à côté, comme si la photo avait été prise à deux dès l'origine.`,
    '- Star immédiatement reconnaissable, intégration naturelle sans collage visible.',
    ...photoEditHeightLinesFr(ctx, starName),
    '- Tenue casual réaliste adaptée au lieu (pas tapis rouge, pas look trop stylisé).',
    '- Résultat = vrai selfie iPhone sur le vif, pas photo studio.',
    '',
    'Style : lumière naturelle, peau avec texture réelle et petits défauts, cheveux vivants, proportions justes, posture détendue, rencontre spontanée.',
    '',
    'Composition : la personne reste exactement à sa place, inchangée. La star occupe uniquement l\'espace vide à côté, légèrement penchée, proche, attitude amicale.',
    '',
    'À éviter absolument : fond modifié, tête ou visage de l\'utilisateur remplacé/retouché, peau plastique, effet beauté, visage déformé, arrière-plan reconstruit, pose trop parfaite, rendu pro, collage visible.',
    ...(userHint ? ['', `Note : ${userHint}`] : []),
    ...(dual ? [] : ['', `Célébrité : ${starDescription}.`]),
    '',
    `Objectif : une vraie photo selfie — la personne et le fond de image_input[0] intacts à 100 %, ${starName} ajoutée naturellement à côté.`,
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

export const CUSTOM_PROMPT_EXAMPLES = [
  'Victoire d\'escape room à 00:01, tenues chic froissées, tu brandis une clé géante en plastique, la star applaudit trop fort.',
  'File du McDo drive à 2h du matin en smoking, plateau sur le toit de la voiture, regards caméra ultra sérieux.',
  'Laverie automatique un mardi soir, panier à linge entre vous, sweats tour merch assortis, pose souvenir de colonie.',
  'Cabine karaoke 2€, micro-brosse à dents, paillettes de scène + crocs, duo hors-ton assumé.',
]
