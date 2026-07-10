'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ProgressBar from './ProgressBar'
import type { CelebrityResult } from '@/lib/types'
import { callFunction } from '@/lib/functions'

const STEPS = [
  'Détection des points clés de ton visage...',
  'Comparaison avec 10 000 célébrités...',
  'Calcul de la ressemblance exacte...',
  'Ton jumeau vient d\'être trouvé !',
]

import { formatKieError } from '@/lib/kie-errors'

interface AnalysisLoaderProps {
  preview: string
  imageBase64: string
  sessionId?: string
  onComplete: (result: CelebrityResult & { analysisId?: string }) => void
}

export default function AnalysisLoader({ preview, imageBase64, sessionId, onComplete }: AnalysisLoaderProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [apiError, setApiError] = useState('')
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    // Progress bar animation — min 4 seconds UX
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        // Slow down near 90% until API responds
        if (prev >= 90) return prev
        return prev + 1.5
      })
    }, 60)

    // Step text cycling
    const stepInterval = setInterval(() => {
      setStepIndex((prev) => Math.min(prev + 1, STEPS.length - 2))
    }, 1100)

    // Minimum display time before transitioning
    const MIN_MS = 3800

    const t0 = Date.now()

    callFunction<CelebrityResult & { analysisId?: string; error?: string }>(
      'analyze',
      { imageBase64, sessionId }
    )
      .then((data) => {
        clearInterval(stepInterval)

        if (data.error) {
          throw new Error(data.error)
        }

        const elapsed = Date.now() - t0
        const remaining = Math.max(0, MIN_MS - elapsed)

        // Show final step + fill bar, then transition
        setStepIndex(STEPS.length - 1)

        setTimeout(() => {
          clearInterval(progressInterval)
          setProgress(100)
          setTimeout(() => onComplete(data), 600)
        }, remaining)
      })
      .catch((err: unknown) => {
        clearInterval(progressInterval)
        clearInterval(stepInterval)
        const raw = err instanceof Error ? err.message : 'Erreur inconnue'
        // callFunction peut renvoyer du JSON stringifié
        try {
          const parsed = JSON.parse(raw) as { error?: string }
          if (parsed.error) {
            setApiError(formatKieError(parsed.error))
            return
          }
        } catch {
          // pas du JSON
        }
        setApiError(formatKieError(raw))
      })

    return () => {
      clearInterval(progressInterval)
      clearInterval(stepInterval)
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
          Analyse en cours
        </h2>
        <p className="text-[#A0A0A0] text-sm">Notre IA scanne ton visage en détail</p>
      </div>

      {/* Animated photo with spinning arcs */}
      <div className="relative w-52 h-52 flex items-center justify-center">
        <motion.div
          className="absolute inset-0"
          animate={{ rotate: 360 }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
        >
          <svg viewBox="0 0 200 200" className="w-full h-full">
            <defs>
              <linearGradient id="arcGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#D4AF37" stopOpacity="0" />
                <stop offset="50%" stopColor="#D4AF37" stopOpacity="1" />
                <stop offset="100%" stopColor="#F0D060" stopOpacity="0.3" />
              </linearGradient>
            </defs>
            <circle cx="100" cy="100" r="95" fill="none" stroke="url(#arcGrad1)"
              strokeWidth="3" strokeDasharray="200 400" strokeLinecap="round" />
          </svg>
        </motion.div>

        <motion.div
          className="absolute"
          style={{ inset: '14px' }}
          animate={{ rotate: -360 }}
          transition={{ duration: 3.5, repeat: Infinity, ease: 'linear' }}
        >
          <svg viewBox="0 0 200 200" className="w-full h-full">
            <defs>
              <linearGradient id="arcGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6B21A8" stopOpacity="0" />
                <stop offset="60%" stopColor="#9333EA" stopOpacity="1" />
                <stop offset="100%" stopColor="#6B21A8" stopOpacity="0" />
              </linearGradient>
            </defs>
            <circle cx="100" cy="100" r="95" fill="none" stroke="url(#arcGrad2)"
              strokeWidth="2" strokeDasharray="120 480" strokeLinecap="round" />
          </svg>
        </motion.div>

        {/* Scan line */}
        <motion.div
          className="absolute left-0 right-0 h-0.5 z-20"
          animate={{ top: ['15%', '85%', '15%'] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="w-full h-full"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.8), transparent)' }} />
        </motion.div>

        {/* Photo */}
        <div className="relative w-44 h-44 rounded-full overflow-hidden z-10"
          style={{ border: '3px solid rgba(212,175,55,0.5)', boxShadow: '0 0 30px rgba(212,175,55,0.2)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Analyse" className="w-full h-full object-cover" />
        </div>

        {[
          { top: '5%', left: '5%' },
          { top: '5%', right: '5%' },
          { bottom: '5%', left: '5%' },
          { bottom: '5%', right: '5%' },
        ].map((pos, i) => (
          <motion.div key={i} className="absolute w-2 h-2 rounded-full bg-[#D4AF37]"
            style={pos}
            animate={{ opacity: [1, 0.2, 1], scale: [1, 0.7, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
          />
        ))}
      </div>

      {/* Step text */}
      <div className="w-full space-y-5">
        {apiError ? (
          <div className="text-center space-y-3">
            <p className="text-red-400 text-sm font-semibold">Erreur lors de l'analyse</p>
            <p className="text-[#A0A0A0] text-xs leading-relaxed max-w-xs mx-auto">
              {apiError}
            </p>
          </div>
        ) : (
          <>
            <div className="h-10 flex items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.p
                  key={stepIndex}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.4 }}
                  className={`text-center font-semibold text-base ${
                    stepIndex === STEPS.length - 1 ? 'text-[#D4AF37]' : 'text-white'
                  }`}
                >
                  {STEPS[stepIndex]}
                </motion.p>
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-center gap-2">
              {STEPS.map((_, i) => (
                <motion.div key={i} className="rounded-full"
                  animate={{ width: i === stepIndex ? 24 : 6, backgroundColor: i <= stepIndex ? '#D4AF37' : '#2A2A2A' }}
                  style={{ height: 6 }}
                  transition={{ duration: 0.3 }}
                />
              ))}
            </div>

            <ProgressBar progress={Math.min(progress, 100)} />

            <div className="flex justify-between text-xs text-[#555]">
              <span>Progression</span>
              <span>{Math.min(Math.round(progress), 100)}%</span>
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}
