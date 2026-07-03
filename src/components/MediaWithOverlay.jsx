import { useRef } from 'react'

/**
 * Renders media with overlay text positioned on top. The same component
 * powers the composer preview (editable: drag to reposition) and the feed
 * (static). Position is stored responsively:
 *   { x, y: % of container, size: % of container width (cqw), color, rotation }
 */
export const DEFAULT_POSITION = { x: 50, y: 82, size: 8, color: '#ffffff', rotation: 0 }

export default function MediaWithOverlay({
  mediaUrl,
  mediaType,
  overlayText,
  overlayPosition,
  editable = false,
  onPositionChange,
  className = '',
}) {
  const containerRef = useRef(null)
  const dragging = useRef(false)
  const pos = { ...DEFAULT_POSITION, ...(overlayPosition || {}) }
  const isSticker = mediaType === 'sticker'

  const moveTo = (clientX, clientY) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    onPositionChange?.({
      ...pos,
      x: Math.round(Math.min(97, Math.max(3, ((clientX - rect.left) / rect.width) * 100))),
      y: Math.round(Math.min(95, Math.max(5, ((clientY - rect.top) / rect.height) * 100))),
    })
  }

  return (
    // container-type: inline-size means width must be explicit (a size
    // container can't size itself from its contents — it collapses to 0)
    <div
      ref={containerRef}
      className={`overlay-container relative select-none overflow-hidden rounded-xl ${
        isSticker ? 'w-44 bg-ink-800/60 p-4' : 'w-full max-w-md bg-ink-800'
      } ${className}`}
    >
      <img
        src={mediaUrl}
        alt={overlayText || 'comment media'}
        draggable={false}
        className={
          isSticker ? 'mx-auto block h-32 w-32 object-contain' : 'block max-h-96 w-full object-contain'
        }
      />

      {overlayText && (
        <span
          onPointerDown={
            editable
              ? (e) => {
                  dragging.current = true
                  e.currentTarget.setPointerCapture(e.pointerId)
                  e.preventDefault()
                }
              : undefined
          }
          onPointerMove={
            editable
              ? (e) => dragging.current && moveTo(e.clientX, e.clientY)
              : undefined
          }
          onPointerUp={editable ? () => (dragging.current = false) : undefined}
          className={`absolute max-w-[92%] whitespace-pre-wrap break-words text-center font-display font-bold leading-tight ${
            editable ? 'cursor-grab touch-none active:cursor-grabbing' : 'pointer-events-none'
          }`}
          style={{
            left: `${pos.x}%`,
            top: `${pos.y}%`,
            transform: `translate(-50%, -50%) rotate(${pos.rotation || 0}deg)`,
            fontSize: `${pos.size}cqw`,
            color: pos.color,
            textShadow:
              '0 1px 3px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.5), -1px 0 1px rgba(0,0,0,0.6), 1px 0 1px rgba(0,0,0,0.6)',
          }}
        >
          {overlayText}
        </span>
      )}
    </div>
  )
}
