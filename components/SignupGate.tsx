'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Lock, ChevronRight, Star } from 'lucide-react'
import { callFunction } from '@/lib/functions'
import { signUpWithEmail, signInWithEmail, formatAuthError } from '@/lib/auth'
import { setStoredEmail } from '@/lib/session-storage'

interface SignupGateProps {
  score: number
  sessionId?: string
  onSuccess: (firstName: string, email: string) => void
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
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setError('Entre ton email pour continuer'); return }
    if (password.length < 6) { setError('Le mot de passe doit contenir au moins 6 caractères'); return }
    if (password !== confirmPassword) { setError('Les mots de passe ne correspondent pas'); return }

    setError('')
    setLoading(true)

    try {
      const authData = await signUpWithEmail(email, password)
      const user = authData.user
      if (!user) throw new Error('Impossible de créer le compte')

      // Si confirmation email désactivée, la session est créée directement
      if (!authData.session) {
        await signInWithEmail(email, password)
      }

      if (sessionId) {
        await callFunction('register', {
          sessionId,
          email: email.trim(),
          firstName: firstName.trim() || undefined,
          userId: user.id,
        }).catch(() => null)
      }

      setStoredEmail(email.trim())
      onSuccess(firstName.trim() || 'toi', email.trim())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur, réessaie'
      setError(formatAuthError(message))
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
      <motion.div variants={up} className="w-full text-center space-y-4">
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
            Crée ton compte
          </h2>
          <p className="text-[#808080] text-sm leading-relaxed">
            Inscris-toi pour débloquer ton jumeau et générer ta photo.
          </p>
        </div>

        <div className="flex items-center justify-center gap-1">
          {[...Array(5)].map((_, i) => (
            <Star key={i} size={13} className="text-[#D4AF37] fill-[#D4AF37]" />
          ))}
          <span className="text-[#606060] text-xs ml-2">4,9/5 · +12 000 avis</span>
        </div>
      </motion.div>

      <motion.form variants={up} onSubmit={handleSubmit} className="w-full space-y-3">
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

        <input
          type="password"
          placeholder="Mot de passe (6 caractères min.) *"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError('') }}
          className={inputClass}
          required
          autoComplete="new-password"
        />

        <input
          type="password"
          placeholder="Confirmer le mot de passe *"
          value={confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
          className={inputClass}
          required
          autoComplete="new-password"
        />

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

        <motion.button
          type="submit"
          disabled={loading}
          className="btn-gold w-full py-5 rounded-2xl text-xl font-black tracking-wide flex items-center justify-center gap-3 disabled:opacity-70"
          whileHover={loading ? {} : { scale: 1.02 }}
          whileTap={loading ? {} : { scale: 0.97 }}
          style={{ boxShadow: '0 8px 40px rgba(212,175,55,0.4)' }}
        >
          {loading ? (
            <span className="flex items-center gap-3">
              <motion.div
                className="w-5 h-5 rounded-full border-2 border-black/40 border-t-black"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              />
              Création du compte…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              Créer mon compte
              <ChevronRight size={20} className="flex-shrink-0" />
            </span>
          )}
        </motion.button>

        <div className="flex items-center justify-center gap-1.5 text-[#505050] text-xs">
          <Lock size={11} className="flex-shrink-0" />
          <span>Tes données sont protégées · Aucun spam</span>
        </div>
      </motion.form>
    </motion.div>
  )
}
