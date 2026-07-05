/**
 * Friends & chat data layer: friend requests, direct messages, and sharing
 * videos / comments into a chat.
 *
 * Same two-backend pattern as store.js:
 *  - Supabase (profiles / friendships / messages tables + realtime)
 *  - localStorage demo mode, where a couple of friendly bots accept your
 *    requests instantly and reply so the whole flow is testable offline.
 */
import { supabase, hasSupabase } from './supabase'
import { LS } from './store'

const uid = () => crypto.randomUUID()

// ------------------------------------------------------------- demo helpers
const DEMO_BOTS = [
  { id: 'bot-reacbot', display_name: 'ReacBot', email: 'reacbot@reactube.demo' },
  { id: 'bot-gifgoblin', display_name: 'GifGoblin', email: 'goblin@reactube.demo' },
]

const BOT_REPLIES = [
  'LMAOOO 💀',
  'ok that one actually got me 😂',
  'bro where do you FIND these',
  'sending this to everyone i know',
  'certified banger 🔥',
]

// Local pub/sub so demo chats update the UI like realtime would
const localListeners = new Map() // friendshipId -> Set<fn>
function emitLocal(friendshipId, message) {
  localListeners.get(friendshipId)?.forEach((fn) => fn(message))
}

const demoFriendships = () => LS.read('demo.friendships', [])
const demoProfile = (id) => DEMO_BOTS.find((b) => b.id === id) || LS.read('demo.user', null)

// ------------------------------------------------------------------ search
/** Find people by display name or email (excludes yourself). */
export async function searchUsers(user, query) {
  const q = query.trim()
  if (!user || q.length < 2) return []
  if (hasSupabase) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, email')
      .or(`display_name.ilike.%${q}%,email.ilike.%${q}%`)
      .neq('id', user.id)
      .limit(10)
    if (error) throw error
    return data || []
  }
  return DEMO_BOTS.filter(
    (b) =>
      b.display_name.toLowerCase().includes(q.toLowerCase()) ||
      b.email.toLowerCase().includes(q.toLowerCase())
  )
}

// ------------------------------------------------------------- friendships
/**
 * Everything the friends UI needs in one call:
 * { friends, incoming, outgoing } — each item is
 * { friendship_id, status, profile } (profile = the *other* person).
 */
export async function getFriendData(user) {
  const empty = { friends: [], incoming: [], outgoing: [] }
  if (!user) return empty

  let rows
  if (hasSupabase) {
    const { data, error } = await supabase
      .from('friendships')
      .select(
        `id, requester_id, addressee_id, status, created_at,
         requester:profiles!friendships_requester_id_fkey (id, display_name, email),
         addressee:profiles!friendships_addressee_id_fkey (id, display_name, email)`
      )
      .order('created_at', { ascending: false })
    if (error) throw error
    rows = (data || []).map((f) => ({
      ...f,
      profile: f.requester_id === user.id ? f.addressee : f.requester,
    }))
  } else {
    rows = demoFriendships()
      .filter((f) => f.requester_id === user.id || f.addressee_id === user.id)
      .map((f) => ({
        ...f,
        profile: demoProfile(f.requester_id === user.id ? f.addressee_id : f.requester_id),
      }))
  }

  const out = { friends: [], incoming: [], outgoing: [] }
  for (const f of rows.filter((f) => f.profile)) {
    const item = { friendship_id: f.id, status: f.status, profile: f.profile }
    if (f.status === 'accepted') out.friends.push(item)
    else if (f.addressee_id === user.id) out.incoming.push(item)
    else out.outgoing.push(item)
  }
  return out
}

export async function sendFriendRequest(user, profileId) {
  if (!user) throw new Error('Sign in to add friends.')
  if (hasSupabase) {
    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: user.id, addressee_id: profileId })
    if (error) {
      if (error.code === '23505') throw new Error('Already friends (or request pending).')
      throw error
    }
    return
  }
  const list = demoFriendships()
  const exists = list.some(
    (f) =>
      (f.requester_id === user.id && f.addressee_id === profileId) ||
      (f.requester_id === profileId && f.addressee_id === user.id)
  )
  if (exists) throw new Error('Already friends (or request pending).')
  // Demo bots are eager — they accept on the spot
  list.push({
    id: uid(),
    requester_id: user.id,
    addressee_id: profileId,
    status: 'accepted',
    created_at: new Date().toISOString(),
  })
  LS.write('demo.friendships', list)
}

