'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import ProgressBar from './ProgressBar'
import type { CelebrityResult } from '@/lib/types'
import { callFunction } from '@/lib/functions'

interface GenerationLoaderProps {
  preview: string
  imageBase64: string
  celebrity: CelebrityResult
  sessionId?: string
  analysisId?: string
  onComplete: (imageBase64: string, generationId?: string) => void
}

export default function GenerationLoader({ preview, imageBase64, celebrity, sessionId, analysisId, onComplete }: GenerationLoaderProps) {
  const { name, celebrity_style_description } = celebrity
  const [stepIndex, setStepIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [apiError, setApiError] = useState('')
  const called = useRef(false)

  const steps = [
    'Préparation de la mise en scène...',
    `Intégration de ton visage aux côtés de ${name}...`,
    'Finalisation de la photo HD...',
  ]

  useEffect(() => {
    if (called.current) return
    called.current = true

    // Progress animation — slower (generation takes longer)
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 85) return prev
        return prev + 0.8
      })
    }, 80)

    const stepInterval = setInterval(() => {
      setStepIndex((prev) => Math.min(prev + 1, steps.length - 2))
    }, 2500)

    const MIN_MS = 4000
    const t0 = Date.now()

    callFunction<{ imageBase64?: string; generationId?: string; error?: string }>(
      'generate',
      { imageBase64, celebrityName: name, celebrityStyleDescription: celebrity_style_description, sessionId, analysisId }
    )
      .then((data) => {
        clearInterval(stepInterval)

        if (data.error || !data.imageBase64) {
          throw new Error(data.error ?? 'Pas d\'image générée')
        }

        const elapsed = Date.now() - t0
        const remaining = Math.max(0, MIN_MS - elapsed)

        setStepIndex(steps.length - 1)

        setTimeout(() => {
          clearInterval(progressInterval)
          setProgress(100)
          setTimeout(() => onComplete(data.imageBase64!, data.generationId), 600)
        }, remaining)
      })
      .catch((err: unknown) => {
        clearInterval(progressInterval)
        clearInterval(stepInterval)
        setApiError(err instanceof Error ? err.message : 'Erreur inconnue')
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
          Ta photo en cours…
        </h2>
        <p className="text-[#A0A0A0] text-sm">
          L&apos;IA te place sur une photo{' '}
          <span className="text-[#D4AF37] font-semibold">aux côtés de {name}</span>
        </p>
      </div>

      {/* Two photos + sparkle */}
      <div className="flex items-center justify-center gap-4">
        <motion.div
          className="relative"
          animate={{ x: [0, 6, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div
            className="w-28 h-28 rounded-2xl overflow-hidden"
            style={{ border: '2px solid rgba(212,175,55,0.4)', boxShadow: '0 0 20px rgba(212,175,55,0.15)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Toi" className="w-full h-full object-cover" />
          </div>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[9px] font-bold text-white bg-[#2A2A2A]">
            TOI
          </div>
        </motion.div>

        <div className="flex flex-col items-center gap-3">
          <div className="relative w-14 h-14 flex items-center justify-center">
            {[...Array(3)].map((_, i) => (
              <motion.div key={i} className="absolute inset-0 rounded-full border border-[#D4AF37]/30"
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

          <div className="relative h-1 w-24 overflow-hidden rounded-full bg-[#2A2A2A]">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ background: 'linear-gradient(90deg, #6B21A8, #D4AF37, #6B21A8)', width: '60%' }}
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        </div>

        <motion.div
          className="relative"
          animate={{ x: [0, -6, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div
            className="w-28 h-28 rounded-2xl overflow-hidden relative"
            style={{ border: '2px solid rgba(107,33,168,0.6)', boxShadow: '0 0 20px rgba(107,33,168,0.2)' }}
          >
            <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, #2d1b69 0%, #6B21A8 100%)' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-4xl font-black text-white/20">{name[0]}</span>
            </div>
          </div>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[9px] font-bold text-white bg-[#2A2A2A] whitespace-nowrap">
            {name.toUpperCase()}
          </div>
        </motion.div>
      </div>

      {/* Status */}
      <div className="w-full space-y-5">
        {apiError ? (
          <div className="text-center space-y-3">
            <p className="text-red-400 text-sm font-semibold">Erreur lors de la génération</p>
            <p className="text-[#808080] text-xs leading-relaxed max-w-xs mx-auto">
              Vérifie que <code className="text-[#D4AF37]">KIE_API_KEY</code> est bien définie dans
              les secrets Supabase → Edge Functions → Secrets
            </p>
            {process.env.NODE_ENV === 'development' && (
              <p className="text-[#555] text-xs font-mono break-all px-2">{apiError}</p>
            )}
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
                  className="text-center font-semibold text-base text-white"
                >
                  {steps[stepIndex]}
                </motion.p>
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-center gap-2">
              {steps.map((_, i) => (
                <motion.div key={i} className="rounded-full"
                  animate={{ width: i === stepIndex ? 24 : 6, backgroundColor: i <= stepIndex ? '#D4AF37' : '#2A2A2A' }}
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
          </>
        )}
      </div>

      <div className="flex gap-6 text-center">
        {['Mise en scène', 'Intégration', 'Rendu HD'].map((item, i) => (
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
