'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import ProgressBar from './ProgressBar'

const STEPS = [
  'Fusion des visages en cours...',
  'Application du style célébrité...',
  'Finalisation de ton jumeau...',
]

interface GenerationLoaderProps {
  preview: string
  onComplete: () => void
}

export default function GenerationLoader({ preview, onComplete }: GenerationLoaderProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const totalDuration = 5000
    const stepDuration = totalDuration / STEPS.length

    const stepTimer = setInterval(() => {
      setStepIndex((prev) => {
        if (prev < STEPS.length - 1) return prev + 1
        clearInterval(stepTimer)
        return prev
      })
    }, stepDuration)

    const progressTimer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressTimer)
          return 100
        }
        return prev + 1
      })
    }, totalDuration / 100)

    const completeTimer = setTimeout(onComplete, totalDuration + 200)

    return () => {
      clearInterval(stepTimer)
      clearInterval(progressTimer)
      clearTimeout(completeTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -40 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center gap-10 w-full"
    >
      <div className="text-center space-y-2">
        <h2
          className="text-3xl font-black text-white"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Génération en cours
        </h2>
        <p className="text-[#A0A0A0] text-sm">L&apos;IA fusionne ton visage avec Zendaya</p>
      </div>

      {/* Two photos + sparkle */}
      <div className="flex items-center justify-center gap-4">
        {/* User photo */}
        <motion.div
          className="relative"
          animate={{ x: [0, 6, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div
            className="w-28 h-28 rounded-2xl overflow-hidden"
            style={{
              border: '2px solid rgba(212,175,55,0.4)',
              boxShadow: '0 0 20px rgba(212,175,55,0.15)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Toi" className="w-full h-full object-cover" />
          </div>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[9px] font-bold text-white bg-[#2A2A2A]">
            TOI
          </div>
        </motion.div>

        {/* Center sparkle / merge indicator */}
        <div className="flex flex-col items-center gap-3">
          {/* Pulsing merge icon */}
          <div className="relative w-14 h-14 flex items-center justify-center">
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute inset-0 rounded-full border border-[#D4AF37]/30"
                animate={{ scale: [1, 2.5], opacity: [0.6, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.5 }}
              />
            ))}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            >
              <Sparkles size={24} className="text-[#D4AF37]" />
            </motion.div>
          </div>

          {/* Particle stream */}
          <div className="relative h-1 w-24 overflow-hidden rounded-full bg-[#2A2A2A]">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                background: 'linear-gradient(90deg, #6B21A8, #D4AF37, #6B21A8)',
                width: '60%',
              }}
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        </div>

        {/* Celeb photo placeholder */}
        <motion.div
          className="relative"
          animate={{ x: [0, -6, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div
            className="w-28 h-28 rounded-2xl overflow-hidden relative"
            style={{
              border: '2px solid rgba(107,33,168,0.6)',
              boxShadow: '0 0 20px rgba(107,33,168,0.2)',
            }}
          >
            <div
              className="w-full h-full"
              style={{ background: 'linear-gradient(135deg, #2d1b69 0%, #6B21A8 100%)' }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-4xl font-black text-white/20">Z</span>
            </div>
          </div>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[9px] font-bold text-white bg-[#2A2A2A] whitespace-nowrap">
            ZENDAYA
          </div>
        </motion.div>
      </div>

      {/* Floating particles between photos */}
      <div className="w-full space-y-5">
        <div className="h-10 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={stepIndex}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4 }}
              className="text-center font-semibold text-base text-white"
            >
              {STEPS[stepIndex]}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-center gap-2">
          {STEPS.map((_, i) => (
            <motion.div
              key={i}
              className="rounded-full"
              animate={{
                width: i === stepIndex ? 24 : 6,
                backgroundColor: i <= stepIndex ? '#D4AF37' : '#2A2A2A',
              }}
              style={{ height: 6 }}
              transition={{ duration: 0.3 }}
            />
          ))}
        </div>

        <ProgressBar progress={Math.min(progress, 100)} />

        <div className="flex justify-between text-xs text-[#555]">
          <span>Génération IA</span>
          <span>{Math.min(Math.round(progress), 100)}%</span>
        </div>
      </div>

      {/* Processing info */}
      <div className="flex gap-6 text-center">
        {['Fusion faciale', 'Style transfer', 'Rendu HD'].map((item, i) => (
          <div key={i} className="space-y-1">
            <motion.div
              className="w-2 h-2 rounded-full mx-auto"
              style={{ background: i <= stepIndex ? '#D4AF37' : '#2A2A2A' }}
              animate={i === stepIndex ? { scale: [1, 1.5, 1] } : {}}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
            <p className="text-[10px] text-[#555]">{item}</p>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
