'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, ChevronRight, Check, Shield, Zap, Crown, TrendingDown, Flame } from 'lucide-react'
import { callFunction, FunctionCallError } from '@/lib/functions'
import { PLAN_CREDITS } from '@/lib/plans'

interface PaymentScreenProps {
  sessionId?: string
  userId?: string
  email?: string
  generationId?: string
  score?: number
  onSuccess: (creditsBalance: number) => void
}

type PayMethod = 'card' | 'apple' | 'paypal'
type PlanId = 'once' | 'weekly' | 'monthly'

interface Plan {
  id: PlanId
  icon: React.ElementType
  label: string
  sublabel: string
  price: string
  oldPrice?: string
  badge?: string
  badgeColor?: string
  recommended?: boolean
  perUnit: string
  credits: number
  pricePerCredit: string
  savings?: string
  savingsPercent?: number
  color: string
  includes: string[]
}

const PLANS: Plan[] = [
  {
    id: 'once',
    icon: Zap,
    label: 'One Shot',
    sublabel: 'Accès unique',
    price: '2,99€',
    perUnit: 'paiement unique',
    credits: 1,
    pricePerCredit: '2,99€',
    color: '#A0A0A0',
    includes: [
      '1 crédit de génération',
      '1 photo IA avec ta star',
      'Version HD téléchargeable',
    ],
  },
  {
    id: 'weekly',
    icon: TrendingDown,
    label: 'Hebdomadaire',
    sublabel: 'Par semaine',
    price: '5,99€',
    oldPrice: '29,90€',
    badge: '-80%',
    badgeColor: '#60a5fa',
    perUnit: 'par semaine',
    credits: 10,
    pricePerCredit: '0,60€',
    savings: 'économie de 80%',
    savingsPercent: 80,
    color: '#60a5fa',
    includes: [
      '10 crédits / semaine',
      '10 photos IA avec tes stars',
      'Renouvellement automatique',
      'Version HD · Sans watermark',
    ],
  },
  {
    id: 'monthly',
    icon: Crown,
    label: 'Mensuel',
    sublabel: 'Par mois',
    price: '12,99€',
    oldPrice: '119,60€',
    badge: 'MEILLEURE OFFRE',
    badgeColor: '#D4AF37',
    recommended: true,
    perUnit: 'par mois',
    credits: 40,
    pricePerCredit: '0,32€',
    savings: 'économie de 89%',
    savingsPercent: 89,
    color: '#D4AF37',
    includes: [
      '40 crédits / mois (4× plus que l\'hebdo)',
      '40 photos IA avec tes stars',
      'Accès prioritaire nouveaux modèles',
      'Renouvellement automatique',
      'Version HD · Sans watermark',
    ],
  },
]

function formatCardNumber(v: string) {
  return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
}
function formatExpiry(v: string) {
  const digits = v.replace(/\D/g, '').slice(0, 4)
  if (digits.length >= 3) return digits.slice(0, 2) + '/' + digits.slice(2)
  return digits
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}
const item = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
}

