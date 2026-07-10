'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, RefreshCw, Sparkles } from 'lucide-react'
import GoldParticles from './GoldParticles'
import type { CelebrityResult } from '@/lib/types'

interface AnalysisResultProps {
  preview: string
  celebrity: CelebrityResult
  onGenerate: () => void
  onReset: () => void
}

export default function AnalysisResult({ preview, celebrity, onGenerate, onReset }: AnalysisResultProps) {
  const [showParticles, setShowParticles] = useState(true)
  const { name, celebrity_domain, score, traits, fun_fact } = celebrity

  useEffect(() => {
    const timer = setTimeout(() => setShowParticles(false), 3500)
    return () => clearTimeout(timer)
  }, [])

  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1 } },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 24 },
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
      <motion.div variants={itemVariants} className="text-center space-y-1">
        <p className="text-[#A0A0A0] text-xs uppercase tracking-widest font-semibold">
          Résultat de ton analyse
        </p>
        <h2
          className="text-4xl font-black text-white"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Ton jumeau révélé
        </h2>
      </motion.div>

      {/* Main result card */}
      <motion.div variants={itemVariants} className="w-full relative">
        <GoldParticles active={showParticles} />

        <div
          className="relative w-full rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, #1A1A1A 0%, #111111 100%)',
            border: '1px solid rgba(212,175,55,0.3)',
            boxShadow: '0 0 60px rgba(212,175,55,0.1), inset 0 1px 0 rgba(212,175,55,0.1)',
          }}
        >
          <div
            className="h-1 w-full"
            style={{ background: 'linear-gradient(90deg, #A88B20, #D4AF37, #F0D060, #D4AF37, #A88B20)' }}
          />

          <div className="p-6 space-y-6">
            {/* Photo + celeb comparison */}
            <div className="flex items-center justify-center gap-4">
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-20 h-20 rounded-full overflow-hidden"
                  style={{ border: '2px solid rgba(212,175,55,0.5)' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Toi" className="w-full h-full object-cover" />
                </div>
                <span className="text-[10px] text-[#A0A0A0]">Toi</span>
              </div>

              <motion.div
                animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <Sparkles size={20} className="text-[#D4AF37]" />
              </motion.div>

              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-20 h-20 rounded-full overflow-hidden relative"
                  style={{ border: '2px solid rgba(212,175,55,0.5)' }}
                >
                  <div
                    className="w-full h-full"
                    style={{ background: 'linear-gradient(135deg, #2d1b69, #6B21A8)' }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-black text-white/30">{name[0]}</span>
                  </div>
                </div>
                <span className="text-[10px] text-[#A0A0A0]">{name}</span>
              </div>
            </div>

            {/* Celebrity name + score */}
            <div className="text-center space-y-3">
              <p className="text-[#A0A0A0] text-sm">Tu ressembles à</p>
              <motion.h3
                className="text-5xl font-black gold-text-glow"
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  background: 'linear-gradient(135deg, #D4AF37 0%, #F0D060 40%, #D4AF37 100%)',
                  backgroundSize: '200% auto',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
                animate={{ backgroundPosition: ['0% center', '200% center'] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
              >
                {name}
              </motion.h3>

              {celebrity_domain && (
                <p className="text-[#808080] text-xs uppercase tracking-widest font-semibold">
                  {celebrity_domain}
                </p>
              )}

              <motion.div
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full"
                style={{ background: 'linear-gradient(135deg, #D4AF37, #F0D060)' }}
                animate={{ boxShadow: ['0 0 0 0 rgba(212,175,55,0.5)', '0 0 0 8px rgba(212,175,55,0)', '0 0 0 0 rgba(212,175,55,0.5)'] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <span className="text-black font-black text-xl">{score}%</span>
                <span className="text-black/70 font-semibold text-sm">de ressemblance</span>
              </motion.div>

              {score >= 85 && (
                <p className="text-[#D4AF37]/80 text-xs font-medium pt-1">
                  Ressemblance rarissime — moins de 3% des visages analysés dépassent 85%
                </p>
              )}
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-[#D4AF37]/30 to-transparent" />

            <div className="space-y-2.5">
              <p className="text-[#A0A0A0] text-xs uppercase tracking-widest">Traits communs détectés</p>
              {traits.map((trait, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-5 h-5 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center flex-shrink-0">
                    <Check size={10} className="text-[#D4AF37]" />
                  </div>
                  <span className="text-white text-sm font-medium">{trait}</span>
                </motion.div>
              ))}
            </div>

            {fun_fact && (
              <p className="text-[#A0A0A0] text-sm text-center leading-relaxed italic">
                &ldquo;{fun_fact}&rdquo;
              </p>
            )}
          </div>
        </div>
      </motion.div>

      {/* CTA block */}
      <motion.div variants={itemVariants} className="w-full space-y-3">
        {/* Teaser label */}
        <div className="text-center">
          <p className="text-[#A0A0A0] text-sm">
            Et si tu te retrouvais sur une photo
            <span className="text-[#D4AF37] font-semibold"> aux côtés de {name} ?</span>
          </p>
        </div>

        <motion.button
          onClick={onGenerate}
          className="btn-gold btn-pulse w-full py-5 rounded-2xl text-lg font-black tracking-wide"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{ boxShadow: '0 8px 40px rgba(212,175,55,0.35)' }}
        >
          Me voir avec {name} →
        </motion.button>

        <button
          onClick={onReset}
          className="w-full flex items-center justify-center gap-2 text-[#606060] hover:text-[#D4AF37] transition-colors py-2 text-sm"
        >
          <RefreshCw size={13} />
          Réessayer avec une autre photo
        </button>
      </motion.div>
    </motion.div>
  )
}