export async function acceptRequest(user, friendshipId) {
  if (hasSupabase) {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId)
    if (error) throw error
    return
  }
  const list = demoFriendships()
  const f = list.find((x) => x.id === friendshipId)
  if (f) f.status = 'accepted'
  LS.write('demo.friendships', list)
}

/** Decline an incoming request, cancel an outgoing one, or unfriend. */
export async function removeFriendship(user, friendshipId) {
  if (hasSupabase) {
    const { error } = await supabase.from('friendships').delete().eq('id', friendshipId)
    if (error) throw error
    return
  }
  LS.write('demo.friendships', demoFriendships().filter((f) => f.id !== friendshipId))
  localStorage.removeItem(`demo.messages.${friendshipId}`)
}

// ---------------------------------------------------------------- messages
export async function getMessages(user, friendshipId) {
  if (hasSupabase) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('friendship_id', friendshipId)
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) throw error
    return data || []
  }
  return LS.read(`demo.messages.${friendshipId}`, [])
}

/**
 * Send a message. kind 'text' needs body; 'video' / 'comment' carry a payload
 * snapshot (see supabase/friends.sql for the shapes).
 */
export async function sendMessage(user, friendshipId, { kind = 'text', body = null, payload = null }) {
  if (!user) throw new Error('Sign in to chat.')
  const row = { friendship_id: friendshipId, sender_id: user.id, kind, body, payload }

  if (hasSupabase) {
    const { data, error } = await supabase.from('messages').insert(row).select().single()
    if (error) throw error
    return data
  }

  const key = `demo.messages.${friendshipId}`
  const list = LS.read(key, [])
  const full = { ...row, id: uid(), created_at: new Date().toISOString() }
  list.push(full)
  LS.write(key, list)

  // Bots keep the conversation going
  const friendship = demoFriendships().find((f) => f.id === friendshipId)
  const otherId = friendship
    ? friendship.requester_id === user.id
      ? friendship.addressee_id
      : friendship.requester_id
    : null
  if (otherId?.startsWith('bot-')) {
    setTimeout(() => {
      const reply = {
        id: uid(),
        friendship_id: friendshipId,
        sender_id: otherId,
        kind: 'text',
        body: BOT_REPLIES[Math.floor(Math.random() * BOT_REPLIES.length)],
        payload: null,
        created_at: new Date().toISOString(),
      }
      const cur = LS.read(key, [])
      cur.push(reply)
      LS.write(key, cur)
      emitLocal(friendshipId, reply)
    }, 900)
  }
  return full
}

/** Live-append new messages in an open chat. Returns a cleanup fn. */
export function subscribeMessages(friendshipId, onMessage) {
  if (!hasSupabase) {
    if (!localListeners.has(friendshipId)) localListeners.set(friendshipId, new Set())
    localListeners.get(friendshipId).add(onMessage)
    return () => localListeners.get(friendshipId)?.delete(onMessage)
  }
  // Channel names must be unique per subscription: supabase.channel(name)
  // returns an existing channel with the same name, and adding callbacks to
  // an already-subscribed channel throws (black-screens the app).
  const channel = supabase
    .channel(`messages:${friendshipId}:${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `friendship_id=eq.${friendshipId}` },
      (p) => onMessage(p.new)
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

/** Re-fires whenever any of my friendships change (new request, accept, …). */
export function subscribeFriendships(user, onChange) {
  if (!hasSupabase || !user) return () => {}
  // Unique name per subscription — the navbar badge and the Friends page
  // both subscribe at once (see note in subscribeMessages).
  const channel = supabase
    .channel(`friendships:${user.id}:${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => onChange())
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
