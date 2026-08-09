'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import StarField from '@/components/StarField'
import { supabase } from '@/lib/supabase'
import { callFunction } from '@/lib/functions'
import { formatAuthError } from '@/lib/auth'
import { setStoredEmail, setStoredSessionId, getStoredSessionId } from '@/lib/session-storage'
import { readOAuthReturnContext, clearOAuthReturnContext } from '@/lib/oauth-return'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function finish() {
      try {
        const params = new URLSearchParams(window.location.search)
        const next = params.get('next') || '/dashboard'
        const oauthError = params.get('error_description') || params.get('error')
        if (oauthError) {
          throw new Error(oauthError)
        }

        const code = params.get('code')
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) throw exchangeError
        }

        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          throw new Error(userError?.message || 'Session Google introuvable')
        }
        if (cancelled) return

        const oauthCtx = readOAuthReturnContext()
        const sessionId = oauthCtx?.sessionId || getStoredSessionId() || undefined
        const meta = user.user_metadata as Record<string, unknown> | undefined
        const fullName =
          (typeof meta?.full_name === 'string' && meta.full_name) ||
          (typeof meta?.name === 'string' && meta.name) ||
          ''
        const firstName = fullName.trim().split(/\s+/)[0] || undefined

        try {
          const reg = await callFunction<{ sessionId?: string }>('register', {
            sessionId,
            email: user.email ?? undefined,
            firstName,
            userId: user.id,
          })
          if (reg.sessionId) setStoredSessionId(reg.sessionId)
        } catch {
          // Compte peut déjà exister — on continue
        }

        if (user.email) setStoredEmail(user.email)

        if (oauthCtx?.intent === 'funnel') {
          // Contexte conservé pour app/page.tsx (?oauth=funnel)
          window.location.replace('/?oauth=funnel')
          return
        }

        clearOAuthReturnContext()
        const safeNext = next.startsWith('/') ? next : '/dashboard'
        window.location.replace(safeNext)
      } catch (err) {
        if (cancelled) return
        clearOAuthReturnContext()
        const message = formatAuthError(err instanceof Error ? err.message : 'Erreur de connexion')
        setError(message)
      }
    }

    void finish()
    return () => { cancelled = true }
  }, [router])

  return (
    <div className="relative min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-5">
      <StarField />
      <div className="relative z-10 text-center space-y-3 max-w-sm">
        {error ? (
          <>
            <p className="text-red-400 text-sm">{error}</p>
            <button
              type="button"
              onClick={() => router.replace('/login')}
              className="text-[#D4AF37] text-sm hover:underline"
            >
              Retour à la connexion
            </button>
          </>
        ) : (
          <p className="text-[#808080] text-sm">Connexion Google en cours…</p>
        )}
      </div>
    </div>
  )
}
