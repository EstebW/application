import { getInteractionPrompt } from './interactions'
import { heightConsistencyBlock } from './height-prompt'
import type { PhotoGenerationContext, PhotoScene } from './types'

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

/** Critère #1 : identité faciale INTÉGRALE.
 *  Avec 2 images, Person A et Person B sont verrouillés à égalité.
 *  Parcours « jumeau » (1 image) : verrouillage maximal contre le morphing vers la star. */
function facePreservationBlock(hasCelebrityReferenceImage: boolean): string[] {
  const dual = hasCelebrityReferenceImage
  return [
    '⚠️⚠️ ABSOLUTE PRIORITY — FACIAL IDENTITY LOCK (NON-NEGOTIABLE) ⚠️⚠️',
    dual
      ? 'This task is an IDENTITY-PRESERVING COMPOSITE EDIT using TWO reference photos. It is NOT face generation, NOT face redesign, NOT beautification, NOT a likeness reinterpretation.'
      : 'This task is an IDENTITY-PRESERVING EDIT of Person A from the reference photo. Person A\'s face, hair, and head proportions must stay pixel-faithful to image_input[0]. The celebrity match is thematic only — NEVER transfer the celebrity\'s look onto Person A.',
    '',
    'image_input ORDER:',
    dual
      ? '- image_input[0] = Person A (USER) — ground-truth face #1'
      : '- image_input[0] = Person A (USER) — sole ground-truth for Person A\'s identity',
    dual ? '- image_input[1] = Person B (CELEBRITY) — ground-truth face #2' : '',
    '',
    'PERSON A (USER) — HARD LOCK (STRICTER THAN SCENE / CELEBRITY):',
    '- Treat image_input[0] as a biometric template. Person A in the output must look like the SAME photograph of the SAME person, only reposed in a new scene.',
    '- Copy EXACTLY from image_input[0]: bone structure, skull shape, face width, cheek volume, jawline, chin, forehead, eyes, eye spacing, eyebrows, nose (bridge + tip + nostrils), lips, ears, neck thickness, skin tone, freckles/moles/marks, age, and facial fat distribution.',
    '- HAIR LOCK: keep the EXACT hair color, undertone (warm/cool), dye/roots if any, texture (straight/wavy/curly/coily), length, volume, parting, hairline, and hairstyle from image_input[0]. Do NOT recolor, lighten, darken, highlight, straighten, curl, thicken, thin, or restyle Person A\'s hair to match the celebrity or the scene.',
    '- PROPORTION LOCK: do NOT enlarge, widen, puff, inflate, slim, elongate, or "beautify" the face. Do NOT make the face fuller, rounder, thinner, or more angular than in image_input[0]. Keep the same head-to-body scale.',
    '- Do NOT redraw, reinvent, morph, average, smooth, beautify, age-shift, gender-shift, ethnicity-shift, or "improve" Person A.',
    '- Do NOT blend Person A with Person B / the celebrity. Zero transfer of hair color, face shape, jaw, lips, eyes, brows, skin tone, or makeup from the celebrity onto Person A.',
    '- Glasses, facial hair, piercings, and accessories on Person A\'s face must match image_input[0] (present only if present in the reference).',
    '- Allowed changes for Person A ONLY: body pose, clothing (unless the brief keeps their outfit), hands, and scene lighting falling on an otherwise UNCHANGED face and hair.',
    '',
    ...(dual
      ? [
          'PERSON B (CELEBRITY) — HARD LOCK (SAME STRENGTH AS PERSON A):',
          '- Copy Person B\'s face EXACTLY from image_input[1]: same identity, same features, same hair as in that photo.',
          '- Do NOT invent a generic celebrity face. Do NOT use prior knowledge of the celebrity if it conflicts with image_input[1].',
          '- Do NOT beautify, morph, blend with Person A, or replace Person B with a different person.',
          '- Allowed changes for Person B ONLY: body pose, FULL OUTFIT (mandatory — see wardrobe rules), and scene lighting falling on an UNCHANGED face.',
          '- CLOTHING FROM image_input[1] IS NOT LOCKED. Discard the reference photo\'s suit, uniform, jersey, stage costume, or formalwear unless the USER SCENE BRIEF explicitly asks for that same outfit.',
          '',
          'FAILURE CONDITIONS (either one fails the whole result):',
          '- Person A is not instantly recognizable as the exact same person as image_input[0].',
          '- Person A\'s hair color/style or face width/volume differs from image_input[0].',
          '- Person B is not instantly recognizable as the exact same person as image_input[1].',
          '- Person B still wears their iconic/reference clothing when the scene brief calls for casual / location-appropriate clothes.',
          '- Any face-swap artifact, melted features, hybrid face, or "AI beauty filter" look on either person.',
        ]
      : [
          'PERSON B (CELEBRITY) — SEPARATE IDENTITY:',
          '- Person B is a different person standing next to Person A. Generate Person B\'s own appearance.',
          '- Never "nudge" Person A toward looking more like Person B (no shared hair color, no shared face fullness, no hybrid look).',
          '- Looking alike as twins is a FUN LABEL only — visually they remain two distinct people; Person A stays locked to image_input[0].',
          '',
          'FAILURE CONDITIONS (any one fails the whole result):',
          '- Person A is not instantly recognizable as the exact same person as image_input[0] → FAILED, even if the scene is perfect.',
          '- Person A\'s hair color, hair style, or face width/fullness differs from image_input[0] → FAILED.',
          '- Person A looks partially like the celebrity (hybrid / averaged face) → FAILED.',
          '- Prefer an imperfect scene over ANY change to Person A\'s face or hair.',
        ]),
  ].filter((line) => line !== '')
}

