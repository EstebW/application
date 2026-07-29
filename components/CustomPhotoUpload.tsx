'use client'

import { useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Camera, ImageIcon, ArrowRight, Lock, Wand2 } from 'lucide-react'

interface CustomPhotoUploadProps {
  onPhotoSelected: (file: File, preview: string) => void
}

const wrap = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}
const up = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
}

export default function CustomPhotoUpload({ onPhotoSelected }: CustomPhotoUploadProps) {
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
        <h1
          style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(2.2rem, 10vw, 3rem)' }}
          className="text-white font-black leading-[1.05]"
        >
          Étape 1 —
          <br />
          <span style={{
            background: 'linear-gradient(135deg, #A855F7 0%, #D4AF37 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Ta photo
          </span>
        </h1>
        <p className="text-[#909090] text-[15px] leading-relaxed max-w-[280px] mx-auto">
          Prends un selfie ou choisis une photo depuis ta galerie pour commencer.
        </p>
      </motion.div>

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

      <motion.p variants={up} className="text-center text-[#404040] text-xs flex items-center justify-center gap-1.5">
        <Lock size={10} className="flex-shrink-0" />
        Aucune photo stockée · Données supprimées immédiatement
      </motion.p>
    </motion.div>
  )
}
