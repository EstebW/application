'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { MapPin, Shirt, Users, ChevronRight, Sparkles } from 'lucide-react'
import type { CelebrityResult, PhotoScene } from '@/lib/types'
import { getDefaultScene, getSceneSuggestions } from '@/lib/scene-suggestions'

interface PhotoSceneCustomizerProps {
  celebrity: CelebrityResult
  onSubmit: (scene: PhotoScene) => void
}

const wrap = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
}
const up = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } },
}

function SceneField({
  icon: Icon,
  label,
  hint,
  value,
  suggestions,
  onChange,
}: {
  icon: React.ElementType
  label: string
  hint: string
  value: string
  suggestions: string[]
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-[#D4AF37]" />
        <label className="text-sm font-semibold text-white">{label}</label>
      </div>
      <p className="text-[#666] text-xs leading-relaxed">{hint}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#555] resize-none outline-none transition-colors"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
        onFocus={(e) => { e.target.style.borderColor = 'rgba(212,175,55,0.4)' }}
        onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
      />
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className="text-[10px] px-2.5 py-1 rounded-full transition-colors"
            style={{
              background: value === s ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${value === s ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: value === s ? '#D4AF37' : '#888',
            }}
          >
            {s.length > 42 ? s.slice(0, 40) + '…' : s}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function PhotoSceneCustomizer({ celebrity, onSubmit }: PhotoSceneCustomizerProps) {
  const { name, celebrity_domain } = celebrity
  const suggestions = getSceneSuggestions(celebrity_domain)
  const [scene, setScene] = useState<PhotoScene>(() => getDefaultScene(celebrity_domain))

  const canSubmit = scene.location.trim() && scene.outfits.trim() && scene.position.trim()

  return (
    <motion.div variants={wrap} initial="hidden" animate="show" className="flex flex-col gap-6 w-full">

      <motion.div variants={up} className="text-center space-y-1.5">
        <p className="text-[#D4AF37] text-[11px] font-bold uppercase tracking-[0.15em]">
          Mise en scène
        </p>
        <h2
          className="text-2xl font-black text-white leading-tight"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Imagine ta photo avec{' '}
          <span style={{
            background: 'linear-gradient(135deg,#D4AF37,#F0D060)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            {name}
          </span>
        </h2>
        <p className="text-[#808080] text-sm">
          Décris la scène — on t&apos;aide avec des idées liées à l&apos;univers{' '}
          <span className="text-[#D4AF37]">{celebrity_domain || 'de ta star'}</span>
        </p>
      </motion.div>

      <motion.div
        variants={up}
        className="w-full rounded-2xl p-5 space-y-6"
        style={{
          background: 'linear-gradient(160deg,#141414,#0E0E0E)',
          border: '1px solid rgba(212,175,55,0.2)',
        }}
      >
        <SceneField
          icon={MapPin}
          label="Le lieu"
          hint="Où se passe la photo ? Pense à un endroit cohérent avec le monde de ta star."
          value={scene.location}
          suggestions={suggestions.locations}
          onChange={(v) => setScene((s) => ({ ...s, location: v }))}
        />

        <SceneField
          icon={Shirt}
          label="Les tenues"
          hint="Comment êtes-vous habillés tous les deux ?"
          value={scene.outfits}
          suggestions={suggestions.outfits}
          onChange={(v) => setScene((s) => ({ ...s, outfits: v }))}
        />

        <SceneField
          icon={Users}
          label="La position"
          hint="Comment êtes-vous placés dans la photo ?"
          value={scene.position}
          suggestions={suggestions.positions}
          onChange={(v) => setScene((s) => ({ ...s, position: v }))}
        />
      </motion.div>

      <motion.div variants={up}>
        <motion.button
          disabled={!canSubmit}
          onClick={() => onSubmit(scene)}
          className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-opacity"
          style={{
            background: canSubmit
              ? 'linear-gradient(135deg,#D4AF37,#F0D060)'
              : 'rgba(255,255,255,0.08)',
            color: canSubmit ? '#0A0A0A' : '#555',
            boxShadow: canSubmit ? '0 8px 32px rgba(212,175,55,0.25)' : 'none',
          }}
          whileHover={canSubmit ? { scale: 1.02 } : {}}
          whileTap={canSubmit ? { scale: 0.98 } : {}}
        >
          <Sparkles size={16} />
          Générer ma photo
          <ChevronRight size={16} />
        </motion.button>
      </motion.div>
    </motion.div>
  )
}
