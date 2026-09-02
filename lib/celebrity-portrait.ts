/**
 * Choix de la meilleure photo de référence pour une star.
 *
 * La vignette d'article Wikipedia est souvent une photo de scène (profil,
 * micro devant le visage, plusieurs personnes) : mauvaise référence visage.
 * On collecte donc plusieurs candidates sur Wikimedia Commons, on pré-trie,
 * puis Gemini choisit la plus frontale et la plus dégagée.
 *
 * N'influence ni le prompt de génération ni la résolution de l'image finale.
 */

export interface PortraitCandidate {
  /** Titre du fichier Commons, sans le préfixe « File: ». */
  fileName: string
  /** Vignette légère, envoyée au modèle. */
  thumbUrl: string
  width: number
  height: number
  mime: string
}

/** Assez petit pour rester rapide, assez grand pour juger un visage. */
export const PORTRAIT_THUMB_PX = 320
/** Largeur retenue pour la référence finale envoyée à la génération. */
export const PORTRAIT_FINAL_PX = 800
export const PORTRAIT_CANDIDATE_POOL = 20
export const PORTRAIT_MAX_REVIEWED = 5

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png'])
const MIN_SIDE_PX = 200
/** Hors de cette plage hauteur/largeur : panorama ou bandeau, pas un portrait. */
const MIN_ASPECT = 0.6
const MAX_ASPECT = 2.5

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** Fichiers qui ne montrent pas le visage de la star. */
const NON_PORTRAIT_FILE_PATTERNS: RegExp[] = [
  /\bmaillot\b/,
  /\bjersey\b/,
  /\bshirt\b/,
  /\blogo\b/,
  /\bsignature\b/,
  /\bnenshkrim\b/,
  /\bautograph\b/,
  /\bflag\b/,
  /\bdrapeau\b/,
  /\bstatue\b/,
  /\bmural\b/,
  /\bgraffiti\b/,
  /\bposter\b/,
  /\baffiche\b/,
  /\bcover\b/,
  /\bpochette\b/,
  /\bplaque\b/,
  /\bstamp\b/,
  /\btimbre\b/,
  /\bcoin\b/,
  /\bmap\b/,
  /\bcarte\b/,
  /\bexhibition\b/,
  /\bmuseum\b/,
  /\bmusee\b/,
  /\bbuilding\b/,
  /\bstadium\b/,
  /\bstade\b/,
  /\bgrave\b/,
  /\btombe\b/,
]

/** Indices de photo de concert dans le nom de fichier. */
const STAGE_FILE_PATTERN =
  /\b(live|concert|tour|festival|glasto|performing|performance|stage|singing|gig|show|arena|forum|q&a|panel)\b/

export function buildCommonsPortraitSearchUrl(
  celebrityName: string,
  limit = PORTRAIT_CANDIDATE_POOL,
): string {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: `"${celebrityName.trim()}"`,
    // Espace de noms 6 = fichiers.
    gsrnamespace: '6',
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|size|mime',
    iiurlwidth: String(PORTRAIT_THUMB_PX),
  })
  return `https://commons.wikimedia.org/w/api.php?${params.toString()}`
}

type CommonsPage = {
  title?: string
  index?: number
  imageinfo?: Array<{
    thumburl?: string
    width?: number
    height?: number
    mime?: string
  }>
}

export function parseCommonsPortraitResponse(json: unknown): PortraitCandidate[] {
  const pages = (json as { query?: { pages?: CommonsPage[] } } | null)?.query?.pages
  if (!Array.isArray(pages)) return []

  return pages
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .flatMap((page) => {
      const info = page.imageinfo?.[0]
      const thumbUrl = info?.thumburl?.trim()
      const fileName = page.title?.replace(/^(File|Fichier):/i, '').trim()
      if (!thumbUrl || !fileName || !info?.width || !info?.height) return []
      return [{
        fileName,
        thumbUrl,
        width: info.width,
        height: info.height,
        mime: info.mime ?? '',
      }]
    })
}

/** Écarte vidéos, SVG, panoramas et objets sans visage. */
export function isUsablePortraitCandidate(candidate: PortraitCandidate): boolean {
  if (!ALLOWED_MIME.has(candidate.mime)) return false
  if (candidate.width < MIN_SIDE_PX || candidate.height < MIN_SIDE_PX) return false

  const aspect = candidate.height / candidate.width
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return false

  const name = fold(candidate.fileName)
  return !NON_PORTRAIT_FILE_PATTERNS.some((pattern) => pattern.test(name))
}

/**
 * Pré-tri avant le passage au modèle : on privilégie les fichiers nommés
 * d'après la star, recadrés, au format portrait et suffisamment définis.
 */
