'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface Particle {
  id: number
  x: number
  rotation: number
  delay: number
  duration: number
  color: string
  size: number
  shape: 'circle' | 'rect' | 'star'
}

const COLORS = ['#D4AF37', '#F0D060', '#A88B20', '#6B21A8', '#9333EA', '#FFFFFF']

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    rotation: Math.random() * 360,
    delay: Math.random() * 1.5,
    duration: 2.5 + Math.random() * 2,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: 4 + Math.random() * 8,
    shape: (['circle', 'rect', 'star'] as const)[Math.floor(Math.random() * 3)],
  }))
}

export default function GoldParticles({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    if (active) {
      setParticles(generateParticles(40))
    } else {
      setParticles([])
    }
  }, [active])

  if (!active || particles.length === 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute top-0"
          style={{
            left: `${p.x}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.shape === 'circle' ? '50%' : p.shape === 'rect' ? '2px' : '0%',
            transform: p.shape === 'star' ? 'rotate(45deg)' : undefined,
          }}
          initial={{ y: -20, opacity: 1, rotate: 0 }}
          animate={{
            y: 600,
            opacity: [1, 1, 0],
            rotate: p.rotation * 4,
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: 'easeIn',
          }}
        />
      ))}
    </div>
  )
}
