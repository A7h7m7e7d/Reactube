import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import {
  searchUsers,
  getFriendData,
  sendFriendRequest,
  acceptRequest,
  removeFriendship,
  getMessages,
  sendMessage,
  subscribeMessages,
  subscribeFriendships,
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

/** One chat message. Text bubbles, or rich cards for shared videos/comments. */
function MessageBubble({ m, mine }) {
  const align = mine ? 'items-end' : 'items-start'
  const bubble = mine
    ? 'bg-brand-500/15 border-brand-500/20'
    : 'bg-ink-800 border-white/5'

  return (
    <div className={`flex flex-col ${align}`}>
      <div className={`max-w-[85%] rounded-2xl border px-3.5 py-2.5 ${bubble}`}>
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

function ChatPane({ user, friend, onBack, onUnfriend }) {
  const [messages, setMessages] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)

  const appendUnique = (msg) =>
    setMessages((prev) => (prev?.some((m) => m.id === msg.id) ? prev : [...(prev || []), msg]))

  useEffect(() => {
    let mounted = true
    setMessages(null)
    getMessages(user, friend.friendship_id).then((list) => mounted && setMessages(list))
    const unsub = subscribeMessages(friend.friendship_id, appendUnique)
    return () => {
      mounted = false
      unsub()
    }
  }, [friend.friendship_id])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const send = async (e) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const msg = await sendMessage(user, friend.friendship_id, { kind: 'text', body })
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
        <Avatar profile={friend.profile} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-100">
            {friend.profile.display_name}
          </p>
          <p className="text-xs text-ink-500">friend</p>
        </div>
        <button
          onClick={onUnfriend}
          className="rounded-lg px-2.5 py-1.5 text-xs text-ink-500 transition-colors hover:bg-brand-500/10 hover:text-brand-400"
        >
          Unfriend
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
          messages.map((m) => <MessageBubble key={m.id} m={m} mine={m.sender_id === user.id} />)
        )}
      </div>

      {/* Composer */}
      <form onSubmit={send} className="flex gap-2 border-t border-white/5 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${friend.profile.display_name}…`}
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
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searchMsg, setSearchMsg] = useState('')
  const [selected, setSelected] = useState(null) // friendship item from data.friends
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    if (!user) return
    getFriendData(user)
      .then((d) => {
        setData(d)
        // Keep the open chat in sync (e.g. unfriended from the other side)
        setSelected((sel) =>
          sel ? d.friends.find((f) => f.friendship_id === sel.friendship_id) || null : null
        )
      })
      .catch((e) => setError(e.message))
  }, [user?.id])

  useEffect(() => {
    refresh()
    return subscribeFriendships(user, refresh)
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
                  {f.profile.display_name}
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
                  {f.profile.display_name}
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
                  onClick={() => setSelected(f)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors ${
                    selected?.friendship_id === f.friendship_id
                      ? 'bg-brand-500/10 text-ink-100'
                      : 'text-ink-300 hover:bg-white/5 hover:text-ink-100'
                  }`}
                >
                  <Avatar profile={f.profile} size="h-8 w-8 text-sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {f.profile.display_name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )

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
              friend={selected}
              onBack={() => setSelected(null)}
              onUnfriend={() => {
                act(removeFriendship, selected.friendship_id)
                setSelected(null)
              }}
            />
          ) : (
            <div className="grid h-full place-items-center p-8 text-center text-sm text-ink-500">
              <div>
                <p className="text-3xl">💬</p>
                <p className="mt-2">Pick a friend to start chatting.</p>
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
