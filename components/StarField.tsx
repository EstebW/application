'use client'

import { useEffect, useState } from 'react'

interface Star {
  id: number
  top: string
  left: string
  size: number
  opacity: number
  duration: number
  delay: number
  color: string
}

function generateStars(count: number): Star[] {
  const colors = ['#ffffff', '#ffffff', '#ffffff', '#D4AF37', '#9333EA']
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    top: `${Math.random() * 100}%`,
    left: `${Math.random() * 100}%`,
    size: Math.random() > 0.93 ? 2.5 : Math.random() > 0.75 ? 1.5 : 1,
    opacity: 0.08 + Math.random() * 0.35,
    duration: 3 + Math.random() * 5,
    delay: Math.random() * 6,
    color: colors[Math.floor(Math.random() * colors.length)],
  }))
}

export default function StarField() {
  const [stars, setStars] = useState<Star[]>([])

  // Évite le mismatch SSR/client (Math.random différent côté serveur)
  useEffect(() => {
    setStars(generateStars(80))
  }, [])

  if (stars.length === 0) return null

  return (
    <div className="fixed inset-0 pointer-events-none" aria-hidden>
      {stars.map((s) => (
        <div
          key={s.id}
          className="absolute rounded-full"
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            backgroundColor: s.color,
            opacity: s.opacity,
            boxShadow: s.size > 2 ? `0 0 ${s.size * 3}px ${s.color}` : undefined,
            animation: `pulse ${s.duration}s ease-in-out ${s.delay}s infinite alternate`,
          }}
        />
      ))}
    </div>
  )
}
