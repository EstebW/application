'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Lock, Download, RefreshCw, Share2, Crown } from 'lucide-react'
import GoldParticles from './GoldParticles'

interface FinalResultProps {
  onReset: () => void
}

export default function FinalResult({ onReset }: FinalResultProps) {
  const [showParticles, setShowParticles] = useState(true)
  const [timeLeft, setTimeLeft] = useState(600) // 10 minutes countdown

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
      {/* Title */}
      <motion.div variants={itemVariants} className="text-center space-y-1 relative">
        <GoldParticles active={showParticles} />
        <p className="text-[#D4AF37] text-xs uppercase tracking-widest font-bold">✨ Génération terminée</p>
        <h2
          className="text-4xl font-black text-white leading-tight"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Ton jumeau
          <br />
          <span
            style={{
              background: 'linear-gradient(135deg, #D4AF37, #F0D060)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            célébrité est prêt !
          </span>
        </h2>
      </motion.div>

      {/* Generated image placeholder */}
      <motion.div variants={itemVariants} className="w-full relative">
        {/* Outer gold glow */}
        <div
          className="absolute inset-0 rounded-3xl blur-2xl"
          style={{ background: 'radial-gradient(ellipse at center, rgba(212,175,55,0.25) 0%, transparent 70%)' }}
        />

        <div
          className="relative w-full rounded-3xl overflow-hidden"
          style={{
            aspectRatio: '9/16',
            maxHeight: '480px',
            border: '2px solid rgba(212,175,55,0.4)',
            boxShadow: '0 0 60px rgba(212,175,55,0.2), 0 20px 60px rgba(0,0,0,0.6)',
          }}
        >
          {/* Blurred background image - mock gradient portrait */}
          <div
            className="absolute inset-0"
            style={{
              background: `
                radial-gradient(ellipse at 40% 30%, rgba(107,33,168,0.8) 0%, transparent 50%),
                radial-gradient(ellipse at 70% 70%, rgba(212,175,55,0.3) 0%, transparent 50%),
                linear-gradient(160deg, #1a0533 0%, #2d1b69 30%, #0f0f1a 60%, #1a1007 100%)
              `,
              filter: 'blur(18px)',
              transform: 'scale(1.08)',
            }}
          />

          {/* Fake portrait silhouette */}
          <div className="absolute inset-0 flex flex-col items-center justify-center opacity-20">
            <div className="w-36 h-36 rounded-full bg-white/30" />
            <div className="w-52 h-40 rounded-t-full bg-white/15 mt-2" />
          </div>

          {/* Heavy blur overlay */}
          <div className="absolute inset-0 backdrop-blur-md" />

          {/* Grain texture overlay */}
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
            }}
          />

          {/* HD Version badge */}
          <div className="absolute top-4 right-4">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{
                background: 'linear-gradient(135deg, #D4AF37, #F0D060)',
                boxShadow: '0 4px 15px rgba(212,175,55,0.4)',
              }}
            >
              <Crown size={11} className="text-black" />
              <span className="text-black text-xs font-black">Version HD</span>
            </motion.div>
          </div>

          {/* Lock icon center */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-20 h-20 rounded-full bg-black/50 border border-white/20 flex items-center justify-center backdrop-blur-sm"
            >
              <Lock size={28} className="text-[#D4AF37]" />
            </motion.div>
          </div>

          {/* Watermark */}
          <div className="absolute bottom-6 left-0 right-0 flex justify-center">
            <p
              className="text-white/25 text-xs font-bold tracking-widest uppercase select-none"
              style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
            >
              monjumeaucelèbre.com
            </p>
          </div>
        </div>
      </motion.div>

      {/* Conversion block */}
      <motion.div variants={itemVariants} className="w-full">
        <div
          className="w-full rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, #1A1A1A, #111)',
            border: '1px solid rgba(212,175,55,0.25)',
          }}
        >
          {/* Top gradient bar */}
          <div
            className="h-1"
            style={{ background: 'linear-gradient(90deg, #6B21A8, #D4AF37, #F0D060, #D4AF37, #6B21A8)' }}
          />

          <div className="p-6 space-y-5">
            {/* Countdown */}
            <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-2xl bg-[#D4AF37]/8 border border-[#D4AF37]/20">
              <div className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
              <span className="text-[#D4AF37] text-sm font-bold">
                Offre expirante dans {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </span>
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-white text-xl font-black">
                Débloque ta version HD sans watermark
              </h3>
              <p className="text-[#A0A0A0] text-sm">
                Télécharge ton jumeau en haute résolution, sans filigrane
              </p>
            </div>

            {/* Features */}
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { icon: Download, text: 'Téléchargement immédiat' },
                { icon: Crown, text: 'Résolution 4K' },
                { icon: Lock, text: 'Sans watermark' },
                { icon: Share2, text: 'Partage réseaux sociaux' },
              ].map(({ icon: Icon, text }, i) => (
                <div key={i} className="flex items-center gap-2 py-2 px-3 rounded-xl bg-[#2A2A2A]/60">
                  <Icon size={13} className="text-[#D4AF37] flex-shrink-0" />
                  <span className="text-white text-xs">{text}</span>
                </div>
              ))}
            </div>

            {/* Price */}
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <p className="text-[#555] text-sm line-through">4,99€</p>
                <p className="text-[#A0A0A0] text-xs">Prix normal</p>
              </div>
              <div className="text-center relative">
                <div
                  className="text-4xl font-black"
                  style={{
                    background: 'linear-gradient(135deg, #D4AF37, #F0D060)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  1,99€
                </div>
                <div className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 -mt-1">
                  <p className="text-red-400 text-[10px] font-bold">-60% AUJOURD&apos;HUI</p>
                </div>
              </div>
            </div>

            {/* CTA button with pulse */}
            <motion.button
              className="btn-gold btn-pulse w-full py-5 rounded-2xl text-xl font-black tracking-wide flex items-center justify-center gap-2"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              style={{ boxShadow: '0 8px 40px rgba(212, 175, 55, 0.45)' }}
            >
              <Crown size={20} />
              Débloquer en HD — 1,99€ →
            </motion.button>

            <div className="flex items-center justify-center gap-2 text-[#A0A0A0] text-xs">
              <Lock size={11} />
              <span>Paiement sécurisé • Téléchargement immédiat</span>
            </div>

            {/* Trust badges */}
            <div className="flex justify-center gap-4 pt-1">
              {['Visa', 'Mastercard', 'Apple Pay', 'PayPal'].map((brand) => (
                <div
                  key={brand}
                  className="px-2 py-1 rounded bg-[#2A2A2A] text-[#555] text-[9px] font-bold"
                >
                  {brand}
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Reset */}
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
