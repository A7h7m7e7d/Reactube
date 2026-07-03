import { useState } from 'react'
import { useAuth } from '../AuthContext'
import { deleteComment, reportComment, voteComment } from '../lib/store'
import { timeAgo, avatarHue } from '../lib/format'
import MediaWithOverlay from './MediaWithOverlay'

function VoteArrow({ dir, active, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir === 1 ? 'Upvote' : 'Downvote'}
      className={`grid h-7 w-7 place-items-center rounded-md transition-all hover:bg-white/10 active:scale-90 ${
        active
          ? dir === 1
            ? 'text-brand-400'
            : 'text-sky-400'
          : 'text-ink-500 hover:text-ink-100'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className={`h-4 w-4 ${dir === -1 ? 'rotate-180' : ''}`}
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d="M12 4l8 9h-5v7H9v-7H4z" />
      </svg>
    </button>
  )
}

export default function CommentCard({ comment, youtubeId, onDeleted }) {
  const { user } = useAuth()
  const [reported, setReported] = useState(false)
  const [busy, setBusy] = useState(false)
  const [score, setScore] = useState(comment.score || 0)
  const [myVote, setMyVote] = useState(comment.my_vote || 0)
  const [voteError, setVoteError] = useState('')
  const mine = user?.id === comment.user_id
  const name = comment.display_name || 'anon'

  const vote = async (dir) => {
    if (!user) {
      setVoteError('Sign in to vote')
      setTimeout(() => setVoteError(''), 2000)
      return
    }
    // Reddit semantics: clicking the same arrow again clears your vote
    const next = myVote === dir ? 0 : dir
    const prev = { score, myVote }
    setScore(score - myVote + next) // optimistic
    setMyVote(next)
    try {
      await voteComment(youtubeId, comment.id, user, next)
    } catch {
      setScore(prev.score)
      setMyVote(prev.myVote)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await deleteComment(youtubeId, comment.id)
      onDeleted?.(comment.id)
    } finally {
      setBusy(false)
    }
  }

  const report = async () => {
    setReported(true)
    try {
      await reportComment(youtubeId, comment.id)
    } catch {
      setReported(false)
    }
  }

  return (
    <article className="rise-in group flex gap-3 rounded-2xl border border-white/5 bg-ink-900 p-4 transition-colors hover:border-white/10">
      {/* Vote rail (Reddit-style) */}
      <div className="flex shrink-0 flex-col items-center gap-0.5 pt-0.5">
        <VoteArrow dir={1} active={myVote === 1} onClick={() => vote(1)} />
        <span
          title={voteError || undefined}
          className={`min-w-6 text-center text-xs font-bold tabular-nums ${
            myVote === 1 ? 'text-brand-400' : myVote === -1 ? 'text-sky-400' : 'text-ink-300'
          }`}
        >
          {voteError ? '🔒' : score}
        </span>
        <VoteArrow dir={-1} active={myVote === -1} onClick={() => vote(-1)} />
      </div>

      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
        style={{ background: `hsl(${avatarHue(comment.user_id)} 65% 45%)` }}
      >
        {name[0]?.toUpperCase()}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-ink-100">{name}</span>
          <span className="text-xs text-ink-500">{timeAgo(comment.created_at)}</span>

          <span className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {mine ? (
              <button
                onClick={remove}
                disabled={busy}
                className="rounded-md px-2 py-1 text-xs text-ink-500 transition-colors hover:bg-brand-500/10 hover:text-brand-400"
              >
                Delete
              </button>
            ) : (
              <button
                onClick={report}
                disabled={reported}
                className="rounded-md px-2 py-1 text-xs text-ink-500 transition-colors hover:bg-white/5 hover:text-ink-300 disabled:text-ink-500"
              >
                {reported ? 'Reported ✓' : 'Report'}
              </button>
            )}
          </span>
        </div>

        {comment.body_text && (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-100">
            {comment.body_text}
          </p>
        )}

        {comment.media_url && (
          <div className="mt-2">
            <MediaWithOverlay
              mediaUrl={comment.media_url}
              mediaType={comment.media_type}
              overlayText={comment.overlay_text}
              overlayPosition={comment.overlay_position}
            />
          </div>
        )}
      </div>
    </article>
  )
}
