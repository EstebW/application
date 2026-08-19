'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, LogIn, LayoutDashboard } from 'lucide-react'
import Link from 'next/link'
import HeroSection from '@/components/HeroSection'
import ModeChoice from '@/components/ModeChoice'
import CustomPhotoUpload from '@/components/CustomPhotoUpload'
import CustomCelebrityForm from '@/components/CustomCelebrityForm'
import PhotoUploadSection from '@/components/PhotoUploadSection'
import AnalysisLoader from '@/components/AnalysisLoader'
import AnalysisResult from '@/components/AnalysisResult'
import TeaserResult from '@/components/TeaserResult'
import SignupGate from '@/components/SignupGate'
import PaymentScreen from '@/components/PaymentScreen'
import PhotoSceneCustomizer from '@/components/PhotoSceneCustomizer'
import GenerationLoader from '@/components/GenerationLoader'
import SuccessScreen from '@/components/SuccessScreen'
import Stepper from '@/components/Stepper'
import StarField from '@/components/StarField'
import StarFusionLogo from '@/components/StarFusionLogo'
import CreationModeChoice from '@/components/CreationModeChoice'
import BasePhotoUpload from '@/components/BasePhotoUpload'
import type { CelebrityCreationMode, CelebrityResult, GenerationRequest } from '@/lib/types'
import { DEFAULT_CREATION_MODE } from '@/lib/types'
import { callFunction } from '@/lib/functions'
import type { AccountData } from '@/lib/account'
import { accountCanRevealTwin, accountCanSkipTwinUnlock } from '@/lib/account'
import { accountHasUnlimitedAccess } from '@/lib/roles'
import { supabase } from '@/lib/supabase'
import {
  getStoredSessionId,
  setStoredSessionId,
  setStoredEmail,
  getStoredEmail,
  setHasCompletedGeneration,
  getStoredUserHeightCm,
  setStoredUserHeightCm,
} from '@/lib/session-storage'
import { isValidUserHeightCm } from '@/lib/height'
import { prefetchCelebrityImage } from '@/lib/celebrity-image'
import {
  clearCheckoutReturnContext,
  readCheckoutReturnContext,
} from '@/lib/checkout-return'
import {
  clearOAuthReturnContext,
  readOAuthReturnContext,
  saveOAuthReturnContext,
} from '@/lib/oauth-return'
import {
  applyFunnelPageView,
  funnelPageTitle,
  funnelPath,
  parseFunnelPath,
  safeFunnelStep,
  type FunnelAppMode,
  type FunnelStep,
} from '@/lib/funnel-routes'

type Step = FunnelStep
type AppMode = FunnelAppMode

function getStepperState(
  step: Step,
  userId: string | undefined,
  creditsBalance: number,
  appMode: AppMode | null,
  unlimitedAccess = false,
): { labels: readonly string[]; index: number } {
  const loggedIn = Boolean(userId)
  const onPaywall = !unlimitedAccess && (step === 'payment' || step === 'signup')
  const needsPay = !unlimitedAccess && (!loggedIn || creditsBalance <= 0 || onPaywall)

  if (appMode === 'match') {
    if (loggedIn && !needsPay) {
      const labels = ['Photo', 'Analyse', 'Jumeau', 'Créa'] as const
      const index =
        step === 'modeChoice' || step === 'hero' || step === 'upload' ? 0
          : step === 'analyzing' || step === 'teaser' ? 1
            : step === 'result' ? 2
              : 3
      return { labels, index }
    }
    if (loggedIn) {
      const labels = ['Photo', 'Analyse', 'Paiement', 'Jumeau', 'Créa'] as const
      const index =
        step === 'modeChoice' || step === 'hero' || step === 'upload' ? 0
          : step === 'analyzing' || step === 'teaser' || step === 'signup' ? 1
            : step === 'payment' ? 2
              : step === 'result' ? 3
                : 4
      return { labels, index }
    }
    const labels = ['Photo', 'Analyse', 'Compte', 'Paiement', 'Jumeau'] as const
    const index =
      step === 'modeChoice' || step === 'hero' || step === 'upload' ? 0
        : step === 'analyzing' || step === 'teaser' ? 1
          : step === 'signup' ? 2
            : step === 'payment' ? 3
              : 4 // result / customize / generating / success
    return { labels, index }
  }

  // Custom — Mode → Star → Photo → Créa
  const onPhotoSteps = step === 'customUpload' || step === 'basePhoto'

  if (loggedIn && !needsPay) {
    const labels = ['Mode', 'Star', 'Photo', 'Créa'] as const
    const index =
      step === 'modeChoice' || step === 'creationChoice' ? 0
        : step === 'customCelebrity' ? 1
          : onPhotoSteps ? 2
            : 3
    return { labels, index }
  }
  if (loggedIn) {
    const labels = ['Mode', 'Star', 'Photo', 'Paiement', 'Créa'] as const
    const index =
      step === 'modeChoice' || step === 'creationChoice' ? 0
        : step === 'customCelebrity' ? 1
          : onPhotoSteps || step === 'signup' ? 2
            : step === 'payment' ? 3
              : 4
    return { labels, index }
  }
  const labels = ['Mode', 'Star', 'Photo', 'Compte', 'Paiement'] as const
  const index =
    step === 'modeChoice' || step === 'creationChoice' ? 0
      : step === 'customCelebrity' ? 1
        : onPhotoSteps ? 2
          : step === 'signup' ? 3
            : 4
  return { labels, index }
}

