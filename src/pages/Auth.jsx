import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { signIn, signUp, isDemoMode } from '../lib/store'

export default function Auth() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')
    try {
      if (mode === 'signup') {
        const res = await signUp({ email, password, displayName })
        if (res?.needsConfirmation) {
          setInfo('Almost there — check your inbox and click the confirmation link, then log in here.')
          setMode('signin')
          return
        }
      } else {
        await signIn({ email, password })
      }
      // Go back to where the user came from; if /auth was opened directly
      // (no in-app history), going back would leave the site — go home.
      if (location.key === 'default') navigate('/', { replace: true })
      else navigate(-1)
    } catch (err) {
      setError(
        /email not confirmed/i.test(err.message)
          ? 'Your email is not confirmed yet — click the link in the email we sent you, then try again.'
          : err.message
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col px-4 pt-16 sm:px-6">
      <div className="pop-in rounded-2xl border border-white/10 bg-ink-900 p-8 shadow-2xl shadow-black/50">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="mt-1.5 text-sm text-ink-300">
          {mode === 'signin'
            ? 'Log in to comment, favorite and upload.'
            : 'Takes ten seconds. GIFs await.'}
        </p>

        {isDemoMode && (
          <p className="mt-4 rounded-lg border border-glow/20 bg-glow/10 px-3 py-2 text-xs text-glow">
            Demo mode: any email works, no password check — your identity is stored in this
            browser only. Connect Supabase for real accounts.
          </p>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-300">Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="gifmaster3000"
                maxLength={30}
                className="w-full rounded-xl border border-white/10 bg-ink-850 px-4 py-2.5 text-sm text-ink-100 placeholder-ink-500 outline-none transition-colors focus:border-brand-500/60"
              />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-300">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-white/10 bg-ink-850 px-4 py-2.5 text-sm text-ink-100 placeholder-ink-500 outline-none transition-colors focus:border-brand-500/60"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-300">Password</label>
            <input
              type="password"
              required
              minLength={isDemoMode ? 1 : 6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-white/10 bg-ink-850 px-4 py-2.5 text-sm text-ink-100 placeholder-ink-500 outline-none transition-colors focus:border-brand-500/60"
            />
          </div>

          {error && <p className="text-sm text-brand-400">{error}</p>}
          {info && (
            <p className="rounded-lg border border-glow/20 bg-glow/10 px-3 py-2 text-sm text-glow">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 hover:shadow-[0_0_20px_rgba(255,45,85,0.4)] disabled:opacity-50"
          >
            {busy ? 'One sec…' : mode === 'signin' ? 'Log in' : 'Sign up'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-300">
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError('')
            }}
            className="font-semibold text-brand-400 transition-colors hover:text-brand-500"
          >
            {mode === 'signin' ? 'Sign up' : 'Log in'}
          </button>
        </p>
      </div>
    </main>
  )
}
