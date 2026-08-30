'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ProgressBar from './ProgressBar'
import type { CelebrityResult } from '@/lib/types'
import { callFunction, FunctionCallError } from '@/lib/functions'
import { formatAnalyzeError, isTransientKieError } from '@/lib/kie-errors'
import {
  analysisProgressFromElapsed,
  analysisStepFromElapsed,
} from '@/lib/analysis-progress'
import { prepareAnalysisImage } from '@/lib/prepare-analysis-image'

const STEPS = [
  'Analyse morphologique de ton visage...',
  'Comparaison structurelle des traits...',
  'Classement des meilleures ressemblances...',
  'Ton jumeau vient d\'être trouvé !',
]

const CLIENT_MAX_ATTEMPTS = 2
const CLIENT_RETRY_DELAY_MS = 2_000

interface AnalysisLoaderProps {
  preview: string
  imageBase64: string
  sessionId?: string
  userId?: string
  onComplete: (result: CelebrityResult & { analysisId?: string }) => void
}

function parseAnalysisError(err: unknown): string {
  if (err instanceof FunctionCallError) {
    return formatAnalyzeError(err.message, err.code)
  }
  const raw = err instanceof Error ? err.message : 'Erreur inconnue'
  try {
    const parsed = JSON.parse(raw) as { error?: string }
    if (parsed.error) return formatAnalyzeError(parsed.error)
  } catch {
    // pas du JSON
  }
  return formatAnalyzeError(raw)
}

export default function AnalysisLoader({ preview, imageBase64, sessionId, userId, onComplete }: AnalysisLoaderProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [apiError, setApiError] = useState('')
  const [retrying, setRetrying] = useState(false)
  const runId = useRef(0)

  const runAnalysis = useCallback(async () => {
    const currentRun = ++runId.current
    setApiError('')
    setRetrying(false)
    setStepIndex(0)
    setProgress(0)

    const t0 = Date.now()
    const progressInterval = setInterval(() => {
      if (runId.current !== currentRun) return
      const elapsed = Date.now() - t0
      setProgress(analysisProgressFromElapsed(elapsed))
      setStepIndex(analysisStepFromElapsed(elapsed))
    }, 250)

    try {
      const preparedImage = await prepareAnalysisImage(imageBase64)
      let lastErr: unknown

      for (let attempt = 1; attempt <= CLIENT_MAX_ATTEMPTS; attempt++) {
        if (runId.current !== currentRun) return
        if (attempt > 1) {
          setRetrying(true)
          await new Promise((r) => setTimeout(r, CLIENT_RETRY_DELAY_MS))
        }

        try {
          const data = await callFunction<CelebrityResult & { analysisId?: string; error?: string }>(
            'analyze',
            { imageBase64: preparedImage, sessionId, userId },
          )

          if (runId.current !== currentRun) return
          if (data.error) throw new Error(data.error)

          clearInterval(progressInterval)
          setRetrying(false)
          setStepIndex(analysisStepFromElapsed(Date.now() - t0, true))
          setProgress(100)
          setTimeout(() => onComplete(data), 700)
          return
        } catch (err) {
          lastErr = err
          const message = parseAnalysisError(err)
          const transient = isTransientKieError(message) || (
            err instanceof FunctionCallError && (err.status === 502 || err.status === 503 || err.status === 504)
          )
          if (!transient || attempt === CLIENT_MAX_ATTEMPTS) break
        }
      }

      if (runId.current !== currentRun) return
      clearInterval(progressInterval)
      setRetrying(false)
      setApiError(parseAnalysisError(lastErr))
    } catch (err) {
      if (runId.current !== currentRun) return
      clearInterval(progressInterval)
      setRetrying(false)
      setApiError(parseAnalysisError(err))
    }
  }, [imageBase64, onComplete, sessionId, userId])

  useEffect(() => {
    void runAnalysis()
    return () => {
      runId.current += 1
    }
  }, [runAnalysis])

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
            <p className="text-red-400 text-sm font-semibold">Erreur lors de l&apos;analyse</p>
            <p className="text-[#A0A0A0] text-xs leading-relaxed max-w-xs mx-auto">
              {apiError}
            </p>
            <button
              type="button"
              onClick={() => void runAnalysis()}
              className="mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-[#D4AF37] border border-[#D4AF37]/40 hover:bg-[#D4AF37]/10 transition-colors"
            >
              Réessayer l&apos;analyse
            </button>
          </div>
        ) : (
          <>
            <div className="h-10 flex items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.p
                  key={retrying ? 'retry' : stepIndex}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.4 }}
                  className={`text-center font-semibold text-base ${
                    stepIndex === STEPS.length - 1 ? 'text-[#D4AF37]' : 'text-white'
                  }`}
                >
                  {retrying ? 'Serveurs chargés — nouvel essai...' : STEPS[stepIndex]}
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
