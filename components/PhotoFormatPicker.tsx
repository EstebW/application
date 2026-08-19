'use client'

import { Maximize2 } from 'lucide-react'
import {
  PHOTO_ASPECT_RATIO_OPTIONS,
  type PhotoAspectRatio,
} from '@/lib/photo-format'

interface PhotoFormatPickerProps {
  value: PhotoAspectRatio
  onChange: (value: PhotoAspectRatio) => void
}

export default function PhotoFormatPicker({ value, onChange }: PhotoFormatPickerProps) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Maximize2 size={14} className="text-[#D4AF37]" />
        <label className="text-sm font-semibold text-white">Format de la photo</label>
      </div>
      <p className="text-[#666] text-xs leading-relaxed">
        Choisis le cadrage avant la génération — tu pourras toujours télécharger le résultat en HD.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {PHOTO_ASPECT_RATIO_OPTIONS.map(({ id, label, hint }) => {
          const active = value === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(id)}
              className="flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              style={{
                background: active ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${active ? 'rgba(212,175,55,0.45)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              <span
                className="text-sm font-semibold"
                style={{ color: active ? '#D4AF37' : '#c8c8c8' }}
              >
                {label}
              </span>
              <span className="text-[10px] leading-tight text-[#666]">{hint}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
