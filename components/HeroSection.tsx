'use client'

import { useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Camera, ImageIcon, Sparkles, Star, Lock, Zap,
  ChevronRight, Check, ArrowRight, Users, TrendingUp,
} from 'lucide-react'

// ── Data ─────────────────────────────────────────────────────────────────────

const CELEBS = [
  'Zendaya', 'Ryan Gosling', 'Margot Robbie', 'Tom Holland', 'Dua Lipa',
  'Timothée Chalamet', 'Billie Eilish', 'Harry Styles', 'Anya Taylor-Joy',
  'Jacob Elordi', 'Sydney Sweeney', 'Austin Butler', 'Sabrina Carpenter',
  'Pedro Pascal', 'Florence Pugh', 'Paul Mescal',
]

const LIVE_FEED = [
  { name: 'Sofia R.', location: 'Paris', celeb: 'Zendaya',       score: 91, color: '#9333EA', time: '3 min' },
  { name: 'Lucas M.', location: 'Lyon',  celeb: 'Ryan Gosling',  score: 87, color: '#2563EB', time: '7 min' },
  { name: 'Emma K.',  location: 'Nice',  celeb: 'Anya Taylor-Joy',score: 94, color: '#059669', time: '12 min' },
  { name: 'Noé B.',   location: 'Bordeaux', celeb: 'Tom Holland', score: 82, color: '#DC2626', time: '18 min' },
]

const STEPS = [
  {
    num: '01',
    icon: Camera,
    title: 'Upload ta photo',
    desc: 'Prends un selfie ou choisis une photo depuis ta galerie. En moins de 5 secondes.',
  },
  {
    num: '02',
    icon: Sparkles,
    title: "L'IA analyse ton visage",
    desc: 'Notre IA scanne 68 points de ton visage et compare avec +10 000 célébrités mondiales.',
  },
  {
    num: '03',
    icon: Star,
    title: 'Découvre ton jumeau',
    desc: 'Reçois ton score de ressemblance et vois-toi en photo aux côtés de ta star.',
  },
]

const TESTIMONIALS = [
  {
    name: 'Sofia, 22 ans',
    city: 'Paris',
    text: "J'étais sceptique mais le résultat m'a bluffée. Le score de 91% avec Zendaya était incroyable ! La photo avec elle est trop stylée.",
    celeb: 'Zendaya',
    score: 91,
    stars: 5,
  },
  {
    name: 'Lucas, 28 ans',
    city: 'Lyon',
    text: "On m'a toujours dit que je ressemble à quelqu'un de connu. L'IA a trouvé Ryan Gosling — mes amis ont kiffé la photo générée !",
    celeb: 'Ryan Gosling',
    score: 87,
    stars: 5,
  },
  {
    name: 'Emma, 19 ans',
    city: 'Bordeaux',
    text: "94% de ressemblance avec Anya Taylor-Joy 😭 J'ai partagé la photo sur Instagram et j'ai eu 2000 likes en 24h.",
    celeb: 'Anya Taylor-Joy',
    score: 94,
    stars: 5,
  },
]

const TRUST = [
  { Icon: Lock, label: 'Aucune photo stockée' },
  { Icon: Zap, label: 'Résultat en 10 sec' },
  { Icon: Users, label: '+50 000 analyses' },
]

// ── Variants ─────────────────────────────────────────────────────────────────

const wrap = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
}
const up = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const } },
}
const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.7 } },
}

