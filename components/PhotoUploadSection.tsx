'use client'

import { motion } from 'framer-motion'
import { Check, RefreshCw, Lock } from 'lucide-react'

interface PhotoUploadSectionProps {
  preview: string
  onAnalyze: () => void
  onReset: () => void
}

export default function PhotoUploadSection({ preview, onAnalyze, onReset }: PhotoUploadSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -40 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center gap-8 w-full"
    >
      {/* Section header */}
      <div className="text-center space-y-2">
        <h2
          className="text-3xl font-black text-white"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Photo prête
        </h2>
        <p className="text-[#A0A0A0] text-sm">Ton selfie a été chargé avec succès</p>
      </div>

      {/* Photo preview with glamour frame */}
      <div className="relative">
        {/* Outer glow */}
        <div
          className="absolute inset-0 rounded-full blur-2xl"
          style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.3) 0%, transparent 70%)' }}
        />

        {/* Decorative orbit ring */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-dashed border-[#D4AF37]/30"
          style={{ margin: '-12px' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        />

        {/* Gold frame */}
        <div
          className="relative w-52 h-52 rounded-full overflow-hidden"
          style={{
            padding: '3px',
            background: 'linear-gradient(135deg, #D4AF37, #F0D060, #A88B20, #D4AF37)',
          }}
        >
          <div className="w-full h-full rounded-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Votre photo"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Success badge */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 300 }}
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 backdrop-blur-sm"
        >
          <Check size={12} className="text-emerald-400" />
          <span className="text-emerald-400 text-xs font-bold">Photo prête</span>
        </motion.div>
      </div>

      {/* Quality indicators */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="flex gap-4"
      >
        {['Netteté ✓', 'Visage détecté ✓', 'Éclairage ✓'].map((item, i) => (
          <div key={i} className="text-center">
            <p className="text-[10px] text-[#D4AF37] font-semibold">{item}</p>
          </div>
        ))}
      </motion.div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="w-full space-y-4"
      >
        <motion.button
          onClick={onAnalyze}
          className="btn-gold w-full py-5 rounded-2xl text-xl font-black tracking-wide shadow-2xl"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{ boxShadow: '0 8px 40px rgba(212, 175, 55, 0.35)' }}
        >
          Analyser mon visage →
        </motion.button>

        <div className="flex items-center justify-center gap-2 text-[#A0A0A0] text-xs">
          <Lock size={11} />
          <span>Ta photo n&apos;est pas stockée • Résultat en 10 secondes</span>
        </div>

        <button
          onClick={onReset}
          className="w-full flex items-center justify-center gap-2 text-[#A0A0A0] hover:text-[#D4AF37] transition-colors py-2 text-sm"
        >
          <RefreshCw size={14} />
          Changer de photo
        </button>
      </motion.div>
    </motion.div>
  )
}
