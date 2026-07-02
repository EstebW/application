'use client'

import { motion } from 'framer-motion'
import { Check, RefreshCw, Lock, Zap, ScanFace } from 'lucide-react'

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
      {/* Header */}
      <div className="text-center space-y-2">
        <h2
          className="text-3xl font-black text-white leading-tight"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Ton selfie est prêt
        </h2>
        <p className="text-[#808080] text-sm">
          On analyse ton visage pour trouver ta star jumelle
        </p>
      </div>

      {/* Photo preview */}
      <div className="flex flex-col items-center">
        <div className="relative">
          {/* Ambient glow */}
          <div
            className="absolute inset-0 rounded-full blur-2xl"
            style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.3) 0%, transparent 70%)' }}
          />

          {/* Spinning dashed ring */}
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-dashed border-[#D4AF37]/30"
            style={{ margin: '-12px' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          />

          {/* Gold border frame */}
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
                alt="Votre selfie"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* ScanFace scan lines overlay */}
          <motion.div
            className="absolute inset-0 rounded-full overflow-hidden pointer-events-none"
            style={{ margin: 0 }}
          >
            <motion.div
              className="absolute left-0 right-0 h-0.5 opacity-60"
              style={{ background: 'linear-gradient(90deg,transparent,#D4AF37,transparent)' }}
              animate={{ top: ['0%', '100%', '0%'] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        </div>

        {/* Ready badge */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 300 }}
          className="mt-5 flex justify-center"
        >
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/40">
            <Check className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-sm font-semibold text-[#D4AF37]">Selfie prêt à l&apos;analyse</span>
          </div>
        </motion.div>
      </div>

      {/* Detection indicators */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
        className="flex items-center gap-5"
      >
        {[
          { Icon: ScanFace, label: 'Visage détecté' },
          { Icon: Check,    label: 'Netteté OK' },
          { Icon: Check,    label: 'Éclairage OK' },
        ].map(({ Icon, label }, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Icon size={11} className="text-emerald-400" />
            <span className="text-[10px] font-semibold text-[#707070]">{label}</span>
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
          className="btn-gold btn-pulse w-full py-5 rounded-2xl text-xl font-black tracking-wide"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{ boxShadow: '0 8px 40px rgba(212,175,55,0.35)' }}
        >
          Analyser mon visage →
        </motion.button>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#A0A0A0]">
            <Lock size={12} className="text-[#D4AF37] flex-shrink-0" />
            0 photo conservée
          </span>
          <span className="text-[#3A3A3A] text-[11px]">·</span>
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#A0A0A0]">
            <Zap size={12} className="text-[#D4AF37] flex-shrink-0" />
            Résultat en 10 secondes
          </span>
        </div>

        <button
          onClick={onReset}
          className="w-full flex items-center justify-center gap-2 text-[#606060] hover:text-[#D4AF37] transition-colors py-2 text-sm"
        >
          <RefreshCw size={13} />
          Prendre une autre photo
        </button>
      </motion.div>
    </motion.div>
  )
}
