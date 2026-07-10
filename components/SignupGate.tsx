'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Lock, ChevronRight, Star } from 'lucide-react'
import { callFunction } from '@/lib/functions'
import type { CelebrityResult } from '@/lib/types'

interface SignupGateProps {
  score: number
  sessionId?: string
  onSuccess: (firstName: string) => void
}

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}
const up = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const } },
}

export default function SignupGate({ score, sessionId, onSuccess }: SignupGateProps) {
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setError('Entre ton email pour continuer'); return }
    setError('')
    setLoading(true)

    try {
      if (sessionId) {
        await callFunction('register', {
          sessionId,
          email: email.trim(),
          firstName: firstName.trim() || undefined,
        })
      }
      onSuccess(firstName.trim() || 'toi')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur, réessaie')
      setLoading(false)
    }
  }

  const inputClass =
    'w-full bg-[#0E0E0E] border border-[#2A2A2A] rounded-2xl px-4 py-4 text-white text-base placeholder-[#505050] focus:outline-none focus:border-[#D4AF37]/60 transition-colors'

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="flex flex-col items-center gap-7 w-full"
    >
      {/* ── Score reveal teaser ── */}
      <motion.div variants={up} className="w-full text-center space-y-4">

        {/* Pulsing score badge */}
        <div className="flex justify-center">
          <motion.div
            animate={{
              boxShadow: [
                '0 0 0 0 rgba(212,175,55,0.5)',
                '0 0 0 20px rgba(212,175,55,0)',
                '0 0 0 0 rgba(212,175,55,0.5)',
              ],
            }}
            transition={{ duration: 2, repeat: Infinity }}
            className="relative w-28 h-28 rounded-full flex flex-col items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))',
              border: '2px solid rgba(212,175,55,0.5)',
            }}
          >
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            >
              <Sparkles size={22} className="text-[#D4AF37] mb-1" />
            </motion.div>
            <span
              className="text-4xl font-black leading-none"
              style={{
                background: 'linear-gradient(135deg, #D4AF37, #F0D060)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {score}%
            </span>
            <span className="text-[#D4AF37]/60 text-[10px] font-bold mt-0.5">match</span>
          </motion.div>
        </div>

        <div className="space-y-2">
          <h2
            className="text-3xl font-black text-white leading-tight"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Ton jumeau a été
            <br />
            <span
              style={{
                background: 'linear-gradient(135deg, #D4AF37, #F0D060)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              trouvé !
            </span>
          </h2>
          <p className="text-[#808080] text-sm leading-relaxed">
            {score >= 85
              ? 'Ressemblance rarissime — tu fais partie du top 3%'
              : 'Résultat analysé — révèle ta célébrité jumelle'}
            <br />
            Entre ton email pour découvrir qui c&apos;est.
          </p>
        </div>

        {/* Stars rating mock */}
        <div className="flex items-center justify-center gap-1">
          {[...Array(5)].map((_, i) => (
            <Star key={i} size={13} className="text-[#D4AF37] fill-[#D4AF37]" />
          ))}
          <span className="text-[#606060] text-xs ml-2">4,9/5 · +12 000 avis</span>
        </div>
      </motion.div>

      {/* ── Form ── */}
      <motion.form
        variants={up}
        onSubmit={handleSubmit}
        className="w-full space-y-3"
      >
        <input
          type="text"
          placeholder="Ton prénom (optionnel)"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className={inputClass}
          autoComplete="given-name"
        />

        <input
          type="email"
          placeholder="Ton email *"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError('') }}
          className={inputClass}
          required
          autoComplete="email"
        />

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-red-400 text-xs px-1"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {/* CTA */}
        <motion.button
          type="submit"
          disabled={loading}
          className="btn-gold w-full py-5 rounded-2xl text-xl font-black tracking-wide flex items-center justify-center gap-3 disabled:opacity-70"
          whileHover={loading ? {} : { scale: 1.02 }}
          whileTap={loading ? {} : { scale: 0.97 }}
          style={{ boxShadow: '0 8px 40px rgba(212,175,55,0.4)' }}
        >
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.span
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
                Vérification…
              </motion.span>
            ) : (
              <motion.span
                key="submit"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                Révéler mon jumeau
                <ChevronRight size={20} className="flex-shrink-0" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        {/* Privacy */}
        <div className="flex items-center justify-center gap-1.5 text-[#505050] text-xs">
          <Lock size={11} className="flex-shrink-0" />
          <span>Gratuit · Aucun spam · Données protégées</span>
        </div>
      </motion.form>

      {/* ── Social proof ── */}
      <motion.div
        variants={up}
        className="w-full rounded-2xl p-4 text-center"
        style={{
          background: 'rgba(212,175,55,0.04)',
          border: '1px solid rgba(212,175,55,0.12)',
        }}
      >
        <p className="text-[#606060] text-xs leading-relaxed">
          🔒 Ton email sert uniquement à accéder à ton résultat.
          <br />
          Tes photos ne sont jamais stockées.
        </p>
      </motion.div>
    </motion.div>
  )
}
