'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Zap } from 'lucide-react'
import HeroSection from '@/components/HeroSection'
import PhotoUploadSection from '@/components/PhotoUploadSection'
import AnalysisLoader from '@/components/AnalysisLoader'
import TeaserResult from '@/components/TeaserResult'
import SignupGate from '@/components/SignupGate'
import PaymentScreen from '@/components/PaymentScreen'
import PhotoSceneCustomizer from '@/components/PhotoSceneCustomizer'
import GenerationLoader from '@/components/GenerationLoader'
import SuccessScreen from '@/components/SuccessScreen'
import Stepper from '@/components/Stepper'
import StarField from '@/components/StarField'
import type { CelebrityResult, PhotoScene } from '@/lib/types'
import { callFunction } from '@/lib/functions'

// ── New funnel:
// hero → upload → analyzing → teaser → signup → payment → customize → generating → success
type Step = 'hero' | 'upload' | 'analyzing' | 'teaser' | 'signup' | 'payment' | 'customize' | 'generating' | 'success'

function getStepperIndex(step: Step): number {
  switch (step) {
    case 'hero':
    case 'upload':
      return 0
    case 'analyzing':
      return 1
    case 'teaser':
    case 'signup':
    case 'payment':
    case 'customize':
      return 2
    case 'generating':
    case 'success':
      return 3
  }
}

const slideVariants = {
  enter: { opacity: 0, y: 30, scale: 0.98 },
  center: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
  exit: { opacity: 0, y: -20, scale: 0.98, transition: { duration: 0.35 } },
}