// ── Component ─────────────────────────────────────────────────────────────────

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

  return (
    <motion.div variants={wrap} initial="hidden" animate="show" className="flex flex-col items-center w-full gap-0">

      {/* ─── HIDDEN FILE INPUTS ────────────────────────────────────────────── */}
      <input ref={cameraRef} type="file" accept="image/*" capture="user" className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  SECTION 1 — HERO                                                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* Viral badge */}
      <motion.div variants={up} className="pt-2 pb-6 flex justify-center">
        <motion.div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full"
          style={{
            background: 'linear-gradient(90deg,rgba(212,175,55,0.08),rgba(212,175,55,0.15),rgba(212,175,55,0.08))',
            border: '1px solid rgba(212,175,55,0.28)',
          }}
          animate={{ boxShadow: ['0 0 0 0 rgba(212,175,55,0.15)', '0 0 0 6px rgba(212,175,55,0)', '0 0 0 0 rgba(212,175,55,0.15)'] }}
          transition={{ duration: 2.5, repeat: Infinity }}
        >
          <TrendingUp size={11} className="text-[#D4AF37]" />
          <span className="text-[#D4AF37] text-[11px] font-bold tracking-[0.1em] uppercase">
            Viral · +50 000 jumeaux révélés
          </span>
          <motion.div className="w-1.5 h-1.5 rounded-full bg-emerald-400"
            animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />
        </motion.div>
      </motion.div>

      {/* Headline */}
      <motion.div variants={up} className="text-center space-y-4 pb-6">
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif" }} className="leading-[0.9] tracking-tight">
          <span className="block text-white font-black" style={{ fontSize: 'clamp(2.8rem, 13vw, 4.2rem)' }}>
            Quelle star
          </span>
          <span className="block font-black" style={{
            fontSize: 'clamp(2.8rem, 13vw, 4.2rem)',
            background: 'linear-gradient(135deg, #D4AF37 0%, #F0D060 50%, #D4AF37 100%)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            te ressemble ?
          </span>
        </h1>

        <p className="text-[#909090] text-[15px] leading-relaxed max-w-[270px] mx-auto">
          L&apos;IA analyse ton visage et te montre la célébrité mondiale qui te ressemble le plus.
          <span className="text-white font-semibold"> Résultat en 10 secondes.</span>
        </p>
      </motion.div>

      {/* ── MAIN CTAs ── */}
      <motion.div variants={up} className="w-full space-y-3 pb-5">

        {/* Primary — Selfie */}
        <motion.button
          onClick={() => cameraRef.current?.click()}
          className="btn-gold btn-pulse w-full py-5 rounded-2xl text-lg font-black tracking-wide flex items-center justify-center gap-3"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          style={{ boxShadow: '0 8px 48px rgba(212,175,55,0.4)' }}
        >
          <Camera size={22} className="flex-shrink-0" />
          Prendre un selfie
          <ArrowRight size={18} className="flex-shrink-0 ml-1" />
        </motion.button>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-[#1E1E1E]" />
          <span className="text-[#404040] text-xs font-medium">ou</span>
          <div className="flex-1 h-px bg-[#1E1E1E]" />
        </div>

        {/* Secondary — Galerie */}
        <motion.button
          onClick={() => galleryRef.current?.click()}
          className="w-full py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-3 transition-all"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.08)', color: '#A0A0A0' }}
          whileHover={{ borderColor: 'rgba(212,175,55,0.35)', color: '#D4AF37', scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
        >
          <ImageIcon size={20} className="flex-shrink-0" />
          Choisir depuis ma galerie
        </motion.button>

        {/* Trust row */}
        <div className="flex items-center justify-center gap-5 pt-1">
          {TRUST.map(({ Icon, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-[11px] font-medium text-[#707070]">
              <Icon size={12} className="text-[#D4AF37] flex-shrink-0" />
              {label}
            </span>
          ))}
        </div>
      </motion.div>

      {/* ── Stars + ratings ── */}
      <motion.div variants={up} className="flex flex-col items-center gap-2 pb-8">
        <div className="flex items-center gap-1">
          {[...Array(5)].map((_, i) => (
            <Star key={i} size={14} className="text-[#D4AF37] fill-[#D4AF37]" />
          ))}
        </div>
        <p className="text-[#606060] text-xs">
          <span className="text-white font-semibold">4,9/5</span> · +12 000 avis vérifiés · 100% gratuit
        </p>
      </motion.div>

      {/* ─── CELEBRITY TICKER ───────────────────────────────────────────── */}
      <motion.div variants={fadeIn} className="w-full rounded-2xl overflow-hidden" style={{
        background: 'linear-gradient(90deg,rgba(212,175,55,0.02),rgba(107,33,168,0.03),rgba(212,175,55,0.02))',
        border: '1px solid rgba(255,255,255,0.04)',
      }}>
        <div className="h-px w-full" style={{ background: 'linear-gradient(90deg,transparent,rgba(212,175,55,0.25),transparent)' }} />
        <div className="py-3 overflow-hidden marquee-mask">
          <div className="ticker-track">
            {[...CELEBS, ...CELEBS].map((name, i) => (
              <span key={i} className="flex items-center gap-3 px-5 flex-shrink-0">
                <span className="text-[#D4AF37] text-[10px] font-bold tracking-widest uppercase whitespace-nowrap">{name}</span>
                <span className="w-1 h-1 rounded-full bg-[#D4AF37]/25 flex-shrink-0" />
              </span>
            ))}
          </div>
        </div>
        <div className="h-px w-full" style={{ background: 'linear-gradient(90deg,transparent,rgba(107,33,168,0.2),transparent)' }} />
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  SECTION 2 — LIVE ACTIVITY FEED                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <motion.div variants={up} className="w-full mt-10 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[#909090] text-[13px] font-semibold uppercase tracking-wider">En ce moment</p>
          <div className="flex items-center gap-1.5">
            <motion.div className="w-1.5 h-1.5 rounded-full bg-emerald-400"
              animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
            <span className="text-[#505050] text-[11px]">En direct</span>
          </div>
        </div>

        <div className="space-y-2">
          {LIVE_FEED.map((r, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.012)', border: '1px solid rgba(255,255,255,0.032)' }}
            >
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white/40 font-black text-sm"
                style={{ background: `linear-gradient(135deg,${r.color}60,${r.color}20)`, border: `1px solid ${r.color}30` }}>
                {r.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold">{r.name}
                  <span className="text-[#505050] font-normal text-xs"> · {r.location}</span>
                </p>
                <p className="text-[#606060] text-xs flex items-center gap-1">
                  <Sparkles size={9} className="text-[#D4AF37]" />
                  Jumeau : <span className="text-[#D4AF37] font-semibold ml-0.5">{r.celeb}</span>
                </p>
              </div>
              <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-[#D4AF37] text-base font-black">{r.score}</span>
                  <span className="text-[#D4AF37]/50 text-[9px] font-bold">%</span>
                </div>
                <span className="text-[#404040] text-[10px]">il y a {r.time}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  SECTION 3 — COMMENT ÇA MARCHE                                     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <motion.div variants={up} className="w-full mt-12 space-y-5">
        <div className="text-center space-y-1">
          <p className="text-[#D4AF37] text-[11px] font-bold uppercase tracking-[0.15em]">Simple & rapide</p>
          <h2 className="text-white text-2xl font-black" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Comment ça marche ?
          </h2>
        </div>

        <div className="space-y-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.12 }}
                className="flex items-start gap-4 p-4 rounded-2xl"
                style={{
                  background: 'linear-gradient(135deg,rgba(212,175,55,0.04),rgba(107,33,168,0.03))',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)' }}>
                  <Icon size={20} className="text-[#D4AF37]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[#D4AF37]/40 text-[10px] font-bold tracking-widest">{step.num}</span>
                    <p className="text-white text-sm font-bold">{step.title}</p>
                  </div>
                  <p className="text-[#707070] text-xs leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  SECTION 4 — TÉMOIGNAGES                                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <motion.div variants={up} className="w-full mt-12 space-y-5">
        <div className="text-center space-y-1">
          <p className="text-[#D4AF37] text-[11px] font-bold uppercase tracking-[0.15em]">Ils ont découvert leur jumeau</p>
          <h2 className="text-white text-2xl font-black" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Ce qu&apos;ils disent
          </h2>
        </div>

        <div className="space-y-3">
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
              className="p-4 rounded-2xl space-y-3"
              style={{
                background: 'rgba(255,255,255,0.015)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              {/* Stars */}
              <div className="flex items-center gap-0.5">
                {[...Array(t.stars)].map((_, j) => (
                  <Star key={j} size={11} className="text-[#D4AF37] fill-[#D4AF37]" />
                ))}
              </div>

              <p className="text-[#B0B0B0] text-sm leading-relaxed">&ldquo;{t.text}&rdquo;</p>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white text-sm font-semibold">{t.name}</p>
                  <p className="text-[#505050] text-xs">{t.city}</p>
                </div>
                <div className="text-right">
                  <p className="text-[#D4AF37] text-xs font-semibold">{t.celeb}</p>
                  <p className="text-[#D4AF37] text-lg font-black leading-tight">{t.score}<span className="text-xs text-[#D4AF37]/50">%</span></p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  SECTION 5 — GARANTIES                                             */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <motion.div variants={up} className="w-full mt-10">
        <div
          className="w-full rounded-2xl p-5 space-y-3"
          style={{
            background: 'linear-gradient(135deg,rgba(212,175,55,0.06),rgba(212,175,55,0.02))',
            border: '1px solid rgba(212,175,55,0.15)',
          }}
        >
          <p className="text-white text-sm font-bold text-center">Ce que tu obtiens, gratuitement</p>
          <div className="space-y-2.5">
            {[
              "Analyse faciale avec +10 000 célébrités",
              "Score de ressemblance précis en %",
              "Ton portrait avec ta célébrité jumelle",
              "Résultat en moins de 10 secondes",
              "Aucune photo stockée, vie privée protégée",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-4 h-4 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check size={9} className="text-[#D4AF37]" />
                </div>
                <p className="text-[#A0A0A0] text-sm">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/*  SECTION 6 — CTA FINAL                                             */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <motion.div variants={up} className="w-full mt-10 mb-6 space-y-4">
        <div className="text-center space-y-1">
          <h2 className="text-white text-2xl font-black" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Prêt à découvrir
            <span className="text-[#D4AF37]"> ta star jumelle ?</span>
          </h2>
          <p className="text-[#606060] text-sm">Rejoins les +50 000 personnes qui ont découvert leur célébrité</p>
        </div>

        <motion.button
          onClick={() => cameraRef.current?.click()}
          className="btn-gold w-full py-5 rounded-2xl text-lg font-black tracking-wide flex items-center justify-center gap-3"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          style={{ boxShadow: '0 8px 48px rgba(212,175,55,0.45)' }}
        >
          <Camera size={22} className="flex-shrink-0" />
          Découvrir ma célébrité jumelle
          <ChevronRight size={20} className="flex-shrink-0" />
        </motion.button>

        <motion.button
          onClick={() => galleryRef.current?.click()}
          className="w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#707070' }}
          whileHover={{ color: '#D4AF37', borderColor: 'rgba(212,175,55,0.25)' }}
          whileTap={{ scale: 0.98 }}
        >
          <ImageIcon size={16} />
          Ou depuis ma galerie
        </motion.button>

        <p className="text-center text-[#404040] text-xs flex items-center justify-center gap-1.5">
          <Lock size={10} className="flex-shrink-0" />
          100% gratuit · Sans compte · Données supprimées immédiatement
        </p>
      </motion.div>

    </motion.div>
  )
}
