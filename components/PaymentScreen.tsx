'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, ChevronRight, Check, Shield, X } from 'lucide-react'
import { MOCK_CELEBRITY } from '@/lib/constants'
import { callFunction } from '@/lib/functions'

interface PaymentScreenProps {
  sessionId?: string
  generationId?: string
  onSuccess: () => void
  onBack: () => void
}

type PayMethod = 'card' | 'apple' | 'paypal'

function formatCardNumber(v: string) {
  return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
}
function formatExpiry(v: string) {
  const digits = v.replace(/\D/g, '').slice(0, 4)
  if (digits.length >= 3) return digits.slice(0, 2) + '/' + digits.slice(2)
  return digits
}

export default function PaymentScreen({ sessionId, generationId, onSuccess, onBack }: PaymentScreenProps) {
  const { name } = MOCK_CELEBRITY

  const [method, setMethod] = useState<PayMethod>('card')
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isCardValid =
    cardNumber.replace(/\s/g, '').length === 16 &&
    expiry.length === 5 &&
    cvc.length >= 3 &&
    email.includes('@')

  const canPay = method !== 'card' || isCardValid

  function handlePay() {
    if (!canPay) {
      setError('Vérifie les informations de paiement')
      return
    }
    setError('')
    setLoading(true)

    // Log payment via Edge Function, then simulate processing delay
    const logPayment = sessionId
      ? callFunction('payment', { sessionId, generationId, method }).catch(() => null)
      : Promise.resolve(null)

    // Minimum 2.2s UX delay for the "processing" feel
    const delay = new Promise((r) => setTimeout(r, 2200))

    Promise.all([logPayment, delay]).then(() => {
      setLoading(false)
      onSuccess()
    })
  }

  const inputClass =
    'w-full bg-[#111] border border-[#2A2A2A] rounded-xl px-4 py-3.5 text-white text-sm placeholder-[#505050] focus:outline-none focus:border-[#D4AF37]/60 transition-colors'

  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08 } },
  }
  const item = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-6 w-full"
    >
      {/* ── Header ── */}
      <motion.div variants={item} className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[#606060] hover:text-[#A0A0A0] transition-colors text-sm"
        >
          <X size={15} />
          Annuler
        </button>
        <div className="flex items-center gap-1.5">
          <Shield size={13} className="text-emerald-400" />
          <span className="text-emerald-400 text-[11px] font-semibold">Paiement sécurisé SSL</span>
        </div>
      </motion.div>

      {/* ── Récap commande ── */}
      <motion.div
        variants={item}
        className="rounded-2xl p-4 flex items-center gap-4"
        style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.2)' }}
      >
        {/* Thumbnail */}
        <div
          className="w-14 h-14 rounded-xl flex-shrink-0 overflow-hidden relative"
          style={{ background: 'linear-gradient(135deg,#2d1b69,#6B21A8)', border: '1px solid rgba(212,175,55,0.3)' }}
        >
          <div
            className="absolute inset-0"
            style={{ backdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.35)' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Lock size={16} className="text-[#D4AF37]" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-bold truncate">Photo avec {name}</p>
          <p className="text-[#A0A0A0] text-xs mt-0.5">Version HD · Sans watermark</p>
        </div>

        <div className="flex-shrink-0 text-right">
          <p className="text-[#555] text-xs line-through">4,99€</p>
          <p
            className="text-xl font-black"
            style={{
              background: 'linear-gradient(135deg,#D4AF37,#F0D060)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            1,99€
          </p>
        </div>
      </motion.div>

      {/* ── Sélecteur de méthode ── */}
      <motion.div variants={item} className="space-y-3">
        <p className="text-[#606060] text-xs uppercase tracking-widest font-semibold">Méthode de paiement</p>
        <div className="grid grid-cols-3 gap-2">
          {(['card', 'apple', 'paypal'] as PayMethod[]).map((m) => {
            const labels: Record<PayMethod, string> = { card: 'Carte', apple: 'Apple Pay', paypal: 'PayPal' }
            const isActive = method === m
            return (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className="py-3 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: isActive ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.03)',
                  border: isActive ? '1.5px solid rgba(212,175,55,0.5)' : '1.5px solid rgba(255,255,255,0.06)',
                  color: isActive ? '#D4AF37' : '#606060',
                }}
              >
                {labels[m]}
              </button>
            )
          })}
        </div>
      </motion.div>

      {/* ── Formulaire carte ── */}
      <AnimatePresence mode="wait">
        {method === 'card' && (
          <motion.div
            key="card-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-3"
          >
            <input
              type="email"
              placeholder="Email (reçois ton accès ici)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
            <input
              type="text"
              placeholder="1234 5678 9012 3456"
              inputMode="numeric"
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
              className={inputClass}
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="MM/AA"
                inputMode="numeric"
                value={expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="CVC"
                inputMode="numeric"
                maxLength={4}
                value={cvc}
                onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className={inputClass}
              />
            </div>
          </motion.div>
        )}

        {method === 'apple' && (
          <motion.div
            key="apple-msg"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="rounded-xl p-4 text-center"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-[#A0A0A0] text-sm">
              Appuie sur le bouton ci-dessous pour confirmer via Face ID ou Touch ID
            </p>
          </motion.div>
        )}

        {method === 'paypal' && (
          <motion.div
            key="paypal-msg"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="rounded-xl p-4 text-center"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-[#A0A0A0] text-sm">
              Tu seras redirigé vers PayPal pour finaliser le paiement en toute sécurité
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Erreur ── */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-red-400 text-xs text-center -mt-3"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* ── Bouton payer ── */}
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
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3"
            >
              <motion.div
                className="w-5 h-5 rounded-full border-2 border-black/40 border-t-black"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              />
              Traitement en cours…
            </motion.div>
          ) : (
            <motion.div
              key="pay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <Lock size={18} className="flex-shrink-0" />
              Payer 1,99€
              <ChevronRight size={18} className="flex-shrink-0" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* ── Garanties ── */}
      <motion.div variants={item} className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {['Remboursé si insatisfait', 'Accès immédiat', 'Sans abonnement'].map((g) => (
          <span key={g} className="flex items-center gap-1.5 text-[11px] text-[#505050]">
            <Check size={10} className="text-[#D4AF37]" />
            {g}
          </span>
        ))}
      </motion.div>
    </motion.div>
  )
}
