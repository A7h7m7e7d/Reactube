import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../AuthContext'
import {
  hasGifProvider,
  gifProviderName,
  trendingGifs,
  searchGifs,
  trendingStickers,
  searchStickers,
} from '../lib/gifs'
import { curatedStickers } from '../lib/stickers'
import { getFavorites, toggleFavorite, uploadImage } from '../lib/store'

const TABS = [
  { id: 'trending', label: 'Trending' },
  { id: 'search', label: 'Search' },
  { id: 'stickers', label: 'Stickers' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'upload', label: 'Upload' },
]

export default function MediaPicker({ onSelect, onClose }) {
  const { user } = useAuth()
  const [tab, setTab] = useState('trending')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [favUrls, setFavUrls] = useState(new Set())
  const [favorites, setFavorites] = useState([])
  const fileRef = useRef(null)
  const debounce = useRef(null)

  useEffect(() => {
    getFavorites(user).then((list) => {
      setFavorites(list)
      setFavUrls(new Set(list.map((f) => f.media_url)))
    })
  }, [user])

  // Load content whenever the tab or (debounced) query changes
  useEffect(() => {
    setError('')
    if (tab === 'upload') return
    if (tab === 'favorites') {
      setItems(
        favorites.map((f) => ({
          id: f.id,
          preview_url: f.media_url,
          media_url: f.media_url,
          media_type: f.media_type,
          source: f.source,
        }))
      )
      return
    }
    if (tab === 'stickers' && !query) {
      // Curated set always works; append provider trending stickers when keyed
      setLoading(hasGifProvider)
      setItems(curatedStickers)
      if (hasGifProvider) {
        trendingStickers()
          .then((extra) => setItems([...curatedStickers, ...extra]))
          .catch(() => {})
          .finally(() => setLoading(false))
      }
      return
    }
    if (!hasGifProvider) {
      setItems(tab === 'stickers' ? curatedStickers : [])
      return
    }

    setLoading(true)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      try {
        let results
        if (tab === 'stickers') results = await searchStickers(query)
        else if (tab === 'search' && query) results = await searchGifs(query)
        else results = await trendingGifs()
        setItems(results)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }, query ? 350 : 0)
    return () => clearTimeout(debounce.current)
  }, [tab, query, favorites])

  const pick = (item) => {
    onSelect({
      media_url: item.media_url,
      media_type:
        item.media_type ||
        (tab === 'stickers' || item.source === 'sticker-library' ? 'sticker' : 'gif'),
      source: item.source,
    })
  }

  const heart = async (e, item) => {
    e.stopPropagation()
    if (!user) {
      setError('Sign in to save favorites.')
      return
    }
    const fav = {
      media_url: item.media_url,
      media_type:
        item.media_type ||
        (tab === 'stickers' || item.source === 'sticker-library' ? 'sticker' : 'gif'),
      source: item.source,
    }
    const added = await toggleFavorite(user, fav)
    const next = new Set(favUrls)
    added ? next.add(item.media_url) : next.delete(item.media_url)
    setFavUrls(next)
    setFavorites(await getFavorites(user))
  }

  const upload = async (file) => {
    if (!file) return
    if (!user) {
      setError('Sign in to upload images.')
      return
    }
    try {
      setLoading(true)
      const url = await uploadImage(user, file)
      onSelect({ media_url: url, media_type: 'image', source: 'upload' })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const showSearchBox = tab === 'search' || tab === 'stickers'
  const gridItems = useMemo(() => items, [items])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="pop-in flex h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-ink-900 shadow-2xl shadow-black/60 sm:h-[560px] sm:rounded-2xl"
      >
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-white/5 p-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id)
                setQuery('')
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-brand-500/15 text-brand-400'
                  : 'text-ink-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            onClick={onClose}
            aria-label="Close picker"
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-ink-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Search box */}
        {showSearchBox && (
          <div className="border-b border-white/5 p-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                tab === 'stickers'
                  ? 'Search stickers…'
                  : hasGifProvider
                    ? `Search ${gifProviderName} GIFs…`
                    : 'Search GIFs…'
              }
              className="w-full rounded-xl border border-white/10 bg-ink-850 px-4 py-2.5 text-sm text-ink-100 placeholder-ink-500 outline-none transition-colors focus:border-brand-500/60"
              autoFocus
            />
          </div>
        )}

        {/* Body */}
        <div className="nice-scroll flex-1 overflow-y-auto p-3">
          {error && <p className="mb-3 text-sm text-brand-400">{error}</p>}

          {tab === 'upload' ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="grid h-full w-full place-items-center rounded-xl border-2 border-dashed border-white/10 text-ink-300 transition-colors hover:border-brand-500/50 hover:text-white"
            >
              <span className="text-center">
                <span className="mb-2 block text-3xl">🖼️</span>
                <span className="block text-sm font-medium">Click to upload an image</span>
                <span className="mt-1 block text-xs text-ink-500">
                  PNG, JPG, GIF or a WhatsApp-exported sticker — up to 4MB
                </span>
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => upload(e.target.files?.[0])}
              />
            </button>
          ) : loading && gridItems.length === 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-lg bg-ink-800" />
              ))}
            </div>
          ) : gridItems.length === 0 ? (
            <div className="grid h-full place-items-center text-center">
              <div className="max-w-sm text-sm text-ink-300">
                {tab === 'favorites' ? (
                  <>Nothing saved yet — tap the ♥ on any GIF or sticker to keep it here.</>
                ) : !hasGifProvider ? (
                  <>
                    <p className="mb-2 font-medium text-ink-100">GIFs need a (free) GIPHY key</p>
                    Grab one at developers.giphy.com and add{' '}
                    <code className="rounded bg-ink-800 px-1.5 py-0.5 text-xs">VITE_GIPHY_API_KEY</code> to
                    your <code className="rounded bg-ink-800 px-1.5 py-0.5 text-xs">.env</code> file to unlock
                    trending &amp; search. Stickers and uploads work without it.
                  </>
                ) : (
                  <>No results — try another search.</>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {gridItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => pick(item)}
                  title={item.title}
                  className="group relative aspect-square overflow-hidden rounded-lg bg-ink-800 transition-transform hover:scale-[1.03] focus:outline-2 focus:outline-brand-500"
                >
                  <img
                    src={item.preview_url}
                    alt={item.title || ''}
                    loading="lazy"
                    className={`h-full w-full ${
                      item.source === 'sticker-library' ? 'object-contain p-3' : 'object-cover'
                    }`}
                  />
                  <span
                    onClick={(e) => heart(e, item)}
                    role="button"
                    aria-label="Toggle favorite"
                    className={`absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full text-sm backdrop-blur transition-all ${
                      favUrls.has(item.media_url)
                        ? 'bg-brand-500 text-white'
                        : 'bg-black/50 text-white/70 opacity-0 hover:bg-black/70 hover:text-white group-hover:opacity-100'
                    }`}
                  >
                    ♥
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
