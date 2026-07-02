'use client'

import { useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Camera, ImageIcon, Sparkles, TrendingUp, Lock, Zap, Clapperboard } from 'lucide-react'

const CELEBS = [
  'Zendaya', 'Ryan Gosling', 'Margot Robbie', 'Tom Holland', 'Dua Lipa',
  'Timothée Chalamet', 'Billie Eilish', 'Harry Styles', 'Anya Taylor-Joy',
  'Jacob Elordi', 'Sydney Sweeney', 'Austin Butler',
]

const RESULTS = [
  { user: 'Sofia, 22 ans', celeb: 'Zendaya',      score: 91, gradient: 'linear-gradient(160deg,#1a0d2e,#4a1060)', initial: 'S' },
  { user: 'Lucas, 28 ans', celeb: 'R. Gosling',   score: 87, gradient: 'linear-gradient(160deg,#0d1a2e,#0d2e4a)', initial: 'L' },
  { user: 'Emma, 19 ans',  celeb: 'A. Taylor-Joy', score: 94, gradient: 'linear-gradient(160deg,#1a2e0d,#2e4a1a)', initial: 'E' },
]

const REASSURANCE = [
  { Icon: Lock,        label: '0 photo conservée' },
  { Icon: Zap,         label: '10 secondes chrono' },
  { Icon: Clapperboard, label: '10 000 stars scannées' },
]

interface HeroSectionProps {
  onPhotoSelected: (file: File, preview: string) => void
}

