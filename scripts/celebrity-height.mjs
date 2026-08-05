/**
 * Administration des tailles de célébrités (le projet n'a pas d'espace admin).
 *
 * Consulter  : node scripts/celebrity-height.mjs list
 *              node scripts/celebrity-height.mjs list --missing
 * Corriger   : node scripts/celebrity-height.mjs set "Lionel Messi" 170 "https://fr.wikipedia.org/wiki/Lionel_Messi"
 * Réinitialiser (relance une recherche automatique) :
 *              node scripts/celebrity-height.mjs reset "Lionel Messi"
 *
 * Une valeur posée à la main est marquée manual_override et n'est jamais
 * écrasée par la récupération automatique.
 * Requiert NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env.local
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

try {
  const env = readFileSync(join(__dir, '..', '.env.local'), 'utf-8')
  for (const line of env.split('\n')) {
    const [key, ...rest] = line.split('=')
    if (key && !key.startsWith('#')) process.env[key.trim()] = rest.join('=').trim()
  }
} catch {
  console.error('❌ .env.local introuvable.')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.')
  process.exit(1)
}

/** Même règle que celebrityIdFromName dans lib/height.ts */
function celebrityIdFromName(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

async function api(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=merge-duplicates',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

const [command, ...args] = process.argv.slice(2)

if (command === 'list') {
  const missingOnly = args.includes('--missing')
  const filter = missingOnly ? '&height_cm=is.null' : ''
  const rows = await api(`celebrity_heights?select=*&order=updated_at.desc&limit=200${filter}`)
  if (!rows.length) {
    console.log('Aucune fiche taille enregistrée.')
  }
  for (const r of rows) {
    const height = r.height_cm ? `${r.height_cm} cm` : '—'
    const flag = r.manual_override ? ' [manuel]' : ''
    console.log(
      `${r.celebrity_id.padEnd(32)} ${height.padStart(7)}  ${r.confidence.padEnd(9)}${flag}  ${r.source_url ?? ''}`
    )
  }
} else if (command === 'set') {
  const [name, rawHeight, sourceUrl] = args
  const heightCm = Number(rawHeight)
  if (!name || !Number.isInteger(heightCm) || heightCm < 120 || heightCm > 260) {
    console.error('Usage : node scripts/celebrity-height.mjs set "Nom" <120-260> [sourceUrl]')
    process.exit(1)
  }
  const now = new Date().toISOString()
  await api('celebrity_heights', {
    method: 'POST',
    body: JSON.stringify({
      celebrity_id: celebrityIdFromName(name),
      display_name: name,
      height_cm: heightCm,
      source_url: sourceUrl ?? null,
      verified_at: now,
      confidence: 'verified',
      manual_override: true,
      updated_at: now,
    }),
  })
  console.log(`✅ ${name} → ${heightCm} cm (correction manuelle, verrouillée)`)
} else if (command === 'reset') {
  const [name] = args
  if (!name) {
    console.error('Usage : node scripts/celebrity-height.mjs reset "Nom"')
    process.exit(1)
  }
  await api(`celebrity_heights?celebrity_id=eq.${encodeURIComponent(celebrityIdFromName(name))}`, {
    method: 'DELETE',
  })
  console.log(`✅ Fiche supprimée : la prochaine génération relancera une recherche pour ${name}.`)
} else {
  console.log(`Commandes :
  list [--missing]                       liste les fiches (ou seulement celles sans taille)
  set "Nom" <cm> [sourceUrl]             corrige une taille à la main (verrouillée)
  reset "Nom"                            supprime la fiche et relance une recherche`)
}
