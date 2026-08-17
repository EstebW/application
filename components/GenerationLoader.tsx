'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import ProgressBar from './ProgressBar'
import CelebrityPortrait from './CelebrityPortrait'
import type { CelebrityCreationMode, CelebrityResult, GenerationRequest } from '@/lib/types'
import { DEFAULT_CREATION_MODE } from '@/lib/types'
import { callFunction, FunctionCallError } from '@/lib/functions'
import { formatKieError, isSensitiveContentError } from '@/lib/kie-errors'
import { getCelebrityFirstName } from '@/lib/celebrity-image'
import { celebrityIdFromName } from '@/lib/height'
import {
  generationProgressFromElapsed,
  generationStepFromElapsed,
} from '@/lib/generation-progress'

interface GenerationLoaderProps {
  preview: string
  imageBase64: string
  celebrity: CelebrityResult
  /** Vraie photo de la célébrité importée par l'utilisateur (mode "Choisis ta star") */
  celebrityImageBase64?: string
  generationRequest: GenerationRequest
  /** photo_edit : imageBase64 est la photo de base, pas une simple référence de visage */
  creationMode?: CelebrityCreationMode
  /** Parcours « Choisis ta star » uniquement — la taille de la star est résolue côté serveur */
  userHeightCm?: number
  sessionId?: string
  userId?: string
  email?: string
  analysisId?: string
  onComplete: (imageBase64: string, generationId?: string, creditsBalance?: number) => void
  onRetry?: () => void
  onInsufficientCredits?: () => void
}

export default function GenerationLoader({ preview, imageBase64, celebrity, celebrityImageBase64, generationRequest, creationMode, userHeightCm, sessionId, userId, email, analysisId, onComplete, onRetry, onInsufficientCredits }: GenerationLoaderProps) {
  const { name, celebrity_domain, celebrity_style_description } = celebrity
  const firstName = getCelebrityFirstName(name)
  const resolvedCreationMode =
    creationMode ?? generationRequest.creationMode ?? DEFAULT_CREATION_MODE
  const isPhotoEdit = resolvedCreationMode === 'photo_edit'
  const [stepIndex, setStepIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [apiError, setApiError] = useState('')
  const [apiErrorCode, setApiErrorCode] = useState<string | undefined>()
  const called = useRef(false)

  const steps = isPhotoEdit
    ? [
        'Analyse de ta photo d\'origine...',
        `Intégration de ${firstName} dans ta photo...`,
        'Finalisation de la photo HD...',
      ]
    : [
        'Préparation de la mise en scène...',
        `Intégration de ton visage aux côtés de ${firstName}...`,
        'Finalisation de la photo HD...',
      ]

  useEffect(() => {
    if (called.current) return
    called.current = true

    const t0 = Date.now()
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - t0
      setProgress(generationProgressFromElapsed(elapsed))
      setStepIndex(generationStepFromElapsed(elapsed))
    }, 250)

    callFunction<{ imageBase64?: string; generationId?: string; creditsBalance?: number; error?: string }>(
      'generate',
      {
        imageBase64,
        celebrityName: name,
        celebrityDomain: celebrity_domain,
        celebrityStyleDescription: celebrity_style_description,
        celebrityTraits: celebrity.traits,
        funFact: celebrity.fun_fact,
        celebrityImageBase64,
        generationMode: generationRequest.mode,
        creationMode: resolvedCreationMode,
        sceneSource: isPhotoEdit ? undefined : generationRequest.sceneSource,
        // photo_edit : la scène est la photo elle-même, le backend refuse photoScene.
        // user_photo : le décor vient de image_input[0], pas d'une scène inventée.
        photoScene:
          isPhotoEdit || generationRequest.sceneSource === 'user_photo'
            ? undefined
            : generationRequest.photoScene,
        customPrompt:
          generationRequest.sceneSource === 'user_photo'
            ? undefined
            : generationRequest.customPrompt,
        interaction: generationRequest.interaction,
        // Le backend ne fait pas confiance à celebrityId : il le recalcule à
        // partir du nom pour retrouver la fiche taille de la star.
        celebrityId: celebrityIdFromName(name),
        userHeightCm,
        sessionId,
        userId,
        email,
        analysisId,
      }
    )
      .then((data) => {
        clearInterval(progressInterval)

        if (data.error || !data.imageBase64) {
          throw new Error(data.error ?? 'Pas d\'image générée')
        }

        setStepIndex(generationStepFromElapsed(Date.now() - t0, true))
        setProgress(100)
        setTimeout(() => onComplete(data.imageBase64!, data.generationId, data.creditsBalance), 700)
      })
      .catch((err: unknown) => {
        clearInterval(progressInterval)
        const message = err instanceof Error ? err.message : 'Erreur inconnue'
        const code = err instanceof FunctionCallError ? err.code : undefined
        const formatted = formatKieError(message, code)
        setApiError(formatted)
        setApiErrorCode(code)
        // Ne renvoie vers l'achat de crédits app QUE si l'erreur vient
        // vraiment du contrôle de crédits de l'app (status 402 dédié).
        // Une erreur côté kie.ai (fournisseur IA) ne doit jamais déclencher
        // ce flux — acheter des crédits app ne résoudrait rien.
        if (code === 'APP_CREDITS_INSUFFICIENT') {
          onInsufficientCredits?.()
        }
      })

    return () => {
      clearInterval(progressInterval)
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
          <CelebrityPortrait
            name={name}
            imageSrc={celebrityImageBase64}
            size="md"
            shape="rounded"
            badgeLabel="first"
          />
        </motion.div>
      </div>

      {/* Status */}
      <div className="w-full space-y-5">
        {apiError ? (
          <div className="text-center space-y-3">
            <p className="text-red-400 text-sm font-semibold">Erreur lors de la génération</p>
            <p className="text-[#A0A0A0] text-xs leading-relaxed max-w-xs mx-auto">
              {apiError}
            </p>
            {/* Toujours proposer de relancer : la photo importée et les choix sont conservés. */}
            {onRetry && apiErrorCode !== 'APP_CREDITS_INSUFFICIENT' && (
              <motion.button
                onClick={onRetry}
                className="mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
                style={{
                  background: 'rgba(212,175,55,0.12)',
                  border: '1px solid rgba(212,175,55,0.35)',
                  color: '#D4AF37',
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isSensitiveContentError(apiError)
                  ? 'Modifier la mise en scène'
                  : isPhotoEdit
                    ? 'Réessayer ou changer de photo'
                    : 'Réessayer'}
              </motion.button>
            )}
            {apiErrorCode === 'APP_CREDITS_INSUFFICIENT' && onInsufficientCredits && (
              <motion.button
                onClick={onInsufficientCredits}
                className="mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
                style={{
                  background: 'linear-gradient(135deg,#D4AF37,#F0D060)',
                  color: '#0A0A0A',
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Acheter des crédits
              </motion.button>
            )}
            {process.env.NODE_ENV === 'development' && !isSensitiveContentError(apiError) && (
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
