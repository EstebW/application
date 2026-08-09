import Link from 'next/link'
import StarField from '@/components/StarField'
import StarFusionLogo from '@/components/StarFusionLogo'

export default function LegalLayout({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-screen bg-[#0A0A0A] text-white">
      <StarField />
      <div className="relative z-10 max-w-[640px] mx-auto px-5 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/">
            <StarFusionLogo variant="duo" size="navbar" />
          </Link>
          <Link href="/" className="text-[#808080] text-xs hover:text-[#D4AF37]">
            Retour
          </Link>
        </div>
        <h1
          className="text-2xl font-black"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          {title}
        </h1>
        <div className="space-y-4 text-[#A0A0A0] text-sm leading-relaxed">{children}</div>
        <p className="text-[#505050] text-xs pt-4 border-t border-white/5">
          <Link href="/legal/cgu" className="hover:text-[#D4AF37]">CGU</Link>
          {' · '}
          <Link href="/legal/confidentialite" className="hover:text-[#D4AF37]">Confidentialité</Link>
          {' · '}
          <Link href="/legal/remboursement" className="hover:text-[#D4AF37]">Remboursement</Link>
        </p>
      </div>
    </div>
  )
}
