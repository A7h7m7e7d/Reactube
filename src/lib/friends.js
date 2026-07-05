/**
 * Friends, groups & chat data layer: friend requests, direct + group
 * messages, unread tracking, and sharing videos / comments into chats.
 *
 * A "chat" everywhere below is { kind: 'friend' | 'group', id } — id is a
 * friendship id or a group id.
 *
 * Same two-backend pattern as store.js:
 *  - Supabase (see supabase/friends.sql and supabase/groups.sql)
 *  - localStorage demo mode, where a couple of friendly bots accept your
 *    requests instantly and reply so the whole flow is testable offline.
 */
import { supabase, hasSupabase } from './supabase'
import { LS } from './store'

const uid = () => crypto.randomUUID()

export const chatKey = (chat) => `${chat.kind}:${chat.id}`

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

// Local pub/sub so demo chats and same-tab unread badges update like realtime
const localListeners = new Map() // topic -> Set<fn>
function emitLocal(topic, payload) {
  localListeners.get(topic)?.forEach((fn) => fn(payload))
}
function onLocal(topic, fn) {
  if (!localListeners.has(topic)) localListeners.set(topic, new Set())
  localListeners.get(topic).add(fn)
  return () => localListeners.get(topic)?.delete(fn)
}

const demoFriendships = () => LS.read('demo.friendships', [])
const demoGroups = () => LS.read('demo.groups', [])
const demoProfile = (id) => DEMO_BOTS.find((b) => b.id === id) || LS.read('demo.user', null)
const demoMsgKey = (chat) => `demo.msgs.${chatKey(chat)}`

function demoBotReply(chat, botId, delay = 900) {
  setTimeout(() => {
    const reply = {
      id: uid(),
      sender_id: botId,
      display_name: DEMO_BOTS.find((b) => b.id === botId)?.display_name || 'Bot',
      kind: 'text',
      body: BOT_REPLIES[Math.floor(Math.random() * BOT_REPLIES.length)],
      payload: null,
      created_at: new Date().toISOString(),
    }
    const key = demoMsgKey(chat)
    const cur = LS.read(key, [])
    cur.push(reply)
    LS.write(key, cur)
    emitLocal(chatKey(chat), reply)
    emitLocal('inbox', reply)
  }, delay)
}

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
  localStorage.removeItem(demoMsgKey({ kind: 'friend', id: friendshipId }))
}

// ------------------------------------------------------------------ groups
/** Groups I'm in: [{ id, name, owner_id, members: [{id, display_name}] }] */
export async function getGroups(user) {
  if (!user) return []
  if (hasSupabase) {
    const { data, error } = await supabase
      .from('groups')
      .select(
        `id, name, owner_id, created_at,
         members:group_members (profile:profiles!group_members_user_id_fkey (id, display_name))`
      )
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map((g) => ({
      ...g,
      members: (g.members || []).map((m) => m.profile).filter(Boolean),
    }))
  }
  return demoGroups()
    .filter((g) => g.member_ids.includes(user.id))
    .map((g) => ({ ...g, members: g.member_ids.map(demoProfile).filter(Boolean) }))
}

export async function createGroup(user, name, memberIds) {
  if (!user) throw new Error('Sign in to create groups.')
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Give the group a name.')
  if (hasSupabase) {
    const { data: group, error } = await supabase
      .from('groups')
      .insert({ name: trimmed, owner_id: user.id })
      .select()
      .single()
    if (error) throw error
    const rows = [user.id, ...memberIds].map((id) => ({ group_id: group.id, user_id: id }))
    const { error: mErr } = await supabase.from('group_members').insert(rows)
    if (mErr) throw mErr
    return group
  }
  const g = {
    id: uid(),
    name: trimmed,
    owner_id: user.id,
    member_ids: [user.id, ...memberIds],
    created_at: new Date().toISOString(),
  }
  LS.write('demo.groups', [g, ...demoGroups()])
  return g
}

export async function addGroupMember(user, groupId, profileId) {
  if (hasSupabase) {
    const { error } = await supabase
      .from('group_members')
      .insert({ group_id: groupId, user_id: profileId })
    if (error) {
      if (error.code === '23505') throw new Error('Already in the group.')
      throw error
    }
    return
  }
  const list = demoGroups()
  const g = list.find((x) => x.id === groupId)
  if (g && !g.member_ids.includes(profileId)) g.member_ids.push(profileId)
  LS.write('demo.groups', list)
}

/** Leave a group; the owner leaving deletes the group for everyone. */
export async function leaveGroup(user, group) {
  if (hasSupabase) {
    const { error } =
      group.owner_id === user.id
        ? await supabase.from('groups').delete().eq('id', group.id)
        : await supabase
            .from('group_members')
            .delete()
            .eq('group_id', group.id)
            .eq('user_id', user.id)
    if (error) throw error
    return
  }
  let list = demoGroups()
  if (group.owner_id === user.id) list = list.filter((g) => g.id !== group.id)
  else {
    const g = list.find((x) => x.id === group.id)
    if (g) g.member_ids = g.member_ids.filter((id) => id !== user.id)
  }
  LS.write('demo.groups', list)
  localStorage.removeItem(demoMsgKey({ kind: 'group', id: group.id }))
}

// ---------------------------------------------------------------- messages
export async function getMessages(user, chat) {
  if (hasSupabase) {
    const table = chat.kind === 'group' ? 'group_messages' : 'messages'
    const col = chat.kind === 'group' ? 'group_id' : 'friendship_id'
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(col, chat.id)
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) throw error
    return data || []
  }
  return LS.read(demoMsgKey(chat), [])
}

