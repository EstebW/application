import type { Metadata } from 'next'
import type { CelebrityCreationMode } from './types'

export type FunnelStep =
  | 'modeChoice'
  | 'hero'
  | 'upload'
  | 'analyzing'
  | 'teaser'
  | 'customUpload'
  | 'customCelebrity'
  | 'creationChoice'
  | 'basePhoto'
  | 'signup'
  | 'payment'
  | 'result'
  | 'customize'
  | 'generating'
  | 'success'

export type FunnelAppMode = 'match' | 'custom'

const MATCH_PATHS: Record<string, FunnelStep> = {
  '/jumeau': 'hero',
  '/jumeau/photo': 'upload',
  '/jumeau/analyse': 'analyzing',
  '/jumeau/teaser': 'teaser',
  '/jumeau/compte': 'signup',
  '/jumeau/paiement': 'payment',
  '/jumeau/revelation': 'result',
  '/jumeau/scene': 'customize',
  '/jumeau/generation': 'generating',
  '/jumeau/succes': 'success',
}

const STAR_PATHS: Record<string, FunnelStep> = {
  '/star': 'creationChoice',
  '/star/celebrite': 'customCelebrity',
  '/star/photo': 'customUpload',
  '/star/selfie': 'basePhoto',
  '/star/compte': 'signup',
  '/star/paiement': 'payment',
  '/star/scene': 'customize',
  '/star/generation': 'generating',
  '/star/succes': 'success',
}

const TITLES: Record<FunnelStep, string> = {
  modeChoice: 'Choisis ton expérience',
  hero: 'Trouve ton jumeau',
  upload: 'Ta photo',
  analyzing: 'Analyse faciale',
  teaser: 'Résultat verrouillé',
  signup: 'Créer un compte',
  payment: 'Paiement',
  result: 'Ton jumeau célèbre',
  customize: 'Mise en scène',
  generating: 'Génération de la photo',
  success: 'Photo prête',
  creationChoice: 'Choisis ta star',
  customCelebrity: 'Quelle star',
  customUpload: 'Ta photo',
  basePhoto: 'Selfie',
}

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/'
  return pathname.replace(/\/+$/, '') || '/'
}

export function funnelPath(step: FunnelStep, appMode: FunnelAppMode | null): string {
  if (step === 'modeChoice' || !appMode) return '/'

  if (appMode === 'match') {
    const found = Object.entries(MATCH_PATHS).find(([, s]) => s === step)
    return found?.[0] ?? '/jumeau'
  }

  const found = Object.entries(STAR_PATHS).find(([, s]) => s === step)
  return found?.[0] ?? '/star'
}

export function parseFunnelPath(
  pathname: string,
): { step: FunnelStep; appMode: FunnelAppMode | null } {
  const path = normalizePath(pathname)
  if (path === '/') return { step: 'modeChoice', appMode: null }

  const matchStep = MATCH_PATHS[path]
  if (matchStep) return { step: matchStep, appMode: 'match' }

  const starStep = STAR_PATHS[path]
  if (starStep) return { step: starStep, appMode: 'custom' }

  if (path.startsWith('/jumeau')) return { step: 'hero', appMode: 'match' }
  if (path.startsWith('/star')) return { step: 'creationChoice', appMode: 'custom' }

  return { step: 'modeChoice', appMode: null }
}

export function funnelPageTitle(step: FunnelStep, appMode: FunnelAppMode | null): string {
  const label = TITLES[step] ?? 'StarFusion'
  if (appMode === 'match') return `StarFusion — Jumeau · ${label}`
  if (appMode === 'custom') return `StarFusion — Star · ${label}`
  return `StarFusion — ${label}`
}

export function funnelMetadata(pathname: string): Metadata {
  const { step, appMode } = parseFunnelPath(pathname)
  return { title: funnelPageTitle(step, appMode) }
}

export function funnelPaymentPath(appMode: FunnelAppMode | null): string {
  return appMode === 'custom' ? '/star/paiement' : '/jumeau/paiement'
}

/** Page vue SPA — GA4 / GTM si le tag est présent. */
export function applyFunnelPageView(path: string, title: string) {
  if (typeof window === 'undefined') return
  document.title = title
  const w = window as Window & {
    dataLayer?: Array<Record<string, unknown>>
    gtag?: (...args: unknown[]) => void
  }
  w.dataLayer?.push({
    event: 'page_view',
    page_path: path,
    page_title: title,
  })
  w.gtag?.('event', 'page_view', {
    page_path: path,
    page_title: title,
  })
}

export function funnelOauthReturnPath(appMode: FunnelAppMode | null | undefined): string {
  return `${funnelPaymentPath(appMode === 'custom' ? 'custom' : 'match')}?oauth=funnel`
}

export type FunnelGuardContext = {
  photoPreview: string
  celebrity: { name: string } | null
  generationRequest: unknown
  generatedImage: string
  creationMode?: CelebrityCreationMode
}

export function safeFunnelStep(
  step: FunnelStep,
  appMode: FunnelAppMode | null,
  ctx: FunnelGuardContext,
): FunnelStep {
  if (appMode === 'match') {
    if ((step === 'upload' || step === 'analyzing') && !ctx.photoPreview) return 'hero'
    if (
      (step === 'teaser' ||
        step === 'signup' ||
        step === 'payment' ||
        step === 'result' ||
        step === 'customize' ||
        step === 'generating' ||
        step === 'success') &&
      !ctx.celebrity
    ) {
      return ctx.photoPreview ? 'upload' : 'hero'
    }
    if (step === 'generating' && !ctx.generationRequest) return 'customize'
    if (step === 'success' && !ctx.generatedImage) return 'customize'
  }

  if (appMode === 'custom') {
    if (
      (step === 'customUpload' ||
        step === 'basePhoto' ||
        step === 'signup' ||
        step === 'payment' ||
        step === 'customize' ||
        step === 'generating' ||
        step === 'success') &&
      !ctx.celebrity
    ) {
      return 'creationChoice'
    }
    if (step === 'generating' && !ctx.generationRequest) return 'customize'
    if (step === 'success' && !ctx.generatedImage) return 'customize'
  }

  return step
}
