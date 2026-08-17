'use client'

import FunnelApp from '@/components/FunnelApp'

export default function FunnelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <FunnelApp />
      {children}
    </>
  )
}
