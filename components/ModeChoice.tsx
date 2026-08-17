'use client'

import { motion } from 'framer-motion'
import { Sparkles, Wand2, ChevronRight, Star, Camera } from 'lucide-react'

interface ModeChoiceProps {
  onSelectMatch: () => void
  onSelectCustom: () => void
}

const wrap = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}
const up = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
}

export default function ModeChoice({ onSelectMatch, onSelectCustom }: ModeChoiceProps) {
  return (
    <motion.div variants={wrap} initial="hidden" animate="show" className="flex flex-col items-center w-full gap-8 pt-4">

      {/* Headline */}
      <motion.div variants={up} className="text-center space-y-3">
        <h1
          style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(2.2rem, 10vw, 3rem)' }}
          className="text-white font-black leading-[1.05]"
        >
          Choisis ton
          <br />
          <span style={{
            background: 'linear-gradient(135deg, #D4AF37 0%, #F0D060 50%, #D4AF37 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            expérience
          </span>
        </h1>
        <p className="text-[#909090] text-[15px] leading-relaxed max-w-[280px] mx-auto">
          Deux façons de te retrouver en photo aux côtés d&apos;une célébrité.
        </p>
      </motion.div>

      {/* ── Cards ── */}
      <motion.div variants={up} className="w-full space-y-4">

        {/* Card A — Match */}
        <motion.button
          onClick={onSelectMatch}
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.98 }}
          className="w-full text-left rounded-3xl p-5 space-y-4 relative overflow-hidden"
          style={{
            background: 'linear-gradient(160deg,#141414,#0E0E0E)',
            border: '1.5px solid rgba(212,175,55,0.3)',
            boxShadow: '0 8px 32px rgba(212,175,55,0.08)',
          }}
        >
          <div className="absolute top-0 right-0 px-3 py-1 rounded-bl-2xl text-[9px] font-black"
            style={{ background: 'linear-gradient(135deg,#D4AF37,#F0D060)', color: '#000' }}>
            LE PLUS POPULAIRE
          </div>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)' }}>
              <Star size={22} className="text-[#D4AF37]" />
            </div>
            <div>
              <h3 className="text-white font-black text-lg">Trouve ton jumeau</h3>
              <p className="text-[#808080] text-xs">L&apos;IA choisit ta star pour toi</p>
            </div>
          </div>

          <p className="text-[#909090] text-sm leading-relaxed">
            Notre IA analyse ton visage et révèle la célébrité mondiale qui te ressemble le plus,
            avec un score de ressemblance précis.
          </p>

          <div className="flex items-center justify-end pt-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(212,175,55,0.15)' }}>
              <ChevronRight size={18} className="text-[#D4AF37]" />
            </div>
          </div>
        </motion.button>

        {/* Card B — Custom */}
        <motion.button
          onClick={onSelectCustom}
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.98 }}
          className="w-full text-left rounded-3xl p-5 space-y-4"
          style={{
            background: 'linear-gradient(160deg,#141414,#0E0E0E)',
            border: '1.5px solid rgba(107,33,168,0.35)',
            boxShadow: '0 8px 32px rgba(107,33,168,0.08)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(147,51,234,0.14)', border: '1px solid rgba(147,51,234,0.35)' }}>
              <Wand2 size={22} className="text-[#A855F7]" />
            </div>
            <div>
              <h3 className="text-white font-black text-lg">Choisis ta star</h3>
              <p className="text-[#808080] text-xs">Toi seul décides de tout</p>
            </div>
          </div>

          <p className="text-[#909090] text-sm leading-relaxed">
            Prends ou importe ta photo, choisis n&apos;importe quelle célébrité et imagine
            la scène de ton choix avec elle.
          </p>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[#A855F7] text-xs font-bold uppercase tracking-widest flex items-center gap-1.5">
              <Camera size={12} />
              100% personnalisé
            </span>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(147,51,234,0.16)' }}>
              <ChevronRight size={18} className="text-[#A855F7]" />
            </div>
          </div>
        </motion.button>
      </motion.div>

      <motion.div variants={up} className="flex items-center gap-1.5 text-[#505050] text-xs">
        <Sparkles size={11} className="text-[#D4AF37]" />
        Aucune photo stockée · Vie privée protégée
      </motion.div>
    </motion.div>
  )
}
