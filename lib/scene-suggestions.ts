import type { PhotoGenerationContext, PhotoScene } from './types'

interface SceneSuggestions {
  locations: string[]
  outfits: string[]
  positions: string[]
}

const DOMAIN_PRESETS: { match: RegExp; suggestions: SceneSuggestions }[] = [
  {
    match: /acteur|actrice|cinéma|cinema|film|réalisat/i,
    suggestions: {
      locations: [
        'Tapis rouge d\'une avant-première de film',
        'Plateau de tournage avec éclairages de studio',
        'Festival de Cannes, marches officielles',
      ],
      outfits: [
        'Smoking ou robe de soirée élégante',
        'Tenue de gala avec accessoires de luxe',
        'Look tapis rouge, style première mondiale',
      ],
      positions: [
        'Côte à côte, bras dessus bras dessous, souriant à l\'appareil',
        'Posant ensemble face aux photographes',
        'Marche synchronisée sur le tapis rouge',
      ],
    },
  },
  {
    match: /chanteur|chanteuse|musique|rappeur|rappeuse|artiste/i,
    suggestions: {
      locations: [
        'Scène de concert avec projecteurs et fumée',
        'Studio d\'enregistrement avec micro et consoles',
        'Backstage juste avant le show, ambiance intimiste',
      ],
      outfits: [
        'Tenue de scène iconique, look tournée mondiale',
        'Style streetwear luxe ou costume scénique',
        'Outfit clip vidéo, accessoires signature',
      ],
      positions: [
        'Debout côte à côte, micro à la main',
        'Photo backstage, détendus et complices',
        'Sur scène, saluant le public ensemble',
      ],
    },
  },
  {
    match: /sportif|sport|football|basket|tennis|athlète|athlete/i,
    suggestions: {
      locations: [
        'Stade rempli de supporters, pelouse ou terrain',
        'Podium olympique avec médailles',
        'Vestiaire ou tunnel d\'accès au terrain',
      ],
      outfits: [
        'Maillot officiel de l\'équipe ou tenue de compétition',
        'Survêtement de club avec logo visible',
        'Tenue de cérémonie sportive avec médaille',
      ],
      positions: [
        'Célébration de victoire, bras levés ensemble',
        'Photo officielle d\'équipe, épaule contre épaule',
        'Poignée de main sportive ou accolade',
      ],
    },
  },
  {
    match: /mannequin|mode|top model|fashion/i,
    suggestions: {
      locations: [
        'Défilé de mode, podium et lumières de scène',
        'Backstage fashion week, miroirs et lumières',
        'Shooting éditorial en studio haute couture',
      ],
      outfits: [
        'Pièce iconique de la collection du moment',
        'Look avant-garde signé grande maison',
        'Tenue de défilé, accessoires statement',
      ],
      positions: [
        'Pose éditoriale face caméra, attitude assurée',
        'Debout côte à côte, regard caméra',
        'Marche de défilé, synchronisés',
      ],
    },
  },
]

const DEFAULT_SUGGESTIONS: SceneSuggestions = {
  locations: [
    'Événement VIP avec lumières dorées et fond flou',
    'Soirée célébrités sur rooftop avec skyline',
    'Salon de gala avec décor luxueux',
  ],
  outfits: [
    'Tenues élégantes adaptées à l\'univers de la star',
    'Look chic et soigné, style magazine people',
    'Habits iconiques rappelant l\'image publique de la célébrité',
  ],
  positions: [
    'Côte à côte, souriant naturellement à l\'appareil',
    'Photo posée, complices et détendus',
    'Debout face à la caméra, bien visibles tous les deux',
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
    'SCENE REQUIREMENTS (secondary to face locks):',
    '- Both people clearly visible in one photorealistic photo.',
    '- Natural bodies/poses; faces remain identity-locked as above.',
    '- Tasteful, family-friendly, public-event photography.',
    '- Single cohesive photo — not a collage, not a side-by-side split, not a face-swap glitch.',
    '- If anything conflicts with the face locks, DROP the conflicting detail and KEEP the faces.',
  ]

  const finalReminder = dual
    ? [
        'FINAL MANDATORY CHECK:',
        '1) Compare Person A\'s output face to image_input[0] — must be the same person, unedited identity.',
        '2) Compare Person B\'s output face to image_input[1] — must be the same person, unedited identity.',
        '3) If either face drifted, correct BEFORE returning. Face integrity > scene beauty.',
      ]
    : [
        'FINAL MANDATORY CHECK:',
        'Compare Person A\'s output face to image_input[0] — must look like an unedited crop of the same face. If different in any way, that is a failure: fix the face before returning.',
      ]

  const opener = dual
    ? 'IDENTITY-PRESERVING COMPOSITE: keep BOTH reference faces exactly intact while placing Person A and Person B together in a new scene.'
    : 'IDENTITY-PRESERVING EDIT: keep Person A\'s face exactly intact from the reference while placing them in a scene with a celebrity.'

  if (mode === 'custom' && customPrompt) {
    const userPrompt = sanitizeSceneText(customPrompt)
    return [
      opener,
      '',
      ...facePreservationBlock(dual),
      '',
      'USER SCENE PROMPT (apply to setting/outfits/pose ONLY — faces stay locked):',
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
    'USER SCENE BRIEF (setting/outfits/pose ONLY — faces stay locked):',
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
  'Photo sur un yacht à Monaco au coucher de soleil, tenues blanches élégantes, champagne à la main, sourires détendus.',
  'Selfie backstage après un concert, looks streetwear luxe, lumières colorées et ambiance électrique.',
  'Photo officielle sur le terrain après un match, maillots de l\'équipe, célébration de victoire bras levés.',
  'Shooting magazine sur un rooftop new-yorkais la nuit, skyline en arrière-plan, tenues chic et pose confiante.',
]
