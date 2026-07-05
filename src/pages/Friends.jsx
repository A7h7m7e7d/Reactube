import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import {
  chatKey,
  searchUsers,
  getFriendData,
  sendFriendRequest,
  acceptRequest,
  removeFriendship,
  getGroups,
  createGroup,
  addGroupMember,
  leaveGroup,
  getMessages,
  sendMessage,
  subscribeMessages,
  subscribeFriendships,
  subscribeInbox,
  getUnreadCounts,
  markRead,
  onUnreadChanged,
} from '../lib/friends'
import { timeAgo, avatarHue } from '../lib/format'
import MediaWithOverlay from '../components/MediaWithOverlay'

function Avatar({ profile, size = 'h-9 w-9 text-sm' }) {
  return (
    <span
      className={`grid ${size} shrink-0 place-items-center rounded-full font-semibold text-white`}
      style={{ background: `hsl(${avatarHue(profile?.id || '')} 65% 45%)` }}
    >
      {profile?.display_name?.[0]?.toUpperCase() || '?'}
    </span>
  )
}

function UnreadChip({ count }) {
  if (!count) return null
  return (
    <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">
      {count > 99 ? '99+' : count}
    </span>
  )
}

/** One chat message. Text bubbles, or rich cards for shared videos/comments. */
function MessageBubble({ m, mine, showSender }) {
  const align = mine ? 'items-end' : 'items-start'
  const bubble = mine
    ? 'bg-brand-500/15 border-brand-500/20'
    : 'bg-ink-800 border-white/5'

  return (
    <div className={`flex flex-col ${align}`}>
      <div className={`max-w-[85%] rounded-2xl border px-3.5 py-2.5 ${bubble}`}>
        {showSender && !mine && (
          <p
            className="mb-1 text-[11px] font-semibold"
            style={{ color: `hsl(${avatarHue(m.sender_id)} 70% 65%)` }}
          >
            {m.display_name || 'anon'}
          </p>
        )}

        {m.kind === 'video' && m.payload && (
          <Link
            to={`/watch/${m.payload.youtube_id}`}
            className="group block w-56 max-w-full overflow-hidden rounded-xl border border-white/10 bg-black"
          >
            {m.payload.thumbnail_url && (
              <img
                src={m.payload.thumbnail_url}
                alt=""
                className="aspect-video w-full object-cover transition-transform group-hover:scale-105"
              />
            )}
            <div className="p-2.5">
              <p className="line-clamp-2 text-xs font-semibold text-ink-100">
                {m.payload.title || 'YouTube video'}
              </p>
              <p className="mt-1 text-[11px] font-medium text-brand-400">▶ Watch on ReacTube</p>
            </div>
          </Link>
        )}

        {m.kind === 'comment' && m.payload && (
          <div className="w-64 max-w-full">
            <p className="mb-1.5 text-[11px] font-medium text-ink-500">
              💬 comment on{' '}
              <Link
                to={`/watch/${m.payload.youtube_id}`}
                className="text-brand-400 hover:underline"
              >
                {m.payload.video_title || 'a video'}
              </Link>
            </p>
            <div className="rounded-xl border border-white/10 bg-ink-950/60 p-2.5">
              <p className="text-xs font-semibold text-ink-300">
                {m.payload.comment?.display_name || 'anon'}
              </p>
              {m.payload.comment?.body_text && (
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-100">
                  {m.payload.comment.body_text}
                </p>
              )}
              {m.payload.comment?.media_url && (
                <div className="mt-2">
                  <MediaWithOverlay
                    mediaUrl={m.payload.comment.media_url}
                    mediaType={m.payload.comment.media_type}
                    overlayText={m.payload.comment.overlay_text}
                    overlayPosition={m.payload.comment.overlay_position}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {m.body && (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-100">
            {m.body}
          </p>
        )}
      </div>
      <span className="mt-1 px-1 text-[10px] text-ink-500">{timeAgo(m.created_at)}</span>
    </div>
  )
}

/**
 * Chat pane for a friend or group conversation.
 * chat: { kind: 'friend'|'group', id, title } plus profile (friend) or
 * group + addable friends (group).
 */
function ChatPane({ user, chat, addableFriends, onBack, onLeave, onAddMember }) {
  const [messages, setMessages] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)
  const isGroup = chat.kind === 'group'

  const appendUnique = (msg) =>
    setMessages((prev) => (prev?.some((m) => m.id === msg.id) ? prev : [...(prev || []), msg]))

  useEffect(() => {
    let mounted = true
    setMessages(null)
    getMessages(user, chat).then((list) => mounted && setMessages(list))
    const unsub = subscribeMessages(chat, appendUnique)
    return () => {
      mounted = false
      unsub()
    }
  }, [chat.kind, chat.id])

  // Everything visible in an open chat counts as read
  useEffect(() => {
    if (messages !== null) markRead(user, chat)
  }, [messages, chat.kind, chat.id])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const send = async (e) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const msg = await sendMessage(user, chat, { kind: 'text', body })
      appendUnique(msg)
      setDraft('')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
        <button
          onClick={onBack}
          className="grid h-8 w-8 place-items-center rounded-lg text-ink-300 transition-colors hover:bg-white/10 md:hidden"
          aria-label="Back to friends list"
        >
          ←
        </button>
        {isGroup ? (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-700 text-sm">
            👥
          </span>
        ) : (
          <Avatar profile={chat.profile} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-100">{chat.title}</p>
          <p className="truncate text-xs text-ink-500">
            {isGroup
              ? `${chat.group.members.length} members — ${chat.group.members
                  .map((m) => m.display_name)
                  .join(', ')}`
              : 'friend'}
          </p>
        </div>

        {isGroup && chat.group.owner_id === user.id && addableFriends.length > 0 && (
          <select
            value=""
            onChange={(e) => e.target.value && onAddMember(e.target.value)}
            className="max-w-28 rounded-lg border border-white/10 bg-ink-950 px-2 py-1.5 text-xs text-ink-300 focus:outline-none"
          >
            <option value="">+ Add…</option>
            {addableFriends.map((f) => (
              <option key={f.profile.id} value={f.profile.id}>
                {f.profile.display_name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={onLeave}
          className="rounded-lg px-2.5 py-1.5 text-xs text-ink-500 transition-colors hover:bg-brand-500/10 hover:text-brand-400"
        >
          {isGroup ? (chat.group.owner_id === user.id ? 'Delete group' : 'Leave') : 'Unfriend'}
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="nice-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages === null ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 w-2/3 animate-pulse rounded-2xl bg-ink-800" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="grid h-full place-items-center text-center text-sm text-ink-500">
            <div>
              <p>No messages yet — say hi 👋</p>
              <p className="mt-1 text-xs">
                Tip: use the <span className="text-ink-300">Share</span> buttons on videos and
                comments to send them here.
              </p>
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <MessageBubble key={m.id} m={m} mine={m.sender_id === user.id} showSender={isGroup} />
          ))
        )}
      </div>

      {/* Composer */}
      <form onSubmit={send} className="flex gap-2 border-t border-white/5 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${chat.title}…`}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-ink-950 px-3.5 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:border-brand-500/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-400 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  )
}

export default function Friends() {
  const { user, loading } = useAuth()
  const [data, setData] = useState({ friends: [], incoming: [], outgoing: [] })
  const [groups, setGroups] = useState([])
  const [unread, setUnread] = useState({ total: 0, byChat: {} })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searchMsg, setSearchMsg] = useState('')
  const [selected, setSelected] = useState(null) // { kind, id, title, profile?/group? }
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupPick, setGroupPick] = useState([]) // profile ids for the new group

  const refresh = useCallback(() => {
    if (!user) return
    Promise.all([getFriendData(user), getGroups(user), getUnreadCounts(user)])
      .then(([d, g, u]) => {
        setData(d)
        setGroups(g)
        setUnread(u)
        // Keep the open chat in sync (unfriended / group changed elsewhere)
        setSelected((sel) => {
          if (!sel) return null
          if (sel.kind === 'friend') {
            const f = d.friends.find((x) => x.friendship_id === sel.id)
            return f
              ? { kind: 'friend', id: f.friendship_id, title: f.profile.display_name, profile: f.profile }
              : null
          }
          const grp = g.find((x) => x.id === sel.id)
          return grp ? { kind: 'group', id: grp.id, title: grp.name, group: grp } : null
        })
      })
      .catch((e) => setError(e.message))
  }, [user?.id])

  useEffect(() => {
    refresh()
    const subs = [
      subscribeFriendships(user, refresh),
      subscribeInbox(user, refresh),
      onUnreadChanged(refresh),
    ]
    return () => subs.forEach((fn) => fn())
  }, [refresh])

  // Debounced people search
  useEffect(() => {
    if (!user) return
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearchMsg('')
      return
    }
    const t = setTimeout(() => {
      searchUsers(user, q)
        .then((r) => {
          setResults(r)
          setSearchMsg(r.length ? '' : 'No one found with that name or email.')
        })
        .catch(() => setSearchMsg('Search failed — try again.'))
    }, 300)
    return () => clearTimeout(t)
  }, [query, user?.id])

  if (loading) return null
  if (!user) {
    return (
      <main className="mx-auto max-w-md px-4 pt-24 text-center">
        <h1 className="font-display text-2xl font-semibold">Friends</h1>
        <p className="mt-3 text-sm text-ink-300">
          <Link to="/auth" className="text-brand-400 hover:underline">
            Sign in
          </Link>{' '}
          to add friends, chat, and share videos and comments.
        </p>
      </main>
    )
  }

  const knownIds = new Set(
    [...data.friends, ...data.incoming, ...data.outgoing].map((f) => f.profile?.id)
  )

  const openFriend = (f) => {
    setSelected({ kind: 'friend', id: f.friendship_id, title: f.profile.display_name, profile: f.profile })
    setUnread((u) => stripChat(u, `friend:${f.friendship_id}`))
  }
  const openGroup = (g) => {
    setSelected({ kind: 'group', id: g.id, title: g.name, group: g })
    setUnread((u) => stripChat(u, `group:${g.id}`))
  }
  const stripChat = (u, key) => {
    const n = u.byChat[key] || 0
    if (!n) return u
    const byChat = { ...u.byChat }
    delete byChat[key]
    return { total: u.total - n, byChat }
  }

  const addFriend = async (profileId) => {
    setError('')
    try {
      await sendFriendRequest(user, profileId)
      setResults((r) => r.filter((p) => p.id !== profileId))
      refresh()
    } catch (e) {
      setError(e.message)
    }
  }

  const act = async (fn, ...args) => {
    setError('')
    try {
      await fn(user, ...args)
      refresh()
    } catch (e) {
      setError(e.message)
    }
  }

  const submitGroup = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await createGroup(user, groupName, groupPick)
      setCreating(false)
      setGroupName('')
      setGroupPick([])
      refresh()
    } catch (e) {
      setError(e.message)
    }
  }

  const sidebar = (
    <div className="nice-scroll flex h-full min-h-0 flex-col gap-5 overflow-y-auto p-4">
      {/* Add friends */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
          Add a friend
        </h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full rounded-xl border border-white/10 bg-ink-950 px-3.5 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:border-brand-500/50 focus:outline-none"
        />
        {searchMsg && <p className="mt-2 text-xs text-ink-500">{searchMsg}</p>}
        {results.length > 0 && (
          <ul className="mt-2 space-y-1">
            {results.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
                <Avatar profile={p} size="h-8 w-8 text-sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink-100">
                  {p.display_name}
                </span>
                {knownIds.has(p.id) ? (
                  <span className="text-xs text-ink-500">Added</span>
                ) : (
                  <button
                    onClick={() => addFriend(p.id)}
                    className="rounded-lg bg-brand-500/15 px-2.5 py-1 text-xs font-semibold text-brand-400 transition-colors hover:bg-brand-500/25"
                  >
                    Add
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Incoming requests */}
      {data.incoming.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-glow">
            Friend requests
          </h2>
          <ul className="space-y-1">
            {data.incoming.map((f) => (
              <li key={f.friendship_id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
                <Avatar profile={f.profile} size="h-8 w-8 text-sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink-100">
                  {f.profile?.display_name}
                </span>
                <button
                  onClick={() => act(acceptRequest, f.friendship_id)}
                  className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/25"
                >
                  Accept
                </button>
                <button
                  onClick={() => act(removeFriendship, f.friendship_id)}
                  className="rounded-lg px-2 py-1 text-xs text-ink-500 transition-colors hover:bg-white/5 hover:text-ink-300"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Outgoing requests */}
      {data.outgoing.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
            Sent requests
          </h2>
          <ul className="space-y-1">
            {data.outgoing.map((f) => (
              <li key={f.friendship_id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
                <Avatar profile={f.profile} size="h-8 w-8 text-sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink-300">
                  {f.profile?.display_name}
                </span>
                <span className="text-xs text-ink-500">pending</span>
                <button
                  onClick={() => act(removeFriendship, f.friendship_id)}
                  className="rounded-lg px-2 py-1 text-xs text-ink-500 transition-colors hover:bg-white/5 hover:text-ink-300"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Friends list */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
          Friends <span className="text-ink-500">({data.friends.length})</span>
        </h2>
        {data.friends.length === 0 ? (
          <p className="text-sm text-ink-500">
            No friends yet — search above to send your first request.
          </p>
        ) : (
          <ul className="space-y-1">
            {data.friends.map((f) => (
              <li key={f.friendship_id}>
                <button
                  onClick={() => openFriend(f)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors ${
                    selected?.kind === 'friend' && selected?.id === f.friendship_id
                      ? 'bg-brand-500/10 text-ink-100'
                      : 'text-ink-300 hover:bg-white/5 hover:text-ink-100'
                  }`}
                >
                  <Avatar profile={f.profile} size="h-8 w-8 text-sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {f.profile?.display_name}
                  </span>
                  <UnreadChip
                    count={
                      selected?.kind === 'friend' && selected.id === f.friendship_id
                        ? 0
                        : unread.byChat[`friend:${f.friendship_id}`]
                    }
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Groups */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Groups <span className="text-ink-500">({groups.length})</span>
          </h2>
          <button
            onClick={() => setCreating((c) => !c)}
            className="rounded-lg bg-brand-500/15 px-2.5 py-1 text-xs font-semibold text-brand-400 transition-colors hover:bg-brand-500/25"
          >
            {creating ? 'Cancel' : '+ New group'}
          </button>
        </div>

        {creating && (
          <form
            onSubmit={submitGroup}
            className="mb-3 space-y-2 rounded-xl border border-white/10 bg-ink-950/60 p-3"
          >
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name…"
              maxLength={60}
              className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:border-brand-500/50 focus:outline-none"
            />
            {data.friends.length === 0 ? (
              <p className="text-xs text-ink-500">Add some friends first to invite them.</p>
            ) : (
              <div className="nice-scroll max-h-36 space-y-1 overflow-y-auto">
                {data.friends.map((f) => (
                  <label
                    key={f.profile.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm text-ink-300 hover:bg-white/5"
                  >
                    <input
                      type="checkbox"
                      checked={groupPick.includes(f.profile.id)}
                      onChange={(e) =>
                        setGroupPick((prev) =>
                          e.target.checked
                            ? [...prev, f.profile.id]
                            : prev.filter((id) => id !== f.profile.id)
                        )
                      }
                      className="accent-[#ff2d55]"
                    />
                    <span className="truncate">{f.profile.display_name}</span>
                  </label>
                ))}
              </div>
            )}
            <button
              type="submit"
              disabled={!groupName.trim()}
              className="w-full rounded-lg bg-brand-500 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-400 disabled:opacity-40"
            >
              Create group
            </button>
          </form>
        )}

        {groups.length === 0 && !creating ? (
          <p className="text-sm text-ink-500">No groups yet — make one for the group chat energy.</p>
        ) : (
          <ul className="space-y-1">
            {groups.map((g) => (
              <li key={g.id}>
                <button
                  onClick={() => openGroup(g)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors ${
                    selected?.kind === 'group' && selected?.id === g.id
                      ? 'bg-brand-500/10 text-ink-100'
                      : 'text-ink-300 hover:bg-white/5 hover:text-ink-100'
                  }`}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-700 text-sm">
                    👥
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{g.name}</span>
                    <span className="block truncate text-[11px] text-ink-500">
                      {g.members.length} members
                    </span>
                  </span>
                  <UnreadChip
                    count={
                      selected?.kind === 'group' && selected.id === g.id
                        ? 0
                        : unread.byChat[`group:${g.id}`]
                    }
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )

  const addableFriends =
    selected?.kind === 'group'
      ? data.friends.filter((f) => !selected.group.members.some((m) => m.id === f.profile.id))
      : []

  return (
    <main className="mx-auto max-w-6xl px-4 pb-8 pt-6 sm:px-6">
      <h1 className="mb-4 font-display text-xl font-semibold sm:text-2xl">Friends</h1>
      {error && (
        <p className="mb-3 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-sm text-brand-400">
          {error}
        </p>
      )}

      <div className="grid h-[calc(100vh-11rem)] min-h-[24rem] overflow-hidden rounded-2xl border border-white/5 bg-ink-900 md:grid-cols-[20rem_1fr]">
        {/* Sidebar: hidden on mobile while a chat is open */}
        <div className={`${selected ? 'hidden md:block' : ''} min-h-0 border-white/5 md:border-r`}>
          {sidebar}
        </div>

        {/* Chat pane */}
        <div className={`${selected ? '' : 'hidden md:block'} min-h-0`}>
          {selected ? (
            <ChatPane
              user={user}
              chat={selected}
              addableFriends={addableFriends}
              onBack={() => setSelected(null)}
              onAddMember={(profileId) => act(addGroupMember, selected.id, profileId)}
              onLeave={() => {
                if (selected.kind === 'friend') act(removeFriendship, selected.id)
                else act(leaveGroup, selected.group)
                setSelected(null)
              }}
            />
          ) : (
            <div className="grid h-full place-items-center p-8 text-center text-sm text-ink-500">
              <div>
                <p className="text-3xl">💬</p>
                <p className="mt-2">Pick a friend or group to start chatting.</p>
                <p className="mt-1 text-xs">
                  Share videos and funny comments straight into the chat from any watch page.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
