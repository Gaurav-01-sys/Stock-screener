import ScoreRing from './ScoreRing'

const THEMES = {
  blue: {
    ring: '#3b82f6',
    badge: 'bg-blue-600 text-white',
    barBg: 'bg-blue-500',
    lightBg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  violet: {
    ring: '#8b5cf6',
    badge: 'bg-violet-600 text-white',
    barBg: 'bg-violet-500',
    lightBg: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  },
  amber: {
    ring: '#f59e0b',
    badge: 'bg-amber-500 text-white',
    barBg: 'bg-amber-500',
    lightBg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  emerald: {
    ring: '#10b981',
    badge: 'bg-emerald-600 text-white',
    barBg: 'bg-emerald-500',
    lightBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
}

export default function DimensionCard({ letter, title, score = 0, metrics = [], color = 'blue' }) {
  const theme = THEMES[color] || THEMES.blue

  return (
    <div className="group relative rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg backdrop-blur-md transition-all duration-200 hover:border-slate-700 hover:shadow-xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex w-7 h-7 rounded-lg font-bold text-xs items-center justify-center shadow-md ${theme.badge}`}>
              {letter}
            </span>
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${theme.lightBg}`}>
              Dimension {letter}
            </span>
          </div>
          <h4 className="font-bold text-white text-sm tracking-tight">{title}</h4>
        </div>
        <ScoreRing score={score} color={theme.ring} size={58} />
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="flex justify-between text-[11px] font-semibold text-slate-400 mb-1">
          <span>Score</span>
          <span className="text-white font-bold">{score}/100</span>
        </div>
        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${theme.barBg}`}
            style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
          />
        </div>
      </div>

      {/* Key metrics */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1.5">
        {(metrics || []).slice(0, 3).map((m, i) => (
          <div key={i} className="flex justify-between text-xs">
            <span className="text-slate-400 truncate">{m.name}</span>
            <span className="font-semibold text-slate-200 font-mono">{m.value}</span>
          </div>
        ))}
        {(!metrics || metrics.length === 0) && (
          <p className="text-xs text-slate-500 italic">No metric data</p>
        )}
      </div>
    </div>
  )
}
