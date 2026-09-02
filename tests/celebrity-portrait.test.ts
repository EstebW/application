/**
 * Exécution : npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  PORTRAIT_THUMB_PX,
  buildCommonsPortraitSearchUrl,
  buildPortraitPickBody,
  buildPortraitPickKieMessages,
  commonsFilePathUrl,
  isUsablePortraitCandidate,
  parseCommonsPortraitResponse,
  parsePortraitPick,
  rankPortraitCandidates,
  scorePortraitCandidate,
  type PortraitCandidate,
} from '../lib/celebrity-portrait.ts'

function candidate(over: Partial<PortraitCandidate> = {}): PortraitCandidate {
  return {
    fileName: 'Dua Lipa in 2021.jpg',
    thumbUrl: 'https://upload.wikimedia.org/thumb.jpg',
    width: 800,
    height: 1000,
    mime: 'image/jpeg',
    ...over,
  }
}

describe('recherche des photos candidates', () => {
  it('interroge les fichiers Commons avec vignette', () => {
    const url = new URL(buildCommonsPortraitSearchUrl('Dua Lipa'))
    assert.equal(url.hostname, 'commons.wikimedia.org')
    assert.equal(url.searchParams.get('generator'), 'search')
    assert.equal(url.searchParams.get('gsrsearch'), '"Dua Lipa"')
    assert.equal(url.searchParams.get('gsrnamespace'), '6')
    assert.equal(url.searchParams.get('iiurlwidth'), String(PORTRAIT_THUMB_PX))
  })

  it('lit les fichiers renvoyés, dans l’ordre de pertinence', () => {
    const json = {
      query: {
        pages: [
          {
            title: 'File:Dua Lipa second.jpg',
            index: 2,
            imageinfo: [{ thumburl: 'https://x/b.jpg', width: 800, height: 1000, mime: 'image/jpeg' }],
          },
          {
            title: 'File:Dua Lipa first.jpg',
            index: 1,
            imageinfo: [{ thumburl: 'https://x/a.jpg', width: 900, height: 1200, mime: 'image/jpeg' }],
          },
          { title: 'File:Sans info.jpg', index: 3 },
        ],
      },
    }
    const parsed = parseCommonsPortraitResponse(json)
    assert.deepEqual(parsed.map((c) => c.fileName), ['Dua Lipa first.jpg', 'Dua Lipa second.jpg'])
  })

  it('renvoie une liste vide sur réponse inattendue', () => {
    assert.deepEqual(parseCommonsPortraitResponse(null), [])
    assert.deepEqual(parseCommonsPortraitResponse({ query: {} }), [])
  })
})

describe('candidates exploitables', () => {
  it('refuse vidéos, SVG et images minuscules', () => {
    assert.equal(isUsablePortraitCandidate(candidate({ mime: 'video/webm' })), false)
    assert.equal(isUsablePortraitCandidate(candidate({ mime: 'image/svg+xml' })), false)
    assert.equal(isUsablePortraitCandidate(candidate({ width: 80, height: 90 })), false)
  })

  it('refuse les panoramas et bandeaux', () => {
    assert.equal(isUsablePortraitCandidate(candidate({ width: 5719, height: 1786 })), false)
  })

  it('refuse les fichiers sans visage', () => {
    assert.equal(isUsablePortraitCandidate(candidate({ fileName: 'Maillot Mbappé.jpg' })), false)
    assert.equal(isUsablePortraitCandidate(candidate({ fileName: 'Dua Lipa signature.jpg' })), false)
    assert.equal(isUsablePortraitCandidate(candidate({ fileName: 'Flag of France.jpg' })), false)
  })

  it('accepte une photo de portrait classique', () => {
    assert.equal(isUsablePortraitCandidate(candidate()), true)
  })
})

describe('pré-tri des candidates', () => {
  it('favorise le nom de la star, le recadrage et le format portrait', () => {
    const named = scorePortraitCandidate(candidate({ fileName: 'Dua Lipa (cropped).jpg' }), 'Dua Lipa')
    const anonymous = scorePortraitCandidate(candidate({ fileName: 'Glasto24 259.jpg' }), 'Dua Lipa')
    assert.ok(named > anonymous)
  })

  it('pénalise les photos de scène — micro devant le visage', () => {
    const stage = scorePortraitCandidate(
      candidate({ fileName: 'Dua Lipa live at Glastonbury festival.jpg' }),
      'Dua Lipa',
    )
    const studio = scorePortraitCandidate(candidate({ fileName: 'Dua Lipa in 2021.jpg' }), 'Dua Lipa')
    assert.ok(studio > stage)
  })

  it('borne la liste envoyée au modèle et retire les doublons', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      candidate({ fileName: `Dua Lipa ${i}.jpg` }))
    many.push(candidate({ fileName: 'Dua Lipa 0.jpg' }))
    const ranked = rankPortraitCandidates(many, 'Dua Lipa', 5)
    assert.equal(ranked.length, 5)
    assert.equal(new Set(ranked.map((c) => c.fileName)).size, 5)
  })
})

describe('URL de l’image finale', () => {
  it('passe par Special:FilePath, sans second appel API', () => {
    const url = new URL(commonsFilePathUrl('Dua Lipa in 2021.jpg'))
    assert.equal(url.hostname, 'commons.wikimedia.org')
    assert.ok(url.pathname.includes('Special:FilePath'))
    assert.ok(url.pathname.includes('Dua_Lipa_in_2021.jpg'))
    assert.equal(url.searchParams.get('width'), '800')
  })
})

describe('requête de sélection au modèle', () => {
  it('numérote les photos dans l’ordre fourni', () => {
    const body = buildPortraitPickBody({
      celebrityName: 'Dua Lipa',
      images: [
        { mimeType: 'image/jpeg', data: 'AAA' },
        { mimeType: 'image/png', data: 'BBB' },
      ],
    }) as {
      contents: Array<{ parts: Array<{ text?: string; inlineData?: { data: string } }> }>
      generationConfig: { temperature: number; responseMimeType: string }
    }

    const texts = body.contents[0]!.parts.filter((p) => p.text).map((p) => p.text)
    assert.ok(texts.some((t) => t === 'Photo 0:'))
    assert.ok(texts.some((t) => t === 'Photo 1:'))
    assert.equal(body.contents[0]!.parts.filter((p) => p.inlineData).length, 2)
    assert.equal(body.generationConfig.temperature, 0)
    assert.equal(body.generationConfig.responseMimeType, 'application/json')
  })

  it('construit aussi le format KIE / OpenAI', () => {
    const messages = buildPortraitPickKieMessages({
      celebrityName: 'Dua Lipa',
      images: [{ mimeType: 'image/jpeg', data: 'AAA' }],
    })
    assert.equal(messages[0]?.role, 'system')
    const user = messages[1] as { content: Array<{ type?: string; image_url?: { url: string } }> }
    assert.ok(user.content.some((part) => part.type === 'image_url' && part.image_url?.url.startsWith('data:image/jpeg;base64,')))
  })
})

describe('réponse du modèle', () => {
  it('lit l’index choisi et la raison', () => {
    const pick = parsePortraitPick('{"best_index": 2, "reason": "frontal, face unobstructed"}', 5)
    assert.deepEqual(pick, { index: 2, reason: 'frontal, face unobstructed' })
  })

  it('accepte du JSON entouré de texte', () => {
    assert.equal(parsePortraitPick('Voici: {"best_index":0,"reason":"ok"} fin', 3)?.index, 0)
  })

  it('rejette un index hors plage ou illisible — repli sur le pré-tri', () => {
    assert.equal(parsePortraitPick('{"best_index": 9}', 5), null)
    assert.equal(parsePortraitPick('{"best_index": -1}', 5), null)
    assert.equal(parsePortraitPick('pas du json', 5), null)
    assert.equal(parsePortraitPick('{"best_index": 0}', 0), null)
  })
})