const slideVariants = {
  enter: { opacity: 0, y: 30, scale: 0.98 },
  center: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
  exit: { opacity: 0, y: -20, scale: 0.98, transition: { duration: 0.35 } },
}

export default function FunnelApp() {
  const pathname = usePathname()
  const router = useRouter()
  const parsed = parseFunnelPath(pathname)
  const [step, setStep] = useState<Step>(parsed.step)
  const [appMode, setAppMode] = useState<AppMode | null>(parsed.appMode)
  const [photoPreview, setPhotoPreview] = useState('')
  const [celebrity, setCelebrity] = useState<CelebrityResult | null>(null)
  const [celebrityPhoto, setCelebrityPhoto] = useState('')
  // Parcours « Choisis ta star » uniquement — le funnel « jumeau » reste en full_generation.
  const [creationMode, setCreationMode] = useState<CelebrityCreationMode | undefined>()
  const [basePhoto, setBasePhoto] = useState('')
  // Taille utilisateur — collectée dans « Choisis ta star » ou « Trouve ton jumeau ».
  const [userHeightCm, setUserHeightCm] = useState<number | undefined>()
  const [hasUnlocked, setHasUnlocked] = useState(false)
  const [generatedImage, setGeneratedImage] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [analysisId, setAnalysisId] = useState('')
  const [generationId, setGenerationId] = useState('')
  const [generationRequest, setGenerationRequest] = useState<GenerationRequest | null>(null)
  const [creditsBalance, setCreditsBalance] = useState(0)
  const [unlimitedAccess, setUnlimitedAccess] = useState(false)
  const [userId, setUserId] = useState<string | undefined>()
  const [userEmail, setUserEmail] = useState<string | undefined>()
  const [userFirstName, setUserFirstName] = useState<string | null>(null)
  const sessionInitialized = useRef(false)
  const syncingFromUrl = useRef(false)
  const stepRef = useRef(step)
  const appModeRef = useRef(appMode)
  stepRef.current = step
  appModeRef.current = appMode

  const goTo = useCallback((next: Step, mode?: AppMode | null) => {
    if (mode !== undefined) setAppMode(mode)
    setStep(next)
  }, [])

  useEffect(() => {
    const path = funnelPath(step, appMode)
    applyFunnelPageView(path, funnelPageTitle(step, appMode))
    if (syncingFromUrl.current) {
      syncingFromUrl.current = false
      return
    }
    if (typeof window !== 'undefined' && window.location.pathname !== path) {
      router.push(path)
    }
  }, [step, appMode, router])

  useEffect(() => {
    const currentPath = funnelPath(stepRef.current, appModeRef.current)
    if (pathname === currentPath) return
    syncingFromUrl.current = true
    const parsedPath = parseFunnelPath(pathname)
    setStep(parsedPath.step)
    setAppMode(parsedPath.appMode)
  }, [pathname])

  useEffect(() => {
    const guarded = safeFunnelStep(step, appMode, {
      photoPreview,
      celebrity,
      generationRequest,
      generatedImage,
    })
    if (guarded !== step) goTo(guarded)
  }, [step, appMode, photoPreview, celebrity, generationRequest, generatedImage, goTo])

  const applyAccountFlags = useCallback((data: AccountData) => {
    setCreditsBalance(data.creditsBalance)
    setUserFirstName(data.firstName?.trim() || null)
    const unlimited = accountHasUnlimitedAccess(data)
    setUnlimitedAccess(unlimited)
    if (accountCanSkipTwinUnlock(data)) setHasUnlocked(true)
  }, [])

  const refreshAccount = useCallback(async (opts: { sessionId?: string; userId?: string; email?: string }) => {
    try {
      const data = await callFunction<AccountData>('account', opts)
      applyAccountFlags(data)
      // Préremplissage : le profil ne doit jamais écraser une saisie en cours.
      if (isValidUserHeightCm(data.heightCm)) {
        setUserHeightCm((current) => current ?? data.heightCm ?? undefined)
      }
      if (data.sessionId) {
        setSessionId(data.sessionId)
        setStoredSessionId(data.sessionId)
      }
      if (data.email) {
        setUserEmail(data.email)
        setStoredEmail(data.email)
      }
    } catch {
      // compte pas encore migré ou session invalide
    }
  }, [applyAccountFlags])

  // Create or restore Supabase session on mount — sync avec le compte auth si connecté
  useEffect(() => {
    if (sessionInitialized.current) return
    sessionInitialized.current = true

    async function initSession() {
      const stored = getStoredSessionId()
      const storedEmail = getStoredEmail()
      const storedHeight = getStoredUserHeightCm()
      if (storedHeight !== null) setUserHeightCm(storedHeight)
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        setUserId(user.id)
        if (user.email) setUserEmail(user.email)
        await refreshAccount({
          userId: user.id,
          sessionId: stored ?? undefined,
          email: user.email ?? storedEmail ?? undefined,
        })
        return
      }

      if (stored) {
        setSessionId(stored)
        await refreshAccount({ sessionId: stored, email: storedEmail ?? undefined })
        return
      }

      try {
        const d = await callFunction<{ sessionId?: string }>('session')
        if (d.sessionId) {
          setSessionId(d.sessionId)
          setStoredSessionId(d.sessionId)
        }
      } catch {
        // non-blocking
      }
    }

    initSession()
  }, [refreshAccount])

  // Garder l’état auth à jour (inscription / login / logout dans un autre onglet)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      if (user) {
        setUserId(user.id)
        if (user.email) {
          setUserEmail(user.email)
          setStoredEmail(user.email)
        }
      } else {
        setUserId(undefined)
        setUnlimitedAccess(false)
        setHasUnlocked(false)
        setUserFirstName(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Handlers ───────────────────────────────────────────────────────────────

  /** Après teaser / star : inscription ou paiement ; comptes avec crédits vont direct au résultat. */
  const routeToUnlock = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      goTo('signup')
      return
    }

    setUserId(user.id)
    if (user.email) {
      setUserEmail(user.email)
      setStoredEmail(user.email)
    }

    try {
      const data = await callFunction<AccountData>('account', {
        userId: user.id,
        sessionId: sessionId || undefined,
        email: user.email ?? userEmail,
      })
      applyAccountFlags(data)
      if (data.sessionId) {
        setSessionId(data.sessionId)
        setStoredSessionId(data.sessionId)
      }
      if (data.email) {
        setUserEmail(data.email)
        setStoredEmail(data.email)
      }
      if (accountCanRevealTwin(data)) {
        setHasUnlocked(true)
        goTo(appMode === 'match' ? 'result' : 'customize')
        return
      }
    } catch {
      // ignore
    }

    // Compte existant sans crédit : paiement direct (plus de teaser flouté si déjà client).
    goTo('payment')
  }, [sessionId, userEmail, appMode, applyAccountFlags])

  const handleSelectMatchMode = useCallback(() => {
    goTo('hero', 'match')
  }, [goTo])

  const handleSelectCustomMode = useCallback(() => {
    goTo('creationChoice', 'custom')
  }, [goTo])

  const handlePhotoSelected = useCallback((_file: File, preview: string) => {
    setPhotoPreview(preview)
    goTo('upload')
  }, [])

  const continueAfterCustomPhoto = useCallback(() => {
    if (hasUnlocked) {
      goTo('customize')
      return
    }
    void routeToUnlock()
  }, [hasUnlocked, routeToUnlock])

  const handleCustomPhotoSelected = useCallback((_file: File, preview: string) => {
    setPhotoPreview(preview)
    continueAfterCustomPhoto()
  }, [continueAfterCustomPhoto])

  const handleCustomCelebritySubmit = useCallback((data: {
    name: string
    domain: string
    celebrityImageBase64: string
    userHeightCm: number
  }) => {
    setUserHeightCm(data.userHeightCm)
    setStoredUserHeightCm(data.userHeightCm)
    setCelebrity({
      name: data.name,
      celebrity_domain: data.domain,
      score: 0,
      traits: [],
      celebrity_style_description: '',
      fun_fact: '',
    })
    setCelebrityPhoto(data.celebrityImageBase64)
    if (creationMode === 'photo_edit') {
      goTo('basePhoto')
      return
    }
    goTo('customUpload')
  }, [creationMode])

  const handleCreationModeSubmit = useCallback((mode: CelebrityCreationMode) => {
    setCreationMode(mode)
    if (mode === 'full_generation') setBasePhoto('')
    goTo('customCelebrity')
  }, [])

  // Changer de photo après le paiement ne doit pas renvoyer sur le paywall.
  const handleBasePhotoSubmit = useCallback((photo: string) => {
    setBasePhoto(photo)
    setPhotoPreview(photo)
    if (hasUnlocked) {
      goTo('customize')
      return
    }
    void routeToUnlock()
  }, [hasUnlocked, routeToUnlock])

  const handleChangeBasePhoto = useCallback(() => {
    goTo('basePhoto')
  }, [])

  const handleChangeUserPhoto = useCallback(() => {
    goTo('customUpload')
  }, [])

  const handleAnalyze = useCallback(() => goTo('analyzing'), [])

  const handleAnalysisComplete = useCallback(async (result: CelebrityResult & { analysisId?: string }) => {
    setCelebrity(result)
    if (result.analysisId) setAnalysisId(result.analysisId)
    prefetchCelebrityImage(result.name)

    if (hasUnlocked || unlimitedAccess || creditsBalance > 0) {
      goTo('result')
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const data = await callFunction<AccountData>('account', {
        userId: user?.id,
        sessionId: sessionId || undefined,
        email: user?.email ?? userEmail,
      })
      applyAccountFlags(data)
      if (accountCanSkipTwinUnlock(data)) {
        goTo(accountCanRevealTwin(data) ? 'result' : 'payment')
        return
      }
    } catch {
      // ignore
    }

    goTo('teaser')
  }, [hasUnlocked, creditsBalance, unlimitedAccess, sessionId, userEmail, applyAccountFlags, goTo])

  const handleReveal = useCallback(() => {
    void routeToUnlock()
  }, [routeToUnlock])

  const handleSignupComplete = useCallback(async (
    email?: string,
    meta?: { sessionId?: string; creditsBalance?: number },
  ) => {
    if (email) {
      setStoredEmail(email)
      setUserEmail(email)
    }

    if (meta?.sessionId) {
      setSessionId(meta.sessionId)
      setStoredSessionId(meta.sessionId)
    }

    setCreditsBalance(typeof meta?.creditsBalance === 'number' ? meta.creditsBalance : 0)

    const { data: { user } } = await supabase.auth.getUser()
    if (user) setUserId(user.id)

    try {
      const data = await callFunction<AccountData>('account', {
        userId: user?.id,
        sessionId: meta?.sessionId || sessionId || undefined,
        email: email || user?.email || userEmail,
      })
      applyAccountFlags(data)
      if (accountCanRevealTwin(data)) {
        goTo(appMode === 'match' ? 'result' : 'customize')
        return
      }
    } catch {
      // ignore
    }

    goTo('payment')
  }, [sessionId, userEmail, appMode, applyAccountFlags, goTo])

  const handlePaymentSuccess = useCallback((newBalance: number) => {
    setCreditsBalance(newBalance)
    setHasUnlocked(true)
    goTo(appMode === 'match' ? 'result' : 'customize')
  }, [appMode])

  // Retour Google OAuth depuis le SignupGate → reprendre le funnel (paiement)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('oauth') !== 'funnel') return

    let cancelled = false

    async function resumeAfterGoogle() {
      const ctx = readOAuthReturnContext()
      clearOAuthReturnContext()
      window.history.replaceState({}, '', window.location.pathname)

      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled || !user) return

      setUserId(user.id)
      if (user.email) {
        setUserEmail(user.email)
        setStoredEmail(user.email)
      }

      try {
        const data = await callFunction<AccountData>('account', {
          userId: user.id,
          email: user.email ?? undefined,
          sessionId: ctx?.sessionId || sessionId || undefined,
        })
        applyAccountFlags(data)
        if (data.sessionId) {
          setSessionId(data.sessionId)
          setStoredSessionId(data.sessionId)
        }
      } catch {
        // ignore
      }

      if (ctx?.celebrity) {
        setCelebrity({
          name: ctx.celebrity.name,
          score: ctx.celebrity.score,
          traits: ctx.celebrity.traits ?? [],
          celebrity_domain: ctx.celebrity.celebrity_domain ?? '',
          celebrity_style_description: ctx.celebrity.celebrity_style_description ?? '',
          fun_fact: ctx.celebrity.fun_fact ?? '',
        })
      }
      if (ctx?.photoPreview) setPhotoPreview(ctx.photoPreview)
      if (ctx?.celebrityPhoto) setCelebrityPhoto(ctx.celebrityPhoto)
      if (ctx?.analysisId) setAnalysisId(ctx.analysisId)
      if (ctx?.creationMode) setCreationMode(ctx.creationMode)
      if (ctx?.basePhoto) setBasePhoto(ctx.basePhoto)
      if (typeof ctx?.userHeightCm === 'number') setUserHeightCm(ctx.userHeightCm)
      if (ctx?.appMode === 'match' || ctx?.appMode === 'custom') setAppMode(ctx.appMode)

      // Compte avec crédits ou accès illimité : révélation directe
      try {
        const data = await callFunction<AccountData>('account', {
          userId: user.id,
          email: user.email ?? undefined,
        })
        applyAccountFlags(data)
        if (accountCanRevealTwin(data)) {
          goTo((ctx?.appMode ?? appMode) === 'match' ? 'result' : 'customize')
          return
        }
      } catch {
        // ignore
      }

      if (ctx?.celebrity) {
        goTo('payment')
      } else {
        goTo('modeChoice')
      }
    }

    void resumeAfterGoogle()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot OAuth return
  }, [])

  // Retour Stripe Checkout → confirmer le paiement et reprendre le funnel
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const checkout = params.get('checkout')
    const checkoutSessionId = params.get('session_id')

    if (checkout === 'cancel') {
      const ctx = readCheckoutReturnContext()
      if (ctx?.celebrity) setCelebrity(ctx.celebrity as CelebrityResult)
      if (ctx?.photoPreview) setPhotoPreview(ctx.photoPreview)
      if (ctx?.analysisId) setAnalysisId(ctx.analysisId)
      if (ctx?.generationId) setGenerationId(ctx.generationId)
      if (ctx?.creationMode) setCreationMode(ctx.creationMode)
      if (ctx?.basePhoto) setBasePhoto(ctx.basePhoto)
      if (typeof ctx?.userHeightCm === 'number') setUserHeightCm(ctx.userHeightCm)
      if (ctx?.appMode === 'match' || ctx?.appMode === 'custom') setAppMode(ctx.appMode)
      if (ctx?.celebrity) goTo('payment', ctx.appMode === 'custom' ? 'custom' : ctx.appMode === 'match' ? 'match' : undefined)
      window.history.replaceState({}, '', window.location.pathname)
      return
    }

    if (checkout !== 'success' || !checkoutSessionId?.startsWith('cs_')) return

    let cancelled = false

    async function resumeAfterCheckout() {
      try {
        const res = await fetch(
          `/api/stripe/confirm?session_id=${encodeURIComponent(checkoutSessionId!)}`
        )
        const data = (await res.json()) as {
          creditsBalance?: number
          sessionId?: string
          error?: string
        }
        if (!res.ok) throw new Error(data.error || 'Confirmation paiement échouée')
        if (cancelled) return

        const ctx = readCheckoutReturnContext()
        clearCheckoutReturnContext()

        if (data.sessionId) {
          setSessionId(data.sessionId)
          setStoredSessionId(data.sessionId)
        }
        if (typeof data.creditsBalance === 'number') {
          setCreditsBalance(data.creditsBalance)
        }
        setHasUnlocked(true)

        if (ctx?.celebrity) {
          setCelebrity(ctx.celebrity as CelebrityResult)
        }
        if (ctx?.photoPreview) setPhotoPreview(ctx.photoPreview)
        if (ctx?.analysisId) setAnalysisId(ctx.analysisId)
        if (ctx?.generationId) setGenerationId(ctx.generationId)
        if (ctx?.creationMode) setCreationMode(ctx.creationMode)
        if (ctx?.basePhoto) setBasePhoto(ctx.basePhoto)
        if (typeof ctx?.userHeightCm === 'number') setUserHeightCm(ctx.userHeightCm)
        if (ctx?.appMode === 'match' || ctx?.appMode === 'custom') {
          setAppMode(ctx.appMode)
        }

        // Ne jamais afficher un step qui exige `celebrity` si le snapshot est absent
        // (sinon écran blanc : le rendu est conditionné par `celebrity && …`).
        const mode = ctx?.appMode ?? appMode
        if (ctx?.celebrity && mode === 'match') {
          goTo('result', 'match')
        } else if (ctx?.celebrity && mode === 'custom') {
          goTo('customize', 'custom')
        } else {
          goTo('modeChoice', null)
        }
      } catch (err) {
        console.error('[checkout return]', err)
      } finally {
        window.history.replaceState({}, '', window.location.pathname)
      }
    }

    resumeAfterCheckout()
    return () => { cancelled = true }
  }, [appMode])

  const handleInsufficientCredits = useCallback(() => {
    if (unlimitedAccess) return
    goTo('payment')
  }, [unlimitedAccess])

  const handleContinueToScene = useCallback(() => {
    goTo('customize')
  }, [])

  const handleSceneSubmit = useCallback((request: GenerationRequest) => {
    if (request.userHeightCm) {
      setUserHeightCm(request.userHeightCm)
      setStoredUserHeightCm(request.userHeightCm)
    }
    setGenerationRequest(request)
    goTo('generating')
  }, [])

  const handleBackToCustomize = useCallback(() => {
    goTo('customize')
  }, [])

  const handleGenerationComplete = useCallback((imageBase64: string, genId?: string, newBalance?: number) => {
    setGeneratedImage(imageBase64)
    if (genId) setGenerationId(genId)
    if (typeof newBalance === 'number') setCreditsBalance(newBalance)
    else {
      refreshAccount({
        sessionId: sessionId || undefined,
        userId,
        email: userEmail,
      })
    }
    setHasCompletedGeneration()
    goTo('success')
  }, [sessionId, userId, userEmail, refreshAccount])

  const handleReset = useCallback(() => {
    setPhotoPreview('')
    setCelebrity(null)
    setCelebrityPhoto('')
    setGeneratedImage('')
    setAnalysisId('')
    setGenerationId('')
    setGenerationRequest(null)
    setCreationMode(undefined)
    setBasePhoto('')
    setHasUnlocked(false)
    goTo('modeChoice', null)
  }, [goTo])

  /** Régénérer : on garde star, mode, photo source et options de scène. */
  const handleRegenerate = useCallback(() => {
    setGeneratedImage('')
    goTo('customize')
  }, [])

  /** Retour arrière sans perdre ce qui est déjà renseigné (étapes du choix de mode). */
  const handleBack = useCallback(() => {
    if (step === 'basePhoto' || step === 'customUpload') {
      goTo('customCelebrity')
      return
    }
    if (step === 'customCelebrity') {
      goTo('creationChoice')
      return
    }
    if (step === 'creationChoice') {
      handleReset()
      return
    }
    handleReset()
  }, [step, handleReset, goTo])

  // ── Back button visibility ─────────────────────────────────────────────────
  const noBack: Step[] = ['modeChoice', 'hero', 'analyzing', 'generating', 'signup', 'payment', 'result', 'customize', 'success']
  const showBackButton = !noBack.includes(step)

  /** photo_edit : la photo de base remplace le selfie comme image principale. */
  const generationImage =
    appMode === 'custom' && creationMode === 'photo_edit' && basePhoto
      ? basePhoto
      : photoPreview

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
      <header className="relative z-20 max-w-[390px] mx-auto w-full px-5 pt-5 pb-4">
        <div className="relative flex items-center justify-between min-h-[44px]">
          <div className="flex items-center gap-2.5 min-w-0">
            <AnimatePresence>
              {showBackButton && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}
                  onClick={handleBack}
                  aria-label="Revenir à l'étape précédente"
                  className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  whileHover={{ borderColor: 'rgba(212,175,55,0.4)', scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <ArrowLeft size={15} className="text-[#A0A0A0]" />
                </motion.button>
              )}
            </AnimatePresence>

            <motion.button
              type="button"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              onClick={handleReset}
              aria-label="Retour à l'accueil"
              className="min-w-0 text-left"
            >
              <StarFusionLogo variant="duo" size="navbar" />
            </motion.button>
          </div>

          {userId ? (
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex-shrink-0 max-w-[160px]"
              style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', color: '#D4AF37' }}
              title={userFirstName || userEmail || 'Mon espace'}
            >
              <LayoutDashboard size={13} className="flex-shrink-0" />
              <span className="truncate">{userFirstName || 'Mon espace'}</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A0A0A0' }}
            >
              <LogIn size={13} />
              Connexion
            </Link>
          )}
        </div>
      </header>

      {/* ── Stepper (masqué sur l'accueil : le parcours n'est pas encore choisi) ── */}
      {step !== 'modeChoice' && (
        <div className="relative z-20 px-5 max-w-[390px] mx-auto w-full">
          {(() => {
            const stepper = getStepperState(step, userId, creditsBalance, appMode, unlimitedAccess)
            return <Stepper labels={stepper.labels} currentStep={stepper.index} />
          })()}
        </div>
      )}

      {/* ── Main ── */}
      <main className="relative z-10 flex-1 flex flex-col pb-10 pt-2 max-w-[390px] mx-auto w-full">
        <AnimatePresence mode="wait">

          {step === 'modeChoice' && (
            <motion.div key="modeChoice" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <ModeChoice onSelectMatch={handleSelectMatchMode} onSelectCustom={handleSelectCustomMode} />
            </motion.div>
          )}

          {step === 'hero' && (
            <motion.div key="hero" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <HeroSection onPhotoSelected={handlePhotoSelected} />
            </motion.div>
          )}

          {step === 'creationChoice' && (
            <motion.div key="creationChoice" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <CreationModeChoice
                celebrityName={celebrity?.name}
                celebrityImageSrc={celebrityPhoto || undefined}
                value={creationMode}
                onSubmit={handleCreationModeSubmit}
              />
            </motion.div>
          )}

          {step === 'customCelebrity' && (
            <motion.div key="customCelebrity" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <CustomCelebrityForm
                preview={photoPreview || undefined}
                initialName={celebrity?.name}
                initialDomain={celebrity?.celebrity_domain}
                initialPhoto={celebrityPhoto}
                initialHeightCm={userHeightCm}
                onSubmit={handleCustomCelebritySubmit}
              />
            </motion.div>
          )}

          {step === 'customUpload' && (
            <motion.div key="customUpload" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <CustomPhotoUpload
                celebrityName={celebrity?.name}
                initialPreview={photoPreview || undefined}
                onPhotoSelected={handleCustomPhotoSelected}
                onContinueExisting={photoPreview ? continueAfterCustomPhoto : undefined}
              />
            </motion.div>
          )}

          {step === 'basePhoto' && celebrity && (
            <motion.div key="basePhoto" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <BasePhotoUpload
                celebrityName={celebrity.name}
                initialPhoto={basePhoto || undefined}
                onSubmit={handleBasePhotoSubmit}
              />
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
                userId={userId}
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
                score={appMode === 'custom' ? undefined : celebrity.score}
                sessionId={sessionId}
                onBeforeGoogle={() => {
                  saveOAuthReturnContext({
                    intent: 'funnel',
                    sessionId: sessionId || undefined,
                    appMode,
                    celebrity: celebrity
                      ? {
                          name: celebrity.name,
                          score: celebrity.score,
                          traits: celebrity.traits,
                          celebrity_domain: celebrity.celebrity_domain,
                          celebrity_style_description: celebrity.celebrity_style_description,
                          fun_fact: celebrity.fun_fact,
                        }
                      : null,
                    celebrityPhoto: celebrityPhoto || undefined,
                    photoPreview: photoPreview || undefined,
                    analysisId: analysisId || undefined,
                    creationMode,
                    basePhoto: basePhoto || undefined,
                    userHeightCm,
                  })
                }}
                onSuccess={(_firstName, email, meta) => handleSignupComplete(email, meta)}
              />
            </motion.div>
          )}

          {step === 'payment' && celebrity && (
            <motion.div key="payment" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <PaymentScreen
                sessionId={sessionId}
                userId={userId}
                email={userEmail}
                generationId={generationId}
                score={appMode === 'custom' ? undefined : celebrity.score}
                creditsBalance={creditsBalance}
                onSuccess={handlePaymentSuccess}
                returnTo="home"
                appMode={appMode}
                checkoutContext={{
                  celebrity,
                  photoPreview,
                  analysisId: analysisId || undefined,
                  creationMode,
                  basePhoto: basePhoto || undefined,
                  userHeightCm,
                }}
              />
            </motion.div>
          )}

          {step === 'result' && celebrity && appMode === 'match' && (
            <motion.div key="result" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <AnalysisResult
                preview={photoPreview}
                celebrity={celebrity}
                onGenerate={handleContinueToScene}
                onReset={handleReset}
              />
            </motion.div>
          )}

          {step === 'customize' && celebrity && (
            <motion.div key="customize" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <PhotoSceneCustomizer
                celebrity={celebrity}
                creditsBalance={creditsBalance}
                hasUnlimitedAccess={unlimitedAccess}
                creationMode={appMode === 'custom' ? (creationMode ?? DEFAULT_CREATION_MODE) : DEFAULT_CREATION_MODE}
                basePhoto={basePhoto || undefined}
                userPhoto={photoPreview || undefined}
                initialRequest={generationRequest ?? undefined}
                onChangeBasePhoto={handleChangeBasePhoto}
                onChangeUserPhoto={appMode === 'custom' ? handleChangeUserPhoto : undefined}
                enableSceneSource={appMode === 'custom'}
                collectUserHeight={appMode === 'match'}
                initialUserHeightCm={userHeightCm}
                onSubmit={handleSceneSubmit}
                onNeedCredits={handleInsufficientCredits}
              />
            </motion.div>
          )}

          {step === 'generating' && celebrity && generationRequest && (
            <motion.div key="generating" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <GenerationLoader
                preview={generationImage}
                imageBase64={generationImage}
                celebrity={celebrity}
                celebrityImageBase64={celebrityPhoto || undefined}
                generationRequest={generationRequest}
                creationMode={appMode === 'custom' ? (creationMode ?? DEFAULT_CREATION_MODE) : DEFAULT_CREATION_MODE}
                userHeightCm={userHeightCm ?? generationRequest.userHeightCm}
                sessionId={sessionId}
                userId={userId}
                email={userEmail}
                analysisId={analysisId}
                onComplete={handleGenerationComplete}
                onRetry={handleBackToCustomize}
                onInsufficientCredits={handleInsufficientCredits}
              />
            </motion.div>
          )}

          {step === 'success' && celebrity && (
            <motion.div key="success" className="px-5"
              variants={slideVariants} initial="enter" animate="center" exit="exit">
              <SuccessScreen
                preview={generationImage}
                generatedImage={generatedImage}
                celebrity={celebrity}
                celebrityImageSrc={celebrityPhoto || undefined}
                creditsBalance={creditsBalance}
                hasUnlimitedAccess={unlimitedAccess}
                showMatchScore={appMode !== 'custom'}
                onRegenerate={handleRegenerate}
                onReset={handleReset}
              />
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 text-center py-5 px-5 space-y-2">
        <div className="h-px w-full mb-4"
          style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent)' }} />
        <p className="text-[#383838] text-[11px] tracking-wide">
          StarFusion · Pour le divertissement uniquement
        </p>
        <p className="text-[#383838] text-[10px] flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <Link href="/legal/cgu" className="hover:text-[#606060]">CGU</Link>
          <span>·</span>
          <Link href="/legal/confidentialite" className="hover:text-[#606060]">Confidentialité</Link>
          <span>·</span>
          <Link href="/legal/remboursement" className="hover:text-[#606060]">Remboursement</Link>
        </p>
      </footer>
    </div>
  )
}