/** Anti-"AI look" : photo smartphone amateur, indiscernable d'une vraie photo. */
function photorealismBlock(celebrityName: string): string[] {
  const celeb = sanitizeSceneText(celebrityName) || 'the celebrity'
  return [
    'PHOTOREALISM — AUTHENTIC AMATEUR SMARTPHONE PHOTO (highest visual priority after face locks):',
    `Create a highly believable real-life amateur smartphone photo featuring the user together with ${celeb} in the scene described in the USER SCENE BRIEF below.`,
    '',
    'ABSOLUTE PRIORITY — PRESERVE THE USER\'S IDENTITY EXACTLY:',
    'Do not redesign, beautify, improve, reinterpret, fatten, slim, or recolor the user. Keep the exact facial structure, face width, cheek volume, jawline, nose shape, eye shape, mouth shape, hair color, hair texture, hairstyle, skin tone, glasses if present, and overall likeness. The user must still look exactly like the same real person from the source image, not like an AI-modified or celebrity-blended version.',
    '',
    'The image must look like a genuine casual phone photo taken in real life, not like AI art, CGI, a 3D render, or a professional photoshoot. It should feel spontaneous, natural, candid, and slightly imperfect, as if captured quickly in a real moment by a friend or as a casual selfie.',
    '',
    'AUTHENTIC AMATEUR SMARTPHONE PHOTOGRAPHY STYLE:',
    '- natural real-world lighting only',
    '- slightly imperfect framing',
    '- subtle handheld feel',
    '- mild realistic motion blur when appropriate',
    '- slight lens distortion from a phone camera',
    '- natural skin texture with pores and small imperfections',
    '- realistic eyes, teeth, hands, and hair',
    '- realistic clothing wrinkles and folds',
    '- mild phone-camera noise',
    '- slight compression artifacts',
    '- realistic shadows and reflections',
    '- believable depth and perspective',
    '- authentic background details',
    '- natural asymmetry in faces and posture',
    '- expressions must feel relaxed and genuine, not staged',
    '',
    `${celeb} must look naturally present in the same environment as the user, with realistic posture, believable body language, and lighting perfectly matching the surroundings. The interaction between the user and ${celeb} should feel like a real encounter captured in the moment, not like a promotional image or posed advertisement.`,
    '',
    'The composition must not feel too perfect or too polished. Avoid a centered commercial look. Let the image feel like a normal everyday snapshot from a phone gallery, Snapchat, BeReal, or Instagram Story. The final image should include subtle imperfections that make it feel real: slightly uneven framing, tiny exposure inconsistencies, natural ambient clutter, and realistic environment details.',
    '',
    'IMPORTANT NEGATIVE REQUIREMENTS:',
    'Do not make the skin too smooth, do not beautify the face, do not change the user\'s hair color or hairstyle, do not make the user\'s face fuller/wider/thinner than the reference, do not over-sharpen, do not make the image cinematic, do not use studio lighting, do not create a beauty-filter effect, do not make smiles too perfect, do not create fake bokeh, do not overprocess HDR, do not distort objects, do not generate incoherent backgrounds, do not create unrealistic car interiors or strange object shapes, do not make the subjects look like influencers or models, and do not make the result look AI-generated in any way.',
    '',
    'AVOID: AI-generated look, CGI, 3D render, waxy skin, doll face, glossy skin, fake symmetry, changed hair color, celebrity-hair transplant onto the user, puffy/inflated cheeks, widened jaw, slimmed face, perfect composition, professional advertising style, fashion-shoot vibes, magazine photography, unrealistic colors, over-detailed textures, unnatural hands, distorted perspective, and artificial background people.',
    '',
    'VARIATION (scene only — NEVER vary Person A\'s identity):',
    '- Randomize camera angle, focal length, distance, lighting, Person B expression, posture, framing, background activity, object placement, and slight imperfections so each generation feels like a different real-life moment.',
    '- Do NOT randomize Person A\'s hair, face shape, facial features, or identity.',
    '',
    'SCENE FIDELITY — FOLLOW THE USER BRIEF LITERALLY:',
    '- Execute the requested location, outfits, and pose EXACTLY as described. Do not substitute a generic VIP / red-carpet / yacht / gala stock scene.',
    '- If the brief is quirky, funny, or specific, KEEP that specificity — originality is the point.',
    '- Do not "upgrade" the scene into a cliché celebrity photoshoot unless the user asked for that.',
    '',
    `OUTPUT GOAL: a photo that is almost impossible to distinguish from a genuine real amateur smartphone picture taken in a real-life moment with ${celeb} in the requested scene.`,
  ]
}

