import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Bot, User, Loader2, Lightbulb, Brain, ChevronDown } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || ''

// Simple markdown-to-JSX renderer (bold, headers, bullets, tables)
function MarkdownText({ text }) {
  if (!text) return null
  const lines = text.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // H3
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="font-bold text-slate-100 text-sm mt-2 mb-1">
          {renderInline(line.slice(4))}
        </h3>
      )
    }
    // H2
    else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="font-bold text-white text-base mt-2 mb-1">
          {renderInline(line.slice(3))}
        </h2>
      )
    }
    // Table header detection
    else if (line.startsWith('|') && lines[i + 1]?.startsWith('|---')) {
      const headers = line.split('|').filter(Boolean).map(h => h.trim())
      const rows = []
      i += 2 // skip separator
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(lines[i].split('|').filter(Boolean).map(c => c.trim()))
        i++
      }
      elements.push(
        <div key={`table-${i}`} className="overflow-x-auto my-2">
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr>
                {headers.map((h, j) => (
                  <th key={j} className="px-2 py-1 bg-white/10 text-left text-slate-200 font-semibold border border-white/10">
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="even:bg-white/5">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 py-1 text-slate-300 border border-white/10">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }
    // Bullet
    else if (line.startsWith('  • ') || line.startsWith('- ') || line.startsWith('* ')) {
      const content = line.replace(/^(\s*[•\-\*]\s*)/, '')
      elements.push(
        <div key={i} className="flex gap-1.5 text-xs text-slate-300 my-0.5">
          <span className="text-blue-400 mt-0.5 shrink-0">•</span>
          <span>{renderInline(content)}</span>
        </div>
      )
    }
    // Numbered list
    else if (/^\d+\./.test(line)) {
      elements.push(
        <div key={i} className="flex gap-1.5 text-xs text-slate-300 my-0.5">
          <span className="text-blue-400 shrink-0 font-mono">{line.match(/^\d+/)[0]}.</span>
          <span>{renderInline(line.replace(/^\d+\.\s*/, ''))}</span>
        </div>
      )
    }
    // Italic quote (suggestions)
    else if (line.startsWith('- *') || line.match(/^- \*.+\*$/)) {
      elements.push(
        <div key={i} className="text-xs text-slate-400 italic ml-3 my-0.5">
          {renderInline(line.slice(2))}
        </div>
      )
    }
    // Empty line
    else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1" />)
    }
    // Normal paragraph
    else {
      elements.push(
        <p key={i} className="text-xs text-slate-300 leading-relaxed">
          {renderInline(line)}
        </p>
      )
    }
    i++
  }

  return <div className="space-y-0.5">{elements}</div>
}

function renderInline(text) {
  // Bold **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>
    }
    // Italic *text*
    const italic = part.split(/(\*[^*]+\*)/)
    return italic.map((p, j) => {
      if (p.startsWith('*') && p.endsWith('*') && p.length > 2) {
        return <em key={j} className="text-slate-400 italic">{p.slice(1, -1)}</em>
      }
      return <span key={j}>{p}</span>
    })
  })
}

