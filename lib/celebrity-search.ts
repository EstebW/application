/**
 * Recherche de célébrités (parcours « Choisis ta star »).
 *
 * Source : recherche Wikipedia FR puis EN. On ne garde que les pages avec une
 * photo exploitable, puisque le portrait sert ensuite de référence visage.
 * N'influence ni le prompt de génération ni la résolution de l'image finale.
 */

export interface CelebritySearchResult {
  /** Titre de la page Wikipedia — sert de nom de star. */
  name: string
  /** Courte description Wikidata (« actrice américaine »). */
  description: string
  /** Portrait (vignette Wikimedia). */
  imageUrl: string
  lang: 'fr' | 'en'
}

export const CELEBRITY_SEARCH_MIN_QUERY = 2
export const CELEBRITY_SEARCH_LIMIT = 12
/**
 * Le service de vignettes Wikimedia rejette les largeurs non pré-générées :
 * on demande donc directement une taille exploitable comme référence visage,
 * plutôt que de réécrire l'URL après coup.
 */
export const CELEBRITY_SEARCH_THUMB_PX = 640

const WIKI_SEARCH_LANGS = ['fr', 'en'] as const

/**
 * Retire les accents avant filtrage : en JS, `\b` est ASCII, donc `\béquipe\b`
 * ne matche jamais. Tous les motifs ci-dessous sont donc écrits sans accent.
 */
function foldForMatching(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .toLowerCase()
}

