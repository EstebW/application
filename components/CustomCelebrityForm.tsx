'use client'

import { useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Sparkles, ImagePlus, X } from 'lucide-react'
import UserHeightField from './UserHeightField'
import { parseUserHeightCm } from '@/lib/height'

interface CustomCelebrityFormProps {
  preview?: string
  /** Valeurs déjà saisies — restaurées lors d'un retour en arrière */
  initialName?: string
  initialDomain?: string
  initialPhoto?: string
  /** Taille déjà connue (saisie précédente ou profil) */
  initialHeightCm?: number
  onSubmit: (data: {
    name: string
    domain: string
    celebrityImageBase64: string
    userHeightCm: number
  }) => void
}

const DOMAINS = ['Acteur·rice', 'Chanteur·se', 'Sportif·ve', 'Mannequin', 'Autre']

const wrap = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}
const up = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
}

export default function CustomCelebrityForm({
  preview,
  initialName,
  initialDomain,
  initialPhoto,
  initialHeightCm,
  onSubmit,
}: CustomCelebrityFormProps) {
  const [name, setName] = useState(initialName ?? '')
  const [domain, setDomain] = useState<string>(initialDomain ?? '')
  const [celebrityPhoto, setCelebrityPhoto] = useState(initialPhoto ?? '')
  const [heightInput, setHeightInput] = useState(initialHeightCm ? String(initialHeightCm) : '')
  const celebrityPhotoRef = useRef<HTMLInputElement>(null)

  const userHeightCm = parseUserHeightCm(heightInput)
  const canContinue = name.trim().length >= 2 && !!celebrityPhoto && userHeightCm !== null

  const handleCelebrityFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      if (e.target?.result) setCelebrityPhoto(e.target.result as string)
    }
    reader.readAsDataURL(file)
  }, [])

  function handleSubmit() {
    if (!canContinue || userHeightCm === null) return
    onSubmit({ name: name.trim(), domain, celebrityImageBase64: celebrityPhoto, userHeightCm })
  }

  return (
    <motion.div variants={wrap} initial="hidden" animate="show" className="flex flex-col items-center w-full gap-6 pt-4">

      {preview && (
        <motion.div variants={up} className="flex justify-center">
          <div className="w-20 h-20 rounded-2xl overflow-hidden" style={{ border: '2px solid rgba(168,85,247,0.4)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Ta photo" className="w-full h-full object-cover" />
          </div>
        </motion.div>
      )}

      <motion.div variants={up} className="text-center space-y-2">
        <p className="text-[#A855F7] text-[11px] font-bold uppercase tracking-[0.15em]">Étape 2</p>
        <h2
          className="text-3xl font-black text-white leading-tight"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Quelle star veux-tu
          <br />
          rencontrer ?
        </h2>
        <p className="text-[#808080] text-sm">Tape n&apos;importe quel nom de célébrité</p>
      </motion.div>

      <motion.div variants={up} className="w-full">
        <UserHeightField value={heightInput} onChange={setHeightInput} />
      </motion.div>

      <motion.div variants={up} className="w-full space-y-2">
        <label className="text-[#909090] text-xs font-semibold uppercase tracking-wider">Nom de la célébrité</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Beyoncé, Cristiano Ronaldo, Zendaya..."
          className="w-full px-4 py-4 rounded-2xl text-white text-base outline-none placeholder:text-[#505050]"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.1)' }}
          autoFocus
        />
      </motion.div>

      <motion.div variants={up} className="w-full space-y-2">
        <input
          ref={celebrityPhotoRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCelebrityFile(f) }}
        />
        <label className="text-[#909090] text-xs font-semibold uppercase tracking-wider">
          Photo de la célébrité <span className="text-[#A855F7]">*</span>
        </label>
        <p className="text-[#666] text-xs leading-relaxed">
          Importe une photo pour que l&apos;IA reproduise fidèlement son visage.
        </p>

        {celebrityPhoto ? (
          <div className="relative w-full flex items-center gap-3 p-3 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(168,85,247,0.35)' }}>
            <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0" style={{ border: '1.5px solid rgba(168,85,247,0.4)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={celebrityPhoto} alt="Célébrité choisie" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold">Photo ajoutée</p>
              <button
                type="button"
                onClick={() => celebrityPhotoRef.current?.click()}
                className="text-[#A855F7] text-xs font-semibold"
              >
                Changer la photo
              </button>
            </div>
            <button
              type="button"
              onClick={() => setCelebrityPhoto('')}
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              <X size={14} className="text-[#A0A0A0]" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => celebrityPhotoRef.current?.click()}
            className="w-full py-6 rounded-2xl flex flex-col items-center justify-center gap-2 transition-colors"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1.5px dashed rgba(168,85,247,0.35)' }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(168,85,247,0.12)' }}>
              <ImagePlus size={18} className="text-[#A855F7]" />
            </div>
            <span className="text-[#A0A0A0] text-sm font-semibold">Importer une photo de la star</span>
          </button>
        )}
      </motion.div>

      <motion.div variants={up} className="w-full space-y-2">
        <label className="text-[#909090] text-xs font-semibold uppercase tracking-wider">Domaine (optionnel)</label>
        <div className="flex flex-wrap gap-2">
          {DOMAINS.map((d) => {
            const active = domain === d
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDomain(active ? '' : d)}
                className="px-3.5 py-2 rounded-full text-sm font-semibold transition-all"
                style={{
                  background: active ? 'linear-gradient(135deg,#A855F7,#D4AF37)' : 'rgba(255,255,255,0.04)',
                  border: active ? '1.5px solid transparent' : '1.5px solid rgba(255,255,255,0.1)',
                  color: active ? '#000' : '#A0A0A0',
                }}
              >
                {d}
              </button>
            )
          })}
        </div>
      </motion.div>

      <motion.div variants={up} className="w-full pt-2">
        <motion.button
          onClick={handleSubmit}
          disabled={!canContinue}
          whileHover={canContinue ? { scale: 1.02 } : {}}
          whileTap={canContinue ? { scale: 0.97 } : {}}
          className="w-full py-5 rounded-2xl text-lg font-black tracking-wide flex items-center justify-center gap-3 transition-opacity"
          style={{
            background: 'linear-gradient(135deg,#A855F7,#D4AF37)',
            color: '#000',
            boxShadow: canContinue ? '0 8px 48px rgba(168,85,247,0.35)' : 'none',
            opacity: canContinue ? 1 : 0.4,
          }}
        >
          <Sparkles size={20} className="flex-shrink-0" />
          Continuer
          <ArrowRight size={18} className="flex-shrink-0 ml-1" />
        </motion.button>
      </motion.div>
    </motion.div>
  )
}
