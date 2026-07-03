/**
 * Extract a YouTube video ID from any common URL shape:
 * youtu.be/ID, watch?v=ID, /shorts/ID, /embed/ID, /live/ID, or a bare ID.
 * Returns null when nothing valid is found.
 */
export function extractVideoId(input) {
  const raw = (input || '').trim()
  if (!raw) return null

  // Bare 11-char video id
  if (/^[\w-]{11}$/.test(raw)) return raw

  let url
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\.|^m\./, '')
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0]
    return /^[\w-]{11}$/.test(id) ? id : null
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v')
    if (v && /^[\w-]{11}$/.test(v)) return v
    const m = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)
    if (m) return m[1]
  }
  return null
}

/**
 * Fetch title/thumbnail without an API key. Tries YouTube's own oEmbed
 * endpoint first, then noembed as a backup (its nginx occasionally answers
 * 406/blocks), and finally falls back to the predictable thumbnail URL.
 */
export async function fetchVideoMeta(youtubeId) {
  const fallback = {
    title: 'YouTube video',
    author: '',
    thumbnail_url: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
  }
  const watchUrl = encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`)
  const sources = [
    `https://www.youtube.com/oembed?url=${watchUrl}&format=json`,
    `https://noembed.com/embed?url=${watchUrl}`,
  ]
  for (const src of sources) {
    try {
      const res = await fetch(src, { headers: { Accept: 'application/json' } })
      if (!res.ok) continue
      const data = await res.json()
      if (data.error) continue
      return {
        title: data.title || fallback.title,
        author: data.author_name || '',
        thumbnail_url: data.thumbnail_url || fallback.thumbnail_url,
      }
    } catch {
      // try the next source
    }
  }
  return fallback
}
