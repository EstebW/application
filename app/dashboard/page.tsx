import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import StarField from '@/components/StarField'
import StarFusionLogo from '@/components/StarFusionLogo'
import UserDashboard from '@/components/UserDashboard'

export default function DashboardPage() {
  return (
    <div className="relative min-h-screen bg-[#0A0A0A] flex flex-col">
      <StarField />

      <header className="relative z-20 max-w-[390px] mx-auto w-full px-5 pt-5 pb-4">
        <div className="relative flex items-center justify-between min-h-[44px]">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              href="/"
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <ArrowLeft size={15} className="text-[#A0A0A0]" />
            </Link>
            <StarFusionLogo variant="duo" size="navbar" />
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 px-5 pb-10 max-w-[390px] mx-auto w-full">
        <UserDashboard />
      </main>
    </div>
  )
}
