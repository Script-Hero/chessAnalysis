import { useState } from 'react'
import './InfoNote.css'

type InfoNoteProps = {
  /** What the measure is and how to read it. Shown only when asked for. */
  children: React.ReactNode
  /** Accessible name for the toggle, e.g. the section it explains. */
  label: string
}

/**
 * An explanation that is available but not in the way.
 *
 * Every measure in this app needs a sentence saying what it is — a graph
 * statistic with no explanation is unreadable, which is why the panels carry
 * them at all. But a paragraph above every chart means the page is mostly prose
 * and the reader has to scroll past an essay to reach a number they have
 * already understood. The explanation is needed once, not on every visit.
 *
 * So it moves behind a marker: the first read expands it, every read after that
 * ignores it. The tradeoff is deliberate — discoverability costs one click,
 * and in exchange the default view is the data.
 */
function InfoNote({ children, label }: InfoNoteProps) {
  const [open, setOpen] = useState(false)

  return (
    <span className="info-note">
      <button
        type="button"
        className={`info-note__toggle${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-label={open ? `Hide explanation of ${label}` : `Explain ${label}`}
        onClick={() => setOpen((value) => !value)}
      >
        ?
      </button>
      {open && <span className="info-note__body">{children}</span>}
    </span>
  )
}

export default InfoNote
