import type { PhotoGenerationContext, PhotoScene } from './types'

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
  outfits: [
    'Tenues chic + gilets de sauvetage fluo « au cas où »',
    'Costumes d\'anniversaire enfant trop petits, badges prénom',
    'Looks premium froissés genre « on a dormi dans l\'avion »',
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

/** Critère #1 : identité faciale INTÉGRALE.
 *  Avec 2 images, Person A et Person B sont verrouillés à égalité. */
function facePreservationBlock(hasCelebrityReferenceImage: boolean): string[] {
  const dual = hasCelebrityReferenceImage
  return [
    '⚠️⚠️ ABSOLUTE PRIORITY — DUAL FACIAL IDENTITY LOCK ⚠️⚠️',
    dual
      ? 'This task is an IDENTITY-PRESERVING COMPOSITE EDIT using TWO reference photos. It is NOT face generation, NOT face redesign, NOT beautification, NOT a likeness reinterpretation.'
      : 'This task is an IDENTITY-PRESERVING EDIT of Person A from the reference photo. Person A\'s face must stay pixel-faithful to the reference.',
    '',
    'image_input ORDER:',
    dual
      ? '- image_input[0] = Person A (USER) — ground-truth face #1'
      : '- image_input[0] = Person A (USER) — ground-truth face',
    dual ? '- image_input[1] = Person B (CELEBRITY) — ground-truth face #2' : '',
    '',
    'PERSON A (USER) — HARD LOCK:',
    '- Copy Person A\'s face EXACTLY from image_input[0]: bone structure, eyes, eyebrows, nose, lips, jawline, cheeks, ears, hairline, skin tone, freckles/marks, age.',
    '- Do NOT redraw, reinvent, morph, average, smooth, beautify, age-shift, or "improve" Person A\'s face.',
    '- Do NOT blend Person A with Person B. Zero facial feature transfer in either direction.',
    '- Allowed changes for Person A ONLY: body pose, outfit, hands, and scene lighting falling on an UNCHANGED face.',
    '',
    ...(dual
      ? [
          'PERSON B (CELEBRITY) — HARD LOCK (SAME STRENGTH AS PERSON A):',
          '- Copy Person B\'s face EXACTLY from image_input[1]: same identity, same features, same hair as in that photo.',
          '- Do NOT invent a generic celebrity face. Do NOT use prior knowledge of the celebrity if it conflicts with image_input[1].',
          '- Do NOT beautify, morph, blend with Person A, or replace Person B with a different person.',
          '- Allowed changes for Person B ONLY: body pose, outfit, and scene lighting falling on an UNCHANGED face.',
          '',
          'FAILURE CONDITIONS (either one fails the whole result):',
          '- Person A is not instantly recognizable as the exact same person as image_input[0].',
          '- Person B is not instantly recognizable as the exact same person as image_input[1].',
          '- Any face-swap artifact, melted features, hybrid face, or "AI beauty filter" look on either person.',
        ]
      : [
          'FAILURE CONDITION:',
          '- Person A is not instantly recognizable as the exact same person as image_input[0] → FAILED, even if the scene is perfect.',
          '- Prefer keeping Person A\'s face unchanged over perfect scene composition.',
        ]),
  ].filter((line) => line !== '')
}

/** Anti-"AI look" : photo smartphone amateur, indiscernable d'une vraie photo. */
function photorealismBlock(): string[] {
  return [
    'PHOTOREALISM — AUTHENTIC AMATEUR SMARTPHONE PHOTO (highest visual priority after face locks):',
    'Generate a photo that is completely indistinguishable from a genuine amateur smartphone picture taken in real life.',
    'The image must NEVER look AI-generated, CGI, rendered, edited, or professionally photographed.',
    '',
    'STYLE:',
    '- Authentic smartphone photography; natural candid moment.',
    '- Slightly imperfect framing; slight handheld camera shake; tiny motion blur when appropriate.',
    '- Natural facial expressions (not exaggerated, not perfect).',
    '- Realistic human skin with pores, texture, small blemishes and imperfections — NO beauty filter.',
    '- Natural eye reflections; slight phone-lens distortion; automatic smartphone HDR (mild, not overcooked).',
    '- Mild digital noise and compression artifacts; realistic white balance; slightly inconsistent exposure.',
    '- Natural clothing wrinkles; random real background details.',
    '- Real-life lighting ONLY — environment light must affect subjects naturally, with genuine shadows and reflections.',
    '- Imperfect focus consistency.',
    '',
    'COMPOSITION:',
    '- Spontaneous: as if someone quickly pulled out their phone and captured a real moment without preparation.',
    '- Must NOT feel posed or professionally composed.',
    '',
    'PEOPLE:',
    '- Body proportions, hands, teeth, hair and facial features completely natural.',
    '- Subtle human asymmetry; avoid exaggerated smiles or perfect poses.',
    '- Hands/fingers/ears/eyes anatomically correct — no extra fingers, warped ears, or glassy doll eyes.',
    '',
    'CAMERA:',
    '- Looks taken on an iPhone or recent Android smartphone, default Camera app, automatic mode.',
    '',
    'NEGATIVE / FORBIDDEN LOOK:',
    '- No CGI, no AI look, no studio lighting, no cinematic lighting, no beauty filter, no glamour photography.',
    '- No influencer aesthetic, no ultra-sharp details, no fake bokeh, no perfect symmetry, no wax/plastic skin.',
    '- No overprocessed HDR, no unrealistic colors, no commercial / fashion / magazine photography.',
    '- No unnatural facial expressions.',
    '',
    'VARIATION:',
    '- Randomize camera angle, focal length, distance, lighting, expressions, posture, head orientation, framing, background activity, object placement, and slight imperfections so each generation feels like a different real-life moment.',
    '- Final result should be impossible to distinguish from a genuine Snapchat / BeReal / Instagram Stories / smartphone gallery photo.',
    '',
    'SCENE FIDELITY — FOLLOW THE USER BRIEF LITERALLY:',
    '- Execute the requested location, outfits, and pose EXACTLY as described. Do not substitute a generic VIP / red-carpet / yacht / gala stock scene.',
    '- If the brief is quirky, funny, or specific, KEEP that specificity — originality is the point.',
    '- Do not "upgrade" the scene into a cliché celebrity photoshoot unless the user asked for that.',
  ]
}

/**
 * Prompt Nano Banana 2 — scènes guidées ou prompt libre utilisateur.
 */
export function buildPhotoPrompt(ctx: PhotoGenerationContext): string {
  const {
    celebrityName,
    celebrityDomain,
    celebrityStyleDescription,
    funFact,
    mode,
    scene,
    customPrompt,
    hasCelebrityReferenceImage,
  } = ctx

  const dual = Boolean(hasCelebrityReferenceImage)
  const domain = sanitizeSceneText(celebrityDomain)
  const style = celebrityStyleDescription ? sanitizeSceneText(celebrityStyleDescription) : ''
  // Ne jamais injecter les traits de ressemblance dans le prompt de génération :
  // ils poussent le modèle à morpher / mélanger les visages.
  const mood = !dual && funFact ? sanitizeSceneText(funFact) : ''

  const subjectLines = [
    dual
      ? '- Person A = face locked from image_input[0]. Person B = face locked from image_input[1].'
      : '- Person A (USER): face locked from image_input[0] — identity preserved exactly.',
    dual
      ? `- Person B name label only (do not reinvent the face): ${celebrityName}${domain ? `, ${domain}` : ''}.`
      : `- Person B (CELEBRITY): ${celebrityName}${domain ? `, ${domain}` : ''} — believable likeness beside Person A, WITHOUT changing Person A\'s face.`,
    !dual && style ? `- Celebrity styling for Person B only (clothes/hair vibe, NOT Person A\'s face): ${style}.` : '',
    mood ? `- Scene mood / energy only (NOT faces): ${mood}.` : '',
  ]

  const requirements = [
    'SCENE REQUIREMENTS (secondary to face locks, but must still obey the brief):',
    '- Both people clearly visible in ONE cohesive real photograph.',
    '- Natural bodies/poses; faces remain identity-locked as above.',
    '- Tasteful, family-friendly content.',
    '- Single photo — not a collage, not a side-by-side split, not a face-swap glitch.',
    '- If anything conflicts with the face locks, DROP the conflicting detail and KEEP the faces.',
  ]

  const finalReminder = dual
    ? [
        'FINAL MANDATORY CHECK:',
        '1) Compare Person A\'s output face to image_input[0] — must be the same person, unedited identity.',
        '2) Compare Person B\'s output face to image_input[1] — must be the same person, unedited identity.',
        '3) Does it look like a raw smartphone snap (Snapchat/BeReal/Stories), NOT AI/CGI/studio/glamour? If not, fix realism.',
        '4) Does the scene match the user brief specifically (not a generic celebrity cliché)? If not, fix the scene.',
        '5) Face integrity > scene beauty, but face locks AND amateur-phone realism AND brief fidelity are all required.',
      ]
    : [
        'FINAL MANDATORY CHECK:',
        '1) Compare Person A\'s output face to image_input[0] — must look like an unedited crop of the same face.',
        '2) Does it look like a raw smartphone snap (Snapchat/BeReal/Stories), NOT AI/CGI/studio/glamour? If not, fix realism.',
        '3) Does the scene match the user brief specifically? If not, fix the scene.',
        '4) Face integrity > scene beauty, but face lock AND amateur-phone realism AND brief fidelity are all required.',
      ]

  const opener = dual
    ? 'IDENTITY-PRESERVING COMPOSITE: keep BOTH reference faces exactly intact while placing Person A and Person B together in a NEW scene that faithfully matches the user brief — output must look like a genuine amateur smartphone photo.'
    : 'IDENTITY-PRESERVING EDIT: keep Person A\'s face exactly intact from the reference while placing them in a scene with a celebrity — output must look like a genuine amateur smartphone photo that faithfully matches the user brief.'

  if (mode === 'custom' && customPrompt) {
    const userPrompt = sanitizeSceneText(customPrompt)
    return [
      opener,
      '',
      ...facePreservationBlock(dual),
      '',
      ...photorealismBlock(),
      '',
      'USER SCENE PROMPT (apply to setting/outfits/pose ONLY — faces stay locked; follow literally):',
      userPrompt,
      '',
      'SUBJECTS:',
      ...subjectLines,
      '',
      ...requirements,
      '',
      ...finalReminder,
    ].filter(Boolean).join('\n')
  }

  if (!scene) {
    throw new Error('photoScene requis en mode presets')
  }

  const location = sanitizeSceneText(scene.location)
  const outfits = sanitizeSceneText(scene.outfits)
  const position = sanitizeSceneText(scene.position)

  return [
    opener,
    '',
    ...facePreservationBlock(dual),
    '',
    ...photorealismBlock(),
    '',
    'USER SCENE BRIEF (setting/outfits/pose ONLY — faces stay locked; follow literally):',
    `1. LOCATION / SETTING: ${location}`,
    `2. OUTFITS for both people: ${outfits}`,
    `3. POSE and FRAMING: ${position}`,
    '',
    'SUBJECTS:',
    ...subjectLines,
    '',
    ...requirements,
    '',
    ...finalReminder,
  ].filter(Boolean).join('\n')
}

export const CUSTOM_PROMPT_EXAMPLES = [
  'Victoire d\'escape room à 00:01, tenues chic froissées, tu brandis une clé géante en plastique, la star applaudit trop fort.',
  'File du McDo drive à 2h du matin en smoking, plateau sur le toit de la voiture, regards caméra ultra sérieux.',
  'Laverie automatique un mardi soir, panier à linge entre vous, sweats tour merch assortis, pose souvenir de colonie.',
  'Cabine karaoke 2€, micro-brosse à dents, paillettes de scène + crocs, duo hors-ton assumé.',
]
