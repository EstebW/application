import Link from 'next/link'
import { Zap, ArrowLeft } from 'lucide-react'
import StarField from '@/components/StarField'
import UserDashboard from '@/components/UserDashboard'

export default function DashboardPage() {
  return (
    <div className="relative min-h-screen bg-[#0A0A0A] flex flex-col">
      <StarField />

      <header className="relative z-20 flex items-center justify-between px-5 pt-5 pb-3 max-w-[390px] mx-auto w-full">
        <Link
          href="/"
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <ArrowLeft size={15} className="text-[#A0A0A0]" />
        </Link>

        <div className="flex items-center gap-2">
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
            Mon espace
          </span>
        </div>

        <div className="w-9 h-9" />
      </header>

      <main className="relative z-10 flex-1 px-5 pb-10 max-w-[390px] mx-auto w-full">
        <UserDashboard />
      </main>
    </div>
  )
}
