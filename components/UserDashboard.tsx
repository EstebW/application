'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Crown,
  History,
  Plus,
  CreditCard,
  Zap,
  Image as ImageIcon,
  ScanFace,
  LogOut,
  ChevronDown,
  ExternalLink,
  Settings2,
  Pencil,
  Check,
  X,
} from 'lucide-react'
import { callFunction } from '@/lib/functions'
import type { AccountData } from '@/lib/account'
import { accountHasUnlimitedAccess } from '@/lib/roles'
import { PLAN_CENTS, PLAN_CREDITS, type PlanId, isPlanId } from '@/lib/plans'
import PaymentScreen from '@/components/PaymentScreen'
import { supabase } from '@/lib/supabase'
import { signOut } from '@/lib/auth'
import {
  setStoredSessionId,
  setStoredEmail,
  clearStoredSession,
} from '@/lib/session-storage'
import { formatCelebrityName } from '@/lib/display-name'
import type { StripeBillingSummary } from '@/lib/stripe-billing'

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
  })
}

function formatPriceEuros(cents: number) {
  return `${(cents / 100).toFixed(2).replace('.', ',')}€`
}

function planLabel(plan: string | null | undefined) {
  if (plan === 'weekly') return 'Hebdomadaire'
  if (plan === 'monthly') return 'Mensuel'
  if (plan === 'once') return 'One Shot'
  return null
}

function planPriceLine(plan: PlanId | null | undefined, priceCents?: number | null, interval?: string | null) {
  if (!plan && priceCents == null) return null
  const cents = priceCents ?? (plan ? PLAN_CENTS[plan] : null)
  if (cents == null) return null
  const price = formatPriceEuros(cents)
  const freq =
    interval === 'week' || plan === 'weekly'
      ? 'semaine'
      : interval === 'month' || plan === 'monthly'
        ? 'mois'
        : null
  return freq ? `${price} / ${freq}` : price
}

function fallbackTransactionLabel(t: AccountData['transactions'][number]): string {
  if (t.label) return t.label
  if (t.reason === 'payment') {
    if (t.amount === 10) return 'Abonnement hebdomadaire'
    if (t.amount === 40) return 'Abonnement mensuel'
    if (t.amount === 1) return 'Achat One Shot'
    return 'Achat de crédits'
  }
  if (t.reason === 'generation') return 'Photo générée'
  if (t.reason === 'refund') return 'Remboursement'
  if (t.reason === 'bonus') return 'Bonus'
  return t.reason
}

function creationSubtitle(mode?: string | null) {
  if (mode === 'photo_edit') return 'Photo avec une star'
  return 'Photo avec une star'
}

