import { useState, useEffect, useCallback } from 'react'
import {
  Shield, ShieldCheck, ShieldX, ShieldAlert,
  X, Activity, Lock, Zap, Eye, AlertTriangle,
  CheckCircle2, XCircle, ToggleLeft, ToggleRight,
  RefreshCw, ChevronRight, Loader2, FileCheck2,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL || ''

const ASI_ICONS = {
  'ASI-01': '🛡️', 'ASI-02': '🔑', 'ASI-03': '🧹', 'ASI-04': '🔗',
  'ASI-05': '⏱️', 'ASI-06': '🆔', 'ASI-07': '🛡️', 'ASI-08': '🔌',
  'ASI-09': '🚫', 'ASI-10': '🛑',
}

const ASI_LABELS = {
  'ASI-01': 'Input Sanitisation',
  'ASI-02': 'RBAC Capabilities',
  'ASI-03': 'Output Sanitisation',
  'ASI-04': 'Audit Chain Integrity',
  'ASI-05': 'Resource Budgets',
  'ASI-06': 'Zero-Trust Identity',
  'ASI-07': 'Param Validation',
  'ASI-08': 'Circuit Breakers',
  'ASI-09': 'Data Integrity',
  'ASI-10': 'Kill Switch / Sandbox',
}

function StatusDot({ active }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${active ? 'bg-emerald-400 shadow-[0_0_6px_theme(colors.emerald.400)]' : 'bg-red-400 shadow-[0_0_6px_theme(colors.red.400)]'}`} />
  )
}

function CircuitBreakerRow({ id, data }) {
  const name = id.replace('agent-', '').replace(/_/g, ' ')
  return (
    <div className="flex items-center justify-between text-xs py-1.5 border-b border-white/5 last:border-0">
      <span className="text-slate-300 capitalize">{name}</span>
      <div className="flex items-center gap-2">
        <span className={`font-mono text-[11px] ${data.open ? 'text-red-400' : 'text-emerald-400'}`}>
          {data.open ? 'OPEN' : 'CLOSED'}
        </span>
        <span className="text-slate-500 text-[10px]">{data.failures}/{data.threshold}</span>
      </div>
    </div>
  )
}

function AuditRow({ rec }) {
  const isAllow = rec.decision === 'allow'
  return (
    <div className="flex items-start gap-2 text-[11px] py-1.5 border-b border-white/5 last:border-0">
      {isAllow
        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
        : <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
      }
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-300 font-medium truncate">{rec.agent?.replace('agent-', '')}</span>
          {rec.asi && <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-slate-400 font-mono">{rec.asi}</span>}
        </div>
        <p className="text-slate-500 truncate">{rec.tool || rec.action}: {rec.reason}</p>
      </div>
    </div>
  )
}

export default function GovernancePanel({ open, onClose }) {
  const [status, setStatus] = useState(null)
  const [audit, setAudit] = useState([])
  const [verification, setVerification] = useState(null)
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [tab, setTab] = useState('controls') // controls | audit | verify

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/governance/status`)
      if (res.ok) setStatus(await res.json())
    } catch {}
  }, [])

  const fetchAudit = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/governance/audit?limit=30`)
      if (res.ok) {
        const data = await res.json()
        setAudit(data.records || [])
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    Promise.all([fetchStatus(), fetchAudit()]).finally(() => setLoading(false))
    const interval = setInterval(() => { fetchStatus(); fetchAudit() }, 8000)
    return () => clearInterval(interval)
  }, [open, fetchStatus, fetchAudit])

  const toggleKill = async () => {
    setToggling(true)
    try {
      const res = await fetch(`${API}/api/governance/toggle-kill`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setStatus(prev => prev ? { ...prev, kill_switch: data.kill_switch } : prev)
      }
    } catch {} finally { setToggling(false) }
  }

  const runVerify = async () => {
    setVerifying(true)
    setVerification(null)
    try {
      const res = await fetch(`${API}/api/governance/verify`, { method: 'POST' })
      if (res.ok) setVerification(await res.json())
    } catch (e) {
      setVerification({ valid: false, message: `Error: ${e.message}` })
    } finally { setVerifying(false) }
  }

  const controls = status?.owasp_controls || {}
  const breakers = status?.circuit_breakers || {}

  return (
    <div className={`fixed inset-y-0 right-0 z-[60] w-[400px] max-w-[calc(100vw-16px)]
      shadow-2xl border-l border-white/10 flex flex-col transition-transform duration-300
      ${open ? 'translate-x-0' : 'translate-x-full'}
    `} style={{ background: 'linear-gradient(170deg, #0f172a 0%, #1e1b4b 100%)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-white">Governance Shield</h2>
          <p className="text-[11px] text-slate-400">AGT · OWASP ASI 10/10</p>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center">
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Kill Switch banner */}
      {status && (
        <div className={`px-5 py-3 flex items-center justify-between border-b border-white/10 shrink-0
          ${status.kill_switch ? 'bg-red-900/40' : 'bg-emerald-900/20'}`}>
          <div className="flex items-center gap-2">
            {status.kill_switch
              ? <ShieldX className="w-5 h-5 text-red-400" />
              : <ShieldCheck className="w-5 h-5 text-emerald-400" />
            }
            <div>
              <p className={`text-xs font-semibold ${status.kill_switch ? 'text-red-300' : 'text-emerald-300'}`}>
                {status.kill_switch ? 'KILL SWITCH ACTIVE' : 'System Operational'}
              </p>
              <p className="text-[10px] text-slate-400">
                {status.total_evaluations} evals · {status.total_denials} denied
              </p>
            </div>
          </div>
          <button
            onClick={toggleKill}
            disabled={toggling}
            className={`p-1.5 rounded-lg transition-colors ${
              status.kill_switch ? 'hover:bg-red-800/50 text-red-400' : 'hover:bg-white/10 text-slate-400'
            }`}
          >
            {toggling
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : status.kill_switch
                ? <ToggleRight className="w-6 h-6" />
                : <ToggleLeft className="w-6 h-6" />
            }
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-white/10 shrink-0">
        {[
          { id: 'controls', label: 'Controls', icon: Shield },
          { id: 'audit', label: 'Audit Log', icon: Eye },
          { id: 'verify', label: 'Verify', icon: FileCheck2 },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium
              transition-colors border-b-2 ${tab === t.id
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          </div>
        )}

        {/* ── Controls tab ── */}
        {!loading && tab === 'controls' && (
          <>
            {/* OWASP ASI status grid */}
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
                OWASP Agentic Top 10 Coverage
              </h3>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(ASI_LABELS).map(([code, label]) => (
                  <div key={code} className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-2 border border-white/5">
                    <span className="text-sm">{ASI_ICONS[code]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-mono text-slate-400">{code}</p>
                      <p className="text-[11px] text-slate-200 truncate">{label}</p>
                    </div>
                    <StatusDot active={true} />
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
                Session Stats
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Evaluations', val: status?.total_evaluations ?? 0, color: 'text-blue-400' },
                  { label: 'Denials', val: status?.total_denials ?? 0, color: 'text-red-400' },
                  { label: 'Tool Calls', val: status?.session_tool_calls ?? 0, color: 'text-amber-400' },
                ].map(s => (
                  <div key={s.label} className="bg-white/5 rounded-lg px-3 py-2 border border-white/5 text-center">
                    <p className={`text-lg font-bold ${s.color}`}>{s.val}</p>
                    <p className="text-[10px] text-slate-500">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Circuit breakers */}
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-amber-400" />
                Circuit Breakers (ASI-08)
              </h3>
              <div className="bg-white/5 rounded-lg border border-white/5 px-3 py-2">
                {Object.entries(breakers).map(([id, data]) => (
                  <CircuitBreakerRow key={id} id={id} data={data} />
                ))}
                {Object.keys(breakers).length === 0 && (
                  <p className="text-xs text-slate-500 py-2">No agents registered yet</p>
                )}
              </div>
            </div>

            {/* Registered agents */}
            {status?.registered_agents?.length > 0 && (
              <div>
                <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-blue-400" />
                  Registered Agents (ASI-06)
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {status.registered_agents.map(a => (
                    <span key={a} className="text-[11px] px-2 py-1 rounded-lg bg-blue-500/15 text-blue-300 border border-blue-500/20 font-mono">
                      {a.replace('agent-', '')}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Audit tab ── */}
        {!loading && tab === 'audit' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5">
                <Eye className="w-3 h-3" /> Recent Audit Records
              </h3>
              <button onClick={fetchAudit} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>
            <div className="bg-white/5 rounded-lg border border-white/5 px-3 py-1 max-h-[500px] overflow-y-auto">
              {audit.length === 0 && <p className="text-xs text-slate-500 py-4 text-center">No audit records yet</p>}
              {audit.map((rec, i) => <AuditRow key={i} rec={rec} />)}
            </div>
          </div>
        )}

        {/* ── Verify tab ── */}
        {!loading && tab === 'verify' && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <FileCheck2 className="w-10 h-10 text-blue-400 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-white mb-1">Audit Chain Verifier</h3>
              <p className="text-[11px] text-slate-400 max-w-[280px] mx-auto">
                Cryptographically verify the SHA-256 Merkle hash chain and HMAC signatures of all audit records.
              </p>
            </div>

            <button
              onClick={runVerify}
              disabled={verifying}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600
                text-white text-sm font-semibold hover:from-blue-500 hover:to-violet-500
                disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {verifying
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
                : <><FileCheck2 className="w-4 h-4" /> Run Integrity Check</>
              }
            </button>

            {verification && (
              <div className={`rounded-xl p-4 border ${
                verification.valid
                  ? 'bg-emerald-900/20 border-emerald-500/30'
                  : 'bg-red-900/20 border-red-500/30'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {verification.valid
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    : <AlertTriangle className="w-5 h-5 text-red-400" />
                  }
                  <span className={`text-sm font-semibold ${verification.valid ? 'text-emerald-300' : 'text-red-300'}`}>
                    {verification.message}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Records verified: {verification.records}
                </p>
                {verification.errors?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {verification.errors.map((e, i) => (
                      <p key={i} className="text-[11px] text-red-400 font-mono">• {e}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-white/10 shrink-0">
        <p className="text-[10px] text-slate-600 text-center">
          Microsoft AGT-style governance · OWASP Agentic Top 10 · SHA-256 + HMAC
        </p>
      </div>
    </div>
  )
}
