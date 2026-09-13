import type { Choice } from '../../lib/moveGraph'

/** Plain words for what the played move did with the room it had. */
export const CHOICE_TEXT: Record<Choice, string> = {
  best: 'best move',
  inside: 'kept the position',
  outside: 'left the safe moves',
}
