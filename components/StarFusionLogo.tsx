'use client'

/**
 * StarFusion brand logo — uses the exact official mark asset.
 *
 * Usage:
 *   <StarFusionLogo size="navbar" />
 *   <StarFusionMark size={40} />
 */

export type LogoSize = 'navbar' | 'icon' | 'hero'

/** Kept for backwards compatibility */
export type LogoVariant = 'duo' | 'orbit' | 'eclipse'

const CREAM = '#F0EAD6'
const GOLD = '#F5C518'

const SIZE_MAP = {
  navbar: { mark: 34, word: 18, gap: 10 },
  icon: { mark: 40, word: 0, gap: 0 },
  hero: { mark: 72, word: 32, gap: 14 },
} as const

interface MarkProps {
  /** @deprecated Ignored — official asset only */
  variant?: LogoVariant
  size?: number
  className?: string
  title?: string
}

/** Icon-only mark — exact logo PNG with transparent bg (blends on #0A0A0A). */
export function StarFusionMark({
  size = 34,
  className,
  title = 'StarFusion',
}: MarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/starfusion-mark.png"
      alt={title}
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        display: 'block',
        flexShrink: 0,
      }}
      draggable={false}
    />
  )
}

interface LogoProps {
  /** @deprecated Ignored — official asset only */
  variant?: LogoVariant
  size?: LogoSize
  showWordmark?: boolean
  className?: string
}

/** Full logo: exact mark + wordmark. */
export default function StarFusionLogo({
  size = 'navbar',
  showWordmark,
  className,
}: LogoProps) {
  const dims = SIZE_MAP[size]
  const withWord = showWordmark ?? size !== 'icon'

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: dims.gap,
        lineHeight: 1,
      }}
    >
      <StarFusionMark size={dims.mark} />
      {withWord && (
        <span
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: dims.word,
            fontWeight: 900,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            lineHeight: 1,
          }}
        >
          <span style={{ color: CREAM }}>Star</span>
          <span style={{ color: GOLD }}>Fusion</span>
        </span>
      )}
    </span>
  )
}
