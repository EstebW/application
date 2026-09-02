/**
 * Exécution : npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  CELEBRITY_SEARCH_LIMIT,
  CELEBRITY_SEARCH_THUMB_PX,
  buildWikiSearchUrl,
  celebrityNameMatchesQuery,
  guessCelebrityDomain,
  isLikelyPersonDescription,
  isLikelyPersonPage,
  isLikelyPersonTitle,
  isSearchableCelebrityQuery,
  mergeCelebrityResults,
  normalizeCelebrityQuery,
  parseWikiSearchResponse,
} from '../lib/celebrity-search.ts'
import { isAllowedCelebrityImageUrl } from '../lib/celebrity-image.ts'

describe('requête de recherche de star', () => {
  it('normalise les espaces et borne la longueur', () => {
    assert.equal(normalizeCelebrityQuery('  Cristiano   Ronaldo '), 'Cristiano Ronaldo')
    assert.equal(normalizeCelebrityQuery('a'.repeat(200)).length, 80)
  })

  it('exige au moins deux caractères', () => {
    assert.equal(isSearchableCelebrityQuery('z'), false)
    assert.equal(isSearchableCelebrityQuery('  '), false)
    assert.equal(isSearchableCelebrityQuery('ze'), true)
  })

  it('cherche par titre par défaut — bien plus précis sur un nom propre', () => {
    const url = new URL(buildWikiSearchUrl('fr', 'Zendaya'))
    assert.equal(url.hostname, 'fr.wikipedia.org')
    assert.equal(url.searchParams.get('generator'), 'prefixsearch')
    assert.equal(url.searchParams.get('gpssearch'), 'Zendaya')
    assert.ok(url.searchParams.get('prop')?.includes('pageimages'))
  })

  it('bascule sur le plein texte pour le rappel', () => {
    const url = new URL(buildWikiSearchUrl('en', 'Zendaya', 'fulltext'))
    assert.equal(url.hostname, 'en.wikipedia.org')
    assert.equal(url.searchParams.get('generator'), 'search')
    assert.equal(url.searchParams.get('gsrsearch'), 'Zendaya')
    assert.equal(url.searchParams.get('gsrnamespace'), '0')
  })
})

describe('filtrage des résultats', () => {
  it('écarte films, albums, homonymies et lieux', () => {
    assert.equal(isLikelyPersonDescription('film américain de 2019'), false)
    assert.equal(isLikelyPersonDescription('album de Beyoncé'), false)
    assert.equal(isLikelyPersonDescription('page d’homonymie de Wikimedia'), false)
    assert.equal(isLikelyPersonDescription('Wikimedia disambiguation page'), false)
    assert.equal(isLikelyPersonDescription('commune française du Rhône'), false)
  })

  it('écarte les descriptions accentuées (piège du \\b ASCII)', () => {
    assert.equal(isLikelyPersonDescription('équipe nationale masculine de football'), false)
    assert.equal(
      isLikelyPersonDescription('rivalité sportive entre Lionel Messi et Cristiano Ronaldo'),
      false,
    )
    assert.equal(isLikelyPersonDescription('série télévisée américaine'), false)
    assert.equal(isLikelyPersonDescription('comédie romantique sortie en 2026'), false)
    assert.equal(isLikelyPersonDescription('duo de comiques français'), false)
    assert.equal(isLikelyPersonDescription("liste d'un projet Wikimedia"), false)
  })

  it('écarte les évènements et les figures historiques', () => {
    assert.equal(
      isLikelyPersonDescription("1741, bataille la plus importante de la guerre de l'oreille de Jenkins"),
      false,
    )
    assert.equal(isLikelyPersonDescription('navigateur florentin (1454-1512)'), false)
    assert.equal(isLikelyPersonDescription('actrice française (1934-2022)'), false)
    assert.equal(isLikelyPersonDescription("Men's World Cup final, held in Qatar"), false)
    assert.equal(isLikelyPersonTitle('Siège de Carthagène des Indes'), false)
    assert.equal(isLikelyPersonTitle('2022 FIFA World Cup final'), false)
  })

  it('garde une année de naissance seule', () => {
    assert.equal(isLikelyPersonDescription('British actor (born 1996)'), true)
    assert.equal(isLikelyPersonDescription('footballeur français né en 1998'), true)
  })

  it('garde les personnes, y compris sans description', () => {
    assert.equal(isLikelyPersonDescription('actrice et chanteuse américaine'), true)
    assert.equal(isLikelyPersonDescription('footballeur portugais'), true)
    assert.equal(isLikelyPersonDescription(''), true)
  })

  it('écarte les titres dérivés même sans description', () => {
    assert.equal(isLikelyPersonTitle('Zendaya discography'), false)
    assert.equal(isLikelyPersonTitle('Vidéographie de Beyoncé'), false)
    assert.equal(isLikelyPersonTitle('Carrière de Cristiano Ronaldo'), false)
    assert.equal(isLikelyPersonTitle('Dua Lipa - Live From Mexico'), false)
    assert.equal(isLikelyPersonTitle('The Self-Titled Tour'), false)
    assert.equal(isLikelyPersonTitle('Tom Holland (acteur)'), true)
    assert.equal(isLikelyPersonTitle('MJ (personnage de fiction)'), false)
  })

  it('exige titre ET description valides', () => {
    assert.equal(isLikelyPersonPage('Zendaya', 'actrice américaine'), true)
    assert.equal(isLikelyPersonPage('Zendaya discography', ''), false)
    assert.equal(isLikelyPersonPage('Équipe du Portugal de football', 'équipe nationale'), false)
  })
})

describe('parsing de la réponse Wikipedia', () => {
  const response = {
    query: {
      pages: [
        {
          title: 'Euphoria',
          index: 1,
          description: 'série télévisée américaine',
          thumbnail: { source: 'https://upload.wikimedia.org/euphoria.jpg' },
        },
        {
          title: 'Zendaya',
          index: 2,
          description: 'actrice et chanteuse américaine',
          thumbnail: { source: 'https://upload.wikimedia.org/zendaya.jpg' },
        },
        {
          title: 'Star sans photo',
          index: 3,
          description: 'actrice française',
        },
      ],
    },
  }

  it('ne garde que les personnes avec une photo, triées par pertinence', () => {
    const results = parseWikiSearchResponse(response, 'fr', 'zendaya')
    assert.deepEqual(results.map((r) => r.name), ['Zendaya'])
    assert.equal(results[0]?.lang, 'fr')
    assert.equal(results[0]?.imageUrl, 'https://upload.wikimedia.org/zendaya.jpg')
  })

  it('écarte les pages hors sujet même si ce sont des personnes', () => {
    const off = {
      query: {
        pages: [{
          title: 'Alejandro Zendejas',
          index: 1,
          description: 'joueur américain de soccer',
          thumbnail: { source: 'https://upload.wikimedia.org/z.jpg' },
        }],
      },
    }
    assert.deepEqual(parseWikiSearchResponse(off, 'fr', 'zendaya'), [])
  })

  it('renvoie une liste vide sur réponse inattendue', () => {
    assert.deepEqual(parseWikiSearchResponse(null, 'fr', 'zendaya'), [])
    assert.deepEqual(parseWikiSearchResponse({ query: {} }, 'en', 'zendaya'), [])
  })
})

describe('pertinence du nom', () => {
  it('accepte le nom exact, partiel ou en cours de frappe', () => {
    assert.equal(celebrityNameMatchesQuery('zendaya', 'Zendaya'), true)
    assert.equal(celebrityNameMatchesQuery('ronaldo', 'Cristiano Ronaldo'), true)
    assert.equal(celebrityNameMatchesQuery('ze', 'Zendaya'), true)
    assert.equal(celebrityNameMatchesQuery('beyonce', 'Beyoncé'), true)
  })

  it('tolère les fautes de frappe', () => {
    assert.equal(celebrityNameMatchesQuery('indie navarette', 'Inde Navarrette'), true)
    assert.equal(celebrityNameMatchesQuery('mbappe', 'Kylian Mbappé'), true)
  })

  it('rejette les titres seulement proches alphabétiquement', () => {
    assert.equal(celebrityNameMatchesQuery('zendaya', 'Alejandro Zendejas'), false)
    assert.equal(celebrityNameMatchesQuery('zendaya', 'Michel Zendali'), false)
    assert.equal(celebrityNameMatchesQuery('dua lipa', 'Dualité onde-corpuscule'), false)
    assert.equal(celebrityNameMatchesQuery('dua lipa', 'Dua Libro'), false)
    assert.equal(celebrityNameMatchesQuery('omar sy', 'Omar Sharif'), false)
  })

  it('rejette les personnes seulement citées dans l’article', () => {
    assert.equal(celebrityNameMatchesQuery('zendaya', 'Tom Holland'), false)
    assert.equal(celebrityNameMatchesQuery('zendaya', 'Bella Thorne'), false)
  })
})

describe('fusion FR + EN', () => {
  const fr = [{ name: 'Zendaya', description: 'actrice', imageUrl: 'a.jpg', lang: 'fr' as const }]
  const en = [
    { name: 'zendaya', description: 'actress', imageUrl: 'b.jpg', lang: 'en' as const },
    { name: 'Tom Holland', description: 'actor', imageUrl: 'c.jpg', lang: 'en' as const },
  ]

  it('déduplique sans tenir compte de la casse ni des accents', () => {
    const merged = mergeCelebrityResults([fr, en])
    assert.deepEqual(merged.map((r) => r.name), ['Zendaya', 'Tom Holland'])
  })

  it('borne le nombre de résultats', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      name: `Star ${i}`,
      description: 'actrice',
      imageUrl: `${i}.jpg`,
      lang: 'fr' as const,
    }))
    assert.equal(mergeCelebrityResults([many]).length, CELEBRITY_SEARCH_LIMIT)
  })
})

describe('domaine deviné', () => {
  it('mappe les descriptions courantes sur les domaines de l’UI', () => {
    assert.equal(guessCelebrityDomain('actrice et productrice américaine'), 'Acteur·rice')
    assert.equal(guessCelebrityDomain('chanteuse américaine'), 'Chanteur·se')
    assert.equal(guessCelebrityDomain('footballeur portugais'), 'Sportif·ve')
    assert.equal(guessCelebrityDomain('mannequin britannique'), 'Mannequin')
    assert.equal(guessCelebrityDomain('personnalité publique'), '')
    assert.equal(guessCelebrityDomain(''), '')
  })

  it('retient le métier cité en premier, pas l’ordre des règles', () => {
    assert.equal(
      guessCelebrityDomain('autrice-compositrice-interprète, mannequin et actrice britannique'),
      'Chanteur·se',
    )
    assert.equal(guessCelebrityDomain('actrice et chanteuse américaine'), 'Acteur·rice')
  })
})

describe('portrait sélectionné', () => {
  it('n’autorise que les hôtes Wikimedia en HTTPS', () => {
    assert.equal(isAllowedCelebrityImageUrl('https://upload.wikimedia.org/a/zendaya.jpg'), true)
    assert.equal(isAllowedCelebrityImageUrl('https://fr.wikipedia.org/a.jpg'), true)
    assert.equal(isAllowedCelebrityImageUrl('http://upload.wikimedia.org/a.jpg'), false)
    assert.equal(isAllowedCelebrityImageUrl('https://evil.example.com/a.jpg'), false)
    assert.equal(isAllowedCelebrityImageUrl('https://notwikimedia.org/a.jpg'), false)
    assert.equal(isAllowedCelebrityImageUrl('pas une url'), false)
  })

  it('demande une vignette déjà exploitable comme référence visage', () => {
    // Wikimedia rejette les largeurs non pré-générées : la taille doit venir
    // de la requête de recherche, jamais d'une réécriture d'URL.
    const url = new URL(buildWikiSearchUrl('fr', 'Zendaya'))
    assert.equal(url.searchParams.get('pithumbsize'), String(CELEBRITY_SEARCH_THUMB_PX))
    assert.ok(CELEBRITY_SEARCH_THUMB_PX >= 480)
  })
})
