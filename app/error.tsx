'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="text-xl font-bold">Une erreur est survenue</h2>
      <p className="text-[#808080] text-sm max-w-sm">
        Recharge la page ou relance le serveur de développement si le problème persiste.
      </p>
      <button
        type="button"
        onClick={reset}
        className="px-5 py-3 rounded-xl font-semibold text-black"
        style={{ background: 'linear-gradient(135deg,#D4AF37,#F0D060)' }}
      >
        Réessayer
      </button>
    </div>
  )
}
