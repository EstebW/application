'use client'

import { useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Camera, Lock, ChevronRight, Sparkles, TrendingUp } from 'lucide-react'

/* ─── ticker celebrities ─── */
const CELEBS = [
  'Zendaya', 'Ryan Gosling', 'Margot Robbie', 'Tom Holland', 'Dua Lipa',
  'Timothée Chalamet', 'Billie Eilish', 'Harry Styles', 'Anya Taylor-Joy',
  'Jacob Elordi', 'Sydney Sweeney', 'Austin Butler',
]

/* ─── mock result cards ─── */
const RESULTS = [
  {
    user: 'Sofia, 22 ans',
    celeb: 'Zendaya',
    score: 91,
    gradient: 'linear-gradient(160deg,#1a0d2e,#4a1060)',
    initial: 'S',
  },
  {
    user: 'Lucas, 28 ans',
    celeb: 'R. Gosling',
    score: 87,
    gradient: 'linear-gradient(160deg,#0d1a2e,#0d2e4a)',
    initial: 'L',
  },
  {
    user: 'Emma, 19 ans',
    celeb: 'A. Taylor-Joy',
    score: 94,
    gradient: 'linear-gradient(160deg,#1a2e0d,#2e4a1a)',
    initial: 'E',
  },
]

/* ─── feature pills ─── */
const FEATURES = [
  { icon: '🔒', label: 'Photo non stockée' },
  { icon: '⚡', label: 'Résultat en 10s' },
  { icon: '🎯', label: '10 000 célébrités' },
]

interface HeroSectionProps {
  onPhotoSelected: (file: File, preview: string) => void
}