// Single chat message bubble
function ChatMessage({ msg }) {
  const isUser = msg.role === 'user'
  const time = new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`flex gap-2 mb-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs mt-0.5
        ${isUser ? 'bg-blue-500' : 'bg-gradient-to-br from-violet-500 to-blue-600'}`}>
        {isUser ? <User className="w-3 h-3 text-white" /> : <Bot className="w-3 h-3 text-white" />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-xs
        ${isUser
          ? 'bg-blue-600 text-white rounded-tr-sm'
          : 'bg-white/10 border border-white/10 text-slate-200 rounded-tl-sm'
        }`}
      >
        {isUser
          ? <p className="text-xs">{msg.content}</p>
          : <MarkdownText text={msg.content} />
        }
        <p className={`text-[10px] mt-1 ${isUser ? 'text-blue-200 text-right' : 'text-slate-500'}`}>{time}</p>
      </div>
    </div>
  )
}

// Suggestion chip
function Chip({ text, onClick }) {
  return (
    <button
      onClick={() => onClick(text)}
      className="text-[11px] px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300
                 border border-white/10 hover:border-white/25 transition-all text-left leading-snug"
    >
      {text}
    </button>
  )
}

export default function ChatBot({ sessionId, lastAnalysed }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [tickerCount, setTickerCount] = useState(0)
  const [unread, setUnread] = useState(0)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150)
      setUnread(0)
    }
  }, [open])

  // When a new ticker is analysed, push a follow-up suggestion into chat
  useEffect(() => {
    if (!lastAnalysed) return
    const assistantMsg = {
      role: 'assistant',
      content: `✅ **${lastAnalysed.ticker}** scorecard loaded into memory!\n\nOverall score: **${lastAnalysed.overall_score}/100** (${lastAnalysed.overall_label})\n\nAsk me anything about it — dimensions, Piotroski signals, comparisons, and more.`,
      timestamp: Date.now() / 1000,
    }
    setMessages(prev => [...prev, assistantMsg])
    setSuggestions([
      `What is ${lastAnalysed.ticker}'s overall score?`,
      `Explain ${lastAnalysed.ticker}'s financial dimension`,
      `What is ${lastAnalysed.ticker}'s momentum trend?`,
      'What have we analysed this session?',
    ])
    setTickerCount(c => c + 1)
    if (!open) setUnread(u => u + 1)
  }, [lastAnalysed])

  // Initial welcome message
  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: '👋 Hi! I\'m your **FMCG memory assistant**.\n\nAnalyse a stock using the search bar above, then ask me questions like:\n- *What is AAPL\'s score?*\n- *Compare AAPL and MSFT*\n- *Explain the F-score for PG*\n- *What have we analysed?*',
      timestamp: Date.now() / 1000,
    }])
  }, [])

  const sendMessage = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')

    const userMsg = { role: 'user', content: msg, timestamp: Date.now() / 1000 }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: msg }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Chat error')

      const assistantMsg = {
        role: 'assistant',
        content: data.reply,
        timestamp: Date.now() / 1000,
      }
      setMessages(prev => [...prev, assistantMsg])
      setSuggestions(data.suggestions || [])
      setTickerCount(data.tickers_in_memory?.length || 0)
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ Error: ${e.message}. Make sure the backend is running.`,
        timestamp: Date.now() / 1000,
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Floating toggle button */}
      <button
        id="chatbot-toggle"
        onClick={() => { setOpen(o => !o); setUnread(0) }}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl
          flex items-center justify-center transition-all duration-300
          bg-gradient-to-br from-violet-600 to-blue-600 hover:scale-110 active:scale-95`}
        aria-label="Toggle chat assistant"
      >
        {open
          ? <ChevronDown className="w-6 h-6 text-white" />
          : <MessageCircle className="w-6 h-6 text-white" />
        }
        {/* Unread badge */}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500
            text-white text-[10px] font-bold flex items-center justify-center animate-bounce">
            {unread}
          </span>
        )}
      </button>

      {/* Chat panel */}
      <div className={`fixed bottom-24 right-6 z-50 w-[360px] max-w-[calc(100vw-24px)]
        rounded-2xl shadow-2xl border border-white/10 overflow-hidden
        flex flex-col transition-all duration-300 origin-bottom-right
        ${open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-90 pointer-events-none'}
      `}
        style={{ height: '520px', background: 'linear-gradient(160deg, #1e1b4b 0%, #1e293b 100%)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3
          bg-gradient-to-r from-violet-700/60 to-blue-700/40 border-b border-white/10 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600
            flex items-center justify-center shrink-0">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white leading-tight">FMCG Memory Assistant</p>
            <p className="text-[11px] text-slate-400 leading-tight">
              {tickerCount > 0
                ? `${tickerCount} ticker${tickerCount > 1 ? 's' : ''} in memory`
                : 'Analyse a stock to get started'}
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 scroll-smooth">
          {messages.map((msg, i) => (
            <ChatMessage key={i} msg={msg} />
          ))}
          {loading && (
            <div className="flex gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-blue-600
                flex items-center justify-center shrink-0">
                <Bot className="w-3 h-3 text-white" />
              </div>
              <div className="bg-white/10 border border-white/10 rounded-2xl rounded-tl-sm px-3 py-2">
                <div className="flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Follow-up suggestions */}
        {suggestions.length > 0 && !loading && (
          <div className="px-4 pb-2 shrink-0">
            <div className="flex items-center gap-1 mb-1.5">
              <Lightbulb className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Suggestions</span>
            </div>
            <div className="flex flex-col gap-1">
              {suggestions.map((s, i) => (
                <Chip key={i} text={s} onClick={sendMessage} />
              ))}
            </div>
          </div>
        )}

        {/* Input bar */}
        <div className="px-3 pb-3 pt-2 border-t border-white/10 shrink-0">
          <div className="flex gap-2 items-end">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Ask about any analysed stock…"
              disabled={loading}
              id="chatbot-input"
              className="flex-1 bg-white/10 border border-white/15 rounded-xl px-3 py-2
                text-xs text-white placeholder-slate-500 focus:outline-none
                focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50
                disabled:opacity-50 transition-all resize-none"
            />
            <button
              id="chatbot-send"
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40
                flex items-center justify-center transition-all active:scale-95 shrink-0"
            >
              {loading
                ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                : <Send className="w-4 h-4 text-white" />
              }
            </button>
          </div>
          <p className="text-[10px] text-slate-600 text-center mt-1.5">
            Memory resets on page refresh · Data from current session only
          </p>
        </div>
      </div>
    </>
  )
}
