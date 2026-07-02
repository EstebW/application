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