export default function HeroSection({ onPhotoSelected }: HeroSectionProps) {
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef  = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = (e) => {
        if (e.target?.result) onPhotoSelected(file, e.target.result as string)
      }
      reader.readAsDataURL(file)
    },
    [onPhotoSelected]
  )

  const wrap = {
    hidden: {},
    show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
  }
  const up = {
    hidden: { opacity: 0, y: 32 },
    show:   { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const } },
  }
  const fadeIn = {
    hidden: { opacity: 0 },
    show:   { opacity: 1, transition: { duration: 0.8 } },
  }

  return (
    <motion.div variants={wrap} initial="hidden" animate="show" className="flex flex-col items-center w-full gap-0">

      {/* ── HEADLINE ── */}
      <motion.div variants={up} className="w-full pt-2 pb-8 text-center space-y-5">

        <div className="flex justify-center">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full"
            style={{ background: 'linear-gradient(90deg,rgba(212,175,55,0.08),rgba(212,175,55,0.14),rgba(212,175,55,0.08))', border: '1px solid rgba(212,175,55,0.25)' }}
          >
            <TrendingUp size={11} className="text-[#D4AF37]" />
            <span className="text-[#D4AF37] text-[11px] font-bold tracking-[0.12em] uppercase">
              +50 000 jumeaux célèbres révélés
            </span>
            <motion.div
              className="w-1.5 h-1.5 rounded-full bg-emerald-400"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <h1
            className="font-serif leading-[0.88] tracking-tighter"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            <span className="block text-white font-black" style={{ fontSize: 'clamp(3rem, 14vw, 4.5rem)' }}>
              Découvre ta
            </span>
            <span className="block font-black text-[#D4AF37]" style={{ fontSize: 'clamp(3rem, 14vw, 4.5rem)' }}>
              célébrité
            </span>
            <span className="block text-white font-black" style={{ fontSize: 'clamp(3rem, 14vw, 4.5rem)' }}>
              jumelle
            </span>
          </h1>
        </div>

        <p className="text-[#808080] text-[15px] leading-relaxed max-w-[280px] mx-auto">
          Prends un selfie ou uploade une photo —
          <br />
          l&apos;IA trouve la star qui te ressemble le plus
        </p>
      </motion.div>

      {/* ── DEUX CTA PRINCIPAUX ── */}
      <motion.div variants={up} className="w-full space-y-3">

        {/* Inputs natifs */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="user"
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />

        {/* Bouton 1 — Selfie (primaire) */}
        <motion.button
          onClick={() => cameraRef.current?.click()}
          className="btn-gold w-full py-5 rounded-2xl text-lg font-black tracking-wide flex items-center justify-center gap-3"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          style={{ boxShadow: '0 8px 40px rgba(212,175,55,0.35)' }}
        >
          <Camera size={22} className="flex-shrink-0" />
          Prendre un selfie
        </motion.button>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-[#2A2A2A]" />
          <span className="text-[#505050] text-xs font-medium">ou</span>
          <div className="flex-1 h-px bg-[#2A2A2A]" />
        </div>

        {/* Bouton 2 — Galerie (secondaire) */}
        <motion.button
          onClick={() => galleryRef.current?.click()}
          className="w-full py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-3 transition-all"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1.5px solid rgba(255,255,255,0.1)',
            color: '#A0A0A0',
          }}
          whileHover={{ borderColor: 'rgba(212,175,55,0.4)', color: '#D4AF37', scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
        >
          <ImageIcon size={20} className="flex-shrink-0" />
          Choisir depuis ma galerie
        </motion.button>

        {/* Réassurance */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-1">
          {REASSURANCE.map(({ Icon, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-[11px] font-medium text-[#A0A0A0]">
              <Icon size={13} className="text-[#D4AF37] flex-shrink-0" />
              {label}
            </span>
          ))}
        </div>
      </motion.div>

      {/* ── TICKER ── */}
      <motion.div variants={fadeIn} className="w-full mt-10 rounded-2xl" style={{
        background: 'linear-gradient(90deg,rgba(212,175,55,0.03),rgba(107,33,168,0.03),rgba(212,175,55,0.03))',
        border: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div className="h-px w-full" style={{ background: 'linear-gradient(90deg,transparent,rgba(212,175,55,0.2),transparent)' }} />
        <div className="py-3 overflow-hidden marquee-mask">
          <div className="ticker-track">
            {[...CELEBS, ...CELEBS].map((name, i) => (
              <span key={i} className="flex items-center gap-3 px-5 flex-shrink-0">
                <span className="text-[#D4AF37] text-[11px] font-bold tracking-widest uppercase whitespace-nowrap">{name}</span>
                <span className="w-1 h-1 rounded-full bg-[#D4AF37]/30 flex-shrink-0" />
              </span>
            ))}
          </div>
        </div>
        <div className="h-px w-full" style={{ background: 'linear-gradient(90deg,transparent,rgba(107,33,168,0.25),transparent)' }} />
      </motion.div>

      {/* ── RÉSULTATS RÉCENTS ── */}
      <motion.div variants={up} className="w-full mt-10 space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-[#808080] text-sm font-semibold">Ça vient de se passer</p>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 animate-pulse" />
            <span className="text-[#505050] text-[11px]">En direct</span>
          </div>
        </div>

        <div className="space-y-2.5">
          {RESULTS.map((r, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-4 p-3 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.012)', border: '1px solid rgba(255,255,255,0.035)' }}
            >
              <div
                className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center text-white/30 font-black text-lg"
                style={{ background: r.gradient, border: '1px solid rgba(255,255,255,0.08)', filter: 'blur(0.5px)' }}
              >
                {r.initial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">{r.user}</p>
                <p className="text-[#606060] text-xs mt-0.5 flex items-center gap-1">
                  <Sparkles size={10} className="text-[#D4AF37]" />
                  Jumeau célèbre :{' '}
                  <span className="text-[#D4AF37] font-semibold">{r.celeb}</span>
                </p>
              </div>
              <div
                className="flex-shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center"
                style={{ background: 'linear-gradient(135deg,rgba(212,175,55,0.12),rgba(212,175,55,0.06))', border: '1px solid rgba(212,175,55,0.25)' }}
              >
                <span className="text-[#D4AF37] text-base font-black leading-none">{r.score}</span>
                <span className="text-[#D4AF37]/50 text-[9px] font-bold">%</span>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ── SOCIAL PROOF ── */}
      <motion.div variants={up} className="w-full mt-6 mb-2">
        <div
          className="w-full rounded-2xl p-4"
          style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)' }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2.5 flex-shrink-0">
                {['#4a1060', '#0d2e4a', '#2e4a1a', '#3a2000'].map((bg, i) => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-[#0A0A0A]"
                    style={{ background: `linear-gradient(135deg,${bg},#0A0A0A)` }} />
                ))}
              </div>
              <div>
                <div className="flex items-center gap-0.5 mb-0.5">
                  {[...Array(5)].map((_, i) => <span key={i} className="text-[#D4AF37] text-xs">★</span>)}
                </div>
                <p className="text-[#808080] text-xs font-medium">4,9/5 · +12 000 avis vérifiés</p>
              </div>
            </div>
            <p className="text-sm text-[#A0A0A0] text-center sm:text-right">
              100% gratuit · sans carte bancaire
            </p>
          </div>
        </div>
      </motion.div>

    </motion.div>
  )
}