/**
 * Tenues adaptées au lieu — pas aux habits iconiques de la star
 * (ex. Macron en costard dans un parc → tenue civile décontractée).
 */
function sceneAdaptiveWardrobeBlock(celebrityName: string): string[] {
  const celeb = sanitizeSceneText(celebrityName) || 'the celebrity'
  return [
    '⚠️ SCENE-ADAPTIVE WARDROBE (MANDATORY — SAME PRIORITY AS SCENE FIDELITY) ⚠️',
    'Clothing is driven by LOCATION + OUTFIT BRIEF, never by the celebrity\'s famous look or by clothes visible in any reference photo.',
    '',
    `- Dress BOTH Person A and ${celeb} (Person B) for THIS specific setting, as real people would dress if they were actually there together.`,
    `- Do NOT keep ${celeb}'s signature / official / stage / match-day / red-carpet / presidential / suit-and-tie wardrobe by default.`,
    '- Examples: park / street / café / home / beach / laundromat → casual civilian clothes (jeans, sneakers, jacket, t-shirt…). Formal suit only if the brief explicitly asks for formalwear or a formal venue.',
    '- If the outfit brief is playful or quirky, apply that spirit to BOTH people — matching vibes, not a VIP next to a tourist.',
    '- If the outfit brief is vague, infer natural clothes from the location (weather, activity, time of day) — still casual when the place is casual.',
    '- Reference images supply FACE and HAIR identity only. Their garments, shoes, accessories (except eyeglasses already on the locked face), and styling props must be redesigned for the scene.',
    `- A park selfie with ${celeb} still in a formal suit / jersey / gown when the brief did not ask for it = FAILED wardrobe.`,
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
      : '- Person A (USER): face + hair + head proportions locked from image_input[0] — biometric identity preserved exactly; never morph toward the celebrity.',
    dual
      ? `- Person B name label only (do not reinvent the face): ${celebrityName}${domain ? `, ${domain}` : ''}. Clothes = scene-adapted, NOT from image_input[1].`
      : `- Person B (CELEBRITY): ${celebrityName}${domain ? `, ${domain}` : ''} — separate person beside Person A. Do NOT borrow Person B\'s hair color, face shape, or features for Person A. Dress Person B for the scene, not their iconic look.`,
    !dual && style
      ? `- Optional Person B fashion vibe (LOW priority — override with location-appropriate clothes if the scene is casual): ${style}.`
      : '',
    mood ? `- Scene mood / energy only (NOT faces, NOT Person A\'s hair): ${mood}.` : '',
  ]

  const requirements = [
    'SCENE REQUIREMENTS (secondary to face locks, but must still obey the brief):',
    '- Both people clearly visible in ONE cohesive real photograph.',
    '- Natural bodies/poses; faces remain identity-locked as above.',
    '- Outfits for BOTH people must match the location and outfit brief (scene-adaptive wardrobe).',
    '- Tasteful, family-friendly content.',
    '- Single photo — not a collage, not a side-by-side split, not a face-swap glitch.',
    '- If anything conflicts with the face locks, DROP the conflicting detail and KEEP the faces.',
    '- If iconic celebrity clothing conflicts with the scene, DROP the iconic clothing and KEEP the scene-appropriate outfits.',
  ]

  const finalReminder = dual
    ? [
        'FINAL MANDATORY CHECK:',
        '1) Compare Person A\'s output face to image_input[0] — must be the same person, unedited identity.',
        '2) Compare Person B\'s output face to image_input[1] — must be the same person, unedited identity.',
        '3) Are BOTH outfits appropriate for THIS location / outfit brief (not Person B\'s default suit/jersey/gown)? If not, restyle clothes.',
        '4) Does it look like a raw smartphone snap (Snapchat/BeReal/Stories), NOT AI/CGI/studio/glamour? If not, fix realism.',
        '5) Does the scene match the user brief specifically (not a generic celebrity cliché)? If not, fix the scene.',
        '6) Face integrity > scene beauty, but face locks AND amateur-phone realism AND brief fidelity AND scene-adaptive clothes are all required.',
      ]
    : [
        'FINAL MANDATORY CHECK:',
        '1) Compare Person A\'s output face to image_input[0] — same person, same face width/volume, same features, unedited identity.',
        '2) Compare Person A\'s hair to image_input[0] — same color, texture, length, and style (no celebrity hair transplant).',
        '3) Person A must NOT look like a blend/average with the celebrity.',
        '4) Are BOTH outfits appropriate for THIS location / outfit brief (celebrity not stuck in iconic formalwear)? If not, restyle clothes.',
        '5) Does it look like a raw smartphone snap (Snapchat/BeReal/Stories), NOT AI/CGI/studio/glamour? If not, fix realism.',
        '6) Does the scene match the user brief specifically? If not, fix the scene.',
        '7) Face + hair integrity of Person A > scene beauty. If identity drifted, the result is invalid.',
      ]

  const opener = dual
    ? 'IDENTITY-PRESERVING COMPOSITE: keep BOTH reference faces exactly intact while placing Person A and Person B together in a NEW scene that faithfully matches the user brief — output must look like a genuine amateur smartphone photo.'
    : 'IDENTITY-PRESERVING EDIT: keep Person A\'s face, hair color, hairstyle, and head proportions EXACTLY intact from image_input[0] while placing them in a scene with a celebrity — never morph Person A toward the celebrity. Output must look like a genuine amateur smartphone photo that faithfully matches the user brief.'

  const interactionPrompt = getInteractionPrompt(interaction)
  const interactionLine = interactionPrompt
    ? `4. INTERACTION between the two people: ${sanitizeSceneText(interactionPrompt)}.`
    : ''

  // Les lignes vides sont filtrées en fin de fonction : le bloc est pré-joint
  // pour conserver ses paragraphes.
  const heightSection = heightConsistencyBlock(ctx).join('\n')

  if (mode === 'custom' && customPrompt) {
    const userPrompt = sanitizeSceneText(customPrompt)
    return [
      opener,
      '',
      ...facePreservationBlock(dual),
      '',
      ...photorealismBlock(celebrityName),
      '',
      ...sceneAdaptiveWardrobeBlock(celebrityName),
      '',
      heightSection,
      '',
      'USER SCENE PROMPT (apply to setting/outfits/pose ONLY — faces stay locked; follow literally):',
      userPrompt,
      interactionLine,
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
    ...photorealismBlock(celebrityName),
    '',
    ...sceneAdaptiveWardrobeBlock(celebrityName),
    '',
    heightSection,
    '',
    'USER SCENE BRIEF (setting/outfits/pose ONLY — faces stay locked; follow literally):',
    `1. LOCATION / SETTING: ${location}`,
    `2. OUTFITS for both people (MUST adapt to the location — no iconic celebrity default clothes): ${outfits}`,
    `3. POSE and FRAMING: ${position}`,
    interactionLine,
    '',
    'SUBJECTS:',
    ...subjectLines,
    '',
    ...requirements,
    '',
    ...finalReminder,
  ].filter(Boolean).join('\n')
}

/**
 * Prompt « Ajouter la star à ma photo » — la photo importée est la base immuable.
 * On n'invente ni décor ni visage : on insère seulement la star dans l'espace libre.
 */
export function buildPhotoEditPrompt(ctx: PhotoGenerationContext): string {
  const { celebrityName, celebrityDomain, interaction, customPrompt, hasCelebrityReferenceImage } = ctx
  const celeb = sanitizeSceneText(celebrityName) || 'the celebrity'
  const domain = sanitizeSceneText(celebrityDomain)
  const dual = Boolean(hasCelebrityReferenceImage)
  const interactionPrompt = getInteractionPrompt(interaction)
  // Précision facultative de l'utilisateur : jamais prioritaire sur la préservation.
  const userHint = customPrompt ? sanitizeSceneText(customPrompt).slice(0, 300) : ''

  return [
    'INVISIBLE INTEGRATION OF A CELEBRITY INTO AN EXISTING PHOTOGRAPH.',
    '',
    'Edit the uploaded photograph instead of generating an entirely new image.',
    '',
    'Treat the uploaded photograph as the immutable visual base of the final result.',
    '',
    `The goal is to add ${celeb}${domain ? ` (${domain})` : ''} naturally into the existing photograph, so that it looks as if they had really been present at the moment the original photo was taken.`,
    '',
    'image_input ORDER:',
    '- image_input[0] = THE BASE PHOTOGRAPH (immutable). It defines EVERYTHING: camera, framing, perspective, eye level, lighting and image quality. It contains the user.',
    ...(dual
      ? [
          `- image_input[1] = FACIAL IDENTITY REFERENCE ONLY for ${celeb}.`,
          '- CRITICAL: image_input[1] is NOT a cutout to paste. Never copy its framing, crop, head size, head angle, body pose, clothing scale, background, lighting or image quality. Take the facial identity from it and NOTHING else.',
          `- If image_input[1] shows only a head or upper body, generate the rest of ${celeb}'s body naturally, consistent with their real build and with the framing of image_input[0].`,
          `- ${celeb}'s facial identity must match image_input[1] exactly — same features, same hair. Do not invent a generic celebrity face and do not blend their face with the user's.`,
        ]
      : []),
    '',
    'DO NOT ASSUME THIS IS A GROUP PHOTO.',
    '',
    'Do not change the type of photo, the setting, the composition, the mood or the intent of the original photograph.',
    '',
    `Adapt ${celeb} to the existing image, whether it is a selfie, a portrait, a full-body shot, an indoor photo, an outdoor photo, an amateur snapshot, a party, a car interior, a street, a beach, a restaurant, a concert or any other real-life situation.`,
    '',
    'PRESERVE THE ORIGINAL PHOTOGRAPH AND THE PERSON ALREADY IN IT AS MUCH AS POSSIBLE.',
    '',
    'Do not regenerate, replace, beautify, redraw, smooth, sharpen or reinterpret the user.',
    '',
    'Preserve exactly: their identity; their face; their facial proportions; their expression; their skin texture; their hairstyle; their body; their posture; their hands; their clothing; their accessories.',
    '',
    'Preserve the original photographic characteristics as well: the background; the objects; the framing; the crop; the camera angle; the perspective; the horizon line; the apparent focal length; the resolution; the lighting; the shadows; the reflections; the colours; the sharpness; the blur; the depth of field; the grain; the digital noise; the compression artefacts; the visual signature of the camera or smartphone that took the photo.',
    '',
    `Only add ${celeb} into a physically believable available area of the photograph.`,
    '',
    `${celeb}'s position, posture, body orientation, expression, interaction and visibility must adapt naturally to the existing scene.`,
    '',
    'Do not impose a posture or an interaction that is incompatible with the original photograph.',
    '',
    `${celeb} must match the source photo precisely in terms of: perspective; camera height; body scale; distance from the camera; light direction; light intensity; shadow softness; exposure; white balance; colour temperature; colour cast; contrast; saturation; dynamic range; sharpness; focus softness; motion blur; depth of field; skin detail level; sensor noise; grain; compression; lens distortion; overall image quality.`,
    '',
    `${celeb} must NEVER appear sharper, cleaner, brighter, more detailed, more saturated, more contrasted or more professionally photographed than the user or the original environment.`,
    '',
    'If the source photograph is dark, soft, slightly blurry, grainy, noisy, compressed, desaturated, imperfectly exposed or of average quality, reproduce those exact same imperfections on the added celebrity.',
    '',
    `${celeb} must feel physically present in the environment. Use realistically: ground placement; perspective; body scale; contact shadows; cast shadows; light bounced from the environment; contour softness; overlaps; natural occlusions; spacing between people and objects; interaction with nearby objects; interaction with the user when appropriate.`,
    '',
    `${celeb} must not look pasted, floating, cut out, superimposed or photographed with a different camera.`,
    '',
    'GEOMETRY AND SCALE — THIS IS THE #1 FAILURE POINT, TREAT IT AS CRITICAL:',
    `- Render ${celeb} as a COMPLETE, coherent human being physically present in the scene. Never a floating head, never a head-and-shoulders cutout, never a sticker pasted on top of the photo.`,
    '- Their head-to-body proportions must be anatomically correct. A head without a matching body, or a head too large for its body, is an automatic failure.',
    '- Size their head like a real human head at their actual distance from the camera: compare it to the user\'s head and scale it by depth — slightly smaller when further away, never bigger unless they are clearly closer to the lens.',
    '- Use the SAME eye level, horizon line, camera height, lens focal length and perspective vanishing lines as image_input[0]. Their gaze and head tilt must be consistent with that camera position.',
    '- Ground them physically: plausible standing or seated position, weight supported by the floor, feet visible or naturally occluded by the user, furniture or the frame border.',
    '- If image_input[0] is a close-range selfie, place them at arm\'s length beside or slightly behind the user, sharing the same wide-angle distortion, partially occluded by the user or the frame — exactly as it would happen in real life.',
    '- If the frame cuts them off, it must read as natural photographic framing: a continuous body cut by the image border, never a detached silhouette floating inside the frame.',
    '- Blend their edges into the photograph: no hard cutout outline, no halo, no fringe. Their contours must carry the same softness, motion blur, grain and JPEG compression as the surrounding pixels.',
    `- Do not reuse or re-attribute the user's limbs. Any arm or hand belonging to ${celeb} must be anatomically connected to their own body. Never add a limb without a body.`,
    '- Never duplicate people, faces, hands or limbs.',
    '',
    heightConsistencyBlock(ctx).join('\n'),
    '',
    'DO NOT reconstruct the whole scene.',
    'DO NOT globally enhance or upgrade the photograph.',
    'DO NOT add cinematic lighting.',
    'DO NOT add studio lighting.',
    'DO NOT create fake HDR.',
    'DO NOT create fake background blur.',
    'DO NOT create shiny, plastic or artificial skin.',
    'DO NOT turn the image into a promotional, advertising, editorial, cinematic or poster photograph.',
    'DO NOT crop or reframe the image unless absolutely necessary.',
    '',
    `Make only the changes strictly necessary to integrate ${celeb} naturally into the original photograph.`,
    '',
    'AVOID: pasted cutout look, sticker effect, collage, photomontage, floating head or torso, disembodied head, oversized or undersized head, wrong head-to-body ratio, mismatched perspective, mismatched eye level, subject sharper than the photo, hard edges, halo outline, distorted anatomy, incoherent shadows, duplicated objects, altered faces, artificial skin and any obvious AI-generated appearance.',
    '',
    ...(interactionPrompt
      ? [
          'OPTIONAL INTERACTION (only if it fits the existing photo without moving or reshaping the user):',
          `- Preferred: ${sanitizeSceneText(interactionPrompt)}.`,
          '- If this interaction would require changing the user\'s pose, body, framing or background, IGNORE it and simply place the celebrity in the free space.',
          '',
        ]
      : []),
    ...(userHint
      ? [
          'OPTIONAL USER NOTE (lowest priority — never overrides the rules above):',
          userHint,
          '- Ignore any part of this note that would modify the user, the background or the framing.',
          '',
        ]
      : []),
    'FINAL GOAL:',
    'The edited result must look like ONE single real photograph taken at the same moment with the same camera.',
    'Someone looking at the image must not be able to tell which person was added after the shot.',
    '',
    'FINAL MANDATORY CHECK:',
    '1) Is the user pixel-identical to image_input[0] (face, pose, clothes, expression)? If not, redo without touching them.',
    '2) Is the background the ORIGINAL background, not a recreated one? If not, redo.',
    `3) Is ${celeb} a COMPLETE person with a correctly proportioned body, head size, eye level and perspective consistent with the user? If not, fix the geometry before anything else.`,
    `4) Is ${celeb} exactly as soft, grainy, noisy and imperfect as the rest of the photograph — never cleaner or sharper? If not, degrade them to match.`,
    '5) Does any part look pasted — hard edges, halo, floating body, sticker, mismatched sharpness? If yes, re-integrate with matching grain, blur, shadows and depth of field.',
    '6) Could a stranger tell which person was added? If yes, the edit has failed.',
    '7) Preserving the original photo always wins over a nicer composition.',
  ].filter((line) => line !== '').join('\n')
}

/**
 * Dispatcher : choisit le prompt selon l'approche de création.
 * Sans creationMode (historique / parcours « jumeau célèbre »), on reste en full_generation.
 */
export function buildPhotoPrompt(ctx: PhotoGenerationContext): string {
  return ctx.creationMode === 'photo_edit'
    ? buildPhotoEditPrompt(ctx)
    : buildFullGenerationPrompt(ctx)
}

export const CUSTOM_PROMPT_EXAMPLES = [
  'Victoire d\'escape room à 00:01, tenues chic froissées, tu brandis une clé géante en plastique, la star applaudit trop fort.',
  'File du McDo drive à 2h du matin en smoking, plateau sur le toit de la voiture, regards caméra ultra sérieux.',
  'Laverie automatique un mardi soir, panier à linge entre vous, sweats tour merch assortis, pose souvenir de colonie.',
  'Cabine karaoke 2€, micro-brosse à dents, paillettes de scène + crocs, duo hors-ton assumé.',
]