export default function UserDashboard() {
  const router = useRouter()
  const [account, setAccount] = useState<AccountData | null>(null)
  const [userId, setUserId] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [showPayment, setShowPayment] = useState(false)
  const [checkoutMessage, setCheckoutMessage] = useState('')
  const [billing, setBilling] = useState<StripeBillingSummary | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.replace('/login')
        return
      }

      if (!cancelled) setUserId(user.id)

      try {
        const data = await callFunction<AccountData>('account', {
          userId: user.id,
          email: user.email ?? undefined,
        })

        if (cancelled) return

        setAccount(data)
        setStoredSessionId(data.sessionId)
        if (data.email) setStoredEmail(data.email)

        // Données abonnement live Stripe
        try {
          const qs = new URLSearchParams({
            sessionId: data.sessionId,
            userId: user.id,
          })
          const { getClientAuthHeaders } = await import('@/lib/client-auth-headers')
          const authHeaders = await getClientAuthHeaders()
          const res = await fetch(`/api/stripe/billing?${qs}`, { headers: authHeaders })
          if (res.ok) {
            const summary = (await res.json()) as StripeBillingSummary
            if (!cancelled) setBilling(summary)
          }
        } catch {
          // non-bloquant
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const checkout = params.get('checkout')
    const checkoutSessionId = params.get('session_id')
    if (checkout === 'cancel') {
      setShowPayment(true)
      setCheckoutMessage('Paiement annulé — tu peux réessayer.')
      router.replace('/dashboard')
      return
    }
    if (checkout !== 'success' || !checkoutSessionId?.startsWith('cs_')) return

    let cancelled = false
    async function confirm() {
      try {
        const res = await fetch(
          `/api/stripe/confirm?session_id=${encodeURIComponent(checkoutSessionId!)}`
        )
        const data = (await res.json()) as { creditsBalance?: number; error?: string }
        if (!res.ok) throw new Error(data.error || 'Confirmation échouée')
        if (cancelled) return
        if (typeof data.creditsBalance === 'number') {
          setAccount((prev) => prev ? { ...prev, creditsBalance: data.creditsBalance! } : prev)
        }
        setShowPayment(false)
        setCheckoutMessage('Paiement confirmé — crédits ajoutés.')
      } catch (err) {
        if (!cancelled) {
          setCheckoutMessage(err instanceof Error ? err.message : 'Erreur de confirmation')
        }
      } finally {
        router.replace('/dashboard')
      }
    }
    confirm()
    return () => { cancelled = true }
  }, [router])

  const handlePaymentSuccess = (newBalance: number) => {
    setShowPayment(false)
    setAccount((prev) => prev ? { ...prev, creditsBalance: newBalance } : prev)
  }

  const handleLogout = async () => {
    clearStoredSession()
    await signOut()
    router.push('/')
  }

  const startEditName = () => {
    setNameDraft(account?.firstName ?? '')
    setNameError('')
    setEditingName(true)
  }

  const cancelEditName = () => {
    setEditingName(false)
    setNameError('')
    setNameDraft('')
  }

  const saveProfileName = async () => {
    if (!account) return
    const next = nameDraft.replace(/\s+/g, ' ').trim()
    if (next.length > 40) {
      setNameError('Le nom doit faire au plus 40 caractères')
      return
    }
    setNameSaving(true)
    setNameError('')
    try {
      const data = await callFunction<{ success?: boolean; firstName?: string | null; error?: string }>(
        'account',
        { action: 'updateProfile', firstName: next },
      )
      if (data.error) throw new Error(data.error)
      setAccount((prev) => prev ? { ...prev, firstName: data.firstName ?? null } : prev)
      setEditingName(false)
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Impossible d’enregistrer le nom')
    } finally {
      setNameSaving(false)
    }
  }

  const openPortal = async () => {
    if (!account) return
    setPortalError('')
    setPortalLoading(true)
    try {
      const { getClientAuthHeaders } = await import('@/lib/client-auth-headers')
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: await getClientAuthHeaders(),
        body: JSON.stringify({ sessionId: account.sessionId, userId }),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Impossible d’ouvrir le portail')
      }
      window.location.href = data.url
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : 'Erreur portail Stripe')
      setPortalLoading(false)
    }
  }

  const stripeSub = billing?.subscription ?? null
  const activePlan: PlanId | null = useMemo(() => {
    if (stripeSub?.plan && isPlanId(stripeSub.plan)) return stripeSub.plan
    if (isPlanId(account?.subscriptionPlan)) {
      return account!.subscriptionPlan as PlanId
    }
    return null
  }, [stripeSub, account])

  const isRecurring =
    Boolean(stripeSub && (stripeSub.status === 'active' || stripeSub.status === 'trialing' || stripeSub.status === 'past_due')) ||
    (activePlan === 'weekly' || activePlan === 'monthly')

  const canManageSubscription = Boolean(
    billing?.hasStripeCustomer || account?.stripeCustomerId
  )

  const renewAt =
    stripeSub?.currentPeriodEnd ??
    account?.subscriptionExpiresAt ??
    null

  const creditsPerPeriod =
    stripeSub?.creditsPerPeriod ??
    (activePlan === 'weekly' || activePlan === 'monthly' ? PLAN_CREDITS[activePlan] : null)

  const priceLine = planPriceLine(
    activePlan,
    stripeSub?.priceCents,
    stripeSub?.interval
  )

  const renewLine = useMemo(() => {
    if (!isRecurring || !renewAt) return null
    const date = formatDateShort(renewAt)
    if (stripeSub?.cancelAtPeriodEnd) {
      return `Se termine le ${date}`
    }
    if (creditsPerPeriod) {
      return `+${creditsPerPeriod} crédits le ${date}`
    }
    return `Prochain renouvellement : ${date}`
  }, [isRecurring, renewAt, stripeSub?.cancelAtPeriodEnd, creditsPerPeriod])

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
          Impossible de charger ton espace. Déconnecte-toi puis reconnecte-toi, ou crée un nouveau compte.
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

  const subLabel = planLabel(activePlan ?? account.subscriptionPlan)
  const unlimitedAccess = accountHasUnlimitedAccess(account)

  return (
    <div className="flex flex-col gap-6 w-full">
      {checkoutMessage && (
        <p className="text-center text-xs text-[#D4AF37] px-2">{checkoutMessage}</p>
      )}

      {/* ── Carte Mon compte ── */}
      <div
        className="rounded-2xl p-5 space-y-5"
        style={{
          background: 'linear-gradient(160deg,#141414,#0E0E0E)',
          border: '1px solid rgba(212,175,55,0.25)',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[#606060] text-xs uppercase tracking-widest font-semibold">Mon compte</p>
          {unlimitedAccess && (
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md"
              style={{
                color: '#D4AF37',
                background: 'rgba(212,175,55,0.12)',
                border: '1px solid rgba(212,175,55,0.35)',
              }}
            >
              Super Admin
            </span>
          )}
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-stretch sm:justify-between sm:gap-6">
          {/* Gauche — identité & abonnement */}
          <div className="min-w-0 flex-1 space-y-2.5">
            <div>
              {editingName ? (
                <div className="space-y-2">
                  <label htmlFor="profile-name" className="text-[#606060] text-[10px] uppercase tracking-widest font-semibold">
                    Nom de profil
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="profile-name"
                      type="text"
                      value={nameDraft}
                      onChange={(e) => { setNameDraft(e.target.value); setNameError('') }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void saveProfileName()
                        }
                        if (e.key === 'Escape') cancelEditName()
                      }}
                      maxLength={40}
                      placeholder="Ton prénom"
                      autoComplete="nickname"
                      autoFocus
                      disabled={nameSaving}
                      className="min-w-0 flex-1 rounded-xl px-3 py-2 text-sm text-white outline-none"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(212,175,55,0.35)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void saveProfileName()}
                      disabled={nameSaving}
                      aria-label="Enregistrer le nom"
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 disabled:opacity-50"
                      style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.35)' }}
                    >
                      <Check size={15} className="text-[#D4AF37]" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditName}
                      disabled={nameSaving}
                      aria-label="Annuler"
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      <X size={15} className="text-[#808080]" />
                    </button>
                  </div>
                  {nameError && (
                    <p className="text-red-400/90 text-[11px]">{nameError}</p>
                  )}
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[#606060] text-[10px] uppercase tracking-widest font-semibold mb-0.5">
                      Nom de profil
                    </p>
                    <p className="text-white font-semibold text-sm truncate">
                      {account.firstName || 'Non renseigné'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={startEditName}
                    aria-label="Modifier le nom de profil"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex-shrink-0"
                    style={{
                      color: '#D4AF37',
                      background: 'rgba(212,175,55,0.08)',
                      border: '1px solid rgba(212,175,55,0.25)',
                    }}
                  >
                    <Pencil size={11} />
                    {account.firstName ? 'Modifier' : 'Ajouter'}
                  </button>
                </div>
              )}
              <p className="text-[#808080] text-xs break-all mt-2.5">
                {account.email ?? 'Membre'}
              </p>
            </div>

            {unlimitedAccess ? (
              <div className="space-y-1 pt-1">
                <p className="text-[#D4AF37] text-xs font-semibold flex items-center gap-1.5">
                  <Crown size={12} className="flex-shrink-0" />
                  Accès illimité
                </p>
                <p className="text-[#606060] text-xs pl-[18px]">Mode administrateur</p>
              </div>
            ) : isRecurring && subLabel ? (
              <div className="space-y-1 pt-1">
                <p className="text-[#D4AF37] text-xs font-semibold flex items-center gap-1.5">
                  <Crown size={12} className="flex-shrink-0" />
                  Abonnement {subLabel}
                  {stripeSub?.cancelAtPeriodEnd && (
                    <span className="text-[#808080] font-normal">· résiliation prévue</span>
                  )}
                </p>
                {priceLine && (
                  <p className="text-[#A0A0A0] text-xs pl-[18px]">{priceLine}</p>
                )}
                {renewLine && (
                  <p className="text-[#606060] text-xs pl-[18px] leading-relaxed">{renewLine}</p>
                )}
              </div>
            ) : (
              <p className="text-[#505050] text-xs pt-1">Aucun abonnement actif</p>
            )}
          </div>

          {/* Droite — crédits (informatif même en Super Admin) */}
          <div
            className="sm:w-[140px] flex-shrink-0 rounded-2xl px-4 py-4 text-center flex flex-col items-center justify-center"
            style={{
              background: 'rgba(212,175,55,0.12)',
              border: '1px solid rgba(212,175,55,0.3)',
            }}
          >
            <p className="text-[#D4AF37] text-4xl font-black leading-none tracking-tight">
              {account.creditsBalance}
            </p>
            <p className="text-[#808080] text-[11px] mt-2 font-medium leading-snug">
              {unlimitedAccess
                ? 'crédits (info)'
                : `crédit${account.creditsBalance !== 1 ? 's' : ''} disponibles`}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2.5 pt-1">
          <div className={`grid grid-cols-1 ${unlimitedAccess ? '' : 'sm:grid-cols-2'} gap-2`}>
            <Link
              href="/"
              className="flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold text-black"
              style={{ background: 'linear-gradient(135deg,#D4AF37,#F0D060)' }}
            >
              <Plus size={15} />
              Nouvelle analyse
            </Link>
            {!unlimitedAccess && (
              <button
                type="button"
                onClick={() => setShowPayment(true)}
                className="flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#A0A0A0',
                }}
              >
                <CreditCard size={15} />
                Acheter des crédits
              </button>
            )}
          </div>

          {!unlimitedAccess && canManageSubscription && (
            <button
              type="button"
              onClick={openPortal}
              disabled={portalLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-[#D4AF37]/90 text-xs font-semibold hover:text-[#F0D060] transition-colors disabled:opacity-60"
            >
              {portalLoading ? (
                <motion.div
                  className="w-3.5 h-3.5 rounded-full border-2 border-[#D4AF37]/30 border-t-[#D4AF37]"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                />
              ) : (
                <Settings2 size={13} />
              )}
              Gérer mon abonnement
              <ExternalLink size={11} className="opacity-60" />
            </button>
          )}

          {portalError && (
            <p className="text-red-400/90 text-[11px] text-center leading-relaxed px-2">
              {portalError}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2 text-[#505050] text-xs hover:text-[#808080] transition-colors"
        >
          <LogOut size={13} />
          Se déconnecter
        </button>
      </div>

      {!unlimitedAccess && showPayment && (
        <div
          className="rounded-2xl p-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <PaymentScreen
            sessionId={account.sessionId}
            userId={userId}
            email={account.email ?? undefined}
            creditsBalance={account.creditsBalance}
            onSuccess={handlePaymentSuccess}
            returnTo="dashboard"
          />
        </div>
      )}

      {/* ── Mes analyses ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ScanFace size={14} className="text-[#D4AF37]" />
          <h2 className="text-sm font-bold text-white">Mes analyses</h2>
          {account.analyses.length > 0 && (
            <span className="text-[#505050] text-xs">({account.analyses.length})</span>
          )}
        </div>
        {account.analyses.length === 0 ? (
          <div
            className="rounded-xl px-4 py-5 text-center space-y-2"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-[#606060] text-xs leading-relaxed">
              Tu n&apos;as encore aucune analyse.
            </p>
            <Link href="/" className="inline-block text-[#D4AF37] text-xs font-semibold hover:underline">
              Trouver mon jumeau →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {account.analyses.map((a) => (
              <div
                key={a.id}
                className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold truncate">
                    {formatCelebrityName(a.celebrity_name)}
                  </p>
                  <p className="text-[#505050] text-[10px]">{formatDateTime(a.created_at)}</p>
                </div>
                <span className="text-[#D4AF37] font-black text-lg flex-shrink-0">{a.score}%</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Mes créations ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ImageIcon size={14} className="text-[#D4AF37]" />
          <h2 className="text-sm font-bold text-white">Mes créations</h2>
          {account.generations.length > 0 && (
            <span className="text-[#505050] text-xs">({account.generations.length})</span>
          )}
        </div>
        {account.generations.length === 0 ? (
          <p className="text-[#505050] text-xs">Aucune création pour l&apos;instant.</p>
        ) : (
          <div className="space-y-2">
            {account.generations.map((g) => {
              const name = formatCelebrityName(g.celebrity_name)
              return (
                <div
                  key={g.id}
                  className="rounded-xl px-4 py-3 flex items-start gap-3"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <CreationThumb name={name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-white text-sm font-semibold truncate">Avec {name}</p>
                      {g.unlocked && (
                        <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 flex-shrink-0">
                          <Zap size={10} /> HD
                        </span>
                      )}
                    </div>
                    <p className="text-[#606060] text-[11px] mt-0.5">
                      {creationSubtitle(g.creation_mode)}
                    </p>
                    <p className="text-[#505050] text-[10px] mt-1">{formatDateTime(g.created_at)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Historique des crédits (repliable) ── */}
      {account.transactions.length > 0 && (
        <section className="space-y-2">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 py-1"
          >
            <div className="flex items-center gap-2">
              <History size={14} className="text-[#D4AF37]" />
              <h2 className="text-sm font-bold text-white">Historique des crédits</h2>
            </div>
            <span className="flex items-center gap-1 text-[#606060] text-xs font-semibold">
              {historyOpen ? 'Masquer' : 'Voir'}
              <ChevronDown
                size={14}
                className={`transition-transform ${historyOpen ? 'rotate-180' : ''}`}
              />
            </span>
          </button>

          <AnimatePresence initial={false}>
            {historyOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <div className="space-y-1.5 pt-1">
                  {account.transactions.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 text-xs px-1 py-1"
                    >
                      <span className="text-[#808080] truncate min-w-0">
                        {fallbackTransactionLabel(t)}
                      </span>
                      <span
                        className={`font-bold flex-shrink-0 ${
                          t.amount > 0 ? 'text-emerald-400' : 'text-red-400/90'
                        }`}
                      >
                        {t.amount > 0 ? '+' : ''}
                        {t.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}
    </div>
  )
}

/** Miniature discrète — portrait wiki de la star si disponible (pas le prompt). */
function CreationThumb({ name }: { name: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/celebrity-image?name=${encodeURIComponent(name)}`)
        if (!res.ok) return
        const data = (await res.json()) as { url?: string | null }
        if (!cancelled && data.url) setUrl(data.url)
      } catch {
        // ignore
      }
    }
    load()
    return () => { cancelled = true }
  }, [name])

  if (!url) {
    return (
      <div
        className="w-11 h-11 rounded-lg flex-shrink-0 flex items-center justify-center"
        style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.15)' }}
      >
        <ImageIcon size={16} className="text-[#D4AF37]/50" />
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="w-11 h-11 rounded-lg object-cover flex-shrink-0 opacity-90"
      style={{ border: '1px solid rgba(255,255,255,0.08)' }}
    />
  )
}
