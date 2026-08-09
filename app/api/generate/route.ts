import { NextResponse } from 'next/server'
import { getRequestAuthUser } from '@/lib/auth-request'

/**
 * Proxy sécurisé vers l’edge `generate`.
 * Plus de bypass local KIE sans crédits — toute génération passe par l’edge
 * (JWT + contrôle / débit crédits côté serveur).
 */
export async function POST(req: Request) {
  try {
    const user = await getRequestAuthUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Connexion requise' }, { status: 401 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    if (!url || !anonKey) {
      return NextResponse.json({ error: 'Configuration Supabase manquante' }, { status: 500 })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Connexion requise' }, { status: 401 })
    }

    const body = await req.json()

    const res = await fetch(`${url}/functions/v1/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: anonKey,
      },
      body: JSON.stringify({
        ...body,
        // Forcer l’identité JWT côté edge (l’edge ignore body.userId de toute façon)
        userId: user.id,
        email: user.email,
      }),
    })

    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne'
    console.error('[api/generate]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
