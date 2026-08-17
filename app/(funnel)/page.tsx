import type { Metadata } from 'next'
import { funnelMetadata } from '@/lib/funnel-routes'

export const metadata: Metadata = funnelMetadata('/')

export default function HomePage() {
  return null
}
