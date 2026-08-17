import { useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { TrendingUp, Calendar } from 'lucide-react'

export default function PriceChart({ prices = [] }) {
  const [period, setPeriod] = useState('ALL') // 1M, 3M, ALL

  if (!prices || !prices.length) {
    return (
      <div className="h-56 flex flex-col items-center justify-center text-slate-500">
        <TrendingUp className="w-8 h-8 mb-2 opacity-40 text-blue-400" />
        <p className="text-xs">No price history available</p>
      </div>
    )
  }

  // Filter based on period
  let filtered = prices
  if (period === '1M') filtered = prices.slice(-21)
  if (period === '3M') filtered = prices.slice(-63)

  const chartData = filtered.map((p) => ({
    date: p.date?.slice(5) || p.date,
    close: p.close,
  }))

  const minPrice = Math.min(...chartData.map(d => d.close || Infinity))
  const maxPrice = Math.max(...chartData.map(d => d.close || -Infinity))
  const latestPrice = chartData[chartData.length - 1]?.close
  const firstPrice = chartData[0]?.close
  const pctChange = firstPrice ? ((latestPrice - firstPrice) / firstPrice) * 100 : 0

  return (
    <div className="space-y-3">
      {/* Header controls & summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Latest Close</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-white">
                ${latestPrice ? latestPrice.toFixed(2) : 'N/A'}
              </span>
              <span className={`text-xs font-semibold ${pctChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {pctChange >= 0 ? `+${pctChange.toFixed(1)}%` : `${pctChange.toFixed(1)}%`}
              </span>
            </div>
          </div>
        </div>

        {/* Timeframe Toggles */}
        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700">
          {['1M', '3M', 'ALL'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                period === p
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#64748b' }}
              axisLine={{ stroke: '#334155' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 10, fill: '#64748b' }}
              axisLine={{ stroke: '#334155' }}
              tickLine={false}
              tickFormatter={(v) => `$${v?.toFixed?.(0) ?? v}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                borderColor: '#334155',
                borderRadius: '12px',
                fontSize: '12px',
                color: '#f8fafc',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
              }}
              formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Close Price']}
            />
            <Area
              type="monotone"
              dataKey="close"
              stroke="#3b82f6"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#priceGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
        <span>Range: ${minPrice.toFixed(2)} – ${maxPrice.toFixed(2)}</span>
        <span>OHLCV price history via yfinance MCP</span>
      </div>
    </div>
  )
}