export default function PaymentScreen({ sessionId, userId, email, generationId, score, onSuccess }: PaymentScreenProps) {
  const [plan, setPlan] = useState<PlanId>('monthly')
  const [method, setMethod] = useState<PayMethod>('card')
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [payEmail, setEmail] = useState(email ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedPlan = PLANS.find((p) => p.id === plan)!

  const isCardValid =
    cardNumber.replace(/\s/g, '').length === 16 &&
    expiry.length === 5 &&
    cvc.length >= 3 &&
    payEmail.includes('@')

  const canPay = method !== 'card' || isCardValid

  async function handlePay() {
    if (!canPay) { setError('Vérifie les informations de paiement'); return }
    setError('')
    setLoading(true)

    const billingEmail = email ?? (payEmail.includes('@') ? payEmail.trim() : undefined)

    if (!sessionId && !userId && !billingEmail) {
      setLoading(false)
      setError('Impossible d\'identifier ton compte. Recharge la page et réessaie.')
      return
    }

    const delay = new Promise((r) => setTimeout(r, 2200))

    try {
      // Paiement simulé (carte/Apple/PayPal toujours acceptés), MAIS le crédit
      // en base est réel : on attend la vraie confirmation du serveur avant
      // de laisser l'utilisateur continuer, pour ne jamais afficher un solde
      // qui n'existe pas réellement côté base de données.
      const [paymentResult] = await Promise.all([
        callFunction<{ creditsBalance: number }>('payment', {
          sessionId,
          userId,
          email: billingEmail,
          generationId,
          method,
          plan,
        }),
        delay,
      ])

      setLoading(false)
      onSuccess(paymentResult.creditsBalance)
    } catch (err) {
      setLoading(false)
      const message = err instanceof FunctionCallError ? err.message : 'Erreur lors du paiement, réessaie.'
      setError(`Le crédit n'a pas pu être enregistré (${message}). Réessaie ou contacte le support.`)
    }
  }

  const inputClass =
    'w-full bg-[#0E0E0E] border border-[#222] rounded-xl px-4 py-3.5 text-white text-sm placeholder-[#505050] focus:outline-none focus:border-[#D4AF37]/60 transition-colors'

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="flex flex-col gap-5 w-full">

      {/* ── Header sécurité ── */}
      <motion.div variants={item} className="flex items-center justify-center gap-1.5">
        <Shield size={13} className="text-emerald-400" />
        <span className="text-emerald-400 text-[11px] font-semibold">Paiement 100% sécurisé · SSL</span>
      </motion.div>

      {/* ── Headline ── */}
      <motion.div variants={item} className="text-center space-y-1">
        <h2 className="text-2xl font-black text-white"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
          Débloquer mon résultat
        </h2>
        {score && (
          <p className="text-[#808080] text-sm">
            Ta ressemblance de{' '}
            <span className="text-[#D4AF37] font-bold">{score}%</span>
            {' '}t&apos;attend
          </p>
        )}
      </motion.div>

      {/* ── Sélecteur de plan ── */}
      <motion.div variants={item} className="space-y-2.5">
        <p className="text-[#606060] text-xs uppercase tracking-widest font-semibold">Choisis ton offre</p>

        {PLANS.map((p) => {
          const Icon = p.icon
          const isSelected = plan === p.id
          return (
            <motion.button
              key={p.id}
              onClick={() => setPlan(p.id)}
              className="w-full text-left rounded-2xl transition-all relative overflow-hidden"
              style={{
                background: isSelected
                  ? `linear-gradient(135deg, ${p.color}14, ${p.color}08)`
                  : 'rgba(255,255,255,0.02)',
                border: isSelected
                  ? `2px solid ${p.color}80`
                  : '1.5px solid rgba(255,255,255,0.06)',
                padding: '14px 16px',
              }}
              whileTap={{ scale: 0.99 }}
            >
              {/* Badge top-right */}
              {p.badge && (
                <div className="absolute top-0 right-0">
                  <div
                    className="px-2.5 py-1 text-[9px] font-black rounded-bl-xl rounded-tr-2xl"
                    style={{
                      background: p.recommended
                        ? 'linear-gradient(135deg,#D4AF37,#F0D060)'
                        : `${p.color}30`,
                      color: p.recommended ? '#000' : p.color,
                      border: p.recommended ? 'none' : `1px solid ${p.color}50`,
                    }}
                  >
                    {p.badge}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                {/* Radio */}
                <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                  style={{
                    border: isSelected ? `2px solid ${p.color}` : '2px solid rgba(255,255,255,0.15)',
                    background: isSelected ? `${p.color}20` : 'transparent',
                  }}>
                  {isSelected && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: p.color }} />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Name + credit count */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-[#808080]'}`}>
                        {p.label}
                      </span>
                      {p.savings && isSelected && (
                        <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                          style={{ background: `${p.color}18`, color: p.color }}>
                          {p.savings}
                        </span>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      {p.oldPrice && (
                        <p className="text-[#444] text-[10px] line-through">{p.oldPrice}</p>
                      )}
                      <p className={`text-base font-black ${isSelected ? '' : 'text-[#606060]'}`}
                        style={isSelected ? { color: p.color } : {}}>
                        {p.price}
                      </p>
                      <p className="text-[#444] text-[9px]">{p.perUnit}</p>
                    </div>
                  </div>

                  {/* Credits bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-[#606060]'}`}>
                        {p.credits} crédit{p.credits > 1 ? 's' : ''}
                      </span>
                      <span className="text-[10px]"
                        style={{ color: isSelected ? p.color : '#505050' }}>
                        {p.pricePerCredit} / crédit
                      </span>
                    </div>
                    {/* Visual credit bar */}
                    <div className="h-1.5 w-full rounded-full bg-[#1A1A1A] overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: isSelected ? `${Math.min((p.credits / 40) * 100, 100)}%` : '0%' }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        style={{
                          background: `linear-gradient(90deg, ${p.color}80, ${p.color})`,
                          boxShadow: isSelected ? `0 0 8px ${p.color}60` : 'none',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.button>
          )
        })}
      </motion.div>

      {/* ── Comparatif économie ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={plan}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="rounded-2xl overflow-hidden"
          style={{
            border: `1px solid ${selectedPlan.color}30`,
            background: `linear-gradient(135deg,${selectedPlan.color}06,transparent)`,
          }}>
          <div className="h-px w-full"
            style={{ background: `linear-gradient(90deg,transparent,${selectedPlan.color}50,transparent)` }} />
          <div className="p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <Flame size={13} style={{ color: selectedPlan.color }} />
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: selectedPlan.color }}>
                Inclus avec {selectedPlan.label}
              </p>
            </div>
            {selectedPlan.includes.map((inc) => (
              <div key={inc} className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `${selectedPlan.color}15`,
                    border: `1px solid ${selectedPlan.color}30`,
                  }}>
                  <Check size={8} style={{ color: selectedPlan.color }} />
                </div>
                <span className="text-[#A0A0A0] text-xs">{inc}</span>
              </div>
            ))}

            {/* Savings callout */}
            {selectedPlan.savingsPercent && (
              <div className="mt-1 pt-2.5 border-t flex items-center justify-between"
                style={{ borderColor: `${selectedPlan.color}15` }}>
                <span className="text-[#606060] text-xs">vs One Shot (2,99€/crédit)</span>
                <span className="text-sm font-black" style={{ color: selectedPlan.color }}>
                  -{selectedPlan.savingsPercent}%
                </span>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ── Méthode de paiement ── */}
      <motion.div variants={item} className="space-y-3">
        <p className="text-[#606060] text-xs uppercase tracking-widest font-semibold">Méthode de paiement</p>
        <div className="grid grid-cols-3 gap-2">
          {(['card', 'apple', 'paypal'] as PayMethod[]).map((m) => {
            const labels: Record<PayMethod, string> = { card: 'Carte', apple: 'Apple Pay', paypal: 'PayPal' }
            const isActive = method === m
            return (
              <button key={m} onClick={() => setMethod(m)}
                className="py-3 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: isActive ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.03)',
                  border: isActive ? '1.5px solid rgba(212,175,55,0.45)' : '1.5px solid rgba(255,255,255,0.06)',
                  color: isActive ? '#D4AF37' : '#606060',
                }}>
                {labels[m]}
              </button>
            )
          })}
        </div>
      </motion.div>

      {/* ── Formulaire carte ── */}
      <AnimatePresence mode="wait">
        {method === 'card' && (
          <motion.div key="card-form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }} className="space-y-3">
            <input type="email" placeholder="Email (reçois ton accès ici)"
              value={payEmail} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            <input type="text" placeholder="1234 5678 9012 3456" inputMode="numeric"
              value={cardNumber} onChange={(e) => setCardNumber(formatCardNumber(e.target.value))} className={inputClass} />
            <div className="grid grid-cols-2 gap-3">
              <input type="text" placeholder="MM/AA" inputMode="numeric"
                value={expiry} onChange={(e) => setExpiry(formatExpiry(e.target.value))} className={inputClass} />
              <input type="text" placeholder="CVC" inputMode="numeric" maxLength={4}
                value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))} className={inputClass} />
            </div>
          </motion.div>
        )}
        {method === 'apple' && (
          <motion.div key="apple-msg" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}
            className="rounded-xl p-4 text-center"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[#A0A0A0] text-sm">Confirme via Face ID ou Touch ID</p>
          </motion.div>
        )}
        {method === 'paypal' && (
          <motion.div key="paypal-msg" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}
            className="rounded-xl p-4 text-center"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[#A0A0A0] text-sm">Tu seras redirigé vers PayPal pour finaliser</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Erreur ── */}
      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="text-red-400 text-xs text-center -mt-2">
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* ── CTA ── */}
      <motion.button
        onClick={handlePay}
        disabled={loading}
        className="btn-gold w-full py-5 rounded-2xl text-xl font-black tracking-wide flex items-center justify-center gap-3 disabled:opacity-70"
        whileHover={loading ? {} : { scale: 1.02 }}
        whileTap={loading ? {} : { scale: 0.97 }}
        style={{ boxShadow: '0 8px 40px rgba(212,175,55,0.4)' }}
      >
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-3">
              <motion.div className="w-5 h-5 rounded-full border-2 border-black/40 border-t-black"
                animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
              Traitement…
            </motion.div>
          ) : (
            <motion.div key="pay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2">
              <Lock size={18} className="flex-shrink-0" />
              Débloquer · {selectedPlan.price}
              <ChevronRight size={18} className="flex-shrink-0" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* ── Garanties ── */}
      <motion.div variants={item} className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {[
          'Satisfait ou remboursé',
          'Accès immédiat',
          plan === 'once' ? 'Sans abonnement' : 'Résiliation en 1 clic',
        ].map((g) => (
          <span key={g} className="flex items-center gap-1.5 text-[11px] text-[#505050]">
            <Check size={10} className="text-[#D4AF37]" />
            {g}
          </span>
        ))}
      </motion.div>

    </motion.div>
  )
}
