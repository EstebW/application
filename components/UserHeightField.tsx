'use client'

import { useId, useState } from 'react'
import { Ruler } from 'lucide-react'
import { MAX_USER_HEIGHT_CM, MIN_USER_HEIGHT_CM, parseUserHeightCm } from '@/lib/height'

interface UserHeightFieldProps {
  /** Saisie brute (chaîne) — le parent garde la valeur pour la restaurer au retour arrière */
  value: string
  onChange: (value: string) => void
}

/**
 * Taille de l'utilisateur — parcours « Choisis ta star » uniquement.
 * On ne demande jamais la taille de la célébrité : elle est résolue côté serveur.
 */
export default function UserHeightField({ value, onChange }: UserHeightFieldProps) {
  const inputId = useId()
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const [touched, setTouched] = useState(false)

  const isEmpty = value.trim() === ''
  const invalid = !isEmpty && parseUserHeightCm(value) === null
  const showError = touched && (isEmpty || invalid)

  return (
    <div className="w-full space-y-2">
      <label
        htmlFor={inputId}
        className="text-[#909090] text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5"
      >
        <Ruler size={12} className="text-[#A855F7]" aria-hidden />
        Quelle est ta taille ? <span className="text-[#A855F7]">*</span>
      </label>
      <p id={hintId} className="text-[#666] text-xs leading-relaxed">
        Cela nous aide à respecter les proportions entre toi et la star.
      </p>

      <div className="relative">
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 3))}
          onBlur={() => setTouched(true)}
          placeholder="Ex : 175"
          aria-describedby={showError ? `${hintId} ${errorId}` : hintId}
          aria-invalid={showError || undefined}
          className="w-full pl-4 pr-14 py-4 rounded-2xl text-white text-base outline-none placeholder:text-[#505050]"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: `1.5px solid ${showError ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.1)'}`,
          }}
        />
        <span
          className="absolute right-4 top-1/2 -translate-y-1/2 text-[#808080] text-sm font-semibold pointer-events-none"
          aria-hidden
        >
          cm
        </span>
      </div>

      {showError && (
        <p id={errorId} role="alert" className="text-red-400 text-xs">
          {isEmpty
            ? 'Renseigne ta taille pour continuer.'
            : `Indique une taille entre ${MIN_USER_HEIGHT_CM} et ${MAX_USER_HEIGHT_CM} cm.`}
        </p>
      )}
    </div>
  )
}
