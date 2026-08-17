import type { Metadata } from 'next'
import { funnelMetadata } from '@/lib/funnel-routes'

type Props = { params: { slug?: string[] } }

export function generateMetadata({ params }: Props): Metadata {
  const suffix = params.slug?.length ? `/${params.slug.join('/')}` : ''
  return funnelMetadata(`/jumeau${suffix}`)
}

export default function JumeauPage() {
  return null
}
