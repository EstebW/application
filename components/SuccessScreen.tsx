'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Share2, RefreshCw, Crown, Check, LayoutDashboard } from 'lucide-react'
import GoldParticles from './GoldParticles'
import type { CelebrityResult } from '@/lib/types'

interface SuccessScreenProps {
  preview: string
  generatedImage: string
  celebrity: CelebrityResult
  creditsBalance?: number
  onReset: () => void
}

export default function SuccessScreen({ preview, generatedImage, celebrity, creditsBalance, onReset }: SuccessScreenProps) {
  const { name, score } = celebrity
  const [shared, setShared] = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  function handleShare() {
    setShared(true)
    setTimeout(() => setShared(false), 2500)
  }
  function handleDownload() {
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 2500)
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
          {score}% de ressemblance · Version HD sans watermark
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
                <div className="relative w-1/2 h-full" style={{ background: 'linear-gradient(160deg,#2d1b69 0%,#6B21A8 60%,#1a0533 100%)' }}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-7xl font-black select-none" style={{ color: 'rgba(255,255,255,0.08)', fontFamily: "'Playfair Display', Georgia, serif" }}>{name[0]}</span>
                  </div>
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
          onClick={handleShare}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1.5px solid rgba(255,255,255,0.1)',
            color: '#A0A0A0',
          }}
        >
          <AnimatePresence mode="wait">
            {shared ? (
              <motion.span key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-[#D4AF37]">
                <Check size={16} /> Partagé !
              </motion.span>
            ) : (
              <motion.span key="sh" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                <Share2 size={16} /> Partager
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </motion.div>

      {/* ── Score badge ── */}
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
          <span className="text-[#D4AF37]/50 text-[9px] font-bold">%</span>
        </motion.div>
        <div>
          <p className="text-white text-sm font-bold">Ressemblance confirmée</p>
          <p className="text-[#606060] text-xs mt-0.5">
            Moins de 3% des gens dépassent 85% — tu fais partie de l&apos;élite
          </p>
        </div>
      </motion.div>

      {/* ── Crédits restants + espace ── */}
      <motion.div variants={item} className="w-full flex flex-col gap-2">
        {typeof creditsBalance === 'number' && (
          <p className="text-center text-[#606060] text-xs">
            Il te reste{' '}
            <span className="text-[#D4AF37] font-bold">{creditsBalance} crédit{creditsBalance !== 1 ? 's' : ''}</span>
            {' '}pour de nouvelles générations
          </p>
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
    </motion.div>
  )
}
