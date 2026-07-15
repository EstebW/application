/** Message utilisateur à partir d'une erreur kie.ai / Nano Banana */
export function formatKieError(message: string): string {
  const lower = message.toLowerCase()

  if (
    lower.includes('422') ||
    lower.includes('sensitive') ||
    lower.includes('flagged')
  ) {
    return 'Le contenu a été bloqué par le filtre de sécurité de l\'IA. Modifie le lieu, les tenues ou la position avec des descriptions plus neutres, puis réessaie.'
  }

  if (lower.includes('402') || lower.includes('insuffisants') || lower.includes('insufficient')) {
    return 'Crédits insuffisants. Achète un pack pour générer une nouvelle photo.'
  }

  if (lower.includes('402') || lower.includes('credit')) {
    return 'Crédits kie.ai insuffisants. Recharge ton compte sur kie.ai.'
  }

  if (lower.includes('401') || lower.includes('unauthorized')) {
    return 'Clé API kie.ai invalide. Vérifie KIE_API_KEY.'
  }

  if (
    lower.includes("can't help") ||
    lower.includes("can't identify") ||
    lower.includes('facial recognition') ||
    lower.includes('impossible de parser')
  ) {
    return 'L\'analyse photo a échoué. Réessaie avec une photo plus nette, bien éclairée, où le visage est visible.'
  }

  return message
}

export function isSensitiveContentError(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('422') || lower.includes('sensitive') || lower.includes('flagged')
}
