import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { getFriendData, getGroups, sendMessage } from '../lib/friends'
import { avatarHue } from '../lib/format'

/**
 * "Send to a friend or group" picker. `message` is the {kind, body?, payload}
 * that gets dropped into whichever chat(s) you pick.
 */
export default function ShareModal({ open, onClose, message, title = 'Send to a friend' }) {
  const { user } = useAuth()
  const [targets, setTargets] = useState(null) // null = loading; [{chat, label, profile?}]
  const [sent, setSent] = useState({}) // chatKey -> 'sending' | 'sent' | 'error'

  useEffect(() => {
    if (!open) return
    setSent({})
    setTargets(null)
    if (!user) {
      setTargets([])
      return
    }
    Promise.all([getFriendData(user), getGroups(user)])
      .then(([d, groups]) =>
        setTargets([
          ...d.friends.map((f) => ({
            chat: { kind: 'friend', id: f.friendship_id },
            label: f.profile.display_name,
            profile: f.profile,
          })),
          ...groups.map((g) => ({
            chat: { kind: 'group', id: g.id },
            label: g.name,
            sub: `${g.members.length} members`,
          })),
        ])
      )
      .catch(() => setTargets([]))
  }, [open, user?.id])

  if (!open) return null

  const send = async (t) => {
    const key = `${t.chat.kind}:${t.chat.id}`
    setSent((s) => ({ ...s, [key]: 'sending' }))
    try {
      await sendMessage(user, t.chat, message)
      setSent((s) => ({ ...s, [key]: 'sent' }))
    } catch {
      setSent((s) => ({ ...s, [key]: 'error' }))
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
        ) : targets === null ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-xl bg-ink-800" />
            ))}
          </div>
        ) : targets.length === 0 ? (
          <p className="text-sm text-ink-300">
            No friends yet —{' '}
            <Link to="/friends" className="text-brand-400 hover:underline" onClick={onClose}>
              add some on the Friends page
            </Link>{' '}
            first.
          </p>
        ) : (
          <ul className="nice-scroll max-h-72 space-y-1 overflow-y-auto">
            {targets.map((t) => {
              const key = `${t.chat.kind}:${t.chat.id}`
              const state = sent[key]
              return (
                <li key={key}>
                  <button
                    onClick={() => state !== 'sent' && send(t)}
                    disabled={state === 'sending'}
                    className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/5 disabled:opacity-60"
                  >
                    {t.profile ? (
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
                        style={{ background: `hsl(${avatarHue(t.profile.id)} 65% 45%)` }}
                      >
                        {t.label?.[0]?.toUpperCase() || '?'}
                      </span>
                    ) : (
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-700 text-sm">
                        👥
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-100">
                        {t.label}
                      </span>
                      {t.sub && <span className="block text-[11px] text-ink-500">{t.sub}</span>}
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
