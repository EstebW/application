'use client'

import { motion } from 'framer-motion'
import { Check } from 'lucide-react'

const STEPS = ['Photo', 'Analyse', 'Débloquer', 'Ta photo'] as const

interface StepperProps {
  currentStep: number
}

export default function Stepper({ currentStep }: StepperProps) {
  return (
    <div className="flex items-center justify-center w-full mb-6 px-1">
      {STEPS.map((label, i) => {
        const isCompleted = i < currentStep
        const isActive = i === currentStep
        const isUpcoming = i > currentStep

        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              {/* Completed → solid gold + check. Active → gold ring + pulse. Upcoming → grey. */}
              <motion.div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                  isCompleted
                    ? 'bg-[#D4AF37] border-[#D4AF37] text-black'
                    : isActive
                      ? 'bg-transparent border-[#D4AF37] text-[#D4AF37]'
                      : 'border-[#A0A0A0]/30 text-[#A0A0A0] bg-transparent'
                }`}
                animate={isActive ? { boxShadow: ['0 0 0 0 rgba(212,175,55,0.5)', '0 0 0 6px rgba(212,175,55,0)', '0 0 0 0 rgba(212,175,55,0.5)'] } : {}}
                transition={{ duration: 2, repeat: Infinity }}
              >
                {isCompleted ? <Check size={14} strokeWidth={3} /> : i + 1}
              </motion.div>
              <span
                className={`hidden sm:block text-[10px] font-medium whitespace-nowrap ${
                  isActive ? 'text-[#D4AF37]' : isUpcoming ? 'text-[#A0A0A0]/60' : 'text-[#A0A0A0]'
                }`}
              >
                {label}
              </span>
            </div>

            {i < STEPS.length - 1 && (
              <div className="w-6 sm:w-10 h-[2px] mx-1.5 sm:mx-2 bg-[#A0A0A0]/20 relative overflow-hidden rounded-full">
                <motion.div
                  className="absolute inset-0 bg-[#D4AF37] origin-left"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: i < currentStep ? 1 : 0 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
