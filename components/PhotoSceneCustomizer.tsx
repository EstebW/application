'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { MapPin, Shirt, Users, ChevronRight, Sparkles, Wand2, LayoutGrid, ImagePlus, RefreshCw, Camera } from 'lucide-react'
import type {
  CelebrityCreationMode,
  CelebrityResult,
  GenerationRequest,
  PhotoGenerationMode,
  PhotoScene,
  SceneSource,
} from '@/lib/types'
import { DEFAULT_CREATION_MODE } from '@/lib/types'
import { CUSTOM_PROMPT_EXAMPLES, getDefaultScene, getSceneSuggestions } from '@/lib/scene-suggestions'
import { INTERACTION_OPTIONS } from '@/lib/interactions'
import UserHeightField from './UserHeightField'
import PhotoFormatPicker from './PhotoFormatPicker'
import { parseUserHeightCm } from '@/lib/height'
import { DEFAULT_PHOTO_ASPECT_RATIO, normalizePhotoAspectRatio, type PhotoAspectRatio } from '@/lib/photo-format'

interface PhotoSceneCustomizerProps {
  celebrity: CelebrityResult
  creditsBalance?: number
  /** Affichage UI seulement — le débit est contrôlé côté edge generate */
  hasUnlimitedAccess?: boolean
  /** Approche choisie dans le parcours « Choisis ta star » */
  creationMode?: CelebrityCreationMode
  /** Photo de base en mode photo_edit */
  basePhoto?: string
  /** Photo utilisateur — full_generation, notamment pour garder le décor */
  userPhoto?: string
  /** Choix précédents — restaurés après un retour ou une régénération */
  initialRequest?: GenerationRequest
  onChangeBasePhoto?: () => void
  onChangeUserPhoto?: () => void
  /** Parcours « Choisis ta star » uniquement — jumeau reste sur les scènes inventées */
  enableSceneSource?: boolean
  /** Parcours « Trouve ton jumeau » : demander la taille avant génération */
  collectUserHeight?: boolean
  /** Taille déjà connue (profil ou parcours star) — préremplit le champ jumeau */
  initialUserHeightCm?: number
  onSubmit: (request: GenerationRequest) => void
  onNeedCredits?: () => void
}

const wrap = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
}
const up = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } },
}