export default function HeroSection({ onPhotoSelected }: HeroSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  /* stagger variants */
  const wrap = {
    hidden: {},
    show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
  }
  const up = {
    hidden: { opacity: 0, y: 32 },
    show:   { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
  }
  const fadeIn = {
    hidden: { opacity: 0 },
    show:   { opacity: 1, transition: { duration: 0.8 } },
  }

  return (
    <motion.div
      variants={wrap}
      initial="hidden"
      animate="show"
      className="flex flex-col items-center w-full gap-0"
    >

      {/* ══════════════════════════════════
          SECTION A — EYEBROW + HEADLINE
      ══════════════════════════════════ */}
      <motion.div variants={up} className="w-full pt-2 pb-8 text-center space-y-5">

        {/* Eyebrow badge */}
        <div className="flex justify-center">
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full"
            style={{
              background: 'linear-gradient(90deg,rgba(212,175,55,0.08),rgba(212,175,55,0.14),rgba(212,175,55,0.08))',
              border: '1px solid rgba(212,175,55,0.25)',
            }}
            animate={{ backgroundPosition: ['0%','100%','0%'] }}
            transition={{ duration: 4, repeat: Infinity }}
          >
            <TrendingUp size={11} className="text-[#D4AF37]" />
            <span className="text-[#D4AF37] text-[11px] font-bold tracking-[0.12em] uppercase">
              +50 000 jumeaux découverts
            </span>
            <motion.div
              className="w-1.5 h-1.5 rounded-full bg-emerald-400"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            />
          </motion.div>
        </div>

        {/* ── Main headline ── */}
        <div className="space-y-1">
          <h1
            className="leading-[0.88] tracking-tighter"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            <span
              className="block text-white font-black"
              style={{ fontSize: 'clamp(3rem, 14vw, 4.5rem)' }}
            >
              Découvre
            </span>
            <span
              className="block font-black italic"
              style={{
                fontSize: 'clamp(3rem, 14vw, 4.5rem)',
                background: 'linear-gradient(110deg, #A88B20 0%, #D4AF37 30%, #F5E070 55%, #D4AF37 75%, #A88B20 100%)',
                backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: 'shimmerBtn 4s linear infinite',
              }}
            >
              ta célébrité
            </span>
            <span
              className="block text-white font-black"
              style={{ fontSize: 'clamp(3rem, 14vw, 4.5rem)' }}
            >
              jumelle
            </span>
          </h1>
        </div>

        {/* Subtitle */}
        <p className="text-[#808080] text-[15px] leading-relaxed max-w-[280px] mx-auto">
          L&apos;IA analyse ton visage et révèle à quelle star tu ressembles{' '}
          <span className="text-white font-semibold">vraiment</span>
        </p>

        {/* Feature pills row */}
        <div className="flex flex-wrap justify-center gap-2">
          {FEATURES.map(({ icon, label }) => (
            <span
              key={label}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium text-[#A0A0A0]"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <span>{icon}</span>
              {label}
            </span>
          ))}
        </div>
      </motion.div>

      {/* ══════════════════════════════════
          SECTION B — UPLOAD ZONE (HERO)
      ══════════════════════════════════ */}
      <motion.div variants={up} className="w-full">
        {/* Native label wraps the input — click anywhere on the zone opens picker */}
        <label
          className="block w-full cursor-pointer"
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false) }}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />

          <motion.div
            className="relative w-full rounded-3xl overflow-hidden"
            style={{
              background: isDragging
                ? 'linear-gradient(160deg,rgba(212,175,55,0.06),rgba(107,33,168,0.06))'
                : 'linear-gradient(160deg,rgba(22,22,22,0.95),rgba(16,16,16,0.98))',
              border: isDragging
                ? '1.5px solid rgba(212,175,55,0.7)'
                : '1.5px solid rgba(212,175,55,0.18)',
              boxShadow: isDragging
                ? '0 0 50px rgba(212,175,55,0.15),inset 0 0 50px rgba(212,175,55,0.04)'
                : '0 2px 40px rgba(0,0,0,0.5)',
            }}
            whileHover={{
              borderColor: 'rgba(212,175,55,0.45)',
              boxShadow: '0 0 40px rgba(212,175,55,0.1), 0 4px 60px rgba(0,0,0,0.6)',
            }}
            transition={{ duration: 0.25 }}
          >
            {/* Diagonal pattern */}
            <div className="absolute inset-0 diagonal-lines pointer-events-none" />

            {/* Top shimmer line */}
            <div
              className="absolute top-0 left-0 right-0 h-px pointer-events-none"
              style={{ background: 'linear-gradient(90deg,transparent,rgba(212,175,55,0.5),transparent)' }}
            />

            <div className="relative flex flex-col items-center justify-center gap-6 py-12 px-6">

              {/* Central visual — camera portal */}
              <div className="relative flex items-center justify-center">
                <motion.div
                  className="absolute w-36 h-36 rounded-full"
                  style={{ border: '1px solid rgba(212,175,55,0.08)' }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
                />
                <motion.div
                  className="absolute w-28 h-28 rounded-full"
                  style={{ border: '1px dashed rgba(212,175,55,0.2)' }}
                  animate={{ rotate: -360 }}
                  transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                />
                <div
                  className="absolute w-[88px] h-[88px] rounded-full"
                  style={{ border: '1px solid rgba(212,175,55,0.12)' }}
                />
                <div
                  className="absolute w-20 h-20 rounded-full blur-2xl"
                  style={{ background: 'radial-gradient(circle,rgba(212,175,55,0.15),transparent)' }}
                />
                <motion.div
                  className="relative w-[72px] h-[72px] rounded-full flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg,#1c1c1c,#111)',
                    border: '1.5px solid rgba(212,175,55,0.35)',
                    boxShadow: '0 0 20px rgba(212,175,55,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
                  }}
                  animate={{ scale: [1, 1.04, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Camera size={28} className="text-[#D4AF37]" />
                </motion.div>
                {/* Orbit dot gold */}
                <motion.div
                  className="absolute"
                  style={{ width: 112, height: 112, pointerEvents: 'none' }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
                >
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#D4AF37]"
                    style={{ boxShadow: '0 0 8px rgba(212,175,55,0.8)' }}
                  />
                </motion.div>
                {/* Orbit dot purple */}
                <motion.div
                  className="absolute"
                  style={{ width: 112, height: 112, pointerEvents: 'none' }}
                  animate={{ rotate: -360 }}
                  transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
                >
                  <div
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-purple-500"
                    style={{ boxShadow: '0 0 8px rgba(107,33,168,0.9)' }}
                  />
                </motion.div>
              </div>

              <div className="text-center space-y-1">
                <p className="text-white font-bold text-xl tracking-tight">
                  Glisse ton selfie ici
                </p>
                <p className="text-[#606060] text-sm">ou appuie pour choisir dans ta galerie</p>
              </div>

              <div
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-medium text-[#606060]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <span>JPG · PNG · WEBP</span>
                <span className="text-[#3a3a3a]">•</span>
                <span>Max 10 MB</span>
              </div>
            </div>

            {/* Bottom shimmer line */}
            <div
              className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
              style={{ background: 'linear-gradient(90deg,transparent,rgba(107,33,168,0.3),transparent)' }}
            />
          </motion.div>
        </label>
      </motion.div>

      {/* ══════════════════════════════════
          SECTION C — CTA BUTTON
      ══════════════════════════════════ */}
      <motion.div variants={up} className="w-full pt-4 space-y-3">
        <button
          disabled
          className="relative w-full py-[18px] rounded-2xl text-[17px] font-black tracking-wide overflow-hidden"
          style={{
            background: 'rgba(212,175,55,0.06)',
            border: '1px solid rgba(212,175,55,0.15)',
            color: 'rgba(212,175,55,0.3)',
            cursor: 'not-allowed',
          }}
        >
          <span className="flex items-center justify-center gap-2">
            Analyser mon visage
            <ChevronRight size={18} />
          </span>
          <span
            className="absolute inset-x-0 bottom-0 h-px"
            style={{ background: 'linear-gradient(90deg,transparent,rgba(212,175,55,0.2),transparent)' }}
          />
        </button>

        <div className="flex items-center justify-center gap-4 text-[#444]">
          {['🔒 Photo non stockée', '⚡ 10 secondes'].map((t) => (
            <span key={t} className="text-[11px] font-medium">{t}</span>
          ))}
        </div>
      </motion.div>

      {/* ══════════════════════════════════
          SECTION D — TICKER
      ══════════════════════════════════ */}
      <motion.div variants={fadeIn} className="w-full mt-10 overflow-hidden rounded-2xl" style={{
        background: 'linear-gradient(90deg,rgba(212,175,55,0.03),rgba(107,33,168,0.03),rgba(212,175,55,0.03))',
        border: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div className="h-px w-full" style={{ background: 'linear-gradient(90deg,transparent,rgba(212,175,55,0.2),transparent)' }} />
        <div className="py-3 overflow-hidden">
          <div className="ticker-track">
            {[...CELEBS, ...CELEBS].map((name, i) => (
              <span key={i} className="flex items-center gap-3 px-5 flex-shrink-0">
                <span className="text-[#D4AF37] text-[11px] font-bold tracking-widest uppercase whitespace-nowrap">
                  {name}
                </span>
                <span className="w-1 h-1 rounded-full bg-[#D4AF37]/30 flex-shrink-0" />
              </span>
            ))}
          </div>
        </div>
        <div className="h-px w-full" style={{ background: 'linear-gradient(90deg,transparent,rgba(107,33,168,0.25),transparent)' }} />
      </motion.div>

      {/* ══════════════════════════════════
          SECTION E — RESULT EXAMPLES
      ══════════════════════════════════ */}
      <motion.div variants={up} className="w-full mt-10 space-y-5">

        <div className="flex items-center justify-between">
          <p className="text-white text-sm font-bold">Résultats récents</p>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[#606060] text-[11px]">En direct</span>
          </div>
        </div>

        <div className="space-y-3">
          {RESULTS.map((r, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-4 p-3.5 rounded-2xl"
              style={{
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {/* Avatar */}
              <div
                className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center text-white/30 font-black text-lg"
                style={{
                  background: r.gradient,
                  border: '1px solid rgba(255,255,255,0.08)',
                  filter: 'blur(0.5px)',
                }}
              >
                {r.initial}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">{r.user}</p>
                <p className="text-[#606060] text-xs mt-0.5 flex items-center gap-1">
                  <Sparkles size={10} className="text-[#D4AF37]" />
                  Ressemble à{' '}
                  <span className="text-[#D4AF37] font-semibold">{r.celeb}</span>
                </p>
              </div>

              {/* Score badge */}
              <div
                className="flex-shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0"
                style={{
                  background: 'linear-gradient(135deg,rgba(212,175,55,0.12),rgba(212,175,55,0.06))',
                  border: '1px solid rgba(212,175,55,0.25)',
                }}
              >
                <span className="text-[#D4AF37] text-base font-black leading-none">{r.score}</span>
                <span className="text-[#D4AF37]/50 text-[9px] font-bold">%</span>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ══════════════════════════════════
          SECTION F — SOCIAL PROOF
      ══════════════════════════════════ */}
      <motion.div variants={up} className="w-full mt-6">
        <div
          className="w-full rounded-2xl p-4 flex items-center gap-4"
          style={{
            background: 'linear-gradient(110deg,rgba(212,175,55,0.05),rgba(107,33,168,0.05))',
            border: '1px solid rgba(212,175,55,0.1)',
          }}
        >
          {/* Avatars stack */}
          <div className="flex -space-x-2.5 flex-shrink-0">
            {['#4a1060', '#0d2e4a', '#2e4a1a', '#3a2000'].map((bg, i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-full border-2 border-[#0A0A0A]"
                style={{ background: `linear-gradient(135deg,${bg},#0A0A0A)` }}
              />
            ))}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 mb-0.5">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="text-[#D4AF37] text-xs">★</span>
              ))}
            </div>
            <p className="text-white text-xs font-semibold leading-snug">
              4,9/5 · <span className="text-[#808080] font-normal">+12 000 avis vérifiés</span>
            </p>
          </div>

          <div
            className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold text-black"
            style={{ background: 'linear-gradient(135deg,#D4AF37,#F0D060)' }}
          >
            Gratuit
          </div>
        </div>
      </motion.div>

    </motion.div>
  )
}
