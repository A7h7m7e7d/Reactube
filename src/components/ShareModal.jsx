import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { getFriendData, sendMessage } from '../lib/friends'
import { avatarHue } from '../lib/format'

/**
 * "Send to a friend" picker. `message` is the {kind, body?, payload} that
 * gets dropped into the chat with whichever friend(s) you pick.
 */
export default function ShareModal({ open, onClose, message, title = 'Send to a friend' }) {
  const { user } = useAuth()
  const [friends, setFriends] = useState(null) // null = loading
  const [sent, setSent] = useState({}) // friendship_id -> 'sending' | 'sent' | 'error'

  useEffect(() => {
    if (!open) return
    setSent({})
    setFriends(null)
    if (!user) {
      setFriends([])
      return
    }
    getFriendData(user)
      .then((d) => setFriends(d.friends))
      .catch(() => setFriends([]))
  }, [open, user?.id])

  if (!open) return null

  const send = async (friendshipId) => {
    setSent((s) => ({ ...s, [friendshipId]: 'sending' }))
    try {
      await sendMessage(user, friendshipId, message)
      setSent((s) => ({ ...s, [friendshipId]: 'sent' }))
    } catch {
      setSent((s) => ({ ...s, [friendshipId]: 'error' }))
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="pop-in w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-md text-ink-500 transition-colors hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        {!user ? (
          <p className="text-sm text-ink-300">
            <Link to="/auth" className="text-brand-400 hover:underline" onClick={onClose}>
              Sign in
            </Link>{' '}
            to share with friends.
          </p>
        ) : friends === null ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-xl bg-ink-800" />
            ))}
          </div>
        ) : friends.length === 0 ? (
          <p className="text-sm text-ink-300">
            No friends yet —{' '}
            <Link to="/friends" className="text-brand-400 hover:underline" onClick={onClose}>
              add some on the Friends page
            </Link>{' '}
            first.
          </p>
        ) : (
          <ul className="nice-scroll max-h-72 space-y-1 overflow-y-auto">
            {friends.map((f) => {
              const state = sent[f.friendship_id]
              return (
                <li key={f.friendship_id}>
                  <button
                    onClick={() => state !== 'sent' && send(f.friendship_id)}
                    disabled={state === 'sending'}
                    className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/5 disabled:opacity-60"
                  >
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
                      style={{ background: `hsl(${avatarHue(f.profile.id)} 65% 45%)` }}
                    >
                      {f.profile.display_name?.[0]?.toUpperCase() || '?'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-100">
                      {f.profile.display_name}
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        state === 'sent'
                          ? 'text-emerald-400'
                          : state === 'error'
                            ? 'text-brand-400'
                            : 'text-ink-500'
                      }`}
                    >
                      {state === 'sent'
                        ? 'Sent ✓'
                        : state === 'sending'
                          ? '…'
                          : state === 'error'
                            ? 'Failed — retry'
                            : 'Send'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
