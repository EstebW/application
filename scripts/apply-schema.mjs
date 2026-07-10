/**
 * Applique le schéma SQL sur Supabase.
 * Usage : node scripts/apply-schema.mjs
 * Requiert que .env.local soit rempli avec NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

// Charger .env.local manuellement
const envPath = join(__dir, '..', '.env.local')
try {
  const env = readFileSync(envPath, 'utf-8')
  for (const line of env.split('\n')) {
    const [key, ...rest] = line.split('=')
    if (key && !key.startsWith('#')) process.env[key.trim()] = rest.join('=').trim()
  }
} catch {
  console.error('❌ .env.local introuvable. Copie .env.local.example → .env.local et remplis les clés.')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis dans .env.local')
  process.exit(1)
}

const sql = readFileSync(join(__dir, '..', 'supabase', 'schema.sql'), 'utf-8')

// Exécuter via la Supabase Management API (RPC pg_query)
const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: key,
    Authorization: `Bearer ${key}`,
  },
  body: JSON.stringify({ sql }),
})

if (!res.ok) {
  // Fallback: afficher les instructions
  console.log('\n✅ Schéma préparé. Pour l\'appliquer, copie ce SQL dans le SQL Editor de Supabase :')
  console.log(`   https://supabase.com/dashboard/project/${url.split('.')[0].replace('https://', '')}/sql/new`)
  console.log('\n--- Contenu à coller ---')
  console.log(sql)
} else {
  console.log('✅ Schéma appliqué avec succès sur Supabase !')
}
