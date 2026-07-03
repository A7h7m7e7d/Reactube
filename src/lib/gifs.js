/**
 * GIF/sticker provider layer. Supports GIPHY (recommended — Tenor stopped
 * accepting new API clients in Jan 2026) and Tenor v2 for grandfathered keys.
 * Free GIPHY key: https://developers.giphy.com → Create an App → API.
 *
 * Without any key the picker still works — GIF tabs show setup instructions
 * and the sticker/upload tabs stay usable.
 */
const GIPHY_KEY = import.meta.env.VITE_GIPHY_API_KEY
const TENOR_KEY = import.meta.env.VITE_TENOR_API_KEY

export const hasGifProvider = Boolean(GIPHY_KEY || TENOR_KEY)
export const gifProviderName = GIPHY_KEY ? 'GIPHY' : 'Tenor'

const cache = new Map()
const CACHE_TTL = 3 * 60 * 1000 // cache trending/search briefly per the plan

async function cached(url, mapper) {
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GIF API error ${res.status}`)
  const json = await res.json()
  const data = mapper(json)
  cache.set(url, { at: Date.now(), data })
  return data
}

// ------------------------------------------------------------------- GIPHY
function giphy(path, params = {}) {
  const qs = new URLSearchParams({ api_key: GIPHY_KEY, limit: '24', rating: 'pg-13', ...params })
  return cached(`https://api.giphy.com/v1/${path}?${qs}`, (json) =>
    (json.data || []).map(normalizeGiphy).filter(Boolean)
  )
}

function normalizeGiphy(r) {
  const img = r.images || {}
  const preview = img.fixed_width || img.fixed_height_small || img.downsized
  const full = img.downsized_medium?.url ? img.downsized_medium : img.original || preview
  if (!preview?.url) return null
  return {
    id: r.id,
    title: r.title || '',
    preview_url: preview.url,
    media_url: full.url,
    source: 'giphy',
  }
}

// ------------------------------------------------------------------- Tenor
function tenor(endpoint, params = {}) {
  const qs = new URLSearchParams({
    key: TENOR_KEY,
    client_key: 'reactube',
    limit: '24',
    media_filter: 'gif,tinygif,tinygif_transparent,gif_transparent',
    ...params,
  })
  return cached(`https://tenor.googleapis.com/v2/${endpoint}?${qs}`, (json) =>
    (json.results || []).map(normalizeTenor).filter(Boolean)
  )
}

function normalizeTenor(r) {
  const f = r.media_formats || {}
  const preview = f.tinygif_transparent || f.tinygif || f.gif_transparent || f.gif
  const full = f.gif_transparent || f.gif || preview
  if (!preview) return null
  return {
    id: r.id,
    title: r.content_description || '',
    preview_url: preview.url,
    media_url: full.url,
    source: 'tenor',
  }
}

// --------------------------------------------------------------- public API
export const trendingGifs = () =>
  GIPHY_KEY ? giphy('gifs/trending') : tenor('featured')

export const searchGifs = (q) =>
  GIPHY_KEY ? giphy('gifs/search', { q }) : tenor('search', { q })

export const trendingStickers = () =>
  GIPHY_KEY ? giphy('stickers/trending') : tenor('featured', { searchfilter: 'sticker' })

export const searchStickers = (q) =>
  GIPHY_KEY ? giphy('stickers/search', { q }) : tenor('search', { q, searchfilter: 'sticker' })
