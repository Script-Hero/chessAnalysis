import { useAnalysis } from '../context/AnalysisContext'
import './LibraryTab.css'

/**
 * The stored games, and nothing else.
 *
 * This tab used to aggregate decisions across every analysed game and rank
 * openings by leverage. That work is gone on purpose: every claim in the app is
 * now about the game on the board, and a panel comparing one game against a
 * handful of others was answering a question — "how do I play in general" — that
 * a personal library of a few dozen games cannot answer honestly. What remains
 * is filing.
 */
function LibraryTab() {
  const { library, openGame, removeGame, gameKey } = useAnalysis()

  return (
    <div className="library-tab">
      <section className="library-tab__section">
        <h3 className="library-tab__heading">
          Your games
          <span className="library-tab__count">{library.length}</span>
        </h3>
        {library.length === 0 ? (
          <p className="library-tab__note">Nothing here yet. Every game you open gets filed, analysis and all.</p>
        ) : (
          <ul className="library-tab__games">
            {library.map((meta) => (
              <li key={meta.id} className={meta.id === gameKey ? 'is-current' : ''}>
                <button type="button" className="library-tab__game" onClick={() => openGame(meta.id)}>
                  <span className="library-tab__game-players">
                    {meta.headers.White ?? '?'} — {meta.headers.Black ?? '?'}
                  </span>
                  <span className="library-tab__game-meta">
                    {[meta.headers.Event, meta.headers.Date, meta.headers.Result].filter(Boolean).join(' · ')}
                  </span>
                  {!meta.analyzed && <span className="library-tab__game-flag">unanalysed</span>}
                </button>
                <button
                  type="button"
                  className="library-tab__remove"
                  onClick={() => removeGame(meta.id)}
                  aria-label="Remove game from library"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default LibraryTab
