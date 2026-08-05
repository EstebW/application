'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ImageIcon,
  ImagePlus,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import {
  ACCEPTED_BASE_PHOTO_TYPES,
  MAX_BASE_PHOTO_BYTES,
  formatBytes,
  readFileAsDataUrl,
  validateBasePhotoFile,
  validateBasePhotoSource,
  type BasePhotoValidation,
} from '@/lib/base-photo'

interface BasePhotoUploadProps {
  celebrityName: string
  /** Photo déjà retenue (retour en arrière) ou photo importée plus tôt dans le funnel */
  initialPhoto?: string
  onSubmit: (photo: string) => void
}

const wrap = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}
const up = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
}

const TIPS = [
  'photo nette',
  'une seule personne principale',
  'visage visible',
  'espace libre à côté de la personne',
  'éviter les gros plans trop serrés',
  'éviter les photos très sombres',
]

export default function BasePhotoUpload({ celebrityName, initialPhoto, onSubmit }: BasePhotoUploadProps) {
  const [photo, setPhoto] = useState(initialPhoto ?? '')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [validation, setValidation] = useState<BasePhotoValidation | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const analyse = useCallback(async (src: string) => {
    setChecking(true)
    setError('')
    setValidation(null)
    try {
      const result = await validateBasePhotoSource(src)
      setValidation(result)
      if (!result.ok && result.error) setError(result.error)
    } catch {
      setError('Impossible d\'analyser cette photo. Essaie un autre fichier.')
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    if (photo) void analyse(photo)
    // Analyse uniquement au changement de photo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo])

  const handleFile = useCallback(async (file: File) => {
    const fileCheck = validateBasePhotoFile(file)
    if (!fileCheck.ok) {
      setError(fileCheck.error ?? 'Fichier invalide.')
      setValidation(null)
      return
    }
    setChecking(true)
    setError('')
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setPhoto(dataUrl)
    } catch {
      setError('Lecture du fichier impossible. Essaie un autre fichier.')
      setChecking(false)
    }
  }, [])

  const canContinue = Boolean(photo) && !checking && validation?.ok === true

  return (
    <motion.div variants={wrap} initial="hidden" animate="show" className="flex flex-col items-center w-full gap-6 pt-4">

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_BASE_PHOTO_TYPES.join(',')}
        className="sr-only"
        aria-label="Choisir la photo de départ"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
          e.target.value = ''
        }}
      />

      <motion.div variants={up} className="text-center space-y-2">
        <p className="text-[#D4AF37] text-[11px] font-bold uppercase tracking-[0.15em]">Étape 4</p>
        <h2
          className="text-3xl font-black text-white leading-tight"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Choisis ta photo
          <br />
          de départ
        </h2>
        <p className="text-[#808080] text-sm leading-relaxed">
          Utilise une photo avec suffisamment d&apos;espace autour de toi pour que la star puisse être
          ajoutée naturellement.
        </p>
      </motion.div>

      <motion.div
        variants={up}
        className="w-full rounded-2xl p-4"
        style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.15)' }}
      >
        <ul className="space-y-1.5">
          {TIPS.map((tip) => (
            <li key={tip} className="flex items-start gap-2 text-[#909090] text-xs leading-relaxed">
              <Check size={12} className="text-[#D4AF37] flex-shrink-0 mt-0.5" />
              {tip}
            </li>
          ))}
        </ul>
      </motion.div>

      <motion.div variants={up} className="w-full space-y-3">
        {photo ? (
          <>
            <div
              className="relative w-full rounded-2xl overflow-hidden"
              style={{ border: '1.5px solid rgba(212,175,55,0.35)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="Ta photo de départ" className="w-full max-h-[320px] object-contain bg-black" />
              {checking && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60">
                  <Loader2 size={16} className="text-[#D4AF37] animate-spin" />
                  <span className="text-white text-xs font-semibold">Analyse de la photo…</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#A0A0A0',
                }}
              >
                <RefreshCw size={14} />
                Remplacer
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhoto('')
                  setValidation(null)
                  setError('')
                }}
                aria-label="Supprimer la photo"
                className="w-12 flex items-center justify-center rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <Trash2 size={14} className="text-[#A0A0A0]" />
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full py-10 rounded-2xl flex flex-col items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1.5px dashed rgba(212,175,55,0.35)' }}
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(212,175,55,0.12)' }}
            >
              <ImagePlus size={20} className="text-[#D4AF37]" />
            </div>
            <span className="text-[#A0A0A0] text-sm font-semibold">Choisir une photo</span>
            <span className="text-[#555] text-[11px]">
              JPEG, PNG ou WebP · {formatBytes(MAX_BASE_PHOTO_BYTES)} max
            </span>
          </button>
        )}

        {error && (
          <div
            className="flex items-start gap-2 rounded-xl p-3"
            style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)' }}
            role="alert"
          >
            <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-300 text-xs leading-relaxed">{error}</p>
          </div>
        )}

        {!error && validation?.ok && validation.warnings.length > 0 && (
          <div className="space-y-2">
            {validation.warnings.map((warning) => (
              <div
                key={warning}
                className="flex items-start gap-2 rounded-xl p-3"
                style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.3)' }}
              >
                <AlertTriangle size={14} className="text-[#D4AF37] flex-shrink-0 mt-0.5" />
                <p className="text-[#C9A227] text-xs leading-relaxed">{warning}</p>
              </div>
            ))}
            <p className="text-[#555] text-[11px] text-center">
              Tu peux continuer quand même ou choisir une autre photo.
            </p>
          </div>
        )}

        {!error && validation?.ok && validation.warnings.length === 0 && (
          <div
            className="flex items-start gap-2 rounded-xl p-3"
            style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.25)' }}
          >
            <Check size={14} className="text-[#D4AF37] flex-shrink-0 mt-0.5" />
            <p className="text-[#C9A227] text-xs leading-relaxed">
              Ta photo semble adaptée pour un résultat réaliste.
            </p>
          </div>
        )}
      </motion.div>

      <motion.div variants={up} className="w-full">
        <motion.button
          type="button"
          onClick={() => canContinue && onSubmit(photo)}
          disabled={!canContinue}
          whileHover={canContinue ? { scale: 1.02 } : {}}
          whileTap={canContinue ? { scale: 0.97 } : {}}
          className="w-full py-5 rounded-2xl text-lg font-black tracking-wide flex items-center justify-center gap-3 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0A]"
          style={{
            background: canContinue ? 'linear-gradient(135deg,#D4AF37,#F0D060)' : 'rgba(255,255,255,0.08)',
            color: canContinue ? '#0A0A0A' : '#555',
            boxShadow: canContinue ? '0 8px 32px rgba(212,175,55,0.25)' : 'none',
          }}
        >
          <ImageIcon size={18} className="flex-shrink-0" />
          Ajouter {celebrityName} à cette photo
          <ArrowRight size={18} className="flex-shrink-0" />
        </motion.button>
        <p className="text-center text-[#555] text-xs mt-2">
          Tu pourras changer de photo avant de lancer la génération.
        </p>
      </motion.div>
    </motion.div>
  )
}