export function scorePortraitCandidate(
  candidate: PortraitCandidate,
  celebrityName: string,
): number {
  const name = fold(candidate.fileName)
  const tokens = fold(celebrityName).split(/[^a-z0-9]+/).filter(Boolean)
  let score = 0

  if (tokens.length && tokens.every((token) => name.includes(token))) score += 3
  if (/\bcropped\b|\bportrait\b|\bheadshot\b/.test(name)) score += 2
  // Sur scène : micro devant la bouche, profil, éclairage coloré.
  if (STAGE_FILE_PATTERN.test(name)) score -= 3

  const aspect = candidate.height / candidate.width
  if (aspect >= 1.1 && aspect <= 1.6) score += 2
  else if (aspect >= 0.9) score += 1

  const minSide = Math.min(candidate.width, candidate.height)
  if (minSide >= 500) score += 1
  if (minSide >= 1000) score += 1

  return score
}

export function rankPortraitCandidates(
  candidates: PortraitCandidate[],
  celebrityName: string,
  max = PORTRAIT_MAX_REVIEWED,
): PortraitCandidate[] {
  const seen = new Set<string>()
  return candidates
    .filter((candidate) => {
      if (!isUsablePortraitCandidate(candidate)) return false
      const key = fold(candidate.fileName)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((candidate, index) => ({
      candidate,
      index,
      score: scorePortraitCandidate(candidate, celebrityName),
    }))
    // À score égal, on conserve l'ordre de pertinence de Commons.
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .slice(0, max)
    .map((entry) => entry.candidate)
}

/** URL pleine largeur d'un fichier Commons, sans second appel à l'API. */
export function commonsFilePathUrl(fileName: string, width = PORTRAIT_FINAL_PX): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${
    encodeURIComponent(fileName.replace(/ /g, '_'))
  }?width=${width}`
}

export const PORTRAIT_PICK_SYSTEM_INSTRUCTION = [
  'You select the best face-reference photo of a celebrity for an image-generation pipeline.',
  'You are given several candidate photos, numbered from 0, in the order provided.',
  'Pick the single photo that best serves as a facial identity reference.',
  'Ranked criteria:',
  '1. Exactly one clearly identifiable person, and it must be the named celebrity.',
  '2. Face fully visible and unobstructed — reject microphones, hands, instruments, sunglasses, masks, hair or objects covering the face.',
  '3. Frontal or near-frontal head orientation, both eyes visible. Reject strict profile or back-of-head shots.',
  '4. Face sharp, well lit, large enough in frame, neutral or mild expression.',
  '5. Prefer natural colour photography over heavy stage lighting, motion blur or extreme colour casts.',
  'Never pick a photo showing several people, an object, a jersey, a poster or a crowd.',
  'Answer with JSON only: {"best_index": <integer>, "reason": "<max 12 words>"}',
].join('\n')

export function portraitPickUserText(celebrityName: string, imageCount: number): string {
  return [
    `Celebrity: ${celebrityName}. Candidate photos follow, numbered from 0 in order.`,
    ...Array.from({ length: imageCount }, (_, index) => `Photo ${index} is the next image.`),
    `Return the best_index between 0 and ${imageCount - 1}.`,
  ].join('\n')
}

export function buildPortraitPickBody(opts: {
  celebrityName: string
  images: Array<{ mimeType: string; data: string }>
}): Record<string, unknown> {
  const parts: Array<Record<string, unknown>> = [{
    text: portraitPickUserText(opts.celebrityName, opts.images.length),
  }]

  opts.images.forEach((image, index) => {
    parts.push({ text: `Photo ${index}:` })
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } })
  })

  return {
    systemInstruction: { parts: [{ text: PORTRAIT_PICK_SYSTEM_INSTRUCTION }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  }
}

/** Même brief, au format OpenAI/KIE (gemini-3-flash via kie.ai). */
export function buildPortraitPickKieMessages(opts: {
  celebrityName: string
  images: Array<{ mimeType: string; data: string }>
}): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: portraitPickUserText(opts.celebrityName, opts.images.length) },
  ]
  opts.images.forEach((image, index) => {
    content.push({ type: 'text', text: `Photo ${index}:` })
    content.push({
      type: 'image_url',
      image_url: { url: `data:${image.mimeType};base64,${image.data}` },
    })
  })
  return [
    { role: 'system', content: PORTRAIT_PICK_SYSTEM_INSTRUCTION },
    { role: 'user', content },
  ]
}

export interface PortraitPick {
  index: number
  reason: string
}

/** Un index hors plage ou illisible retombe sur le meilleur candidat du pré-tri. */
export function parsePortraitPick(raw: string, candidateCount: number): PortraitPick | null {
  if (candidateCount <= 0) return null

  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return null
  }

  const data = parsed as { best_index?: unknown; reason?: unknown }
  const index = typeof data.best_index === 'number'
    ? data.best_index
    : Number.parseInt(String(data.best_index ?? ''), 10)

  if (!Number.isInteger(index) || index < 0 || index >= candidateCount) return null

  const reason = typeof data.reason === 'string' ? data.reason.trim().slice(0, 120) : ''
  return { index, reason }
}
