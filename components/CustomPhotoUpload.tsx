'use client'

import { useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Camera, ImageIcon, ArrowRight, Lock, Wand2, RefreshCw } from 'lucide-react'

interface CustomPhotoUploadProps {
  onPhotoSelected: (file: File, preview: string) => void
  celebrityName?: string
  initialPreview?: string
  onContinueExisting?: () => void
}

const wrap = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}
const up = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
}

export default function CustomPhotoUpload({
  onPhotoSelected,
  celebrityName,
  initialPreview,
  onContinueExisting,
}: CustomPhotoUploadProps) {
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = (e) => {
        if (e.target?.result) onPhotoSelected(file, e.target.result as string)
      }
      reader.readAsDataURL(file)
    },
    [onPhotoSelected]
  )

  return (
    <motion.div variants={wrap} initial="hidden" animate="show" className="flex flex-col items-center w-full gap-8 pt-4">

      <input ref={cameraRef} type="file" accept="image/*" capture="user" className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

      <motion.div variants={up} className="flex justify-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(147,51,234,0.14)', border: '1px solid rgba(147,51,234,0.35)' }}>
          <Wand2 size={26} className="text-[#A855F7]" />
        </div>
      </motion.div>

      <motion.div variants={up} className="text-center space-y-3">
        <p className="text-[#A855F7] text-[11px] font-bold uppercase tracking-[0.15em]">Étape 3</p>
        <h1
          style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(2.2rem, 10vw, 3rem)' }}
          className="text-white font-black leading-[1.05]"
        >
          Ta photo
        </h1>
        <p className="text-[#909090] text-[15px] leading-relaxed max-w-[280px] mx-auto">
          {celebrityName
            ? `Selfie ou galerie — on s'en sert pour ton visage, puis on crée une nouvelle photo avec ${celebrityName}.`
            : "Selfie ou galerie — on s'en sert pour reconnaître ton visage."}
        </p>
      </motion.div>

      {initialPreview && onContinueExisting && (
        <motion.div variants={up} className="w-full space-y-3">
          <div
            className="relative w-full rounded-2xl overflow-hidden"
            style={{ border: '1.5px solid rgba(168,85,247,0.35)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={initialPreview} alt="Ta photo" className="w-full max-h-[280px] object-contain bg-black" />
          </div>
          <motion.button
            type="button"
            onClick={onContinueExisting}
            className="w-full py-5 rounded-2xl text-lg font-black tracking-wide flex items-center justify-center gap-3"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            style={{
              background: 'linear-gradient(135deg,#A855F7,#D4AF37)',
              color: '#000',
              boxShadow: '0 8px 48px rgba(168,85,247,0.35)',
            }}
          >
            Continuer avec cette photo
            <ArrowRight size={18} className="flex-shrink-0" />
          </motion.button>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#A0A0A0' }}
          >
            <RefreshCw size={14} />
            Prendre un autre selfie
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#A0A0A0' }}
          >
            <ImageIcon size={14} />
            Choisir depuis ma galerie
          </button>
        </motion.div>
      )}

      {!(initialPreview && onContinueExisting) && (
        <motion.div variants={up} className="w-full space-y-3">
          <motion.button
            onClick={() => cameraRef.current?.click()}
            className="w-full py-5 rounded-2xl text-lg font-black tracking-wide flex items-center justify-center gap-3"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            style={{
              background: 'linear-gradient(135deg,#A855F7,#D4AF37)',
              color: '#000',
              boxShadow: '0 8px 48px rgba(168,85,247,0.35)',
            }}
          >
            <Camera size={22} className="flex-shrink-0" />
            Prendre un selfie
            <ArrowRight size={18} className="flex-shrink-0 ml-1" />
          </motion.button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#1E1E1E]" />
            <span className="text-[#404040] text-xs font-medium">ou</span>
            <div className="flex-1 h-px bg-[#1E1E1E]" />
          </div>

          <motion.button
            onClick={() => galleryRef.current?.click()}
            className="w-full py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-3 transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.08)', color: '#A0A0A0' }}
            whileHover={{ borderColor: 'rgba(168,85,247,0.35)', color: '#A855F7', scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            <ImageIcon size={20} className="flex-shrink-0" />
            Choisir depuis ma galerie
          </motion.button>
        </motion.div>
      )}

      <motion.p variants={up} className="text-center text-[#404040] text-xs flex items-center justify-center gap-1.5">
        <Lock size={10} className="flex-shrink-0" />
        Aucune photo stockée · Données supprimées immédiatement
      </motion.p>
    </motion.div>
  )
}
