'use client'

import { motion } from 'framer-motion'
import { Lock, Sparkles, ChevronRight, Eye } from 'lucide-react'
import type { CelebrityResult } from '@/lib/types'

interface TeaserResultProps {
  celebrity: CelebrityResult
  preview: string
  onReveal: () => void
}

const wrap = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}
const up = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const } },
}

export default function TeaserResult({ celebrity, preview, onReveal }: TeaserResultProps) {
  const { score, traits, celebrity_domain } = celebrity

  return (
    <motion.div variants={wrap} initial="hidden" animate="show" className="flex flex-col items-center gap-6 w-full">

      {/* ── Title ── */}
      <motion.div variants={up} className="text-center space-y-1.5">
        <p className="text-[#D4AF37] text-[11px] font-bold uppercase tracking-[0.15em]">
          Analyse terminée
        </p>
        <h2 className="text-3xl font-black text-white leading-tight"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
          Ton jumeau a été
          <br />
          <span style={{
            background: 'linear-gradient(135deg,#D4AF37,#F0D060)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>identifié !</span>
        </h2>
        <p className="text-[#808080] text-sm">
          Inscris-toi pour découvrir qui te ressemble
        </p>
      </motion.div>

      {/* ── Score + photo ── */}
      <motion.div variants={up} className="w-full">
        <div className="relative w-full rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(160deg,#141414,#0E0E0E)',
            border: '1px solid rgba(212,175,55,0.25)',
            boxShadow: '0 0 60px rgba(212,175,55,0.08)',
          }}>
          {/* Gold top bar */}
          <div className="h-1 w-full"
            style={{ background: 'linear-gradient(90deg,#A88B20,#D4AF37,#F0D060,#D4AF37,#A88B20)' }} />

          <div className="p-6 space-y-5">
            {/* User photo + score */}
            <div className="flex items-center gap-4">
              {/* User photo */}
              <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0"
                style={{ border: '2px solid rgba(212,175,55,0.3)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Toi" className="w-full h-full object-cover" />
              </div>

              {/* Arrow + score */}
              <div className="flex-1 flex flex-col items-center gap-2">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                >
                  <Sparkles size={20} className="text-[#D4AF37]" />
                </motion.div>

                <motion.div
                  className="flex flex-col items-center"
                  animate={{ boxShadow: ['0 0 0 0 rgba(212,175,55,0.4)', '0 0 0 12px rgba(212,175,55,0)', '0 0 0 0 rgba(212,175,55,0.4)'] }}
                  transition={{ duration: 2.2, repeat: Infinity }}
                >
                  <span className="text-5xl font-black leading-none"
                    style={{
                      background: 'linear-gradient(135deg,#D4AF37,#F0D060)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}>
                    {score}%
                  </span>
                  <span className="text-[#D4AF37]/60 text-[10px] font-bold mt-0.5 uppercase tracking-wider">
                    ressemblance
                  </span>
                </motion.div>
              </div>

              {/* Celebrity — LOCKED */}
              <div className="w-20 h-20 rounded-2xl flex-shrink-0 relative overflow-hidden"
                style={{ border: '2px solid rgba(212,175,55,0.25)', background: 'linear-gradient(135deg,#1a1a2e,#2d1b69)' }}>
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                  <Lock size={22} className="text-[#D4AF37]/60" />
                  <span className="text-[#D4AF37]/40 text-[9px] font-bold">CACHÉ</span>
                </div>
              </div>
            </div>

            {/* Celebrity domain hint */}
            {celebrity_domain && (
              <div className="flex items-center justify-center gap-2">
                <div className="px-3 py-1 rounded-full text-xs font-semibold"
                  style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)', color: '#D4AF37' }}>
                  {celebrity_domain}
                </div>
                <span className="text-[#505050] text-xs">mondialement connu·e</span>
              </div>
            )}

            <div className="h-px bg-gradient-to-r from-transparent via-[#D4AF37]/20 to-transparent" />

            {/* Traits — blurred */}
            <div className="space-y-2">
              <p className="text-[#606060] text-[11px] uppercase tracking-widest font-semibold">
                Traits communs détectés
              </p>
              {(traits.length > 0 ? traits : ['Trait 1', 'Trait 2', 'Trait 3']).map((trait, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30
                    flex items-center justify-center flex-shrink-0">
                    <Sparkles size={9} className="text-[#D4AF37]" />
                  </div>
                  <div className="flex-1 relative">
                    <span className="text-sm font-medium text-white"
                      style={{ filter: 'blur(5px)', userSelect: 'none' }}>
                      {trait}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Celebrity name — heavily masked */}
            <div className="rounded-2xl p-4 text-center space-y-2"
              style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.12)' }}>
              <p className="text-[#606060] text-xs">Ta célébrité jumelle</p>
              <div className="flex items-center justify-center gap-2">
                <Lock size={14} className="text-[#D4AF37]/50" />
                <span className="text-2xl font-black tracking-[0.3em] text-white/20 select-none">
                  ● ● ● ● ● ●
                </span>
                <Lock size={14} className="text-[#D4AF37]/50" />
              </div>
              <p className="text-[#D4AF37]/50 text-[10px] font-semibold uppercase tracking-wider">
                Inscris-toi pour révéler
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Urgency note ── */}
      <motion.div variants={up}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl"
        style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.1)' }}>
        <motion.div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0"
          animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
        <p className="text-[#808080] text-xs">
          {score >= 85 ? 'Ressemblance rarissime — top 3% des visages analysés' : 'Résultat prêt · Valable 24h seulement'}
        </p>
      </motion.div>

      {/* ── CTA ── */}
      <motion.div variants={up} className="w-full space-y-3">
        <motion.button
          onClick={onReveal}
          className="btn-gold btn-pulse w-full py-5 rounded-2xl text-lg font-black tracking-wide flex items-center justify-center gap-3"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          style={{ boxShadow: '0 8px 48px rgba(212,175,55,0.4)' }}
        >
          <Eye size={20} className="flex-shrink-0" />
          Révéler mon jumeau célèbre
          <ChevronRight size={20} className="flex-shrink-0" />
        </motion.button>

        <p className="text-center text-[#505050] text-xs flex items-center justify-center gap-1.5">
          <Lock size={10} />
          Gratuit · Données protégées · Sans spam
        </p>
      </motion.div>

    </motion.div>
  )
}
