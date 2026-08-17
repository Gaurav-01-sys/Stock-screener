import { TrendingUp, TrendingDown, DollarSign, Building2, ShieldCheck, Sparkles } from 'lucide-react'

function fmtCap(cap) {
  if (!cap) return 'N/A'
  const num = Number(cap)
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`
  return `$${num.toLocaleString()}`
}

function fmtPrice(price) {
  if (price == null) return 'N/A'
  return `$${Number(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function TremorKPI({ data }) {
  if (!data) return null

  const momentumReturns = data.details?.M?.returns || {}
  const return3m = momentumReturns['3M']
  const return1m = momentumReturns['1M']
  const primaryReturn = return3m != null ? return3m : return1m

  const labelColor = (label) => {
    if (label === 'Excellent') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    if (label === 'Good') return 'bg-blue-500/15 text-blue-400 border-blue-500/30'
    if (label === 'Average') return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    return 'bg-red-500/15 text-red-400 border-red-500/30'
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur-xl">
      {/* Background glow gradient */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-blue-600/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-violet-600/10 blur-3xl" />

      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        {/* Left side: Ticker & Metadata */}
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-3xl font-extrabold text-white tracking-tight">{data.ticker}</h2>
            {data.sector && (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300 border border-slate-700">
                <Building2 className="w-3 h-3 text-blue-400" />
                {data.sector}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-3 h-3" /> AGT Governed
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400 font-medium">{data.name}</p>

          <div className="mt-4 flex flex-wrap items-baseline gap-4">
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-500">Market Price</span>
              <p className="text-3xl font-bold text-white tracking-tight">{fmtPrice(data.currentPrice)}</p>
            </div>

            {primaryReturn != null && (
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-800/80 px-3 py-1.5 border border-slate-700/80">
                {primaryReturn >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-400" />
                )}
                <span className={`text-sm font-bold ${primaryReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {primaryReturn >= 0 ? `+${primaryReturn}%` : `${primaryReturn}%`}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">3M Return</span>
              </div>
            )}

            <div>
              <span className="text-xs uppercase tracking-wider text-slate-500">Market Cap</span>
              <p className="text-sm font-semibold text-slate-200">{fmtCap(data.marketCap)}</p>
            </div>
          </div>
        </div>

        {/* Right side: Overall Score Callout */}
        <div className="flex flex-col items-start lg:items-end border-t lg:border-t-0 lg:border-l border-slate-800 pt-4 lg:pt-0 lg:pl-8">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            Overall FMCG Analytics Score
          </span>
          <div className="flex items-center gap-4">
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-black text-white tracking-tight">{data.overall_score}</span>
              <span className="text-lg font-bold text-slate-500">/100</span>
            </div>
            <span className={`rounded-full px-3.5 py-1 text-xs font-bold border ${labelColor(data.overall_label)}`}>
              {data.overall_label}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500 font-mono">
            Ref: {data.a2a_correlation_id?.slice(0, 8)}…
          </p>
        </div>
      </div>
    </div>
  )
}
