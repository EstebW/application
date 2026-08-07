'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, RefreshCw, Sparkles } from 'lucide-react'
import GoldParticles from './GoldParticles'
import CelebrityPortrait from './CelebrityPortrait'
import type { CelebrityResult } from '@/lib/types'
import { topFeatureHighlights } from '@/lib/twin-score'

interface AnalysisResultProps {
  preview: string
  celebrity: CelebrityResult
  /** Photo de la star (mode "Choisis ta star") */
  celebrityImageSrc?: string
  onGenerate: () => void
  onReset: () => void
}

export default function AnalysisResult({ preview, celebrity, celebrityImageSrc, onGenerate, onReset }: AnalysisResultProps) {
  const [showParticles, setShowParticles] = useState(true)
  const { name, celebrity_domain, score, traits, fun_fact, featureScores, runnersUp } = celebrity

  const highlights = featureScores ? topFeatureHighlights(featureScores, 4) : []

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
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center gap-6 w-full"
    >
      <motion.div variants={itemVariants} className="text-center space-y-1">
        <p className="text-[#A0A0A0] text-xs uppercase tracking-widest font-semibold">
          Résultat de ton analyse
        </p>
        <h2
          className="text-4xl font-black text-white"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Ton jumeau célèbre
        </h2>
      </motion.div>

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

              <CelebrityPortrait
                name={name}
                imageSrc={celebrityImageSrc}
                size="sm"
                shape="circle"
                showFirstName
                borderColor="rgba(212,175,55,0.5)"
                boxShadow="none"
              />
            </div>

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
                className="inline-flex flex-col items-center gap-0.5 px-6 py-2.5 rounded-2xl"
                style={{ background: 'linear-gradient(135deg, #D4AF37, #F0D060)' }}
                animate={{ boxShadow: ['0 0 0 0 rgba(212,175,55,0.5)', '0 0 0 8px rgba(212,175,55,0)', '0 0 0 0 rgba(212,175,55,0.5)'] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <span className="text-black/60 text-[10px] font-bold uppercase tracking-wider">
                  Score de ressemblance StarFusion
                </span>
                <span className="text-black font-black text-2xl leading-none">{score} / 100</span>
              </motion.div>
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-[#D4AF37]/30 to-transparent" />

            {(fun_fact || traits.length > 0) && (
              <div className="space-y-2">
                <p className="text-[#A0A0A0] text-xs uppercase tracking-widest">Pourquoi vous vous ressemblez</p>
                <p className="text-white/90 text-sm leading-relaxed">
                  {fun_fact || traits.join('. ')}
                </p>
              </div>
            )}

            {highlights.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-[#A0A0A0] text-xs uppercase tracking-widest">Vos points communs les plus forts</p>
                {highlights.map((h, i) => (
                  <motion.div
                    key={h.key}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 + i * 0.08 }}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-5 h-5 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center flex-shrink-0">
                        <Check size={10} className="text-[#D4AF37]" />
                      </div>
                      <span className="text-white text-sm font-medium truncate">{h.label}</span>
                    </div>
                    <span className="text-[#D4AF37] text-sm font-black tabular-nums flex-shrink-0">{h.score}</span>
                  </motion.div>
                ))}
              </div>
            )}

            {!highlights.length && traits.length > 0 && (
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
            )}
          </div>
        </div>
      </motion.div>

      {runnersUp && runnersUp.length > 0 && (
        <motion.div variants={itemVariants} className="w-full space-y-3">
          <p className="text-[#A0A0A0] text-xs uppercase tracking-widest text-center">
            Tes autres ressemblances
          </p>
          <div className="space-y-2">
            {runnersUp.map((runner, i) => (
              <div
                key={`${runner.name}-${i}`}
                className="flex items-center gap-3 rounded-2xl px-4 py-3"
                style={{
                  background: 'linear-gradient(160deg,#141414,#0E0E0E)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span className="text-[#D4AF37]/50 text-xs font-black w-6">#{i + 2}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-bold truncate">{runner.name}</p>
                  {runner.celebrity_domain && (
                    <p className="text-[#606060] text-[10px] uppercase tracking-wider">{runner.celebrity_domain}</p>
                  )}
                </div>
                <span className="text-[#D4AF37] text-sm font-black tabular-nums flex-shrink-0">
                  {runner.score} / 100
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div variants={itemVariants} className="w-full space-y-3">
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
