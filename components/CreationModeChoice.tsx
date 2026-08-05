'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, ChevronRight, ImagePlus, Sparkles, Wand2 } from 'lucide-react'
import CelebrityPortrait from './CelebrityPortrait'
import type { CelebrityCreationMode } from '@/lib/types'

interface CreationModeChoiceProps {
  celebrityName: string
  celebrityImageSrc?: string
  /** Mode déjà choisi — conservé lors d'un retour en arrière */
  value?: CelebrityCreationMode
  onSubmit: (mode: CelebrityCreationMode) => void
}

const wrap = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}
const up = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
}

const OPTIONS: {
  id: CelebrityCreationMode
  title: string
  description: string
  badge: string
  icon: React.ElementType
  accent: string
  accentSoft: string
  accentBorder: string
  recommended: boolean
}[] = [
  {
    id: 'full_generation',
    title: 'Créer une nouvelle photo',
    description: 'Nous imaginons une nouvelle scène avec toi et la star dans le décor de ton choix.',
    badge: 'Plus créatif',
    icon: Wand2,
    accent: '#A855F7',
    accentSoft: 'rgba(168,85,247,0.14)',
    accentBorder: 'rgba(168,85,247,0.35)',
    recommended: false,
  },
  {
    id: 'photo_edit',
    title: 'Ajouter la star à ma photo',
    description: 'Utilise une vraie photo et ajoute naturellement la star sans changer ton visage ni le décor.',
    badge: 'Plus réaliste · Recommandé',
    icon: ImagePlus,
    accent: '#D4AF37',
    accentSoft: 'rgba(212,175,55,0.12)',
    accentBorder: 'rgba(212,175,55,0.3)',
    recommended: true,
  },
]

export default function CreationModeChoice({
  celebrityName,
  celebrityImageSrc,
  value,
  onSubmit,
}: CreationModeChoiceProps) {
  const [selected, setSelected] = useState<CelebrityCreationMode | undefined>(value)

  useEffect(() => {
    if (value) setSelected(value)
  }, [value])

  return (
    <motion.div variants={wrap} initial="hidden" animate="show" className="flex flex-col items-center w-full gap-6 pt-4">

      <motion.div variants={up} className="flex justify-center">
        <CelebrityPortrait
          name={celebrityName}
          imageSrc={celebrityImageSrc}
          size="md"
          shape="rounded"
          badgeLabel="first"
        />
      </motion.div>

      <motion.div variants={up} className="text-center space-y-2">
        <p className="text-[#D4AF37] text-[11px] font-bold uppercase tracking-[0.15em]">Étape 3</p>
        <h2
          className="text-3xl font-black text-white leading-tight"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Comment veux-tu
          <br />
          créer ta photo ?
        </h2>
        <p className="text-[#808080] text-sm">
          Deux approches pour ta photo avec {celebrityName}
        </p>
      </motion.div>

      <motion.div
        variants={up}
        className="w-full space-y-4"
        role="radiogroup"
        aria-label="Comment veux-tu créer ta photo ?"
      >
        {OPTIONS.map(({ id, title, description, badge, icon: Icon, accent, accentSoft, accentBorder, recommended }) => {
          const active = selected === id
          return (
            <motion.button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(id)}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.98 }}
              className="w-full text-left rounded-3xl p-5 space-y-4 relative overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0A]"
              style={{
                background: 'linear-gradient(160deg,#141414,#0E0E0E)',
                border: `1.5px solid ${active ? accent : accentBorder}`,
                boxShadow: active
                  ? `0 8px 32px ${recommended ? 'rgba(212,175,55,0.22)' : 'rgba(168,85,247,0.22)'}`
                  : `0 8px 32px ${recommended ? 'rgba(212,175,55,0.08)' : 'rgba(168,85,247,0.08)'}`,
              }}
            >
              {recommended && (
                <div
                  className="absolute top-0 right-0 px-3 py-1 rounded-bl-2xl text-[9px] font-black"
                  style={{ background: 'linear-gradient(135deg,#D4AF37,#F0D060)', color: '#000' }}
                >
                  RECOMMANDÉ
                </div>
              )}

              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: accentSoft, border: `1px solid ${accentBorder}` }}
                >
                  <Icon size={22} style={{ color: accent }} />
                </div>
                <div className="min-w-0 pr-16">
                  <h3 className="text-white font-black text-lg leading-tight">{title}</h3>
                  <p className="text-[11px] font-bold uppercase tracking-widest mt-1" style={{ color: accent }}>
                    {badge}
                  </p>
                </div>
              </div>

              <p className="text-[#909090] text-sm leading-relaxed">{description}</p>

              <div className="flex items-center justify-end pt-1">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: accentSoft }}
                >
                  {active ? (
                    <Check size={18} style={{ color: accent }} />
                  ) : (
                    <ChevronRight size={18} style={{ color: accent }} />
                  )}
                </div>
              </div>
            </motion.button>
          )
        })}
      </motion.div>

      <motion.div variants={up} className="w-full pt-1">
        <motion.button
          type="button"
          onClick={() => selected && onSubmit(selected)}
          disabled={!selected}
          whileHover={selected ? { scale: 1.02 } : {}}
          whileTap={selected ? { scale: 0.97 } : {}}
          className="w-full py-5 rounded-2xl text-lg font-black tracking-wide flex items-center justify-center gap-3 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0A]"
          style={{
            background: selected ? 'linear-gradient(135deg,#D4AF37,#F0D060)' : 'rgba(255,255,255,0.08)',
            color: selected ? '#0A0A0A' : '#555',
            boxShadow: selected ? '0 8px 32px rgba(212,175,55,0.25)' : 'none',
          }}
        >
          <Sparkles size={20} className="flex-shrink-0" />
          Continuer
          <ChevronRight size={18} className="flex-shrink-0" />
        </motion.button>
        {!selected && (
          <p className="text-center text-[#555] text-xs mt-2">Choisis une option pour continuer</p>
        )}
      </motion.div>
    </motion.div>
  )
}
