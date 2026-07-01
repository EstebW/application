'use client'

import { motion } from 'framer-motion'

interface ProgressBarProps {
  progress: number
  className?: string
}

export default function ProgressBar({ progress, className = '' }: ProgressBarProps) {
  return (
    <div className={`w-full h-1.5 bg-[#2A2A2A] rounded-full overflow-hidden ${className}`}>
      <motion.div
        className="h-full rounded-full relative overflow-hidden"
        style={{
          background: 'linear-gradient(90deg, #A88B20, #D4AF37, #F0D060, #D4AF37)',
          backgroundSize: '200% 100%',
        }}
        initial={{ width: '0%' }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <motion.div
          className="absolute inset-0 opacity-60"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
          }}
          animate={{ backgroundPosition: ['0% 0%', '200% 0%'] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        />
      </motion.div>
    </div>
  )
}
