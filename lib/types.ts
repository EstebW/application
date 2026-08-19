import type { CelebrityHeightConfidence } from './height'
import type { FeatureScores } from './twin-score'

export type { CelebrityHeightConfidence, FeatureScores }

/** Finaliste du Top 3 — scores globaux toujours calculés côté backend */
export interface TwinRunnerUp {
  name: string
  celebrity_domain: string
  score: number
  featureScores?: FeatureScores
  strongestSimilarities?: string[]
  mainDifferences?: string[]
}

export interface CelebrityResult {
  /** Nom complet de la célébrité (ex: "Ryan Gosling") */
  name: string
  /** Domaine de la célébrité (ex: "Acteur", "Chanteur", "Sportif") */
  celebrity_domain: string
  /**
   * Score de ressemblance StarFusion 0–100.
   * Calculé côté backend à partir des sous-scores — jamais inventé par le LLM.
   */
  score: number
  /** Points de ressemblance (souvent dérivés de strongestSimilarities) */
  traits: string[]
  /** Description du style visuel de la célébrité — utilisée pour la génération d'image */
  celebrity_style_description: string
  /** Explication personnalisée de la ressemblance */
  fun_fact: string
  /** Sous-scores morphologiques du gagnant (match uniquement) */
  featureScores?: FeatureScores
  /** #2 et #3 — révélés après déblocage du paywall */
  runnersUp?: TwinRunnerUp[]
}

export interface PhotoScene {
  location: string
  outfits: string
  position: string
}

export type PhotoGenerationMode = 'presets' | 'custom'

/**
 * Approche de création, proposée uniquement dans le parcours « Choisis ta star ».
 * - full_generation : nouvelle photo — décor inventé, ou décor repris de la photo user.
 * - photo_edit      : selfie immuable, on y ajoute la star.
 *
 * Compatibilité : les générations créées avant cette fonctionnalité (et tout le parcours
 * « jumeau célèbre ») n'ont pas de creationMode et sont traitées comme 'full_generation'.
 *
 * À ne pas confondre avec PhotoGenerationMode, qui décrit la façon de saisir la scène.
 */
export type CelebrityCreationMode = 'full_generation' | 'photo_edit'

export const DEFAULT_CREATION_MODE: CelebrityCreationMode = 'full_generation'

/**
 * Pour « Créer une nouvelle photo » uniquement.
 * - invented   : scène guidée ou prompt libre (comportement historique).
 * - user_photo : on garde le décor / l’ambiance de la photo de l’utilisateur.
 */
export type SceneSource = 'invented' | 'user_photo'

/** Interaction souhaitée entre l'utilisateur et la star — toujours facultative. */
export interface InteractionOption {
  id: string
  label: string
  /** Formulation envoyée au modèle (anglais, alignée sur le reste du prompt) */
  prompt: string
}

/** Choix utilisateur avant génération : scènes guidées ou prompt libre */
export interface GenerationRequest {
  mode: PhotoGenerationMode
  creationMode?: CelebrityCreationMode
  /** full_generation : scène inventée (défaut) ou décor de la photo utilisateur */
  sceneSource?: SceneSource
  photoScene?: PhotoScene
  customPrompt?: string
  /** Facultatif — n'autorise jamais à contourner la préservation d'identité */
  interaction?: string
  /** Taille utilisateur (cm) — collectée avant génération si le parcours le demande */
  userHeightCm?: number
}

/**
 * Contrainte de taille — les deux parcours photo.
 * L'utilisateur ne renseigne QUE sa propre taille ; celle de la star est
 * résolue côté serveur à partir de son identifiant.
 */
export interface HeightContext {
  /** Saisie utilisateur, en centimètres (120–220) */
  userHeightCm?: number
  /** Résolue côté serveur — null si aucune source fiable */
  celebrityHeightCm?: number | null
  celebrityHeightConfidence?: CelebrityHeightConfidence
}

/** Contexte complet transmis à Nano Banana 2 pour la génération */
export interface PhotoGenerationContext extends HeightContext {
  celebrityName: string
  celebrityDomain: string
  celebrityStyleDescription?: string
  /** Traits de ressemblance issus de l'analyse */
  traits?: string[]
  /** Anecdote fun — aide à fixer l'ambiance */
  funFact?: string
  mode: PhotoGenerationMode
  /** Absent = 'full_generation' (générations historiques) */
  creationMode?: CelebrityCreationMode
  /** full_generation : décor inventé ou repris de la photo utilisateur */
  sceneSource?: SceneSource
  scene?: PhotoScene
  customPrompt?: string
  interaction?: string
  /** true si une vraie photo de la célébrité est fournie en 2e image_input (mode "Choisis ta star") */
  hasCelebrityReferenceImage?: boolean
  /** photo_edit : placement précis issu de l'analyse de composition */
  celebrityPlacementInstruction?: string
  /** photo_edit : celebrityHeightCm / userHeightCm lorsque les deux tailles sont connues */
  celebrityTargetApparentHeightRatio?: number
}