/** Descriptions qui ne désignent pas une personne — œuvres, groupes, lieux… */
const NON_PERSON_PATTERNS: RegExp[] = [
  // Homonymie / méta
  /page d'homonymie/,
  /disambiguation/,
  /\bliste d/,
  /^list of\b/,
  /projet wikimedia/,
  /\b(discographie|discography|filmographie|filmography|videographie|videography)\b/,
  // Fiction
  /\bpersonnage\b/,
  /fictional character/,
  // Œuvres
  /\bfilm\b/,
  /\bmovie\b/,
  /\bcomedie\b/,
  /sortie en \d{4}/,
  /\bserie (televisee|d'animation|tv)\b/,
  /\btv series\b/,
  /\bemission\b/,
  /\btv show\b/,
  /\bepisode\b/,
  /\bsaison \d/,
  /\bseason \d/,
  /\balbum\b/,
  /\bchanson\b/,
  /\bsong\b/,
  /\bsingle\b/,
  /jeu video/,
  /video game/,
  /\broman\b/,
  /\bnovel\b/,
  /\blivre\b/,
  /\bbook\b/,
  /bande dessinee/,
  /\bcheval\b/,
  /\bhorse\b/,
  /\bsaga\b/,
  /\bfranchise\b/,
  /\btournee\b/,
  /\bconcert tour\b/,
  // Collectifs
  /\bgroupe\b/,
  /\bduo\b/,
  /\b(band|musical group|girl group|boy band|vocal group)\b/,
  /\bequipe\b/,
  /\b(national team|football club|sports team)\b/,
  /\bclub\b/,
  /\brivalite\b/,
  /\brivalry\b/,
  /parti politique/,
  /political party/,
  // Évènements historiques ou sportifs
  /\bbataille\b/,
  /\bbattle\b/,
  /\bsiege\b/,
  /\bguerre\b/,
  /\bwar\b/,
  /\bconflit\b/,
  /\brevolution\b/,
  /\bmassacre\b/,
  /\battentat\b/,
  /\bcatastrophe\b/,
  /\bevenement\b/,
  /\bceremonie\b/,
  /\bceremony\b/,
  /\belection\b/,
  /\btraite de\b/,
  /\bjeux olympiques\b/,
  /olympic games/,
  /coupe du monde/,
  /world cup/,
  /\bchampionnat\b/,
  /\bchampionship\b/,
  /\btournoi\b/,
  /\btournament\b/,
  /\bcompetition\b/,
  /\bmatch\b/,
  // Lieux, organisations, objets
  /\bcommune\b/,
  /\b(city|town|village|municipality)\b/,
  /\bstade\b/,
  /\bstadium\b/,
  /\bfestival\b/,
  /\bentreprise\b/,
  /\bcompany\b/,
  /\bmarque\b/,
  /\b(brand|website|software|award)\b/,
  /\bespece\b/,
  /\bphrase\b/,
  /\baffaire\b/,
  /\bmusee\b/,
  /\bmuseum\b/,
  /\bchateau\b/,
  /\bcastle\b/,
  /\beglise\b/,
  /\bchurch\b/,
  /\bnavire\b/,
  /\bvoilier\b/,
  /\btall ship\b/,
  /\baeroport\b/,
  /\bairport\b/,
  /\blangue\b/,
  /\blanguage\b/,
  /\bdialecte\b/,
  /\bile\b/,
  /\bisland\b/,
  /\bprovince\b/,
  /\bdepartement\b/,
  /\bregion\b/,
  /\bunivers\b/,
  /\buniverse\b/,
  /\bfiction\b/,
  /\bdieux?\b/,
  /\bgod(dess)?\b/,
  /\bdivinite\b/,
  /\bdeity\b/,
  /\bmythologie\b/,
  /\bmythology\b/,
  /\breligion\b/,
  /\bbouddhisme\b/,
  /\bbuddhism\b/,
  /\becole de\b/,
  /\bschool of\b/,
  /\bcourant\b/,
  /\bdoctrine\b/,
  /\btheorie\b/,
  /\btheory\b/,
  /\bprincipe\b/,
  /\bsysteme\b/,
  /\bsystem\b/,
  /\brallye\b/,
  /\brally\b/,
  /\bepreuve\b/,
  /\bcourse\b/,
  /\bgrand prix\b/,
  /\borganisation\b/,
  /\blegislature\b/,
]

/**
 * Une plage d'années signale une personne décédée ou une période historique
 * (« navigateur florentin (1454-1512) ») : hors sujet pour un selfie avec une star.
 * Une simple année de naissance (« born 1996 ») reste acceptée.
 */
const DECEASED_OR_HISTORICAL = /\b\d{3,4}\s*[-–—]\s*\d{3,4}\b/

/** Titres Wikipedia qui ne sont jamais une fiche de personne. */
const NON_PERSON_TITLE_PATTERNS: RegExp[] = [
  // Qualificatif entre parenthèses, éventuellement suivi de précisions :
  // « (film) », « (personnage de fiction) », « (album de 2019) »…
  /\([^)]*\b(homonymie|disambiguation|film|album|chanson|song|serie|series|personnage|character|groupe|band|jeu video|video game|roman|novel)\b[^)]*\)/,
  /\b(discographie|discography|filmographie|filmography|videographie|videography)\b/,
  /^(liste des?|liste d'|list of)\b/,
  /^(carriere|career) (de|of|d')\b/,
  /^(rivalite|rivalry)\b/,
  /\blive (from|at|in)\b/,
  /\b(world tour|tour \d{4})\b/,
  /^the .+ tour$/,
  /^(siege|bataille|battle|guerre|war|traite|revolution|massacre|prise) (de|du|des|of|d')/,
  /\b(coupe du monde|world cup|jeux olympiques|olympic games)\b/,
]

/** Élimine les pages qui ne sont manifestement pas une personne. */
export function isLikelyPersonDescription(description: string): boolean {
  const text = foldForMatching(description.trim())
  if (!text) return true
  if (DECEASED_OR_HISTORICAL.test(text)) return false
  return !NON_PERSON_PATTERNS.some((pattern) => pattern.test(text))
}

export function isLikelyPersonTitle(title: string): boolean {
  const text = foldForMatching(title.trim())
  if (!text) return false
  return !NON_PERSON_TITLE_PATTERNS.some((pattern) => pattern.test(text))
}

/** Une fiche est retenue seulement si titre ET description passent le filtre. */
export function isLikelyPersonPage(title: string, description: string): boolean {
  return isLikelyPersonTitle(title) && isLikelyPersonDescription(description)
}

/** Domaines proposés dans « Choisis ta star » (alignés sur CustomCelebrityForm). */
export const CELEBRITY_DOMAINS = [
  'Acteur·rice',
  'Chanteur·se',
  'Sportif·ve',
  'Mannequin',
  'Autre',
] as const

export type CelebrityDomain = (typeof CELEBRITY_DOMAINS)[number]

/** Motifs sans accent — la description est repliée avant comparaison. */
const DOMAIN_PATTERNS: Array<[RegExp, CelebrityDomain]> = [
  [/(mannequin|supermodel|\bmodel\b)/, 'Mannequin'],
  [/(acteur|actrice|comedien|comedienne|\bactor\b|\bactress\b)/, 'Acteur·rice'],
  [
    /((auteur|autrice)e?-composit|chanteur|chanteuse|rappeur|rappeuse|musicien|musicienne|\bsinger\b|\brapper\b|\bmusician\b|songwriter)/,
    'Chanteur·se',
  ],
  [
    /(footballeur|footballeuse|basketteur|basketteuse|joueur|joueuse|sportif|sportive|athlete|boxeur|nageur|cycliste|pilote automobile|\bfootballer\b|\bplayer\b|\bboxer\b|\bswimmer\b|\btennis\b)/,
    'Sportif·ve',
  ],
]

/**
 * Pré-sélectionne un domaine à partir de la description Wikidata.
 * Wikidata liste le métier principal en premier : on retient donc la
 * correspondance la plus précoce, pas la première règle de la liste.
 */
export function guessCelebrityDomain(description: string): CelebrityDomain | '' {
  const text = foldForMatching(description.trim())
  if (!text) return ''

  let best: { index: number; domain: CelebrityDomain } | null = null
  for (const [pattern, domain] of DOMAIN_PATTERNS) {
    const index = text.search(pattern)
    if (index < 0) continue
    if (!best || index < best.index) best = { index, domain }
  }
  return best?.domain ?? ''
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost)
    }
    previous = current
  }
  return previous[b.length]!
}

