export interface CelebrityResult {
  /** Nom complet de la célébrité (ex: "Ryan Gosling") */
  name: string
  /** Domaine de la célébrité (ex: "Acteur", "Chanteur", "Sportif") */
  celebrity_domain: string
  /** Score de ressemblance 65–95 */
  score: number
  /** 3 traits faciaux communs */
  traits: string[]
  /** Description du style visuel de la célébrité — utilisée pour la génération d'image */
  celebrity_style_description: string
  /** Anecdote fun comparant les deux personnes */
  fun_fact: string
}

export interface PhotoScene {
  location: string
  outfits: string
  position: string
}

export type PhotoGenerationMode = 'presets' | 'custom'

/** Choix utilisateur avant génération : scènes guidées ou prompt libre */
export interface GenerationRequest {
  mode: PhotoGenerationMode
  photoScene?: PhotoScene
  customPrompt?: string
}

/** Contexte complet transmis à Nano Banana 2 pour la génération */
export interface PhotoGenerationContext {
  celebrityName: string
  celebrityDomain: string
  celebrityStyleDescription?: string
  /** Traits de ressemblance issus de l'analyse */
  traits?: string[]
  /** Anecdote fun — aide à fixer l'ambiance */
  funFact?: string
  mode: PhotoGenerationMode
  scene?: PhotoScene
  customPrompt?: string
}
