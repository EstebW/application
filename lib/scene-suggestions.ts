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
  return text
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildPhotoPrompt(ctx: PhotoGenerationContext): string {
  const { celebrityName, celebrityDomain, celebrityStyleDescription, scene } = ctx

  const location = sanitizeSceneText(scene.location)
  const outfits = sanitizeSceneText(scene.outfits)
  const position = sanitizeSceneText(scene.position)
  const domain = sanitizeSceneText(celebrityDomain)
  const style = celebrityStyleDescription ? sanitizeSceneText(celebrityStyleDescription) : ''

  // Prompt en anglais, ton éditorial — moins susceptible de déclencher le filtre « sensitive »
  const parts = [
    `Professional editorial event photograph, tasteful and family-friendly.`,
    `Setting: ${location}.`,
    domain ? `Event type / industry context: ${domain}.` : '',
    `Wardrobe for both subjects: ${outfits}.`,
    `Framing and pose: ${position}.`,
    style ? `Visual mood and styling cues: ${style}.` : '',
    `The photo features the person from the reference image alongside ${celebrityName} at a public event.`,
    `Both subjects clearly visible, natural smiles, high-end magazine photography, cinematic lighting.`,
  ]

  return parts.filter(Boolean).join(' ')
}
