import { useCallback, useEffect, useState } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { ensureVideo, getComments, watchPresence } from '../lib/store'
import CommentComposer from '../components/CommentComposer'
import CommentCard from '../components/CommentCard'

export default function Watch() {
  const { youtubeId } = useParams()
  const { user } = useAuth()
  const valid = /^[\w-]{11}$/.test(youtubeId || '')
  const [video, setVideo] = useState(null)
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState('top') // 'top' | 'new' — Reddit-style
  const [viewers, setViewers] = useState(1)

  useEffect(() => {
    if (!valid) return
    return watchPresence(youtubeId, user, setViewers)
  }, [valid, youtubeId, user?.id])

  const load = useCallback(async () => {
    const [v, c] = await Promise.all([ensureVideo(youtubeId), getComments(youtubeId, sort)])
    setVideo(v)
    setComments(c)
    setLoading(false)
  }, [youtubeId, sort])

  useEffect(() => {
    if (!valid) return
    setLoading(true)
    load().catch(() => setLoading(false))
  }, [valid, load])

  if (!valid) return <Navigate to="/" replace />

  return (
    <main className="mx-auto max-w-4xl px-4 pb-24 pt-6 sm:px-6">
      {/* Player */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/50">
        <div className="aspect-video">
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}?rel=0&playsinline=1`}
            title={video?.title || 'YouTube video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {video?.title && (
            <h1 className="font-display text-xl font-semibold leading-snug sm:text-2xl">
              {video.title}
            </h1>
          )}
          {video?.author && <p className="mt-1 text-sm text-ink-300">{video.author}</p>}
        </div>

        {/* Live user counter */}
        <span className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-ink-100">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          {viewers} {viewers === 1 ? 'person' : 'people'} here now
        </span>
      </div>

      {/* Comments */}
      <section className="mt-8">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="font-display text-lg font-semibold">Comments</h2>
          <span className="text-sm text-ink-500">{comments.length}</span>

          {/* Sort: Top (most upvoted first) / New */}
          <div className="flex rounded-lg border border-white/10 p-0.5">
            {['top', 'new'].map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                  sort === s
                    ? 'bg-brand-500/15 text-brand-400'
                    : 'text-ink-500 hover:text-ink-100'
                }`}
              >
                {s === 'top' ? '▲ Top' : 'New'}
              </button>
            ))}
          </div>

          <span className="ml-auto hidden text-xs text-ink-500 sm:inline">
            lives here on ReacTube — not on youtube.com
          </span>
        </div>

        <CommentComposer
          youtubeId={youtubeId}
          onPosted={(c) => setComments((prev) => [c, ...prev])}
        />

        <div className="mt-4 space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-ink-900" />
            ))
          ) : comments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-ink-500">
              No comments yet — be the first. Bonus points for a GIF. 🎬
            </div>
          ) : (
            comments.map((c) => (
              <CommentCard
                key={c.id}
                comment={c}
                youtubeId={youtubeId}
                onDeleted={(id) => setComments((prev) => prev.filter((x) => x.id !== id))}
              />
            ))
          )}
        </div>
      </section>
    </main>
  )
}