function SceneField({
  icon: Icon,
  label,
  hint,
  value,
  suggestions,
  onChange,
}: {
  icon: React.ElementType
  label: string
  hint: string
  value: string
  suggestions: string[]
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-[#D4AF37]" />
        <label className="text-sm font-semibold text-white">{label}</label>
      </div>
      <p className="text-[#666] text-xs leading-relaxed">{hint}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#555] resize-none outline-none transition-colors"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
        onFocus={(e) => { e.target.style.borderColor = 'rgba(212,175,55,0.4)' }}
        onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
      />
      <div className="flex flex-col gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className="text-left text-[11px] leading-snug px-3 py-2 rounded-xl transition-colors"
            style={{
              background: value === s ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${value === s ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: value === s ? '#D4AF37' : '#9a9a9a',
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

const EDIT_NOTE_MAX = 300

function InteractionPicker({
  value,
  onChange,
  hint,
}: {
  value?: string
  onChange: (id: string | undefined) => void
  hint: string
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Users size={14} className="text-[#D4AF37]" />
        <label className="text-sm font-semibold text-white">
          L&apos;interaction <span className="text-[#666] font-normal">(optionnel)</span>
        </label>
      </div>
      <p className="text-[#666] text-xs leading-relaxed">{hint}</p>
      <div className="flex flex-wrap gap-2">
        {INTERACTION_OPTIONS.map(({ id, label }) => {
          const active = value === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? undefined : id)}
              className="px-3.5 py-2 rounded-full text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              style={{
                background: active ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${active ? 'rgba(212,175,55,0.45)' : 'rgba(255,255,255,0.1)'}`,
                color: active ? '#D4AF37' : '#9a9a9a',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function PhotoSceneCustomizer({
  celebrity,
  creditsBalance,
  hasUnlimitedAccess = false,
  creationMode = DEFAULT_CREATION_MODE,
  basePhoto,
  userPhoto,
  initialRequest,
  onChangeBasePhoto,
  onChangeUserPhoto,
  enableSceneSource = false,
  collectUserHeight = false,
  initialUserHeightCm,
  onSubmit,
  onNeedCredits,
}: PhotoSceneCustomizerProps) {
  const { name, celebrity_domain } = celebrity
  const suggestions = getSceneSuggestions(celebrity_domain)
  const isPhotoEdit = creationMode === 'photo_edit'
  const [sceneSource, setSceneSource] = useState<SceneSource>(initialRequest?.sceneSource ?? 'invented')
  const [mode, setMode] = useState<PhotoGenerationMode>(initialRequest?.mode ?? 'presets')
  const [scene, setScene] = useState<PhotoScene>(
    () => initialRequest?.photoScene ?? getDefaultScene(celebrity_domain)
  )
  const [customPrompt, setCustomPrompt] = useState(initialRequest?.customPrompt ?? '')
  const [interaction, setInteraction] = useState<string | undefined>(initialRequest?.interaction)
  const [editNote, setEditNote] = useState(isPhotoEdit ? initialRequest?.customPrompt ?? '' : '')
  const [heightInput, setHeightInput] = useState(
    () => String(initialUserHeightCm ?? initialRequest?.userHeightCm ?? '')
  )
  const [aspectRatio, setAspectRatio] = useState<PhotoAspectRatio>(
    () => normalizePhotoAspectRatio(initialRequest?.aspectRatio ?? DEFAULT_PHOTO_ASPECT_RATIO)
  )

  const parsedUserHeight = parseUserHeightCm(heightInput)
  const heightRequired = collectUserHeight && !isPhotoEdit
  const heightOk = !heightRequired || parsedUserHeight !== null

  const keepUserScene = !isPhotoEdit && enableSceneSource && sceneSource === 'user_photo'
  const hasCredits = hasUnlimitedAccess || creditsBalance === undefined || creditsBalance > 0
  const canSubmitPresets = scene.location.trim() && scene.outfits.trim() && scene.position.trim()
  const canSubmitCustom = customPrompt.trim().length >= 20
  const canSubmit = isPhotoEdit
    ? hasCredits && Boolean(basePhoto)
    : keepUserScene
      ? hasCredits && Boolean(userPhoto) && heightOk
      : hasCredits && heightOk && (mode === 'presets' ? Boolean(canSubmitPresets) : canSubmitCustom)

  const heightPayload = heightRequired && parsedUserHeight !== null
    ? { userHeightCm: parsedUserHeight }
    : {}

  const formatPayload = { aspectRatio }

  const handleSubmit = () => {
    if (!hasCredits) {
      onNeedCredits?.()
      return
    }
    if (isPhotoEdit) {
      // Selfie figé : pas d'interaction choisie, la note reste facultative.
      onSubmit({
        mode: 'presets',
        creationMode: 'photo_edit',
        customPrompt: editNote.trim() || undefined,
        ...formatPayload,
      })
      return
    }
    if (enableSceneSource && sceneSource === 'user_photo') {
      onSubmit({
        mode: 'presets',
        creationMode,
        sceneSource: 'user_photo',
        interaction,
        ...heightPayload,
        ...formatPayload,
      })
      return
    }
    if (mode === 'presets') {
      onSubmit({
        mode: 'presets',
        creationMode,
        ...(enableSceneSource ? { sceneSource: 'invented' as const } : {}),
        photoScene: scene,
        interaction,
        ...heightPayload,
        ...formatPayload,
      })
    } else {
      onSubmit({
        mode: 'custom',
        creationMode,
        ...(enableSceneSource ? { sceneSource: 'invented' as const } : {}),
        customPrompt: customPrompt.trim(),
        interaction,
        ...heightPayload,
        ...formatPayload,
      })
    }
  }

  return (
    <motion.div variants={wrap} initial="hidden" animate="show" className="flex flex-col gap-6 w-full">

      <motion.div variants={up} className="text-center space-y-1.5">
        <p className="text-[#D4AF37] text-[11px] font-bold uppercase tracking-[0.15em]">
          {isPhotoEdit ? 'Intégration' : 'Mise en scène'}
        </p>
        <h2
          className="text-2xl font-black text-white leading-tight"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          {isPhotoEdit ? 'Ajoute ' : 'Imagine ta photo avec '}
          <span style={{
            background: 'linear-gradient(135deg,#D4AF37,#F0D060)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            {name}
          </span>
          {isPhotoEdit ? ' à ta photo' : ''}
        </h2>
        <p className="text-[#808080] text-sm">
          {isPhotoEdit
            ? 'Ta photo et ton visage restent intacts — on ajoute seulement la star'
            : enableSceneSource
              ? 'Inventer un décor, ou garder celui de ta photo'
              : 'Choisis des scènes guidées ou écris ton propre prompt'}
        </p>
      </motion.div>

      {!isPhotoEdit && enableSceneSource && (
        <motion.div variants={up} className="grid grid-cols-2 gap-2">
          {([
            { id: 'invented' as const, label: 'Scène de zéro', icon: Wand2 },
            { id: 'user_photo' as const, label: 'Garder ma scène', icon: Camera },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSceneSource(id)}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              style={{
                background: sceneSource === id ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${sceneSource === id ? 'rgba(212,175,55,0.45)' : 'rgba(255,255,255,0.08)'}`,
                color: sceneSource === id ? '#D4AF37' : '#888',
              }}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </motion.div>
      )}

      {!isPhotoEdit && (!enableSceneSource || sceneSource === 'invented') && (
        <motion.div variants={up} className="grid grid-cols-2 gap-2">
          {([
            { id: 'presets' as const, label: 'Scènes guidées', icon: LayoutGrid },
            { id: 'custom' as const, label: 'Prompt libre', icon: Wand2 },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              style={{
                background: mode === id ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${mode === id ? 'rgba(212,175,55,0.45)' : 'rgba(255,255,255,0.08)'}`,
                color: mode === id ? '#D4AF37' : '#888',
              }}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </motion.div>
      )}

      <motion.div
        variants={up}
        className="w-full rounded-2xl p-5 space-y-6"
        style={{
          background: 'linear-gradient(160deg,#141414,#0E0E0E)',
          border: '1px solid rgba(212,175,55,0.2)',
        }}
      >
        {isPhotoEdit ? (
          <div className="space-y-6">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <ImagePlus size={14} className="text-[#D4AF37]" />
                <label className="text-sm font-semibold text-white">Ta photo de départ</label>
              </div>
              {basePhoto ? (
                <div
                  className="w-full rounded-xl overflow-hidden"
                  style={{ border: '1px solid rgba(212,175,55,0.3)' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={basePhoto}
                    alt="Ta photo de départ"
                    className="w-full max-h-[240px] object-contain bg-black"
                  />
                </div>
              ) : (
                <p className="text-[#808080] text-xs">Aucune photo de départ sélectionnée.</p>
              )}
              {onChangeBasePhoto && (
                <button
                  type="button"
                  onClick={onChangeBasePhoto}
                  className="flex items-center gap-2 text-[#D4AF37] text-xs font-semibold py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded"
                >
                  <RefreshCw size={12} />
                  Changer de photo
                </button>
              )}
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Wand2 size={14} className="text-[#D4AF37]" />
                <label className="text-sm font-semibold text-white">
                  Une précision ? <span className="text-[#666] font-normal">(optionnel)</span>
                </label>
              </div>
              <p className="text-[#666] text-xs leading-relaxed">
                Ex : « place-la à ma droite ». Ta photo, ton visage et le décor restent inchangés
                quoi qu&apos;il arrive.
              </p>
              <textarea
                value={editNote}
                onChange={(e) => setEditNote(e.target.value.slice(0, EDIT_NOTE_MAX))}
                rows={2}
                placeholder={`Ex : ${name} debout à ma droite, un peu en retrait`}
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#555] resize-none outline-none transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
                onFocus={(e) => { e.target.style.borderColor = 'rgba(212,175,55,0.4)' }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
              />
              <p className="text-[#555] text-[10px]">
                {editNote.length} / {EDIT_NOTE_MAX}
              </p>
            </div>
          </div>
        ) : keepUserScene ? (
          <div className="space-y-4">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Camera size={14} className="text-[#D4AF37]" />
                <label className="text-sm font-semibold text-white">Le décor de ta photo</label>
              </div>
              <p className="text-[#666] text-xs leading-relaxed">
                On crée une nouvelle photo avec {name} dans le même lieu, la même lumière et
                la même ambiance — ce n&apos;est pas un collage sur ta photo d&apos;origine.
              </p>
              {userPhoto ? (
                <div
                  className="w-full rounded-xl overflow-hidden"
                  style={{ border: '1px solid rgba(212,175,55,0.3)' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={userPhoto}
                    alt="Le décor à conserver"
                    className="w-full max-h-[240px] object-contain bg-black"
                  />
                </div>
              ) : (
                <p className="text-[#808080] text-xs">Aucune photo sélectionnée.</p>
              )}
              {onChangeUserPhoto && (
                <button
                  type="button"
                  onClick={onChangeUserPhoto}
                  className="flex items-center gap-2 text-[#D4AF37] text-xs font-semibold py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded"
                >
                  <RefreshCw size={12} />
                  Changer de photo
                </button>
              )}
            </div>
          </div>
        ) : mode === 'presets' ? (
          <>
            <SceneField
              icon={MapPin}
              label="Le lieu"
              hint="Où se passe la photo ? Pense à un endroit cohérent avec le monde de ta star."
              value={scene.location}
              suggestions={suggestions.locations}
              onChange={(v) => setScene((s) => ({ ...s, location: v }))}
            />

            <SceneField
              icon={Shirt}
              label="Les tenues"
              hint="Comment êtes-vous habillés tous les deux ?"
              value={scene.outfits}
              suggestions={suggestions.outfits}
              onChange={(v) => setScene((s) => ({ ...s, outfits: v }))}
            />

            <SceneField
              icon={Users}
              label="La position"
              hint="Comment êtes-vous placés dans la photo ?"
              value={scene.position}
              suggestions={suggestions.positions}
              onChange={(v) => setScene((s) => ({ ...s, position: v }))}
            />
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Wand2 size={14} className="text-[#D4AF37]" />
              <label className="text-sm font-semibold text-white">Ton prompt</label>
            </div>
            <p className="text-[#666] text-xs leading-relaxed">
              Décris librement la photo que tu veux : lieu, ambiance, tenues, pose, éclairage…
              Sois précis pour de meilleurs résultats.
            </p>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={5}
              placeholder={`Ex : Photo avec ${name} sur un tapis rouge à Cannes, tenues de gala, souriant aux photographes...`}
              className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#555] resize-none outline-none transition-colors"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'rgba(212,175,55,0.4)' }}
              onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
            />
            <p className="text-[#555] text-[10px]">
              Minimum 20 caractères · {customPrompt.trim().length} / 20
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CUSTOM_PROMPT_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setCustomPrompt(example)}
                  className="text-[10px] px-2.5 py-1 rounded-full transition-colors text-left"
                  style={{
                    background: customPrompt === example ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${customPrompt === example ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    color: customPrompt === example ? '#D4AF37' : '#888',
                  }}
                >
                  {example.length > 48 ? example.slice(0, 46) + '…' : example}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isPhotoEdit && (
          <InteractionPicker
            value={interaction}
            onChange={setInteraction}
            hint={`Comment êtes-vous l'un par rapport à l'autre avec ${name} ?`}
          />
        )}

        {heightRequired && (
          <UserHeightField value={heightInput} onChange={setHeightInput} />
        )}

        <PhotoFormatPicker value={aspectRatio} onChange={setAspectRatio} />
      </motion.div>

      <motion.div variants={up} className="w-full space-y-3">
        {hasUnlimitedAccess ? (
          <p className="text-center text-xs text-[#606060]">
            <span className="text-[#D4AF37] font-bold">Accès illimité</span>
            {' '}· aucune consommation de crédits
          </p>
        ) : typeof creditsBalance === 'number' && (
          <p className="text-center text-xs text-[#606060]">
            {creditsBalance > 0 ? (
              <>
                <span className="text-[#D4AF37] font-bold">{creditsBalance} crédit{creditsBalance !== 1 ? 's' : ''}</span>
                {' '}disponible{creditsBalance !== 1 ? 's' : ''} · 1 génération = 1 crédit
              </>
            ) : (
              <>Aucun crédit disponible · achète un pack pour générer</>
            )}
          </p>
        )}

        {!hasCredits ? (
          <button
            type="button"
            onClick={() => onNeedCredits?.()}
            className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(135deg,#D4AF37,#F0D060)',
              color: '#0A0A0A',
              boxShadow: '0 8px 32px rgba(212,175,55,0.25)',
            }}
          >
            Acheter des crédits
            <ChevronRight size={16} />
          </button>
        ) : (
          <motion.button
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0A]"
            style={{
              background: canSubmit
                ? 'linear-gradient(135deg,#D4AF37,#F0D060)'
                : 'rgba(255,255,255,0.08)',
              color: canSubmit ? '#0A0A0A' : '#555',
              boxShadow: canSubmit ? '0 8px 32px rgba(212,175,55,0.25)' : 'none',
            }}
            whileHover={canSubmit ? { scale: 1.02 } : {}}
            whileTap={canSubmit ? { scale: 0.98 } : {}}
          >
            <Sparkles size={16} />
            {isPhotoEdit ? `Ajouter ${name} à ma photo` : 'Générer ma photo'}
            <ChevronRight size={16} />
          </motion.button>
        )}

        {isPhotoEdit && !basePhoto && (
          <p className="text-center text-[#555] text-xs">
            Sélectionne d&apos;abord une photo de départ.
          </p>
        )}
        {keepUserScene && !userPhoto && (
          <p className="text-center text-[#555] text-xs">
            Ajoute d&apos;abord ta photo pour en garder le décor.
          </p>
        )}
      </motion.div>
    </motion.div>
  )
}
