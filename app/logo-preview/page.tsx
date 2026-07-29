'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import StarFusionLogo, { StarFusionMark } from '@/components/StarFusionLogo'

export default function LogoPreviewPage() {
  return (
    <div className="min-h-screen bg-black text-white px-5 py-8 max-w-[420px] mx-auto space-y-8">
      <header className="flex items-center gap-3">
        <Link
          href="/"
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <ArrowLeft size={15} className="text-[#A0A0A0]" />
        </Link>
        <div>
          <p className="text-[#F5C518] text-[10px] font-bold uppercase tracking-[0.15em]">Brand</p>
          <h1 className="text-2xl font-black leading-none">StarFusion logo</h1>
        </div>
      </header>

      <section
        className="rounded-3xl p-6 space-y-6"
        style={{ border: '1px solid rgba(245,197,24,0.25)' }}
      >
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-[#F5C518]/70">Navbar</p>
          <div className="flex items-center justify-center py-5 rounded-2xl bg-black">
            <StarFusionLogo size="navbar" />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-[#F5C518]/70">Icône seule</p>
          <div className="flex items-end justify-center gap-6 py-5 rounded-2xl bg-black">
            {[24, 40, 64].map((s) => (
              <div key={s} className="flex flex-col items-center gap-2">
                <StarFusionMark size={s} />
                <span className="text-[9px] text-[#505050]">{s}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-[#F5C518]/70">Hero</p>
          <div className="flex items-center justify-center py-6 rounded-2xl bg-black">
            <StarFusionLogo size="hero" />
          </div>
        </div>
      </section>
    </div>
  )
}
