'use client'

import { AnimatePresence, motion } from 'framer-motion'

export const LOADING_PATIENCE_HINT_MS = 12_000

export const LOADING_PATIENCE_HINTS = {
  analysis:
    'L’analyse peut parfois prendre un peu plus de temps que prévu. Merci de patienter — on y est presque.',
  generation:
    'La génération peut parfois prendre un peu plus de temps que prévu. Merci de patienter — ta photo arrive bientôt.',
} as const

interface LoadingPatienceHintProps {
  show: boolean
  message: string
}

export default function LoadingPatienceHint({ show, message }: LoadingPatienceHintProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="text-center text-xs text-[#888] leading-relaxed max-w-sm mx-auto px-2"
        >
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  )
}
