'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Lock, RefreshCw, Crown } from 'lucide-react'
import GoldParticles from './GoldParticles'
import type { CelebrityResult } from '@/lib/types'

interface FinalResultProps {
  celebrity: CelebrityResult
  generatedImage: string
  onReset: () => void
  onPay: () => void
}

export default function FinalResult({ celebrity, generatedImage, onReset, onPay }: FinalResultProps) {
  const [showParticles, setShowParticles] = useState(true)
  const [timeLeft, setTimeLeft] = useState(600)
  const { name } = celebrity

  useEffect(() => {
    const timer = setTimeout(() => setShowParticles(false), 4000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((t) => (t > 0 ? t - 1 : 0))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60

  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12 } },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 28 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center gap-6 w-full"
    >
      <motion.div variants={itemVariants} className="text-center space-y-2 relative">
        <GoldParticles active={showParticles} />
        <p className="text-[#D4AF37] text-xs uppercase tracking-widest font-bold">✨ Ta photo est prête</p>
        <h2
          className="text-4xl font-black text-white leading-tight"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Toi avec{' '}
          <span
            style={{
              background: 'linear-gradient(135deg, #D4AF37, #F0D060)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {name}
          </span>
        </h2>
        <p className="text-[#808080] text-sm">
          L&apos;IA t&apos;a mis en scène aux côtés de {name} — débloque la version HD
        </p>
      </motion.div>

      <motion.div variants={itemVariants} className="w-full relative">
        {/* Ambient glow behind the card */}
        <div
          className="absolute inset-x-8 inset-y-4 rounded-3xl blur-3xl"
          style={{ background: 'radial-gradient(ellipse at center, rgba(212,175,55,0.2) 0%, rgba(107,33,168,0.15) 60%, transparent 100%)' }}
        />

        <div
          className="relative w-full rounded-3xl overflow-hidden"
          style={{
            aspectRatio: '4/3',
            border: '2px solid rgba(212,175,55,0.35)',
            boxShadow: '0 0 50px rgba(212,175,55,0.15), 0 16px 48px rgba(0,0,0,0.7)',
          }}
        >
          {/* Background: real generated image blurred, or gradient fallback */}
          {generatedImage ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={generatedImage}
                alt="Aperçu flouté"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: 'blur(18px)', transform: 'scale(1.08)' }}
              />
              <div className="absolute inset-0 bg-black/40" />
            </>
          ) : (
            <>
              <div
                className="absolute inset-0"
                style={{
                  background: `
                    radial-gradient(ellipse at 35% 40%, rgba(107,33,168,0.9) 0%, transparent 55%),
                    radial-gradient(ellipse at 72% 60%, rgba(212,175,55,0.35) 0%, transparent 50%),
                    linear-gradient(160deg, #1a0533 0%, #2d1b69 35%, #0f0f1a 65%, #1a1007 100%)
                  `,
                  filter: 'blur(22px)',
                  transform: 'scale(1.1)',
                }}
              />
              {/* Two silhouettes side by side */}
              <div className="absolute inset-0 flex items-end justify-center gap-6 pb-4 opacity-20">
                <div className="flex flex-col items-center gap-0">
                  <div className="w-16 h-16 rounded-full bg-white/50" />
                  <div className="w-24 h-20 rounded-t-3xl bg-white/30 mt-0.5" />
                </div>
                <div className="flex flex-col items-center gap-0">
                  <div className="w-20 h-20 rounded-full bg-[#D4AF37]/60" />
                  <div className="w-28 h-24 rounded-t-3xl bg-[#D4AF37]/30 mt-0.5" />
                </div>
              </div>
            </>
          )}

          {/* Blur overlay */}
          <div className="absolute inset-0 backdrop-blur-lg" />

          {/* Vignette — darken edges for depth */}
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at 50% 45%, transparent 30%, rgba(0,0,0,0.55) 100%)',
            }}
          />

          {/* Top-left badge */}
          <div className="absolute top-3 left-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 border border-white/10 backdrop-blur-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-pulse" />
              <span className="text-white/70 text-[10px] font-semibold">Toi + {name}</span>
            </div>
          </div>

          {/* Top-right HD badge */}
          <div className="absolute top-3 right-3">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2.5, repeat: Infinity }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full backdrop-blur-sm"
              style={{
                background: 'linear-gradient(135deg, rgba(212,175,55,0.9), rgba(240,208,96,0.9))',
              }}
            >
              <Crown size={9} className="text-black" />
              <span className="text-black text-[10px] font-black">HD</span>
            </motion.div>
          </div>

          {/* Center lock CTA */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <motion.div
              animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }}
              transition={{ duration: 2.2, repeat: Infinity }}
              className="w-16 h-16 rounded-2xl flex items-center justify-center backdrop-blur-sm"
              style={{
                background: 'rgba(0,0,0,0.6)',
                border: '1.5px solid rgba(212,175,55,0.5)',
                boxShadow: '0 0 24px rgba(212,175,55,0.2)',
              }}
            >
              <Lock size={24} className="text-[#D4AF37]" />
            </motion.div>
            <div
              className="px-4 py-1.5 rounded-full text-xs font-bold text-black"
              style={{ background: 'linear-gradient(135deg, #D4AF37, #F0D060)' }}
            >
              Voir la photo en HD
            </div>
          </div>

          {/* Watermark bottom */}
          <div className="absolute bottom-4 left-0 right-0 flex justify-center">
            <p className="text-white/20 text-[10px] font-bold tracking-[0.2em] uppercase select-none">
              monjumeaucelèbre.com
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="w-full">
        <div
          className="w-full rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, #1A1A1A, #111)',
            border: '1px solid rgba(212,175,55,0.25)',
          }}
        >
          <div
            className="h-1"
            style={{ background: 'linear-gradient(90deg, #6B21A8, #D4AF37, #F0D060, #D4AF37, #6B21A8)' }}
          />

          <div className="p-6 space-y-5">
            {/* 1. Titre + sous-titre */}
            <div className="text-center space-y-2">
              <h3 className="text-white text-xl font-black">
                Débloque ta photo avec {name}
              </h3>
              <p className="text-[#A0A0A0] text-sm">
                Sans watermark · télécharge-la et partage-la en un clic
              </p>
            </div>

            {/* 2. Prix + urgence intégrée */}
            <div className="text-center space-y-1">
              <div className="flex items-baseline justify-center gap-3">
                <span className="text-[#555] text-base line-through">4,99€</span>
                <span
                  className="text-4xl font-black"
                  style={{
                    background: 'linear-gradient(135deg, #D4AF37, #F0D060)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  1,99€
                </span>
              </div>
              <p className="text-xs text-[#A0A0A0]">
                Offre limitée · expire dans{' '}
                <span className="text-[#D4AF37] font-semibold tabular-nums">
                  {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </span>
              </p>
            </div>

            {/* 3. CTA */}
            <motion.button
              onClick={onPay}
              className="btn-gold btn-pulse w-full py-5 rounded-2xl text-xl font-black tracking-wide"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              style={{ boxShadow: '0 8px 40px rgba(212, 175, 55, 0.45)' }}
            >
              Débloquer ma version HD →
            </motion.button>

            {/* 4. Réassurance courte */}
            <div className="flex items-center justify-center gap-1.5 text-[#A0A0A0] text-xs">
              <Lock size={11} className="flex-shrink-0" />
              <span>Paiement sécurisé · Accès immédiat</span>
            </div>

            {/* 5. Logos de paiement discrets */}
            <div className="flex items-center justify-center gap-3 opacity-40">
              {['Visa', 'Mastercard', 'Apple Pay', 'PayPal'].map((brand) => (
                <div
                  key={brand}
                  className="px-2 py-0.5 rounded bg-[#2A2A2A] text-[#888] text-[8px] font-bold tracking-wide"
                >
                  {brand}
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      <motion.button
        variants={itemVariants}
        onClick={onReset}
        className="flex items-center gap-2 text-[#A0A0A0] hover:text-[#D4AF37] transition-colors py-2 text-sm"
      >
        <RefreshCw size={14} />
        Recommencer avec une autre photo
      </motion.button>
    </motion.div>
  )
}