function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length)
  return longest === 0 ? 1 : 1 - levenshtein(a, b) / longest
}

/** En dessous, « zendaya » attraperait « Zendejas » ou « Zendali ». */
const NAME_MATCH_THRESHOLD = 0.75

/**
 * La recherche par titre complète ses résultats avec des pages simplement
 * proches alphabétiquement (« Dualité onde-corpuscule » pour « dua lipa »),
 * et le plein texte remonte des personnes seulement citées dans l'article.
 * On exige donc que chaque mot tapé corresponde vraiment à un mot du titre,
 * par préfixe (frappe en cours) ou par proximité (faute de frappe).
 */
export function celebrityNameMatchesQuery(query: string, title: string): boolean {
  const foldedTitle = foldForMatching(title)
  const foldedQuery = foldForMatching(query)
  if (!foldedQuery) return false
  if (foldedTitle.includes(foldedQuery)) return true

  const titleTokens = foldedTitle.split(/[^a-z0-9]+/).filter(Boolean)
  const queryTokens = foldedQuery.split(/[^a-z0-9]+/).filter(Boolean)
  if (!titleTokens.length || !queryTokens.length) return false

  return queryTokens.every((token) =>
    titleTokens.some((candidate) =>
      candidate.startsWith(token) || similarity(token, candidate) >= NAME_MATCH_THRESHOLD,
    ),
  )
}

export function normalizeCelebrityQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 80)
}

export function isSearchableCelebrityQuery(raw: string): boolean {
  return normalizeCelebrityQuery(raw).length >= CELEBRITY_SEARCH_MIN_QUERY
}

/**
 * `title` interroge les titres d'articles : très précis sur un nom propre.
 * `fulltext` cherche dans le corps des articles : rattrape les noms inversés
 * ou partiels, mais fait remonter des évènements, films et lieux liés.
 */
export type CelebritySearchMode = 'title' | 'fulltext'

