import { CheckCircle, XCircle, BarChart2 } from 'lucide-react'

export default function PiotroskiPanel({ data }) {
  if (!data) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg backdrop-blur-md h-full">
        <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-2">
          <BarChart2 className="w-4 h-4 text-blue-400" /> Piotroski F-Score
        </h3>
        <p className="text-xs text-slate-500">Not available for this ticker</p>
      </div>
    )
  }

  const signals = data.signals || {}
  const cats = data.category_scores || {}

  const scorePct = data.pct || 0
  const scoreColor = scorePct >= 70 ? 'text-emerald-400' : scorePct >= 50 ? 'text-blue-400' : 'text-amber-400'

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg backdrop-blur-md h-full flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Financial Quality</span>
            <h3 className="font-bold text-white text-base flex items-center gap-1.5">
              <BarChart2 className="w-4 h-4 text-blue-400" /> Piotroski F-Score
            </h3>
          </div>
          <div className="text-right">
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-black ${scoreColor}`}>{data.score}</span>
              <span className="text-xs font-bold text-slate-500">/{data.max_score}</span>
            </div>
            <span className="text-[10px] font-semibold text-slate-400 font-mono">{scorePct}% Signal Strength</span>
          </div>
        </div>

        {/* Category Breakdown (Tremor style progress bars) */}
        <div className="space-y-3 mb-5">
          {Object.entries(cats).map(([name, v]) => {
            const pct = v.max ? (v.score / v.max) * 100 : 0
            return (
              <div key={name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 font-medium capitalize">
                    {name.replace('_', ' / ')}
                  </span>
                  <span className="font-semibold text-slate-200 font-mono">{v.score}/{v.max}</span>
                </div>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Signal Badges */}
      <div>
        <h4 className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">9-Signal Audit</h4>
        <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-1">
          {Object.entries(signals).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-800/50 border border-slate-800">
              <span className="text-slate-300 capitalize">{k.replace(/_/g, ' ')}</span>
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded ${
                v ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                {v ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {v ? 'PASS' : 'FAIL'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
