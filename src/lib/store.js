/**
 * Data layer for auth, comments, videos and favorites.
 *
 * Two backends behind one API:
 *  - Supabase (when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set)
 *  - localStorage "demo mode" so the app is fully usable with zero setup
 */
import { supabase, hasSupabase } from './supabase'
import { fetchVideoMeta } from './youtube'

// ---------------------------------------------------------------- demo mode
export const LS = {
  read(key, fallback) {
    try {
      const v = localStorage.getItem(key)
      return v ? JSON.parse(v) : fallback
    } catch {
      return fallback
    }
  },
  write(key, value) {
    localStorage.setItem(key, JSON.stringify(value))
  },
}

const uid = () => crypto.randomUUID()
const authListeners = new Set()
const notifyAuth = (user) => authListeners.forEach((fn) => fn(user))

export const isDemoMode = !hasSupabase

// -------------------------------------------------------------------- auth
export async function getUser() {
  if (hasSupabase) {
    const { data } = await supabase.auth.getUser()
    const u = data?.user
    return u
      ? { id: u.id, email: u.email, display_name: u.user_metadata?.display_name || u.email.split('@')[0] }
      : null
  }
  return LS.read('demo.user', null)
}

export function onAuthChange(fn) {
  if (hasSupabase) {
    const { data } = supabase.auth.onAuthStateChange(async () => fn(await getUser()))
    return () => data.subscription.unsubscribe()
  }
  authListeners.add(fn)
  return () => authListeners.delete(fn)
}

export async function signUp({ email, password, displayName }) {
  if (hasSupabase) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })
    if (error) throw error
    // No session ⇒ Supabase "Confirm email" is on and a link was sent
    if (!data.session) return { needsConfirmation: true }
    return getUser()
  }
  const user = { id: uid(), email, display_name: displayName || email.split('@')[0] }
  LS.write('demo.user', user)
  notifyAuth(user)
  return user
}

export async function signIn({ email, password }) {
  if (hasSupabase) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return getUser()
  }
  // Demo mode: signing in just creates/uses a local identity.
  const existing = LS.read('demo.user', null)
  const user =
    existing?.email === email ? existing : { id: uid(), email, display_name: email.split('@')[0] }
  LS.write('demo.user', user)
  notifyAuth(user)
  return user
}

export async function signOut() {
  if (hasSupabase) {
    await supabase.auth.signOut()
    return
  }
  localStorage.removeItem('demo.user')
  notifyAuth(null)
}

// ------------------------------------------------------------------ videos
/** Ensure a `videos` row exists for this youtube_id; returns its metadata. */
export async function ensureVideo(youtubeId) {
  if (hasSupabase) {
    const { data: existing } = await supabase
      .from('videos')
      .select('*')
      .eq('youtube_id', youtubeId)
      .maybeSingle()
    if (existing) return existing
    const meta = await fetchVideoMeta(youtubeId)
    const { data: inserted } = await supabase
      .from('videos')
      .upsert(
        { youtube_id: youtubeId, title: meta.title, thumbnail_url: meta.thumbnail_url },
        { onConflict: 'youtube_id' }
      )
      .select()
      .maybeSingle()
    return inserted || { youtube_id: youtubeId, ...meta }
  }

  const videos = LS.read('demo.videos', {})
  if (videos[youtubeId]) return videos[youtubeId]
  const meta = await fetchVideoMeta(youtubeId)
  const row = { id: uid(), youtube_id: youtubeId, ...meta, created_at: new Date().toISOString() }
  videos[youtubeId] = row
  LS.write('demo.videos', videos)
  return row
}

