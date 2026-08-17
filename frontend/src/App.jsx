import { useState, useRef } from 'react'
import {
  Search, TrendingUp, Shield, BarChart3, Leaf, Loader2, AlertCircle,
  Newspaper, Users, Layers, Activity, Sparkles, SlidersHorizontal
} from 'lucide-react'

import ScoreRing from './components/ScoreRing'
import PriceChart from './components/PriceChart'
import DimensionCard from './components/DimensionCard'
import PiotroskiPanel from './components/PiotroskiPanel'
import TremorKPI from './components/TremorKPI'
import ChatBot from './components/ChatBot'
import GovernancePanel from './components/GovernancePanel'

const API = import.meta.env.VITE_API_URL || ''
const EXAMPLES = ['AAPL', 'MSFT', 'NVDA', 'PG', 'KO', 'JPM', 'COST', 'META', 'AMZN', 'LLY']

export default function App() {
  const sessionId = useRef(crypto.randomUUID()).current

  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [lastAnalysed, setLastAnalysed] = useState(null)
  const [govOpen, setGovOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('all') // all | financials | momentum | peers
  const [momentumPeriod, setMomentumPeriod] = useState('6mo')

  const PERIOD_LABELS = {
    '1d': 'Daily', '5d': 'Weekly', '1mo': '1 Month', '3mo': 'Quarterly',
    '6mo': 'Half Yearly', '1y': '1 Year', '2y': '2 Years', '3y': '3 Years', 'max': 'All Time',
  }

  const runScorecard = async (q) => {
    const text = (q || query).trim()
    if (!text) return
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const res = await fetch(`${API}/api/scorecard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, session_id: sessionId, momentum_period: momentumPeriod }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || json.error || 'Request failed')
      setData(json)
      setLastAnalysed(json)
    } catch (e) {
      setError(e.message || 'Failed to run scorecard')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500 selection:text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 p-0.5 shadow-lg shadow-blue-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center font-black text-blue-400 text-lg">
                F
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight">FMCG Scorecard Pro</h1>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Analytics UI
                </span>
              </div>
              <p className="text-xs text-slate-400">Agentic Stock Intelligence · AGT Governed</p>
            </div>
          </div>

          <button
            onClick={() => setGovOpen(true)}
            className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white
              px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700
              shadow-sm hover:shadow-blue-500/10 transition-all cursor-pointer"
          >
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">AGT Governance Shield</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Search Header */}
        <div className="max-w-2xl mx-auto mb-10 text-center">
          <h2 className="text-3xl font-extrabold text-white tracking-tight mb-2">
            Multi-Dimensional Stock Analysis
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            Piotroski F-Score · Price Momentum · Credibility Signals · Sector Peer Benchmarking
          </p>

          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runScorecard()}
                placeholder="Search ticker symbol (e.g. AAPL, MSFT, NVDA, PG)"
                className="w-full pl-12 pr-32 py-4 rounded-2xl border border-slate-800 bg-slate-900/90 text-white placeholder-slate-500 shadow-2xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
              />
              <button
                onClick={() => runScorecard()}
                disabled={loading}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 transition-all cursor-pointer"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Analyze'}
              </button>
            </div>
            <select
              value={momentumPeriod}
              onChange={(e) => setMomentumPeriod(e.target.value)}
              className="px-3 py-2 rounded-2xl border border-slate-800 bg-slate-900/90 text-slate-300 text-sm font-medium shadow-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all cursor-pointer hover:border-slate-700 min-w-[140px]"
            >
              {Object.entries(PERIOD_LABELS).map(([val, label]) => (
                <option key={val} value={val} className="bg-slate-900">{label}</option>
              ))}
            </select>
          </div>

          {/* Example Tickers */}
          <div className="flex flex-wrap gap-1.5 mt-4 justify-center">
            <span className="text-xs text-slate-500 font-medium py-1 mr-1">Try:</span>
            {EXAMPLES.map((s) => (
              <button
                key={s}
                onClick={() => { setQuery(s); runScorecard(s) }}
                className="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-mono font-medium text-slate-400 hover:border-slate-700 hover:text-white transition-all cursor-pointer"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mb-4">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              </div>
            </div>
            <p className="text-base font-bold text-white">Evaluating Stock Intelligence…</p>
            <p className="text-xs text-slate-500 mt-1">Routing specialist agents (F · M · C · G) + AGT Policy Checks</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="max-w-xl mx-auto flex items-start gap-3.5 p-5 rounded-2xl bg-red-950/40 border border-red-800/50 text-red-200 shadow-xl">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold text-sm text-red-100">Analysis Failed</p>
              <p className="text-xs text-red-300 mt-1">{error}</p>
              <p className="text-[11px] text-red-400/80 mt-2">Ensure the FastAPI backend is running on port 8000.</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !data && !error && (
          <div className="rounded-3xl border border-slate-800/80 bg-slate-900/40 p-12 text-center max-w-3xl mx-auto shadow-2xl backdrop-blur-md">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30 flex items-center justify-center mx-auto mb-4 text-blue-400">
              <BarChart3 className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-extrabold text-white mb-2">Institutional Analytics Dashboard</h3>
            <p className="text-sm text-slate-400 max-w-lg mx-auto mb-6">
              Enter a US ticker above to analyze Piotroski financial strength, real OHLCV momentum, institutional credibility, and sector growth benchmarks.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-left">
              {[
                { letter: 'F', title: 'Financials', desc: 'Piotroski F-Score (0-9)', color: 'text-blue-400' },
                { letter: 'M', title: 'Momentum', desc: '1M / 3M / 6M Returns', color: 'text-violet-400' },
                { letter: 'C', title: 'Credibility', desc: 'Holders & News Flags', color: 'text-amber-400' },
                { letter: 'G', title: 'Growth', desc: 'Sector Peer Benchmarks', color: 'text-emerald-400' },
              ].map((item) => (
                <div key={item.letter} className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800">
                  <span className={`font-black text-sm ${item.color}`}>{item.letter}</span>
                  <h4 className="text-xs font-bold text-white mt-0.5">{item.title}</h4>
                  <p className="text-[11px] text-slate-500 mt-1">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Analytics Dashboard */}
        {data && (
          <div className="space-y-6">
            {/* Tremor Executive KPI Banner */}
            <TremorKPI data={data} />

            {/* Mantine-style Segmented Control View Tabs */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800 shadow-md">
                {[
                  { id: 'all', label: 'All Dimensions', icon: Layers },
                  { id: 'financials', label: 'Financials & Piotroski', icon: BarChart3 },
                  { id: 'momentum', label: 'Momentum & Chart', icon: TrendingUp },
                  { id: 'peers', label: 'Peers & News', icon: Users },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      activeTab === t.id
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <t.icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-500 font-mono hidden md:inline">
                Framework: {data.framework} · Market: US
              </span>
            </div>

            {/* 4 Dimension Cards Grid */}
            {(activeTab === 'all' || activeTab === 'financials') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <DimensionCard
                  letter="F"
                  title="Financial Performance"
                  score={data.scores?.F}
                  metrics={data.details?.F?.metrics}
                  color="blue"
                />
                <DimensionCard
                  letter="M"
                  title="Market Momentum"
                  score={data.scores?.M}
                  metrics={data.details?.M?.metrics}
                  color="violet"
                />
                <DimensionCard
                  letter="C"
                  title="Credibility Signals"
                  score={data.scores?.C}
                  metrics={data.details?.C?.metrics}
                  color="amber"
                />
                <DimensionCard
                  letter="G"
                  title="Sector Growth"
                  score={data.scores?.G}
                  metrics={data.details?.G?.metrics}
                  color="emerald"
                />
              </div>
            )}

            {/* Price Chart + Piotroski Panel Grid */}
            {(activeTab === 'all' || activeTab === 'momentum' || activeTab === 'financials') && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {(activeTab === 'all' || activeTab === 'momentum') && (
                  <div className="lg:col-span-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg backdrop-blur-md">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-white text-sm flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-blue-400" />
                        Price History & Trend (Momentum Agent)
                      </h3>
                      <span className="text-[10px] font-mono text-slate-500">{PERIOD_LABELS[data.details?.M?.price_history?.[0] ? momentumPeriod : '6mo'] || '6M'} OHLCV</span>
                    </div>
                    <PriceChart prices={data.details?.M?.price_history || []} />
                  </div>
                )}
                {(activeTab === 'all' || activeTab === 'financials') && (
                  <div className={`lg:col-span-2 ${activeTab === 'financials' ? 'lg:col-span-5' : ''}`}>
                    <PiotroskiPanel data={data.details?.F?.piotroski} />
                  </div>
                )}
              </div>
            )}

            {/* News + Sector Peers Grid */}
            {(activeTab === 'all' || activeTab === 'peers') && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* News Card */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg backdrop-blur-md">
                  <h3 className="font-bold text-white text-sm mb-3 flex items-center gap-2 border-b border-slate-800 pb-2">
                    <Newspaper className="w-4 h-4 text-amber-400" />
                    Recent Headlines (Credibility Agent)
                  </h3>
                  <div className="space-y-3">
                    {(data.details?.C?.news || []).length === 0 && (
                      <p className="text-xs text-slate-500 py-4 text-center">No news items found</p>
                    )}
                    {(data.details?.C?.news || []).slice(0, 5).map((n, i) => (
                      <div key={i} className="text-xs border-b border-slate-800/80 pb-2.5 last:border-0">
                        <a href={n.link} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-200 line-clamp-2 hover:text-blue-400 transition-colors block">
                          {n.title}
                        </a>
                        <p className="text-[10px] text-slate-500 mt-1 font-mono">{n.publisher}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sector Peers Table Card */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg backdrop-blur-md">
                  <h3 className="font-bold text-white text-sm mb-3 flex items-center gap-2 border-b border-slate-800 pb-2">
                    <Users className="w-4 h-4 text-emerald-400" />
                    Sector Peer Benchmarks (Growth Agent)
                  </h3>
                  <div className="space-y-1">
                    {(data.details?.G?.peers || []).slice(0, 6).map((p) => (
                      <div key={p.symbol} className="flex items-center justify-between text-xs py-2 px-2.5 rounded-lg hover:bg-slate-800/50 transition-colors border-b border-slate-800/40 last:border-0">
                        <div>
                          <span className="font-bold text-white font-mono">{p.symbol}</span>
                          <span className="text-slate-400 ml-2 text-xs truncate max-w-[140px] inline-block align-bottom">{p.name}</span>
                        </div>
                        {p.revenueGrowth != null ? (
                          <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                            p.revenueGrowth >= 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            {(p.revenueGrowth * 100).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-mono">N/A</span>
                        )}
                      </div>
                    ))}
                    {(data.details?.G?.peers || []).length === 0 && (
                      <p className="text-xs text-slate-500 py-4 text-center">No peer benchmarking data</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Footer Governance note */}
            <div className="pt-4 text-center">
              <p className="text-[11px] text-slate-500 font-mono">
                Correlation ID: {data.a2a_correlation_id} · All agent tool calls audited under Microsoft AGT v4.1.0
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Floating Chatbot */}
      <ChatBot sessionId={sessionId} lastAnalysed={lastAnalysed} />

      {/* Governance Panel Slide-over */}
      <GovernancePanel open={govOpen} onClose={() => setGovOpen(false)} />
      {govOpen && (
        <div
          className="fixed inset-0 z-[55] bg-black/60 backdrop-blur-md transition-opacity"
          onClick={() => setGovOpen(false)}
        />
      )}
    </div>
  )
}
