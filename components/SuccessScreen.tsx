'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download,
  Share2,
  RefreshCw,
  Crown,
  Check,
  LayoutDashboard,
  Copy,
  Link2,
  Mail,
  MessageCircle,
  X,
} from 'lucide-react'
import GoldParticles from './GoldParticles'
import type { CelebrityResult } from '@/lib/types'
import { resolveCelebrityImageUrl } from '@/lib/celebrity-image'

interface SuccessScreenProps {
  preview: string
  generatedImage: string
  celebrity: CelebrityResult
  /** Photo de la star pour le fallback côte-à-côte */
  celebrityImageSrc?: string
  creditsBalance?: number
  hasUnlimitedAccess?: boolean
  /** false pour le mode "Choisis ta star" — pas de score de ressemblance à afficher */
  showMatchScore?: boolean
  /** Relance une génération en gardant star, mode, photo source et options */
  onRegenerate?: () => void
  onReset: () => void
}

export default function SuccessScreen({ preview, generatedImage, celebrity, celebrityImageSrc, creditsBalance, hasUnlimitedAccess = false, showMatchScore = true, onRegenerate, onReset }: SuccessScreenProps) {
  const { name, score } = celebrity
  const [shared, setShared] = useState(false)
  const [shareLabel, setShareLabel] = useState('Partagé !')
  const [downloaded, setDownloaded] = useState(false)
  const [fetchedCelebUrl, setFetchedCelebUrl] = useState<string | null>(null)
  const [shareSheetOpen, setShareSheetOpen] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)
  const shareFileRef = useRef<File | null>(null)

  const shareTitle = `Ma photo avec ${name} — StarFusion`
  const shareText = `Regarde ma photo avec ${name} sur StarFusion ✨`
  const shareUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/` : 'https://starfusion.online/'

  useEffect(() => {
    if (celebrityImageSrc || generatedImage) return
    let cancelled = false
    resolveCelebrityImageUrl(name).then((url) => {
      if (!cancelled) setFetchedCelebUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [name, celebrityImageSrc, generatedImage])

  const celebSrc = celebrityImageSrc || fetchedCelebUrl

  function imageToDataUrl(src: string): string {
    if (src.startsWith('data:')) return src
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:')) return src
    return `data:image/jpeg;base64,${src}`
  }

  function downloadFileName(): string {
    const slug = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
    return `starfusion-${slug || 'photo'}.jpg`
  }

  async function getImageBlob(): Promise<Blob> {
    const src = imageToDataUrl(generatedImage)
    const res = await fetch(src)
    const blob = await res.blob()
    const type = blob.type.startsWith('image/') ? blob.type : 'image/jpeg'
    return blob.type === type ? blob : new Blob([blob], { type })
  }

  // Prépare le File dès l’écran succès — iOS exige un share synchrone au clic
  useEffect(() => {
    if (!generatedImage) {
      shareFileRef.current = null
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const blob = await getImageBlob()
        const mime = blob.type.startsWith('image/') ? blob.type : 'image/jpeg'
        const ext = mime.includes('png') ? '.png' : '.jpg'
        const file = new File(
          [blob],
          downloadFileName().replace(/\.jpg$/i, ext),
          { type: mime },
        )
        if (!cancelled) shareFileRef.current = file
      } catch {
        if (!cancelled) shareFileRef.current = null
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild when image/name change
  }, [generatedImage, name])

  /** Vraie feuille système (iOS / Android / Safari) — comme AirDrop, Messages, WhatsApp… */
  function canUseSystemShareSheet(): boolean {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
    const ua = navigator.userAgent || ''
    // Chrome / Edge desktop : share(files) télécharge au lieu d’ouvrir une feuille
    const isChromium = /Chrome|Chromium|Edg\//i.test(ua) && !/OPR\//i.test(ua)
    const isMobile =
      /Android|iPhone|iPad|iPod/i.test(ua) ||
      (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile === true ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    if (isMobile) return true
    if (/Safari/i.test(ua) && !isChromium) return true // Safari macOS
    return false
  }

  async function handleDownload() {
    if (!generatedImage) return
    try {
      const blob = shareFileRef.current ?? (await getImageBlob())
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = downloadFileName()
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
      setDownloaded(true)
      setTimeout(() => setDownloaded(false), 2500)
    } catch {
      window.open(imageToDataUrl(generatedImage), '_blank', 'noopener,noreferrer')
    }
  }

  function flashShare(label: string) {
    setShareLabel(label)
    setShared(true)
    setTimeout(() => setShared(false), 2800)
  }

  async function blobAsPng(blob: Blob): Promise<Blob> {
    if (blob.type === 'image/png') return blob
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unavailable')
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const png = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    )
    if (!png) throw new Error('png encode failed')
    return png
  }

  async function copyImageToClipboard(blob: Blob): Promise<boolean> {
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') return false
    try {
      const png = await blobAsPng(blob)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
      return true
    } catch {
      try {
        const type = blob.type.startsWith('image/') ? blob.type : 'image/jpeg'
        await navigator.clipboard.write([new ClipboardItem({ [type]: blob })])
        return true
      } catch {
        return false
      }
    }
  }

  async function copyTextToClipboard(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch {
      // fall through
    }
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.setAttribute('readonly', '')
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      el.remove()
      return ok
    } catch {
      return false
    }
  }

  async function openSystemShareSheet(): Promise<boolean> {
    if (typeof navigator.share !== 'function') return false
    const file = shareFileRef.current
    const withFiles = file ? { title: shareTitle, text: shareText, files: [file] } : null
    if (withFiles && (!navigator.canShare || navigator.canShare(withFiles))) {
      try {
        await navigator.share(withFiles)
        return true
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return true // annulé = OK
      }
    }
    try {
      await navigator.share({ title: shareTitle, text: shareText, url: shareUrl })
      return true
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return true
      return false
    }
  }

  async function handleShare() {
    if (!generatedImage || shareBusy) return
    setShareBusy(true)
    try {
      // Mobile / Safari : feuille native (AirDrop, Messages, WhatsApp, Copier…)
      if (canUseSystemShareSheet()) {
        // Si le File n’est pas prêt, le préparer encore dans le geste utilisateur
        if (!shareFileRef.current) {
          try {
            const blob = await getImageBlob()
            const mime = blob.type.startsWith('image/') ? blob.type : 'image/jpeg'
            shareFileRef.current = new File(
              [blob],
              downloadFileName().replace(/\.jpg$/i, mime.includes('png') ? '.png' : '.jpg'),
              { type: mime },
            )
          } catch {
            // continue sans fichier
          }
        }
        const ok = await openSystemShareSheet()
        if (ok) {
          flashShare('Partagé !')
          return
        }
      }
      // Desktop (Chrome…) : panneau StarFusion façon « share sheet »
      setShareSheetOpen(true)
    } finally {
      setShareBusy(false)
    }
  }

  async function shareActionCopyPhoto() {
    try {
      const blob = shareFileRef.current ?? (await getImageBlob())
      if (await copyImageToClipboard(blob)) {
        flashShare('Photo copiée !')
        setShareSheetOpen(false)
        return
      }
      flashShare('Copie impossible')
    } catch {
      flashShare('Copie impossible')
    }
  }

  async function shareActionCopyLink() {
    const ok = await copyTextToClipboard(`${shareText}\n${shareUrl}`)
    flashShare(ok ? 'Lien copié !' : 'Copie impossible')
    if (ok) setShareSheetOpen(false)
  }

  function shareActionWhatsApp() {
    const url = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`
    window.open(url, '_blank', 'noopener,noreferrer')
    flashShare('WhatsApp')
    setShareSheetOpen(false)
  }

  function shareActionMessages() {
    window.location.href = `sms:&body=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`
    flashShare('Messages')
    setShareSheetOpen(false)
  }

  function shareActionMail() {
    window.location.href = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`
    flashShare('Mail')
    setShareSheetOpen(false)
  }

  async function shareActionMore() {
    const ok = await openSystemShareSheet()
    if (ok) {
      flashShare('Partagé !')
      setShareSheetOpen(false)
      return
    }
    flashShare('Partage indisponible')
  }

  async function shareActionSave() {
    await handleDownload()
    setShareSheetOpen(false)
  }

  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1 } },
  }
  const item = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center gap-6 w-full"
    >
      {/* ── Header ── */}
      <motion.div variants={item} className="text-center space-y-2 relative w-full">
        <GoldParticles active />

        <div className="flex justify-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-2"
            style={{ background: 'linear-gradient(135deg,#D4AF37,#F0D060)', boxShadow: '0 0 32px rgba(212,175,55,0.5)' }}
          >
            <Crown size={26} className="text-black" />
          </motion.div>
        </div>

        <p className="text-[#D4AF37] text-xs uppercase tracking-widest font-bold">Accès débloqué</p>
        <h2
          className="text-4xl font-black text-white leading-tight"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Ta photo avec{' '}
          <span
            style={{
              background: 'linear-gradient(135deg,#D4AF37,#F0D060)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {name}
          </span>
        </h2>
        <p className="text-[#808080] text-sm">
          {showMatchScore ? `Score ${score} / 100 · ` : ''}Version HD sans watermark
        </p>
      </motion.div>

      {/* ── Photo générée ── */}
      <motion.div variants={item} className="w-full relative">
        {/* Glow */}
        <div
          className="absolute inset-x-6 inset-y-4 rounded-3xl blur-3xl"
          style={{ background: 'radial-gradient(ellipse, rgba(212,175,55,0.3) 0%, rgba(107,33,168,0.2) 60%, transparent 100%)' }}
        />

        <div
          className="relative w-full rounded-3xl overflow-hidden"
          style={{
            aspectRatio: '4/3',
            border: '2px solid rgba(212,175,55,0.5)',
            boxShadow: '0 0 60px rgba(212,175,55,0.2), 0 20px 60px rgba(0,0,0,0.8)',
          }}
        >
          {/* Generated image (real) or fallback side-by-side mock */}
          {generatedImage ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={generatedImage}
                alt={`Toi avec ${name}`}
                className="absolute inset-0 w-full h-full object-cover"
              />
              {/* Subtle vignette */}
              <div
                className="absolute inset-0"
                style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 60%, rgba(0,0,0,0.4) 100%)' }}
              />
            </>
          ) : (
            <>
              {/* Fallback: side-by-side mock */}
              <div
                className="absolute inset-0 flex"
                style={{ background: 'linear-gradient(160deg,#0d0d1a 0%,#1a0533 50%,#0d1a07 100%)' }}
              >
                <div className="relative w-1/2 h-full overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Toi" className="w-full h-full object-cover" />
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, transparent 60%, rgba(0,0,0,0.6) 100%)' }} />
                </div>
                <div className="relative w-1/2 h-full bg-[#1a0533]">
                  {celebSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={celebSrc} alt={name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full animate-pulse" style={{ background: 'linear-gradient(160deg,#2d1b69 0%,#6B21A8 60%,#1a0533 100%)' }} />
                  )}
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to left, transparent 60%, rgba(0,0,0,0.6) 100%)' }} />
                </div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <motion.div
                    animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                    style={{ background: 'linear-gradient(135deg,#D4AF37,#F0D060)', boxShadow: '0 0 20px rgba(212,175,55,0.6)' }}
                  >✨</motion.div>
                </div>
              </div>
              <div className="absolute bottom-3 left-3">
                <div className="px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm text-[10px] font-bold text-white/70">Toi</div>
              </div>
              <div className="absolute bottom-3 right-3">
                <div className="px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm text-[10px] font-bold text-[#D4AF37]">{name}</div>
              </div>
            </>
          )}

          {/* HD badge */}
          <div className="absolute top-3 right-3">
            <div
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-black text-[10px] font-black"
              style={{ background: 'linear-gradient(135deg,#D4AF37,#F0D060)' }}
            >
              <Crown size={9} />
              HD
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Actions ── */}
      <motion.div variants={item} className="w-full grid grid-cols-2 gap-3">
        <motion.button
          type="button"
          onClick={handleDownload}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-black text-base"
          style={{ background: 'linear-gradient(135deg,#D4AF37,#F0D060)', boxShadow: '0 4px 20px rgba(212,175,55,0.3)' }}
        >
          <AnimatePresence mode="wait">
            {downloaded ? (
              <motion.span key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                <Check size={16} /> Sauvegardé !
              </motion.span>
            ) : (
              <motion.span key="dl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                <Download size={16} /> Télécharger
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        <motion.button
          type="button"
          disabled={shareBusy}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void handleShare()
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base disabled:opacity-60"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1.5px solid rgba(255,255,255,0.1)',
            color: '#A0A0A0',
          }}
        >
          <AnimatePresence mode="wait">
            {shared ? (
              <motion.span key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-[#D4AF37]">
                <Check size={16} /> {shareLabel}
              </motion.span>
            ) : (
              <motion.span key="sh" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                <Share2 size={16} /> Partager
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </motion.div>

      {/* ── Score badge (mode "jumeau" uniquement) ── */}
      {showMatchScore ? (
        <motion.div
          variants={item}
          className="w-full rounded-2xl p-4 flex items-center gap-4"
          style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.15)' }}
        >
          <motion.div
            animate={{ boxShadow: ['0 0 0 0 rgba(212,175,55,0.4)', '0 0 0 10px rgba(212,175,55,0)', '0 0 0 0 rgba(212,175,55,0.4)'] }}
            transition={{ duration: 2.5, repeat: Infinity }}
            className="w-14 h-14 rounded-xl flex-shrink-0 flex flex-col items-center justify-center"
            style={{ background: 'linear-gradient(135deg,rgba(212,175,55,0.15),rgba(212,175,55,0.08))', border: '1px solid rgba(212,175,55,0.3)' }}
          >
            <span className="text-[#D4AF37] text-xl font-black leading-none">{score}</span>
            <span className="text-[#D4AF37]/50 text-[9px] font-bold">/100</span>
          </motion.div>
          <div>
            <p className="text-white text-sm font-bold">Score de ressemblance StarFusion</p>
            <p className="text-[#606060] text-xs mt-0.5">
              Calculé à partir de l&apos;analyse morphologique de ton visage
            </p>
          </div>
        </motion.div>
      ) : (
        <motion.div
          variants={item}
          className="w-full rounded-2xl p-4 flex items-center gap-4"
          style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.18)' }}
        >
          <div
            className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,rgba(168,85,247,0.18),rgba(168,85,247,0.08))', border: '1px solid rgba(168,85,247,0.3)' }}
          >
            <Crown size={22} className="text-[#A855F7]" />
          </div>
          <div>
            <p className="text-white text-sm font-bold">Génération réussie</p>
            <p className="text-[#606060] text-xs mt-0.5">
              Ta photo personnalisée avec {name} est prête
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Crédits restants + espace ── */}
      <motion.div variants={item} className="w-full flex flex-col gap-2">
        {hasUnlimitedAccess ? (
          <p className="text-center text-[#606060] text-xs">
            <span className="text-[#D4AF37] font-bold">Accès illimité</span>
            {' '}· régénère sans consommer de crédits
          </p>
        ) : typeof creditsBalance === 'number' && (
          <p className="text-center text-[#606060] text-xs">
            Il te reste{' '}
            <span className="text-[#D4AF37] font-bold">{creditsBalance} crédit{creditsBalance !== 1 ? 's' : ''}</span>
            {' '}pour de nouvelles générations
          </p>
        )}
        {onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#A0A0A0',
            }}
          >
            <RefreshCw size={15} />
            Régénérer avec les mêmes réglages
          </button>
        )}

        <Link
          href="/dashboard"
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold"
          style={{
            background: 'rgba(212,175,55,0.08)',
            border: '1px solid rgba(212,175,55,0.25)',
            color: '#D4AF37',
          }}
        >
          <LayoutDashboard size={15} />
          Mon espace · historique & crédits
        </Link>
      </motion.div>

      {/* ── Recommencer ── */}
      <motion.button
        variants={item}
        onClick={onReset}
        className="flex items-center gap-2 text-[#505050] hover:text-[#D4AF37] transition-colors py-2 text-sm"
      >
        <RefreshCw size={13} />
        Recommencer avec une autre photo
      </motion.button>

      {/* ── Feuille de partage (desktop / fallback) ── */}
      <AnimatePresence>
        {shareSheetOpen && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              aria-label="Fermer"
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setShareSheetOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Partager"
              initial={{ y: 48, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="relative z-10 w-full max-w-[390px] mx-3 mb-3 sm:mb-0 rounded-[28px] overflow-hidden"
              style={{
                background: 'linear-gradient(165deg,#1A1A1A 0%,#111111 100%)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.65)',
              }}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/15" />
              </div>

              <div className="px-5 pb-2 flex items-start gap-3">
                <div
                  className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0"
                  style={{ border: '1px solid rgba(212,175,55,0.35)' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={generatedImage} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-white text-sm font-semibold truncate">Photo avec {name}</p>
                  <p className="text-[#707070] text-xs mt-0.5">StarFusion · Partager</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShareSheetOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[#808080] hover:text-white"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="px-5 pt-3 pb-2">
                <p className="text-[#606060] text-[10px] uppercase tracking-widest font-semibold mb-3">
                  Envoyer vers
                </p>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    {
                      key: 'wa',
                      label: 'WhatsApp',
                      onClick: shareActionWhatsApp,
                      bg: '#25D366',
                      icon: <MessageCircle size={20} className="text-white" />,
                    },
                    {
                      key: 'sms',
                      label: 'Messages',
                      onClick: shareActionMessages,
                      bg: '#34C759',
                      icon: <MessageCircle size={20} className="text-white" />,
                    },
                    {
                      key: 'mail',
                      label: 'Mail',
                      onClick: shareActionMail,
                      bg: '#0A84FF',
                      icon: <Mail size={20} className="text-white" />,
                    },
                    {
                      key: 'more',
                      label: 'Plus',
                      onClick: () => { void shareActionMore() },
                      bg: 'rgba(255,255,255,0.12)',
                      icon: <Share2 size={20} className="text-white" />,
                    },
                  ].map((app) => (
                    <button
                      key={app.key}
                      type="button"
                      onClick={app.onClick}
                      className="flex flex-col items-center gap-1.5 focus:outline-none"
                    >
                      <span
                        className="w-14 h-14 rounded-[18px] flex items-center justify-center"
                        style={{ background: app.bg }}
                      >
                        {app.icon}
                      </span>
                      <span className="text-[11px] text-[#A0A0A0] font-medium">{app.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="px-5 pt-4 pb-5 space-y-2">
                <p className="text-[#606060] text-[10px] uppercase tracking-widest font-semibold mb-1">
                  Actions
                </p>
                {[
                  {
                    key: 'copy-photo',
                    label: 'Copier la photo',
                    icon: <Copy size={16} />,
                    onClick: () => { void shareActionCopyPhoto() },
                  },
                  {
                    key: 'copy-link',
                    label: 'Copier le lien',
                    icon: <Link2 size={16} />,
                    onClick: () => { void shareActionCopyLink() },
                  },
                  {
                    key: 'save',
                    label: 'Enregistrer l’image',
                    icon: <Download size={16} />,
                    onClick: () => { void shareActionSave() },
                  },
                ].map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    onClick={action.onClick}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-semibold text-white/90"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <span className="text-[#D4AF37]">{action.icon}</span>
                    {action.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
