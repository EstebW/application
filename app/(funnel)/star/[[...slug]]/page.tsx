import type { Metadata } from 'next'
import { funnelMetadata } from '@/lib/funnel-routes'

type Props = { params: { slug?: string[] } }

export function generateMetadata({ params }: Props): Metadata {
  const suffix = params.slug?.length ? `/${params.slug.join('/')}` : ''
  return funnelMetadata(`/star${suffix}`)
}

export default function StarPage() {
  return null
}
