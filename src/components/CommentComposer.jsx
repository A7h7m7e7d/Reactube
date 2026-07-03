import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { postComment } from '../lib/store'
import MediaPicker from './MediaPicker'
import MediaWithOverlay, { DEFAULT_POSITION } from './MediaWithOverlay'

const OVERLAY_COLORS = ['#ffffff', '#ffe14d', '#ff2d55', '#4dd0ff', '#7dff8a', '#111111']

export default function CommentComposer({ youtubeId, onPosted }) {
  const { user } = useAuth()
  const [bodyText, setBodyText] = useState('')
  const [media, setMedia] = useState(null) // { media_url, media_type, source }
  const [overlayText, setOverlayText] = useState('')
  const [overlayPosition, setOverlayPosition] = useState(DEFAULT_POSITION)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  if (!user) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-ink-900 p-5">
        <p className="text-sm text-ink-300">Sign in to join the conversation.</p>
        <Link
          to="/auth"
          className="shrink-0 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-400"
        >
          Sign in
        </Link>
      </div>
    )
  }

  const clearMedia = () => {
    setMedia(null)
    setOverlayText('')
    setOverlayPosition(DEFAULT_POSITION)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!bodyText.trim() && !media) return
    setPosting(true)
    setError('')
    try {
      const comment = await postComment(youtubeId, user, {
        bodyText: bodyText.trim() || null,
        mediaUrl: media?.media_url,
        mediaType: media?.media_type,
        overlayText: media && overlayText.trim() ? overlayText.trim() : null,
        overlayPosition: media && overlayText.trim() ? overlayPosition : null,
      })
      setBodyText('')
      clearMedia()
      onPosted?.(comment)
    } catch (err) {
      setError(err.message)
    } finally {
      setPosting(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-white/5 bg-ink-900 p-4">
      {media && (
        <label className="mb-1.5 block text-xs font-medium text-ink-300">
          Comment text <span className="text-ink-500">— shows above the media, TikTok-style</span>
        </label>
      )}
      <textarea
        value={bodyText}
        onChange={(e) => setBodyText(e.target.value)}
        placeholder={media ? 'Write your comment here…' : 'Say something about this video…'}
        rows={2}
        maxLength={1000}
        className="w-full resize-none rounded-xl border border-white/10 bg-ink-850 px-4 py-3 text-sm text-ink-100 placeholder-ink-500 outline-none transition-colors focus:border-brand-500/60"
      />

      {/* Media preview + overlay editor */}
      {media && (
        <div className="pop-in mt-3 rounded-xl border border-white/10 bg-ink-850 p-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative shrink-0">
              <MediaWithOverlay
                mediaUrl={media.media_url}
                mediaType={media.media_type}
                overlayText={overlayText}
                overlayPosition={overlayPosition}
                editable
                onPositionChange={setOverlayPosition}
                className="max-w-xs"
              />
              <button
                type="button"
                onClick={clearMedia}
                aria-label="Remove media"
                className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-ink-800 text-xs text-ink-300 transition-colors hover:bg-brand-500 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-300">
                  Text ON the media{' '}
                  <span className="text-ink-500">
                    {overlayText ? '— drag it into place' : '— optional'}
                  </span>
                </label>
                <input
                  value={overlayText}
                  onChange={(e) => setOverlayText(e.target.value)}
                  placeholder="Optional: layer a caption on top of the image…"
                  maxLength={120}
                  className="w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2 text-sm text-ink-100 placeholder-ink-500 outline-none focus:border-brand-500/60"
                />
              </div>

              {overlayText && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-300">
                      Size
                    </label>
                    <input
                      type="range"
                      min="4"
                      max="16"
                      value={overlayPosition.size}
                      onChange={(e) =>
                        setOverlayPosition({ ...overlayPosition, size: Number(e.target.value) })
                      }
                      className="w-full accent-brand-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-300">Color</label>
                    <div className="flex gap-2">
                      {OVERLAY_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={`Overlay color ${c}`}
                          onClick={() => setOverlayPosition({ ...overlayPosition, color: c })}
                          className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
                            overlayPosition.color === c ? 'border-brand-400' : 'border-white/15'
                          }`}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-300">
                      Rotation
                    </label>
                    <input
                      type="range"
                      min="-30"
                      max="30"
                      value={overlayPosition.rotation}
                      onChange={(e) =>
                        setOverlayPosition({ ...overlayPosition, rotation: Number(e.target.value) })
                      }
                      className="w-full accent-brand-500"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-brand-400">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-ink-300 transition-colors hover:border-brand-500/50 hover:text-white"
        >
          <span className="rounded bg-white/10 px-1 text-[10px] font-bold tracking-wide">GIF</span>
          {media ? 'Change media' : 'GIF · Sticker · Image'}
        </button>
        <button
          type="submit"
          disabled={posting || (!bodyText.trim() && !media)}
          className="ml-auto rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-400 hover:shadow-[0_0_20px_rgba(255,45,85,0.4)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none"
        >
          {posting ? 'Posting…' : 'Post'}
        </button>
      </div>

      {pickerOpen && (
        <MediaPicker
          onClose={() => setPickerOpen(false)}
          onSelect={(m) => {
            setMedia(m)
            setPickerOpen(false)
          }}
        />
      )}
    </form>
  )
}
