import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { extractVideoId } from '../lib/youtube'
import { recentVideos } from '../lib/store'

export default function Home() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [recent, setRecent] = useState([])

  useEffect(() => {
    recentVideos().then(setRecent).catch(() => {})
  }, [])

  const go = (e) => {
    e.preventDefault()
    const id = extractVideoId(url)
    if (!id) {
      setError("That doesn't look like a YouTube link. Try something like youtube.com/watch?v=…")
      return
    }
    navigate(`/watch/${id}`)
  }

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* Hero */}
      <section className="flex flex-col items-center pb-16 pt-20 text-center sm:pt-28">
        <p className="rise-in mb-5 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-ink-300">
          THE COMMENT SECTION YOUTUBE NEVER GAVE YOU
        </p>
        <h1
          className="rise-in max-w-3xl font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl"
          style={{ animationDelay: '60ms' }}
        >
          Watch anything.{' '}
          <span className="bg-gradient-to-r from-brand-400 via-brand-500 to-glow bg-clip-text text-transparent">
            Comment with GIFs.
          </span>
        </h1>
        <p
          className="rise-in mt-5 max-w-xl text-base text-ink-300 sm:text-lg"
          style={{ animationDelay: '120ms' }}
        >
          Paste a YouTube link and get a fresh comment section — with GIFs, stickers,
          and text you can drag right onto the media.
        </p>

        <form
          onSubmit={go}
          className="rise-in mt-10 w-full max-w-2xl"
          style={{ animationDelay: '180ms' }}
        >
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-ink-900/90 p-2 shadow-2xl shadow-black/40 transition-colors focus-within:border-brand-500/60">
            <svg viewBox="0 0 24 24" className="ml-3 h-5 w-5 shrink-0 fill-ink-500" aria-hidden>
              <path d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.9 4.8 12 4.8 12 4.8s-5.9 0-7.6.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.7.4 7.6.4 7.6.4s5.9 0 7.6-.4a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.8zM10 15.2V8.8l5.2 3.2z" />
            </svg>
            <input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setError('')
              }}
              placeholder="Paste a YouTube URL — youtube.com/watch?v=…"
              className="w-full bg-transparent px-1 py-2.5 text-sm text-ink-100 placeholder-ink-500 outline-none sm:text-base"
              autoFocus
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 hover:shadow-[0_0_24px_rgba(255,45,85,0.45)] active:scale-95"
            >
              Watch
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-brand-400">{error}</p>}
        </form>
      </section>

      {/* Recently watched shelf */}
      {recent.length > 0 && (
        <section className="pb-20">
          <h2 className="mb-4 font-display text-lg font-semibold text-ink-100">
            Recently watched here
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {recent.map((v) => (
              <Link
                key={v.youtube_id}
                to={`/watch/${v.youtube_id}`}
                className="group overflow-hidden rounded-xl border border-white/5 bg-ink-900 transition-all hover:-translate-y-0.5 hover:border-white/15 hover:shadow-xl hover:shadow-black/40"
              >
                <div className="aspect-video overflow-hidden bg-ink-800">
                  <img
                    src={v.thumbnail_url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <p className="line-clamp-2 p-3 text-sm font-medium leading-snug text-ink-100">
                  {v.title}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
