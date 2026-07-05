import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { signOut, isDemoMode } from '../lib/store'
import {
  getFriendData,
  getUnreadCounts,
  subscribeFriendships,
  subscribeInbox,
  onUnreadChanged,
} from '../lib/friends'
import { avatarHue } from '../lib/format'

export default function Navbar() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pending, setPending] = useState(0) // friend requests + unread messages

  useEffect(() => {
    if (!user) {
      setPending(0)
      return
    }
    const refresh = () =>
      Promise.all([getFriendData(user), getUnreadCounts(user)])
        .then(([d, u]) => setPending(d.incoming.length + u.total))
        .catch(() => {})
    refresh()
    const subs = [
      subscribeFriendships(user, refresh),
      subscribeInbox(user, refresh),
      onUnreadChanged(refresh),
    ]
    return () => subs.forEach((fn) => fn())
  }, [user?.id])

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="group flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 shadow-[0_0_24px_rgba(255,45,85,0.35)] transition-transform group-hover:scale-105">
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 fill-white" aria-hidden>
              <path d="M9 7v10l8-5z" />
            </svg>
          </span>
          <span className="font-display text-xl font-700 tracking-tight">
            Reac<span className="text-brand-400">Tube</span>
          </span>
        </Link>

        {isDemoMode && (
          <span className="hidden rounded-full border border-glow/30 bg-glow/10 px-2.5 py-1 text-xs font-medium text-glow sm:inline">
            demo mode — data stays in this browser
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <Link
                to="/friends"
                className="relative rounded-lg border border-white/10 px-3 py-1.5 text-sm text-ink-300 transition-colors hover:border-white/20 hover:text-white"
              >
                Friends
                {pending > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
                    {pending}
                  </span>
                )}
              </Link>
              <span className="flex items-center gap-2 text-sm text-ink-300">
                <span
                  className="grid h-8 w-8 place-items-center rounded-full text-sm font-semibold text-white"
                  style={{ background: `hsl(${avatarHue(user.id)} 65% 45%)` }}
                >
                  {user.display_name?.[0]?.toUpperCase() || '?'}
                </span>
                <span className="hidden font-medium text-ink-100 sm:inline">{user.display_name}</span>
              </span>
              <button
                onClick={async () => {
                  await signOut()
                  navigate('/')
                }}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-ink-300 transition-colors hover:border-white/20 hover:text-white"
              >
                Log out
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-400 hover:shadow-[0_0_20px_rgba(255,45,85,0.4)]"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
