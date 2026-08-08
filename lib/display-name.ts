/** Met en forme un nom de célébrité (majuscules correctes). */
export function formatCelebrityName(raw: string | null | undefined): string {
  if (!raw?.trim()) return 'Star'
  return raw
    .trim()
    .split(/\s+/)
    .map((part) => {
      if (!part) return part
      // Conserve les particules courtes en minuscules sauf en début
      const lower = part.toLowerCase()
      if (['de', 'du', 'des', 'la', 'le', 'van', 'von', 'da', 'di'].includes(lower)) {
        return lower
      }
      // McDonald, O'Brien…
      if (lower.startsWith("o'") && lower.length > 2) {
        return `O'${lower.charAt(2).toUpperCase()}${lower.slice(3)}`
      }
      if (lower.startsWith('mc') && lower.length > 2) {
        return `Mc${lower.charAt(2).toUpperCase()}${lower.slice(3)}`
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
    // Remonte la première lettre si c'était une particule
    .replace(/^([a-z])/, (c) => c.toUpperCase())
}