/** Recently watched videos (for the home page shelf). */
export async function recentVideos(limit = 8) {
  if (hasSupabase) {
    const { data } = await supabase
      .from('videos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    return data || []
  }
  const videos = Object.values(LS.read('demo.videos', {}))
  return videos.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
}

// ---------------------------------------------------------------- comments
/**
 * Fetch comments for a video. sort: 'top' (score desc, Reddit-style, default)
 * or 'new' (latest first). Each comment carries `score` and `my_vote` (-1|0|1).
 */
export async function getComments(youtubeId, sort = 'top') {
  if (hasSupabase) {
    let query = supabase.from('comments').select('*').eq('youtube_id', youtubeId)
    query =
      sort === 'top'
        ? query.order('score', { ascending: false }).order('created_at', { ascending: false })
        : query.order('created_at', { ascending: false })
    const { data, error } = await query
    if (error) throw error
    const comments = data || []

    // RLS limits the votes table to the caller's own rows, so this returns
    // exactly "my votes" for these comments.
    const user = await getUser()
    const myVotes = {}
    if (user && comments.length) {
      const { data: votes } = await supabase
        .from('votes')
        .select('comment_id, value')
        .in('comment_id', comments.map((c) => c.id))
      for (const v of votes || []) myVotes[v.comment_id] = v.value
    }
    return comments.map((c) => ({ ...c, my_vote: myVotes[c.id] || 0 }))
  }

  const user = LS.read('demo.user', null)
  const list = LS.read(`demo.comments.${youtubeId}`, []).map((c) => ({
    ...c,
    score: Object.values(c.votes || {}).reduce((a, b) => a + b, 0),
    my_vote: (user && c.votes?.[user.id]) || 0,
  }))
  return sort === 'top'
    ? list.sort((a, b) => b.score - a.score || b.created_at.localeCompare(a.created_at))
    : list.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

/** Cast, switch, or clear a vote. value: 1 (up), -1 (down), 0 (remove). */
export async function voteComment(youtubeId, commentId, user, value) {
  if (!user) throw new Error('Sign in to vote.')
  if (hasSupabase) {
    if (value === 0) {
      const { error } = await supabase
        .from('votes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', user.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('votes')
        .upsert(
          { comment_id: commentId, user_id: user.id, value },
          { onConflict: 'comment_id,user_id' }
        )
      if (error) throw error
    }
    return
  }

  const key = `demo.comments.${youtubeId}`
  const list = LS.read(key, [])
  const c = list.find((c) => c.id === commentId)
  if (!c) return
  c.votes = c.votes || {}
  if (value === 0) delete c.votes[user.id]
  else c.votes[user.id] = value
  LS.write(key, list)
}

const RATE_LIMIT = { max: 5, windowMs: 60_000 }
let recentPosts = []

export async function postComment(youtubeId, user, payload) {
  // Client-side rate limit (the SQL schema enforces the same rule server-side)
  const now = Date.now()
  recentPosts = recentPosts.filter((t) => now - t < RATE_LIMIT.windowMs)
  if (recentPosts.length >= RATE_LIMIT.max) {
    throw new Error('Slow down — max 5 comments per minute.')
  }
  recentPosts.push(now)

  const row = {
    youtube_id: youtubeId,
    user_id: user.id,
    display_name: user.display_name,
    body_text: payload.bodyText || null,
    media_url: payload.mediaUrl || null,
    media_type: payload.mediaType || null,
    overlay_text: payload.overlayText || null,
    overlay_position: payload.overlayPosition || null,
  }

  if (hasSupabase) {
    const { data, error } = await supabase.from('comments').insert(row).select().single()
    if (error) throw error
    return { ...data, my_vote: 0 }
  }

  const full = {
    ...row,
    id: uid(),
    created_at: new Date().toISOString(),
    reported_count: 0,
    votes: {},
    score: 0,
    my_vote: 0,
  }
  const list = LS.read(`demo.comments.${youtubeId}`, [])
  list.unshift(full)
  LS.write(`demo.comments.${youtubeId}`, list)
  return full
}

export async function deleteComment(youtubeId, commentId) {
  if (hasSupabase) {
    const { error } = await supabase.from('comments').delete().eq('id', commentId)
    if (error) throw error
    return
  }
  const key = `demo.comments.${youtubeId}`
  LS.write(key, LS.read(key, []).filter((c) => c.id !== commentId))
}

export async function reportComment(youtubeId, commentId) {
  if (hasSupabase) {
    const { error } = await supabase.rpc('report_comment', { comment_id: commentId })
    if (error) throw error
    return
  }
  const key = `demo.comments.${youtubeId}`
  const list = LS.read(key, [])
  const c = list.find((c) => c.id === commentId)
  if (c) c.reported_count = (c.reported_count || 0) + 1
  LS.write(key, list)
}

// --------------------------------------------------------------- favorites
export async function getFavorites(user) {
  if (!user) return []
  if (hasSupabase) {
    const { data } = await supabase
      .from('favorites')
      .select('*')
      .order('created_at', { ascending: false })
    return data || []
  }
  return LS.read(`demo.favorites.${user.id}`, [])
}

export async function toggleFavorite(user, item) {
  if (!user) throw new Error('Sign in to save favorites.')
  if (hasSupabase) {
    const { data: existing } = await supabase
      .from('favorites')
      .select('id')
      .eq('media_url', item.media_url)
      .maybeSingle()
    if (existing) {
      await supabase.from('favorites').delete().eq('id', existing.id)
      return false
    }
    await supabase.from('favorites').insert({
      user_id: user.id,
      media_url: item.media_url,
      media_type: item.media_type,
      source: item.source,
    })
    return true
  }

  const key = `demo.favorites.${user.id}`
  const list = LS.read(key, [])
  const idx = list.findIndex((f) => f.media_url === item.media_url)
  if (idx >= 0) {
    list.splice(idx, 1)
    LS.write(key, list)
    return false
  }
  list.unshift({ ...item, id: uid(), created_at: new Date().toISOString() })
  LS.write(key, list)
  return true
}

// ---------------------------------------------------------------- presence
/**
 * Live "who's here" counter for a video page via Supabase Realtime presence.
 * Calls onCount(n) whenever someone joins/leaves. Returns a cleanup fn.
 * Guests count too (random per-tab key). Demo mode: always 1 (just you).
 */
export function watchPresence(youtubeId, user, onCount) {
  if (!hasSupabase) {
    onCount(1)
    return () => {}
  }
  const key = user?.id || `guest-${crypto.randomUUID()}`
  const channel = supabase.channel(`presence:video:${youtubeId}`, {
    config: { presence: { key } },
  })
  channel.on('presence', { event: 'sync' }, () => {
    onCount(Math.max(1, Object.keys(channel.presenceState()).length))
  })
  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') await channel.track({ joined_at: Date.now() })
  })
  return () => {
    supabase.removeChannel(channel)
  }
}

// ------------------------------------------------------------ image upload
/** Upload a user image; returns a public URL (data URL in demo mode). */
export async function uploadImage(user, file) {
  if (file.size > 4 * 1024 * 1024) throw new Error('Image must be under 4MB.')
  if (hasSupabase) {
    const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
    const { error } = await supabase.storage.from('comment-media').upload(path, file)
    if (error) throw error
    const { data } = supabase.storage.from('comment-media').getPublicUrl(path)
    return data.publicUrl
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