/**
 * Send a message to a friend or group chat. kind 'text' needs body;
 * 'video' / 'comment' carry a payload snapshot (see supabase/friends.sql).
 */
export async function sendMessage(user, chat, { kind = 'text', body = null, payload = null }) {
  if (!user) throw new Error('Sign in to chat.')

  if (hasSupabase) {
    const row =
      chat.kind === 'group'
        ? { group_id: chat.id, sender_id: user.id, display_name: user.display_name, kind, body, payload }
        : { friendship_id: chat.id, sender_id: user.id, kind, body, payload }
    const table = chat.kind === 'group' ? 'group_messages' : 'messages'
    const { data, error } = await supabase.from(table).insert(row).select().single()
    if (error) throw error
    return data
  }

  const key = demoMsgKey(chat)
  const list = LS.read(key, [])
  const full = {
    id: uid(),
    sender_id: user.id,
    display_name: user.display_name,
    kind,
    body,
    payload,
    created_at: new Date().toISOString(),
  }
  list.push(full)
  LS.write(key, list)

  // Bots keep the conversation going
  let botId = null
  if (chat.kind === 'friend') {
    const f = demoFriendships().find((x) => x.id === chat.id)
    const otherId = f ? (f.requester_id === user.id ? f.addressee_id : f.requester_id) : null
    if (otherId?.startsWith('bot-')) botId = otherId
  } else {
    const g = demoGroups().find((x) => x.id === chat.id)
    const bots = (g?.member_ids || []).filter((id) => id.startsWith('bot-'))
    if (bots.length) botId = bots[Math.floor(Math.random() * bots.length)]
  }
  if (botId) demoBotReply(chat, botId)
  return full
}

/** Live-append new messages in an open chat. Returns a cleanup fn. */
export function subscribeMessages(chat, onMessage) {
  if (!hasSupabase) return onLocal(chatKey(chat), onMessage)
  const table = chat.kind === 'group' ? 'group_messages' : 'messages'
  const col = chat.kind === 'group' ? 'group_id' : 'friendship_id'
  // Channel names must be unique per subscription: supabase.channel(name)
  // returns an existing channel with the same name, and adding callbacks to
  // an already-subscribed channel throws (black-screens the app).
  const channel = supabase
    .channel(`${chatKey(chat)}:${uid()}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table, filter: `${col}=eq.${chat.id}` },
      (p) => onMessage(p.new)
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

// ------------------------------------------------------------------ unread
/**
 * Unread counts for all my chats: { total, byChat } with byChat keyed by
 * chatKey() ("friend:<id>" / "group:<id>").
 */
export async function getUnreadCounts(user) {
  const empty = { total: 0, byChat: {} }
  if (!user) return empty

  if (hasSupabase) {
    const { data, error } = await supabase.rpc('unread_counts')
    if (error) throw error
    const byChat = {}
    let total = 0
    for (const r of data || []) {
      byChat[`${r.chat_kind}:${r.chat_id}`] = Number(r.unread)
      total += Number(r.unread)
    }
    return { total, byChat }
  }

  const reads = LS.read(`demo.reads.${user.id}`, {})
  const byChat = {}
  let total = 0
  const chats = [
    ...demoFriendships()
      .filter((f) => f.status === 'accepted' && (f.requester_id === user.id || f.addressee_id === user.id))
      .map((f) => ({ kind: 'friend', id: f.id })),
    ...demoGroups()
      .filter((g) => g.member_ids.includes(user.id))
      .map((g) => ({ kind: 'group', id: g.id })),
  ]
  for (const chat of chats) {
    const lastRead = reads[chatKey(chat)] || ''
    const n = LS.read(demoMsgKey(chat), []).filter(
      (m) => m.sender_id !== user.id && m.created_at > lastRead
    ).length
    if (n > 0) {
      byChat[chatKey(chat)] = n
      total += n
    }
  }
  return { total, byChat }
}

/** Mark a chat as fully read (called when it's open on screen). */
export async function markRead(user, chat) {
  if (!user) return
  if (hasSupabase) {
    await supabase.from('chat_reads').upsert({
      user_id: user.id,
      chat_kind: chat.kind,
      chat_id: chat.id,
      last_read_at: new Date().toISOString(),
    })
  } else {
    const key = `demo.reads.${user.id}`
    const reads = LS.read(key, {})
    reads[chatKey(chat)] = new Date().toISOString()
    LS.write(key, reads)
  }
  // Same-tab badges (navbar) refresh immediately
  emitLocal('unread-changed', null)
}

/** Fires when this tab marks something read (pair with subscribeInbox). */
export function onUnreadChanged(fn) {
  return onLocal('unread-changed', fn)
}

/**
 * Fires whenever a new message lands in any of my chats (RLS scopes the
 * realtime stream to conversations I'm in). Drives the unread badge.
 */
export function subscribeInbox(user, onMessage) {
  if (!hasSupabase) return onLocal('inbox', onMessage)
  if (!user) return () => {}
  const channel = supabase
    .channel(`inbox:${user.id}:${uid()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) =>
      onMessage(p.new)
    )
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages' }, (p) =>
      onMessage(p.new)
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

/** Re-fires whenever any of my friendships change (new request, accept, …). */
export function subscribeFriendships(user, onChange) {
  if (!hasSupabase || !user) return () => {}
  const channel = supabase
    .channel(`friendships:${user.id}:${uid()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => onChange())
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
