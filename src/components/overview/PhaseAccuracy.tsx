import type { PhaseAccuracy as PhaseAccuracyData } from '../../lib/analysis'
import './PhaseAccuracy.css'

type PhaseAccuracyProps = {
  white: string
  black: string
  phases: PhaseAccuracyData
}

const PHASE_LABEL = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' } as const
const PHASE_ORDER: (keyof PhaseAccuracyData)[] = ['opening', 'middlegame', 'endgame']

function PhaseBar({ value, tone }: { value: number | null; tone: 'white' | 'black' }) {
  return (
    <div className="phase-accuracy__bar-row">
      <div className="phase-accuracy__track">
        {value !== null && (
          <div className={`phase-accuracy__fill phase-accuracy__fill--${tone}`} style={{ width: `${value}%` }} />
        )}
      </div>
      <span className="phase-accuracy__value">{value !== null ? `${value.toFixed(0)}%` : '—'}</span>
    </div>
  )
}

function PhaseAccuracy({ white, black, phases }: PhaseAccuracyProps) {
  return (
    <div className="phase-accuracy">
      <h2 className="phase-accuracy__title">Accuracy by phase</h2>
      <div className="phase-accuracy__header">
        <span />
        <span className="phase-accuracy__header-label">{white}</span>
        <span className="phase-accuracy__header-label">{black}</span>
      </div>
      {PHASE_ORDER.map((phase) => (
        <div key={phase} className="phase-accuracy__row">
          <span className="phase-accuracy__phase">{PHASE_LABEL[phase]}</span>
          <PhaseBar value={phases[phase].white} tone="white" />
          <PhaseBar value={phases[phase].black} tone="black" />
        </div>
      ))}
    </div>
  )
}

export default PhaseAccuracy
