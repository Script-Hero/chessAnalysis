import { useState } from 'react'

/**
 * Moves the reader has already opened from the Moments tab, per game.
 *
 * Kept in localStorage because the tab unmounts whenever the reader goes to
 * The Move, which is exactly when a move becomes reviewed. Storage can throw
 * (private windows, blocked site data); the page then behaves as if nothing
 * had been reviewed rather than failing.
 */
const keyFor = (gameKey: string) => `moments-reviewed:${gameKey}`

function load(gameKey: string | null): Set<number> {
  if (!gameKey) return new Set()
  try {
    const raw = localStorage.getItem(keyFor(gameKey))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is number => Number.isInteger(v)) : [])
  } catch {
    return new Set()
  }
}

export function useReviewed(gameKey: string | null) {
  const [state, setState] = useState(() => ({ gameKey, reviewed: load(gameKey) }))
  // A different game on screen means a different stored set.
  const current = state.gameKey === gameKey ? state.reviewed : load(gameKey)
  if (state.gameKey !== gameKey) setState({ gameKey, reviewed: current })

  const markReviewed = (index: number) => {
    if (current.has(index)) return
    const next = new Set(current).add(index)
    setState({ gameKey, reviewed: next })
    if (!gameKey) return
    try {
      localStorage.setItem(keyFor(gameKey), JSON.stringify([...next]))
    } catch {
      // Ignored: see above.
    }
  }

  return { reviewed: current, markReviewed }
}
