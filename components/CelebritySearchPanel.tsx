'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ImagePlus, Loader2, Search, UserRound, X } from 'lucide-react'
import {
  CELEBRITY_SEARCH_MIN_QUERY,
  type CelebritySearchResult,
  isSearchableCelebrityQuery,
  searchCelebrities,
} from '@/lib/celebrity-search'

const SEARCH_DEBOUNCE_MS = 350

interface CelebritySearchPanelProps {
  open: boolean
  /** Nom déjà saisi dans le formulaire — pré-remplit la recherche. */
  initialQuery?: string
  onClose: () => void
  onSelect: (result: CelebritySearchResult) => void
  /** Repli « je ne trouve pas ma star » → import galerie. */
  onImportInstead?: () => void
}

type SearchState = 'idle' | 'loading' | 'done' | 'error'

export default function CelebritySearchPanel({
  open,
  initialQuery,
  onClose,
  onSelect,
  onImportInstead,
}: CelebritySearchPanelProps) {
  const [query, setQuery] = useState(initialQuery ?? '')
  const [results, setResults] = useState<CelebritySearchResult[]>([])
  const [state, setState] = useState<SearchState>('idle')
  const [mounted, setMounted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    setQuery(initialQuery ?? '')
    const focus = window.setTimeout(() => inputRef.current?.focus(), 120)
    return () => window.clearTimeout(focus)
  }, [open, initialQuery])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) return

    if (!isSearchableCelebrityQuery(query)) {
      setResults([])
      setState('idle')
      return
    }

    const controller = new AbortController()
    setState('loading')

    const timer = window.setTimeout(() => {
      searchCelebrities(query, controller.signal)
        .then((found) => {
          if (controller.signal.aborted) return
          setResults(found)
          setState('done')
        })
        .catch(() => {
          if (controller.signal.aborted) return
          setResults([])
          setState('error')
        })
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [open, query])

  const handleSelect = useCallback(
    (result: CelebritySearchResult) => {
      onSelect(result)
      onClose()
    },
    [onSelect, onClose],
  )

  if (!mounted) return null

  // Portail vers <body> : rendu dans le funnel, le panneau resterait enfermé
  // dans le contexte d'empilement de <main z-10> et passerait sous l'en-tête.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="celebrity-search"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Rechercher une star"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg,#141018 0%,#0B0A0D 100%)',
              border: '1px solid rgba(168,85,247,0.25)',
              boxShadow: '0 -8px 60px rgba(0,0,0,0.6)',
            }}
          >
            <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
              <div>
                <p className="text-[#A855F7] text-[11px] font-bold uppercase tracking-[0.15em]">
                  Choisis ta star
                </p>
                <h3
                  className="text-white text-xl font-black leading-tight"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                >
                  Rechercher une célébrité
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer la recherche"
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <X size={16} className="text-[#A0A0A0]" />
              </button>
            </div>

            <div className="px-5 pb-4">
              <div
                className="flex items-center gap-3 px-4 rounded-2xl"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1.5px solid rgba(255,255,255,0.1)',
                }}
              >
                <Search size={17} className="text-[#808080] flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ex : Zendaya, Cristiano Ronaldo, Beyoncé..."
                  className="flex-1 py-4 bg-transparent text-white text-base outline-none placeholder:text-[#505050]"
                  autoComplete="off"
                />
                {state === 'loading' && (
                  <Loader2 size={16} className="text-[#A855F7] flex-shrink-0 animate-spin" />
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-5">
              {state === 'idle' && (
                <p className="text-[#666] text-sm text-center py-10 leading-relaxed">
                  Tape au moins {CELEBRITY_SEARCH_MIN_QUERY} lettres pour voir apparaître
                  <br />
                  les stars correspondantes.
                </p>
              )}

              {state === 'error' && (
                <p className="text-[#C0C0C0] text-sm text-center py-10 leading-relaxed">
                  La recherche n&apos;a pas répondu. Réessaie dans un instant.
                </p>
              )}

              {state === 'done' && results.length === 0 && (
                <div className="text-center py-10 space-y-3">
                  <p className="text-[#C0C0C0] text-sm leading-relaxed">
                    Aucune star trouvée pour « {query.trim()} ».
                    <br />
                    Vérifie l&apos;orthographe, ou importe une photo.
                  </p>
                  {onImportInstead && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose()
                        onImportInstead()
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                      style={{
                        background: 'rgba(168,85,247,0.12)',
                        border: '1px solid rgba(168,85,247,0.35)',
                        color: '#A855F7',
                      }}
                    >
                      <ImagePlus size={15} />
                      Importer une photo
                    </button>
                  )}
                </div>
              )}

              {results.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {results.map((result) => (
                    <button
                      key={`${result.lang}-${result.name}`}
                      type="button"
                      onClick={() => handleSelect(result)}
                      className="text-left rounded-2xl overflow-hidden transition-transform active:scale-[0.97]"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1.5px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <div className="relative w-full aspect-[3/4] bg-[#181820]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={result.imageUrl}
                          alt={result.name}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="px-3 py-2.5">
                        <p className="text-white text-sm font-bold leading-tight line-clamp-1">
                          {result.name}
                        </p>
                        {result.description && (
                          <p className="text-[#808080] text-[11px] leading-snug line-clamp-2 mt-0.5">
                            {result.description}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {results.length > 0 && onImportInstead && (
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onImportInstead()
                  }}
                  className="w-full mt-4 py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px dashed rgba(255,255,255,0.14)',
                    color: '#909090',
                  }}
                >
                  <UserRound size={15} />
                  Ma star n&apos;est pas dans la liste
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
