'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, LogIn, Zap } from 'lucide-react'
import StarField from '@/components/StarField'
import { signInWithEmail, formatAuthError } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Entre ton email et ton mot de passe.')
      return
    }

    setError('')
    setLoading(true)

    try {
      await signInWithEmail(email, password)
      router.push('/dashboard')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de connexion'
      setError(formatAuthError(message))
      setLoading(false)
    }
  }

  const inputClass =
    'w-full bg-[#0E0E0E] border border-[#222] rounded-xl px-4 py-3.5 text-white text-sm placeholder-[#505050] focus:outline-none focus:border-[#D4AF37]/60 transition-colors'

  return (
    <div className="relative min-h-screen bg-[#0A0A0A] flex flex-col">
      <StarField />

      <header className="relative z-20 flex items-center justify-between px-5 pt-5 pb-3 max-w-[390px] mx-auto w-full">
        <Link
          href="/"
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <ArrowLeft size={15} className="text-[#A0A0A0]" />
        </Link>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#D4AF37,#F0D060)' }}>
            <Zap size={12} className="text-black" fill="black" />
          </div>
          <span className="text-[13px] font-black tracking-tight"
            style={{
              background: 'linear-gradient(135deg,#D4AF37,#F0D060)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
            Connexion
          </span>
        </div>

        <div className="w-9 h-9" />
      </header>

      <main className="relative z-10 flex-1 px-5 pb-10 max-w-[390px] mx-auto w-full flex flex-col justify-center gap-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center mb-2"
            style={{ background: 'linear-gradient(135deg,#D4AF37,#F0D060)' }}>
            <LogIn size={22} className="text-black" />
          </div>
          <h1 className="text-2xl font-black text-white"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Bon retour
          </h1>
          <p className="text-[#808080] text-sm">
            Connecte-toi pour accéder à ton espace
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Ton email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError('') }}
            className={inputClass}
            autoComplete="email"
            required
          />
          <input
            type="password"
            placeholder="Ton mot de passe"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            className={inputClass}
            autoComplete="current-password"
            required
          />

          {error && <p className="text-red-400 text-xs text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl font-bold text-sm text-black disabled:opacity-70"
            style={{ background: 'linear-gradient(135deg,#D4AF37,#F0D060)' }}
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p className="text-center text-[#555] text-xs">
          Pas encore de compte ?{' '}
          <Link href="/" className="text-[#D4AF37] hover:underline">
            Lance ta première analyse
          </Link>
        </p>
      </main>
    </div>
  )
}
