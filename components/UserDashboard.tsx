'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Crown,
  History,
  Plus,
  CreditCard,
  Zap,
  Image as ImageIcon,
  ScanFace,
  LogOut,
} from 'lucide-react'
import { callFunction } from '@/lib/functions'
import type { AccountData } from '@/lib/account'
import PaymentScreen from '@/components/PaymentScreen'
import { supabase } from '@/lib/supabase'
import { signOut } from '@/lib/auth'
import {
  getStoredSessionId,
  setStoredSessionId,
  setStoredEmail,
} from '@/lib/session-storage'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function planLabel(plan: string | null) {
  if (plan === 'weekly') return 'Hebdomadaire'
  if (plan === 'monthly') return 'Mensuel'
  if (plan === 'once') return 'One Shot'
  return null
}

export default function UserDashboard() {
  const router = useRouter()
  const [account, setAccount] = useState<AccountData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPayment, setShowPayment] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.replace('/login')
        return
      }

      try {
        const sessionId = getStoredSessionId()
        const attempts: Array<Record<string, string>> = [
          { userId: user.id },
          ...(sessionId ? [{ sessionId }] : []),
          ...(user.email ? [{ email: user.email }] : []),
        ]

        let data: AccountData | null = null
        for (const body of attempts) {
          try {
            data = await callFunction<AccountData>('account', body)
            break
          } catch {
            // essai suivant
          }
        }

        if (!data) throw new Error('Compte introuvable')

        if (cancelled) return

        setAccount(data)
        setStoredSessionId(data.sessionId)
        if (data.email) setStoredEmail(data.email)

        if (data.generations.length === 0) {
          router.replace('/')
        }
      } catch {
        if (!cancelled) setAccount(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()
    return () => { cancelled = true }
  }, [router])

  const handlePaymentSuccess = (newBalance: number) => {
    setShowPayment(false)
    setAccount((prev) => prev ? { ...prev, creditsBalance: newBalance } : prev)
  }

  const handleLogout = async () => {
    await signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <motion.div
          className="w-8 h-8 rounded-full border-2 border-[#D4AF37]/30 border-t-[#D4AF37]"
          animate={{ rotate: 360 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
        />
        <p className="text-[#606060] text-sm">Chargement de ton espace…</p>
      </div>
    )
  }

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center px-4">
        <p className="text-[#808080] text-sm">
          Impossible de charger ton espace. Termine d&apos;abord une génération depuis l&apos;accueil, puis reconnecte-toi.
        </p>
        <Link href="/" className="text-[#D4AF37] text-sm hover:underline">
          Retour à l&apos;accueil
        </Link>
        <Link href="/login" className="text-[#606060] text-xs hover:underline">
          Réessayer la connexion
        </Link>
      </div>
    )
  }

  const subLabel = planLabel(account.subscriptionPlan)

  return (
    <div className="flex flex-col gap-6 w-full">
      <div
        className="rounded-2xl p-5 space-y-4"
        style={{
          background: 'linear-gradient(160deg,#141414,#0E0E0E)',
          border: '1px solid rgba(212,175,55,0.25)',
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[#606060] text-xs uppercase tracking-widest font-semibold">Mon compte</p>
            <p className="text-white font-semibold text-sm mt-1">
              {account.firstName ? `${account.firstName} · ` : ''}{account.email ?? 'Membre'}
            </p>
            {subLabel && (
              <p className="text-[#D4AF37] text-xs mt-0.5 flex items-center gap-1">
                <Crown size={11} /> Abonnement {subLabel}
                {account.subscriptionExpiresAt && (
                  <span className="text-[#606060]">
                    · jusqu&apos;au {formatDate(account.subscriptionExpiresAt)}
                  </span>
                )}
              </p>
            )}
          </div>
          <div
            className="px-4 py-2 rounded-xl text-center flex-shrink-0"
            style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)' }}
          >
            <p className="text-[#D4AF37] text-2xl font-black leading-none">{account.creditsBalance}</p>
            <p className="text-[#606060] text-[10px] mt-0.5">crédit{account.creditsBalance !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-black"
            style={{ background: 'linear-gradient(135deg,#D4AF37,#F0D060)' }}
          >
            <Plus size={15} />
            Nouvelle analyse
          </Link>
          <button
            type="button"
            onClick={() => setShowPayment(true)}
            className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#A0A0A0',
            }}
          >
            <CreditCard size={15} />
            Acheter crédits
          </button>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-[#606060] text-xs hover:text-[#A0A0A0] transition-colors"
        >
          <LogOut size={13} />
          Se déconnecter
        </button>
      </div>

      {showPayment && (
        <div className="rounded-2xl p-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <PaymentScreen
            sessionId={account.sessionId}
            email={account.email ?? undefined}
            onSuccess={handlePaymentSuccess}
          />
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ScanFace size={14} className="text-[#D4AF37]" />
          <h2 className="text-sm font-bold text-white">Analyses</h2>
          <span className="text-[#505050] text-xs">({account.analyses.length})</span>
        </div>
        {account.analyses.length === 0 ? (
          <p className="text-[#505050] text-xs">Aucune analyse pour l&apos;instant.</p>
        ) : (
          <div className="space-y-2">
            {account.analyses.map((a) => (
              <div
                key={a.id}
                className="rounded-xl px-4 py-3 flex items-center justify-between"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div>
                  <p className="text-white text-sm font-semibold">{a.celebrity_name}</p>
                  <p className="text-[#505050] text-[10px]">{formatDate(a.created_at)}</p>
                </div>
                <span className="text-[#D4AF37] font-black text-lg">{a.score}%</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ImageIcon size={14} className="text-[#D4AF37]" />
          <h2 className="text-sm font-bold text-white">Générations</h2>
          <span className="text-[#505050] text-xs">({account.generations.length})</span>
        </div>
        {account.generations.length === 0 ? (
          <p className="text-[#505050] text-xs">Aucune photo générée pour l&apos;instant.</p>
        ) : (
          <div className="space-y-2">
            {account.generations.map((g) => (
              <div
                key={g.id}
                className="rounded-xl px-4 py-3"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-white text-sm font-semibold">Avec {g.celebrity_name}</p>
                  {g.unlocked && (
                    <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                      <Zap size={10} /> HD
                    </span>
                  )}
                </div>
                {g.scene_summary && (
                  <p className="text-[#606060] text-[10px] mt-1 line-clamp-2">{g.scene_summary}</p>
                )}
                <p className="text-[#505050] text-[10px] mt-1">{formatDate(g.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {account.transactions.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <History size={14} className="text-[#D4AF37]" />
            <h2 className="text-sm font-bold text-white">Mouvements crédits</h2>
          </div>
          <div className="space-y-1.5">
            {account.transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-xs px-1">
                <span className="text-[#606060]">
                  {t.reason === 'payment' ? 'Achat' : t.reason === 'generation' ? 'Génération' : t.reason}
                  {' · '}{formatDate(t.created_at)}
                </span>
                <span className={t.amount > 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                  {t.amount > 0 ? '+' : ''}{t.amount}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
