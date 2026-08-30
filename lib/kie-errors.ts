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

  if (code === 'APP_CREDIT_DEBIT_UNAVAILABLE') {
    return 'Le débit de crédit est temporairement indisponible. Réessaie dans un instant.'
  }

  if (code === 'SOURCE_PHOTO_UNSUITABLE') {
    return 'Cette photo ne permet pas d’ajouter la star de façon naturelle sans modifier la scène. Choisis une photo avec un peu plus d’espace autour de toi.'
  }

  if (code === 'KIE_VENDOR_INSUFFICIENT') {
    return 'Le service de génération IA est temporairement indisponible (crédits fournisseur épuisés). Réessaie un peu plus tard.'
  }

  if (code === 'GENERATION_SAFETY_BLOCKED') {
    return 'Cette génération n\'a pas pu être réalisée automatiquement. Essaie une autre photo ou une autre mise en scène.'
  }

  if (
    lower.includes('prohibited use policy') ||
    lower.includes('violated google') ||
    (lower.includes('filtered out') && lower.includes('google'))
  ) {
    return 'Cette génération n\'a pas pu être réalisée automatiquement. Essaie une autre photo ou une autre mise en scène.'
  }

  if (code === 'GENERATION_FAILED') {
    return 'La génération a échoué. Réessaie avec une autre photo ou une autre mise en scène.'
  }

  if (code === 'GENERATION_JOB_EXPIRED') {
    return 'La génération a expiré. Réessaie — ton crédit a été remboursé si besoin.'
  }

  if (code === 'GENERATION_JOB_NOT_FOUND') {
    return 'Génération introuvable. Relance une nouvelle photo.'
  }

  if (
    code === 'WORKER_RESOURCE_LIMIT' ||
    lower.includes('worker_resource_limit') ||
    lower.includes('not having enough compute resources')
  ) {
    return 'Le serveur a été surchargé pendant la génération. Réessaie dans quelques secondes.'
  }

  if (lower.includes('timeout')) {
    return 'La génération a pris trop de temps. Réessaie — la photo est parfois prête juste après.'
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

/** Erreurs KIE temporaires — retry automatique possible. */
export function isTransientKieError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('worker_resource_limit') ||
    lower.includes('not having enough compute resources') ||
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    /\b429\b/.test(lower) ||
    /\b502\b/.test(lower) ||
    /\b503\b/.test(lower) ||
    lower.includes('temporarily unavailable') ||
    lower.includes('overloaded')
  )
}

/** Messages utilisateur pour l'analyse faciale (pas la génération photo). */
export function formatAnalyzeError(message: string, code?: string): string {
  const lower = message.toLowerCase()

  if (code === 'KIE_VENDOR_INSUFFICIENT') {
    return 'Le service d\'analyse IA est temporairement indisponible. Réessaie un peu plus tard.'
  }

  if (
    code === 'WORKER_RESOURCE_LIMIT' ||
    isTransientKieError(message)
  ) {
    return 'Les serveurs d\'analyse sont surchargés. Réessaie dans quelques secondes.'
  }

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('504')) {
    return 'L\'analyse a pris trop de temps. Réessaie — une photo plus légère ou mieux cadrée aide souvent.'
  }

  if (lower.includes('visage non détecté') || lower.includes('aucun visage')) {
    return 'Aucun visage clairement visible. Prends un selfie net, bien éclairé, visage de face.'
  }

  if (
    lower.includes("can't help") ||
    lower.includes("can't identify") ||
    lower.includes('facial recognition') ||
    lower.includes('impossible de parser') ||
    lower.includes('réponse vide du modèle') ||
    lower.includes('aucun candidat valide')
  ) {
    return 'L\'analyse photo a échoué. Réessaie avec une photo plus nette, bien éclairée, où le visage est visible.'
  }

  if (lower.includes('l\'ia a refusé l\'analyse')) {
    return 'L\'IA n\'a pas pu analyser cette photo. Réessaie avec un selfie net, visage bien visible.'
  }

  return formatKieError(message, code)
}

export function isSensitiveContentError(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('422') || lower.includes('sensitive') || lower.includes('flagged')
}
