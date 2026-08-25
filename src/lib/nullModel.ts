/**
 * Reference distributions for graph statistics.
 *
 * A graph statistic on its own is unreadable. "Coordination 2.31" has no scale,
 * no direction and no baseline, so a reader can neither judge it nor be wrong
 * about it. Worse, most of these measures are dominated by things that have
 * nothing to do with play: connectivity falls because pieces were traded,
 * betweenness rises because the board is crowded, control area grows because
 * the position opened. Comparing two positions on the raw number compares
 * mostly their material.
 *
 * Every statistic the app displays is therefore scored against a null model:
 * the same material, scattered at random over the board. The z-score answers
 * "how much of this is structure the players created, and how much is what any
 * arrangement of this material would have given them" — which is the only form
 * of the question a player can act on.
 */

/** Deterministic PRNG, so the same position always yields the same reference. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Placement, side to move and castling rights, minus clocks — what a null must preserve. */
export function materialSignature(fen: string): string {
  const [board, turn] = fen.split(' ')
  const counts = new Map<string, number>()
  for (const ch of board) {
    if (!/[a-zA-Z]/.test(ch)) continue
    counts.set(ch, (counts.get(ch) ?? 0) + 1)
  }
  return `${[...counts.entries()].sort().map(([k, v]) => k + v).join('')}|${turn}`
}

function rankOf(index: number): number {
  return 8 - Math.floor(index / 8)
}

function adjacent(a: number, b: number): boolean {
  const fileGap = Math.abs((a % 8) - (b % 8))
  const rankGap = Math.abs(Math.floor(a / 8) - Math.floor(b / 8))
  return fileGap <= 1 && rankGap <= 1
}

/**
 * One random arrangement of the same material.
 *
 * Two constraints are kept because breaking them produces boards that are not
 * merely unlikely but impossible, and impossible boards make the reference
 * distribution describe a different game: pawns stay off the back ranks, and
 * the kings stay apart. Everything else is free — the point of the null is that
 * the *arrangement* carries no intention.
 */
function shuffledPosition(fen: string, rng: () => number): string | null {
  const [board, turn, castling] = fen.split(' ')
  const pieces: string[] = []
  for (const ch of board) {
    if (/[a-zA-Z]/.test(ch)) pieces.push(ch)
  }

  const slots = Array.from({ length: 64 }, (_, i) => i)
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[slots[i], slots[j]] = [slots[j], slots[i]]
  }

  const placement = new Map<number, string>()
  const kingSquares: number[] = []
  let cursor = 0

  // Pawns and kings first: they carry the constraints, so they should get first
  // pick of the shuffled squares rather than be left with whatever remains.
  const ordered = [...pieces].sort((a, b) => rank(a) - rank(b))

  for (const piece of ordered) {
    let placed = false
    for (let tries = 0; tries < 64 && cursor < slots.length + 64; tries++) {
      const slot = slots[cursor % slots.length]
      cursor++
      if (placement.has(slot)) continue
      const lower = piece.toLowerCase()
      if (lower === 'p' && (rankOf(slot) === 1 || rankOf(slot) === 8)) continue
      if (lower === 'k' && kingSquares.some((k) => adjacent(k, slot))) continue
      placement.set(slot, piece)
      if (lower === 'k') kingSquares.push(slot)
      placed = true
      break
    }
    if (!placed) return null
  }

  const rows: string[] = []
  for (let r = 0; r < 8; r++) {
    let row = ''
    let gap = 0
    for (let f = 0; f < 8; f++) {
      const piece = placement.get(r * 8 + f)
      if (piece) {
        if (gap) row += gap
        gap = 0
        row += piece
      } else gap++
    }
    if (gap) row += gap
    rows.push(row)
  }

  // Castling rights are dropped: the rooks and kings are no longer on the
  // squares that would justify them, and a FEN claiming otherwise is invalid.
  void castling
  return `${rows.join('/')} ${turn} - - 0 1`
}

function rank(piece: string): number {
  const lower = piece.toLowerCase()
  if (lower === 'k') return 0
  if (lower === 'p') return 1
  return 2
}

export type Reference = {
  mean: number
  sd: number
  samples: number
  /** Sorted sample values, for percentile lookups. */
  sorted: number[]
}

export type Scored = {
  value: number
  /** Standard deviations above the null model's mean. */
  z: number | null
  /** Share of null samples this value exceeds, 0-1. */
  percentile: number | null
  reference: Reference | null
}

const DEFAULT_SAMPLES = 48

// Keyed by statistic name plus material signature: positions sharing material
// share a reference, so a whole game needs one distribution per material change
// rather than one per ply.
const cache = new Map<string, Reference>()

/**
 * The null distribution of `statistic` over random arrangements of `fen`'s
 * material, memoized by material signature.
 */
export function referenceFor(
  name: string,
  fen: string,
  statistic: (fen: string) => number,
  samples = DEFAULT_SAMPLES,
): Reference | null {
  const key = `${name}|${materialSignature(fen)}`
  const cached = cache.get(key)
  if (cached) return cached

  // Seeded from the signature, so the reference for a given material is
  // identical on every render and across reloads.
  let seed = 2166136261
  for (let i = 0; i < key.length; i++) {
    seed ^= key.charCodeAt(i)
    seed = Math.imul(seed, 16777619)
  }
  const rng = mulberry32(seed)

  const values: number[] = []
  for (let i = 0; i < samples * 2 && values.length < samples; i++) {
    const candidate = shuffledPosition(fen, rng)
    if (!candidate) continue
    try {
      const value = statistic(candidate)
      if (Number.isFinite(value)) values.push(value)
    } catch {
      // A shuffled board the statistic cannot handle is dropped rather than
      // counted as zero, which would drag the mean toward an unreachable value.
    }
  }

  if (values.length < 8) return null

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  const reference: Reference = {
    mean,
    sd: Math.sqrt(variance),
    samples: values.length,
    sorted: [...values].sort((a, b) => a - b),
  }
  cache.set(key, reference)
  return reference
}

/** A statistic's observed value alongside where it falls in its null distribution. */
export function scoreAgainstNull(
  name: string,
  fen: string,
  statistic: (fen: string) => number,
  samples = DEFAULT_SAMPLES,
): Scored {
  const value = statistic(fen)
  const reference = referenceFor(name, fen, statistic, samples)
  if (!reference) return { value, z: null, percentile: null, reference: null }
  return {
    value,
    z: reference.sd > 1e-9 ? (value - reference.mean) / reference.sd : null,
    percentile: percentileIn(reference.sorted, value),
    reference,
  }
}

function percentileIn(sorted: number[], value: number): number {
  let below = 0
  for (const v of sorted) {
    if (v < value) below++
    else break
  }
  return below / sorted.length
}

/** Plain-language reading of a z-score, so the number never appears unlabelled. */
export function describeZ(z: number | null): string {
  if (z === null) return 'no reference'
  const magnitude = Math.abs(z)
  const direction = z > 0 ? 'above' : 'below'
  if (magnitude < 0.5) return 'ordinary for this material'
  if (magnitude < 1.5) return `slightly ${direction} what this material usually gives`
  if (magnitude < 2.5) return `clearly ${direction} what this material usually gives`
  return `far ${direction} what this material usually gives`
}

export function clearNullCache() {
  cache.clear()
}
