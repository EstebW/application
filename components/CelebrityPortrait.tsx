'use client'

import { useEffect, useState } from 'react'
import { getCelebrityFirstName, resolveCelebrityImageUrl } from '@/lib/celebrity-image'

interface CelebrityPortraitProps {
  name: string
  /** Photo fournie (base64 data URL ou URL) — mode "Choisis ta star" */
  imageSrc?: string
  size?: 'sm' | 'md' | 'lg'
  shape?: 'circle' | 'rounded'
  /** Affiche le prénom sous le portrait */
  showFirstName?: boolean
  /** Affiche le nom complet en badge (ex. GenerationLoader) */
  badgeLabel?: 'none' | 'first' | 'full'
  className?: string
  borderColor?: string
  boxShadow?: string
}

const SIZES = {
  sm: 'w-20 h-20',
  md: 'w-28 h-28',
  lg: 'w-32 h-32',
} as const

export default function CelebrityPortrait({
  name,
  imageSrc,
  size = 'md',
  shape = 'rounded',
  showFirstName = false,
  badgeLabel = 'none',
  className = '',
  borderColor = 'rgba(107,33,168,0.6)',
  boxShadow = '0 0 20px rgba(107,33,168,0.2)',
}: CelebrityPortraitProps) {
  const [fetchedUrl, setFetchedUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (imageSrc) {
      setFetchedUrl(null)
      setFailed(false)
      return
    }
    let cancelled = false
    setFailed(false)
    resolveCelebrityImageUrl(name).then((url) => {
      if (!cancelled) setFetchedUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [name, imageSrc])

  const src = imageSrc || fetchedUrl
  const firstName = getCelebrityFirstName(name)
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-2xl'
  const badgeText =
    badgeLabel === 'full' ? name.toUpperCase() : badgeLabel === 'first' ? firstName.toUpperCase() : null

  return (
    <div className={`relative flex flex-col items-center gap-2 ${className}`}>
      <div
        className={`${SIZES[size]} ${radius} overflow-hidden relative`}
        style={{ border: `2px solid ${borderColor}`, boxShadow }}
      >
        {src && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={name}
            className="w-full h-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <div
            className="w-full h-full animate-pulse"
            style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #2d1b69 100%)' }}
          />
        )}
      </div>

      {badgeText && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[9px] font-bold text-white bg-[#2A2A2A] whitespace-nowrap">
          {badgeText}
        </div>
      )}

      {showFirstName && !badgeText && (
        <span className="text-[10px] text-[#A0A0A0] font-medium">{firstName}</span>
      )}
    </div>
  )
}