export default function HomePage() {
  const [step, setStep] = useState<Step>('hero')
  const [photoPreview, setPhotoPreview] = useState('')
  const [celebrity, setCelebrity] = useState<CelebrityResult | null>(null)
  const [generatedImage, setGeneratedImage] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [analysisId, setAnalysisId] = useState('')
  const [generationId, setGenerationId] = useState('')
  const [photoScene, setPhotoScene] = useState<PhotoScene | null>(null)
  const sessionInitialized = useRef(false)

  // Create Supabase session on mount
  useEffect(() => {
    if (sessionInitialized.current) return
    sessionInitialized.current = true
    callFunction<{ sessionId?: string }>('session')
      .then((d) => { if (d.sessionId) setSessionId(d.sessionId) })
      .catch(() => { /* non-blocking */ })
  }, [])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handlePhotoSelected = useCallback((_file: File, preview: string) => {
    setPhotoPreview(preview)
    setStep('upload')
  }, [])

  const handleAnalyze = useCallback(() => setStep('analyzing'), [])

  const handleAnalysisComplete = useCallback((result: CelebrityResult & { analysisId?: string }) => {
    setCelebrity(result)
    if (result.analysisId) setAnalysisId(result.analysisId)
    setStep('teaser')       // ← show blurred result first
  }, [])

  const handleReveal = useCallback(() => setStep('signup'), [])

  const handleSignupComplete = useCallback(() => {
    setStep('payment')      // ← after signup → paywall
  }, [])

  const handlePaymentSuccess = useCallback(() => {
    setStep('customize')
  }, [])

  const handleSceneSubmit = useCallback((scene: PhotoScene) => {
    setPhotoScene(scene)
    setStep('generating')
  }, [])

  const handleBackToCustomize = useCallback(() => {
    setStep('customize')
  }, [])

  const handleGenerationComplete = useCallback((imageBase64: string, genId?: string) => {
    setGeneratedImage(imageBase64)
    if (genId) setGenerationId(genId)
    setStep('success')
  }, [])

  const handleReset = useCallback(() => {
    setPhotoPreview('')
    setCelebrity(null)
    setGeneratedImage('')
    setAnalysisId('')
    setGenerationId('')
    setPhotoScene(null)
    setStep('hero')
  }, [])

  // ── Back button visibility ─────────────────────────────────────────────────
  const noBack: Step[] = ['hero', 'analyzing', 'generating', 'signup', 'payment', 'customize', 'success']
  const showBackButton = !noBack.includes(step)

  return (
    <div className="relative min-h-screen bg-[#0A0A0A] flex flex-col">
      <StarField />

      {/* Grain */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 5, opacity: 0.3,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")` }}
        aria-hidden />

      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle,rgba(212,175,55,0.06) 0%,transparent 65%)', filter: 'blur(40px)' }} />
        <div className="absolute top-1/2 -left-32 w-[350px] h-[350px] rounded-full"
          style={{ background: 'radial-gradient(circle,rgba(107,33,168,0.07) 0%,transparent 65%)', filter: 'blur(60px)' }} />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle,rgba(212,175,55,0.05) 0%,transparent 65%)', filter: 'blur(70px)' }} />
      </div>

      {/* ── Header ── */}
      <header className="relative z-20 flex items-center justify-between px-5 pt-5 pb-3">
        <div className="w-9 h-9 flex items-center justify-center">
          <AnimatePresence>
            {showBackButton && (
              <motion.button
                initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}
                onClick={handleReset}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                whileHover={{ borderColor: 'rgba(212,175,55,0.4)', scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <ArrowLeft size={15} className="text-[#A0A0A0]" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
          className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#D4AF37,#F0D060)' }}>
            <Zap size={12} className="text-black" fill="black" />
          </div>
          <span className="text-[13px] font-black tracking-tight"
            style={{
              background: 'linear-gradient(135deg,#D4AF37,#F0D060)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
            Mon Jumeau Célèbre
          </span>
        </motion.div>

        <div className="w-9 h-9" />
      </header>

      {/* ── Stepper ── */}
      <div className="relative z-20 px-5 max-w-[390px] mx-auto w-full">
        <Stepper currentStep={getStepperIndex(step)} />
      </div>

      {/* ── Main ── */}
      <main className="relative z-10 flex-1 flex flex-col pb-10 pt-2 max-w-[390px] mx-auto w-full">
        <AnimatePresence mode="wait">

          {step === 'hero' && (
            <motion.div key="hero" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <HeroSection onPhotoSelected={handlePhotoSelected} />
            </motion.div>
          )}

          {step === 'upload' && (
            <motion.div key="upload" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <PhotoUploadSection preview={photoPreview} onAnalyze={handleAnalyze} onReset={handleReset} />
            </motion.div>
          )}

          {step === 'analyzing' && (
            <motion.div key="analyzing" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <AnalysisLoader
                preview={photoPreview}
                imageBase64={photoPreview}
                sessionId={sessionId}
                onComplete={handleAnalysisComplete}
              />
            </motion.div>
          )}

          {step === 'teaser' && celebrity && (
            <motion.div key="teaser" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <TeaserResult
                celebrity={celebrity}
                preview={photoPreview}
                onReveal={handleReveal}
              />
            </motion.div>
          )}

          {step === 'signup' && celebrity && (
            <motion.div key="signup" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <SignupGate
                score={celebrity.score}
                sessionId={sessionId}
                onSuccess={handleSignupComplete}
              />
            </motion.div>
          )}

          {step === 'payment' && celebrity && (
            <motion.div key="payment" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <PaymentScreen
                sessionId={sessionId}
                generationId={generationId}
                score={celebrity.score}
                onSuccess={handlePaymentSuccess}
              />
            </motion.div>
          )}

          {step === 'customize' && celebrity && (
            <motion.div key="customize" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <PhotoSceneCustomizer
                celebrity={celebrity}
                onSubmit={handleSceneSubmit}
              />
            </motion.div>
          )}

          {step === 'generating' && celebrity && photoScene && (
            <motion.div key="generating" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <GenerationLoader
                preview={photoPreview}
                imageBase64={photoPreview}
                celebrity={celebrity}
                photoScene={photoScene}
                sessionId={sessionId}
                analysisId={analysisId}
                onComplete={handleGenerationComplete}
                onRetry={handleBackToCustomize}
              />
            </motion.div>
          )}

          {step === 'success' && celebrity && (
            <motion.div key="success" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <SuccessScreen
                preview={photoPreview}
                generatedImage={generatedImage}
                celebrity={celebrity}
                onReset={handleReset}
              />
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 text-center py-5 px-5">
        <div className="h-px w-full mb-4"
          style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent)' }} />
        <p className="text-[#383838] text-[11px] tracking-wide">
          Mon Jumeau Célèbre · Pour le divertissement uniquement · Tes photos ne sont pas stockées
        </p>
      </footer>
    </div>
  )
}
