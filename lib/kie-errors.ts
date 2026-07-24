/**
 * Message utilisateur à partir d'une erreur kie.ai / Nano Banana.
 *
 * IMPORTANT : `code` doit venir du champ `code` structuré renvoyé par l'Edge
 * Function (APP_CREDITS_INSUFFICIENT vs KIE_VENDOR_INSUFFICIENT), jamais d'un
 * simple `includes('402')` sur le texte — un message d'erreur kie.ai peut
 * contenir "402" ou "credit" sans que ça concerne les crédits de l'utilisateur.
 */
export function formatKieError(message: string, code?: string): string {
  const lower = message.toLowerCase()

  if (code === 'APP_CREDITS_INSUFFICIENT') {
    return 'Crédits insuffisants. Achète un pack pour générer une nouvelle photo.'
  }

  if (code === 'KIE_VENDOR_INSUFFICIENT') {
    return 'Le service de génération IA est temporairement indisponible (crédits fournisseur épuisés). Réessaie un peu plus tard.'
  }

  if (
    lower.includes('422') ||
    lower.includes('sensitive') ||
    lower.includes('flagged')
  ) {
    return 'Le contenu a été bloqué par le filtre de sécurité de l\'IA. Modifie le lieu, les tenues ou la position avec des descriptions plus neutres, puis réessaie.'
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
