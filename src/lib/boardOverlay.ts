import type { CSSProperties } from 'react'
import { influenceDelta } from './pieceGraph'
import type { PositionStructure } from './structure'
import type { Percolation } from './percolation'
import type { BoardOverlay } from '../context/AnalysisContext'

/**
 * Network measures painted onto the board.
 *
 * Every claim the structure panels make is checkable here, on the squares it is
 * about. A load-bearing score in a side panel asks to be believed; the same
 * score shaded onto f3 can be argued with — the reader can see the squares the
 * knight is the only one covering, and disagree.
 *
 * This is the app's primary reading of a position, not a decoration on it, so
 * every graph measure that can be located on squares is expressible here.
 */

const WHITE_TINT = '232, 195, 117'
const BLACK_TINT = '127, 168, 232'
const LOAD_TINT = '139, 111, 224'
const CUT_TINT = '232, 106, 106'
const RISK_TINT = '224, 138, 74'

function tint(rgb: string, alpha: number): CSSProperties {
  return { background: `rgba(${rgb}, ${alpha.toFixed(3)})` }
}

function ring(rgb: string, alpha: number): CSSProperties {
  return {
    background: `rgba(${rgb}, ${(alpha * 0.55).toFixed(3)})`,
    boxShadow: `inset 0 0 0 3px rgba(${rgb}, ${Math.min(1, alpha + 0.2).toFixed(3)})`,
  }
}

export const OVERLAY_LABEL: Record<BoardOverlay, string> = {
  none: 'Off',
  control: 'Control',
  delta: 'Move impact',
  load: 'Load-bearing',
  cut: 'Defence cut',
  fragility: 'Fragility',
}

export const OVERLAY_DESCRIPTION: Record<BoardOverlay, string> = {
  none: '',
  control: 'Net control per square. Gold is White, blue is Black.',
  delta: 'Squares whose control the last move changed.',
  load: 'Ground each piece is the only one covering.',
  cut: 'Ringed: deflect it and the defence breaks. Shaded: what falls.',
  fragility: 'Control lost if that one piece disappears.',
}

/**
 * Square shading for the selected overlay.
 *
 * `previous` is the position before the move that reached the current one,
 * needed only by the move-impact overlay; the others read the current position.
 * `robustness` is only needed by the fragility overlay, which is the one
 * measure expensive enough that the caller decides whether to compute it.
 */
export function overlayStyles(
  overlay: BoardOverlay,
  fen: string,
  previous: string | null,
  structure: PositionStructure | null,
  robustness: Record<'white' | 'black', Percolation> | null,
): Record<string, CSSProperties> {
  if (overlay === 'none' || !structure) return {}
  const styles: Record<string, CSSProperties> = {}

  if (overlay === 'control') {
    for (const [square, counts] of Object.entries(structure.influence)) {
      if (counts.net === 0) continue
      // Three attackers is a decisively controlled square; shading saturates
      // there so ordinary one-attacker squares stay distinguishable.
      const alpha = Math.min(0.78, Math.abs(counts.net) * 0.26)
      styles[square] = tint(counts.net > 0 ? WHITE_TINT : BLACK_TINT, alpha)
    }
    return styles
  }

  if (overlay === 'delta') {
    if (!previous) return {}
    const delta = influenceDelta(previous, fen)
    for (const [square, change] of Object.entries(delta)) {
      if (change === 0) continue
      const alpha = Math.min(0.82, Math.abs(change) * 0.32)
      styles[square] = tint(change > 0 ? WHITE_TINT : BLACK_TINT, alpha)
    }
    return styles
  }

  if (overlay === 'load') {
    for (const [square, weight] of structure.loadBearing) {
      if (weight <= 0.02) continue
      styles[square] = tint(LOAD_TINT, Math.min(0.85, weight * 0.85))
    }
    return styles
  }

  if (overlay === 'cut') {
    for (const side of ['white', 'black'] as const) {
      const flow = structure.flow[side]
      for (const target of flow.targets) {
        if (!target.unheld) continue
        styles[target.square] = tint(RISK_TINT, Math.min(0.8, 0.3 + target.materialAtRisk * 0.08))
      }
      // Drawn after the targets so a piece that is both a cut defender and an
      // unheld target reads as the defender, which is the actionable half.
      for (const deflection of flow.deflections) {
        styles[deflection.square] = ring(CUT_TINT, Math.min(0.85, 0.35 + deflection.serves.length * 0.2))
      }
    }
    return styles
  }

  if (overlay === 'fragility') {
    if (!robustness) return {}
    for (const side of ['white', 'black'] as const) {
      for (const piece of robustness[side].criticality) {
        if (piece.impact <= 0.01) continue
        styles[piece.square] = tint(LOAD_TINT, Math.min(0.85, piece.impact * 2.4))
      }
    }
    return styles
  }

  return styles
}