export function buildWikiSearchUrl(
  lang: 'fr' | 'en',
  query: string,
  mode: CelebritySearchMode = 'title',
  limit = CELEBRITY_SEARCH_LIMIT,
): string {
  const search = normalizeCelebrityQuery(query)
  const generator: Record<string, string> = mode === 'title'
    ? { generator: 'prefixsearch', gpssearch: search, gpslimit: String(limit) }
    : {
      generator: 'search',
      gsrsearch: search,
      gsrnamespace: '0',
      gsrlimit: String(limit),
    }

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    ...generator,
    prop: 'pageimages|description',
    piprop: 'thumbnail',
    pithumbsize: String(CELEBRITY_SEARCH_THUMB_PX),
    pilimit: String(limit),
  })
  return `https://${lang}.wikipedia.org/w/api.php?${params.toString()}`
}

type WikiSearchPage = {
  title?: string
  index?: number
  description?: string
  thumbnail?: { source?: string }
}

/** Garde l'ordre de pertinence renvoyé par Wikipedia (`index`). */
export function parseWikiSearchResponse(
  json: unknown,
  lang: 'fr' | 'en',
  query: string,
): CelebritySearchResult[] {
  const pages = (json as { query?: { pages?: WikiSearchPage[] } } | null)?.query?.pages
  if (!Array.isArray(pages)) return []

  return pages
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .flatMap((page) => {
      const name = page.title?.trim()
      const imageUrl = page.thumbnail?.source?.trim()
      if (!name || !imageUrl) return []
      if (!celebrityNameMatchesQuery(query, name)) return []
      const description = page.description?.trim() ?? ''
      if (!isLikelyPersonPage(name, description)) return []
      return [{ name, description, imageUrl, lang }]
    })
}

function dedupeKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Fusionne FR puis EN sans doublons, en gardant l'ordre de pertinence. */
export function mergeCelebrityResults(
  lists: CelebritySearchResult[][],
  limit = CELEBRITY_SEARCH_LIMIT,
): CelebritySearchResult[] {
  const seen = new Set<string>()
  const merged: CelebritySearchResult[] = []

  for (const list of lists) {
    for (const result of list) {
      const key = dedupeKey(result.name)
      if (!key || seen.has(key)) continue
      seen.add(key)
      merged.push(result)
      if (merged.length >= limit) return merged
    }
  }

  return merged
}

async function fetchWikiSearch(
  lang: 'fr' | 'en',
  query: string,
  mode: CelebritySearchMode,
  userAgent: string,
  signal?: AbortSignal,
): Promise<CelebritySearchResult[]> {
  try {
    const res = await fetch(buildWikiSearchUrl(lang, query, mode), {
      headers: { Accept: 'application/json', 'User-Agent': userAgent },
      signal,
    })
    if (!res.ok) return []
    return parseWikiSearchResponse(await res.json(), lang, query)
  } catch {
    return []
  }
}

/**
 * Côté serveur : les quatre requêtes partent en parallèle, mais la fusion
 * place les correspondances de titre avant le plein texte.
 */
export async function searchCelebritiesOnWikipedia(
  query: string,
  userAgent: string,
  signal?: AbortSignal,
): Promise<CelebritySearchResult[]> {
  if (!isSearchableCelebrityQuery(query)) return []

  const modes: CelebritySearchMode[] = ['title', 'fulltext']
  const lists = await Promise.all(
    modes.flatMap((mode) =>
      WIKI_SEARCH_LANGS.map((lang) => fetchWikiSearch(lang, query, mode, userAgent, signal)),
    ),
  )
  return mergeCelebrityResults(lists)
}

/** Côté client : passe par la route interne pour éviter le CORS Wikipedia. */
export async function searchCelebrities(
  query: string,
  signal?: AbortSignal,
): Promise<CelebritySearchResult[]> {
  if (!isSearchableCelebrityQuery(query)) return []
  const res = await fetch(
    `/api/celebrity-search?q=${encodeURIComponent(normalizeCelebrityQuery(query))}`,
    { signal },
  )
  if (!res.ok) throw new Error('search_failed')
  const data = (await res.json()) as { results?: CelebritySearchResult[] }
  return Array.isArray(data.results) ? data.results : []
}
