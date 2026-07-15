'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { MapPin, Shirt, Users, ChevronRight, Sparkles, Wand2, LayoutGrid } from 'lucide-react'
import type { CelebrityResult, GenerationRequest, PhotoGenerationMode, PhotoScene } from '@/lib/types'
import { CUSTOM_PROMPT_EXAMPLES, getDefaultScene, getSceneSuggestions } from '@/lib/scene-suggestions'

interface PhotoSceneCustomizerProps {
  celebrity: CelebrityResult
  creditsBalance?: number
  onSubmit: (request: GenerationRequest) => void
  onNeedCredits?: () => void
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

export default function PhotoSceneCustomizer({ celebrity, creditsBalance, onSubmit, onNeedCredits }: PhotoSceneCustomizerProps) {
  const { name, celebrity_domain } = celebrity
  const suggestions = getSceneSuggestions(celebrity_domain)
  const [mode, setMode] = useState<PhotoGenerationMode>('presets')
  const [scene, setScene] = useState<PhotoScene>(() => getDefaultScene(celebrity_domain))
  const [customPrompt, setCustomPrompt] = useState('')

  const hasCredits = creditsBalance === undefined || creditsBalance > 0
  const canSubmitPresets = scene.location.trim() && scene.outfits.trim() && scene.position.trim()
  const canSubmitCustom = customPrompt.trim().length >= 20
  const canSubmit = hasCredits && (mode === 'presets' ? canSubmitPresets : canSubmitCustom)

  const handleSubmit = () => {
    if (!hasCredits) {
      onNeedCredits?.()
      return
    }
    if (mode === 'presets') {
      onSubmit({ mode: 'presets', photoScene: scene })
    } else {
      onSubmit({ mode: 'custom', customPrompt: customPrompt.trim() })
    }
  }

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
          Choisis des scènes guidées ou écris ton propre prompt
        </p>
      </motion.div>

      <motion.div variants={up} className="grid grid-cols-2 gap-2">
        {([
          { id: 'presets' as const, label: 'Scènes guidées', icon: LayoutGrid },
          { id: 'custom' as const, label: 'Prompt libre', icon: Wand2 },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors"
            style={{
              background: mode === id ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${mode === id ? 'rgba(212,175,55,0.45)' : 'rgba(255,255,255,0.08)'}`,
              color: mode === id ? '#D4AF37' : '#888',
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </motion.div>

      <motion.div
        variants={up}
        className="w-full rounded-2xl p-5 space-y-6"
        style={{
          background: 'linear-gradient(160deg,#141414,#0E0E0E)',
          border: '1px solid rgba(212,175,55,0.2)',
        }}
      >
        {mode === 'presets' ? (
          <>
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
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Wand2 size={14} className="text-[#D4AF37]" />
              <label className="text-sm font-semibold text-white">Ton prompt</label>
            </div>
            <p className="text-[#666] text-xs leading-relaxed">
              Décris librement la photo que tu veux : lieu, ambiance, tenues, pose, éclairage…
              Sois précis pour de meilleurs résultats.
            </p>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={5}
              placeholder={`Ex : Photo avec ${name} sur un tapis rouge à Cannes, tenues de gala, souriant aux photographes...`}
              className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#555] resize-none outline-none transition-colors"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'rgba(212,175,55,0.4)' }}
              onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
            />
            <p className="text-[#555] text-[10px]">
              Minimum 20 caractères · {customPrompt.trim().length} / 20
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CUSTOM_PROMPT_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setCustomPrompt(example)}
                  className="text-[10px] px-2.5 py-1 rounded-full transition-colors text-left"
                  style={{
                    background: customPrompt === example ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${customPrompt === example ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    color: customPrompt === example ? '#D4AF37' : '#888',
                  }}
                >
                  {example.length > 48 ? example.slice(0, 46) + '…' : example}
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      <motion.div variants={up} className="w-full space-y-3">
        {typeof creditsBalance === 'number' && (
          <p className="text-center text-xs text-[#606060]">
            {creditsBalance > 0 ? (
              <>
                <span className="text-[#D4AF37] font-bold">{creditsBalance} crédit{creditsBalance !== 1 ? 's' : ''}</span>
                {' '}disponible{creditsBalance !== 1 ? 's' : ''} · 1 génération = 1 crédit
              </>
            ) : (
              <>Aucun crédit disponible · achète un pack pour générer</>
            )}
          </p>
        )}

        {!hasCredits ? (
          <button
            type="button"
            onClick={() => onNeedCredits?.()}
            className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(135deg,#D4AF37,#F0D060)',
              color: '#0A0A0A',
              boxShadow: '0 8px 32px rgba(212,175,55,0.25)',
            }}
          >
            Acheter des crédits
            <ChevronRight size={16} />
          </button>
        ) : (
          <motion.button
            disabled={!canSubmit}
            onClick={handleSubmit}
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
        )}
      </motion.div>
    </motion.div>
  )
}
