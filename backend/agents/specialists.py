"""
FMCG Specialist Agents – yfinance tools + Piotroski F-Score.
"""

from __future__ import annotations
from typing import Any, Dict, Optional, List
from datetime import datetime
import uuid

from governance.policy import GovernanceEngine, AgentIdentity
from routing.a2a import A2ABus, A2AMessage, MessageType
from mcp.yfinance_client import YFinanceClient, TOOL_MAP
from scoring.piotroski import FinancialPeriod, compute_piotroski


def _num(val) -> Optional[float]:
    try:
        if val is None:
            return None
        return float(val)
    except Exception:
        return None


def _extract_period(records: List[Dict], idx: int = 0) -> Optional[Dict]:
    if not records or idx >= len(records):
        return None
    return records[idx]


class BaseAgent:
    def __init__(
        self,
        identity: AgentIdentity,
        governance: GovernanceEngine,
        bus: A2ABus,
        yf: YFinanceClient,
    ):
        self.identity = identity
        self.governance = governance
        self.bus = bus
        self.yf = yf
        self.governance.register_agent(identity)

    async def call_tool(self, tool_name: str, **kwargs) -> Dict[str, Any]:
        from tracing import tracer

        with tracer.run(
            name=f"tool.{tool_name}",
            run_type="tool",
            inputs={"tool": tool_name, **kwargs},
            extra={"agent": self.identity.name},
        ) as span:
            verdict = self.governance.evaluate(
                agent_id=self.identity.agent_id,
                action="tool_call",
                tool_name=tool_name,
                input_data=kwargs,
            )
            if verdict.decision.value != "allow":
                out = {"error": f"Governance denied: {verdict.reason}"}
                tracer.end_with_outputs(span, out)
                return out

            method_name = TOOL_MAP.get(tool_name)
            if not method_name:
                out = {"error": f"Unknown tool: {tool_name}"}
                tracer.end_with_outputs(span, out)
                return out
            method = getattr(self.yf, method_name, None)
            if not method:
                out = {"error": f"Method not found: {method_name}"}
                tracer.end_with_outputs(span, out)
                return out

            try:
                result = await method(**kwargs)
                cb = self.governance.circuit_breakers.get(self.identity.agent_id)
                if cb:
                    cb.record_success()
                summary = (
                    {"ok": True, "keys": list(result.keys())[:12]}
                    if isinstance(result, dict) and "error" not in result
                    else {"error": result.get("error") if isinstance(result, dict) else str(result)}
                )
                tracer.end_with_outputs(span, summary)
                return result
            except Exception as e:
                cb = self.governance.circuit_breakers.get(self.identity.agent_id)
                if cb:
                    cb.record_failure()
                out = {"error": str(e)}
                tracer.end_with_outputs(span, out)
                return out


class FinancialAgent(BaseAgent):
    """F – Financial Performance (Piotroski + fundamentals)."""

    def __init__(self, governance, bus, yf):
        identity = AgentIdentity(
            agent_id="agent-financial",
            name="financial_agent",
            roles=["analyst"],
            allowed_capabilities={
                "yfinance.get_financials",
                "yfinance.get_ticker_info",
                "score.financial",
                "score.piotroski",
            },
        )
        super().__init__(identity, governance, bus, yf)

    def _period_from_statements(self, financials: Dict, idx: int, label: str) -> FinancialPeriod:
        income = _extract_period(financials.get("income_statement") or [], idx) or {}
        balance = _extract_period(financials.get("balance_sheet") or [], idx) or {}
        cashflow = _extract_period(financials.get("cash_flow") or [], idx) or {}

        # Case-insensitive + multi-alias lookup (yfinance field names vary by ticker/version)
        def pick(d: Dict, *keys) -> Optional[float]:
            if not d:
                return None
            lower_map = {str(k).lower().strip(): v for k, v in d.items()}
            for key in keys:
                # exact
                if key in d and d[key] is not None:
                    return _num(d[key])
                # case-insensitive
                lk = key.lower().strip()
                if lk in lower_map and lower_map[lk] is not None:
                    return _num(lower_map[lk])
                # substring fallback
                for dk, dv in lower_map.items():
                    if lk in dk and dv is not None:
                        return _num(dv)
            return None

        return FinancialPeriod(
            label=label,
            net_income=pick(
                income,
                "Net Income", "NetIncome", "Net Income Common Stockholders",
                "Net Income Including Noncontrolling Interests",
            ),
            operating_cash_flow=pick(
                cashflow,
                "Operating Cash Flow", "Total Cash From Operating Activities",
                "Cash Flow From Continuing Operating Activities",
                "Cash From Operations",
            ),
            total_assets=pick(balance, "Total Assets", "TotalAssets"),
            total_revenue=pick(
                income, "Total Revenue", "TotalRevenue", "Operating Revenue", "Revenue"
            ),
            gross_profit=pick(income, "Gross Profit", "GrossProfit"),
            total_debt=pick(
                balance,
                "Total Debt", "TotalDebt", "Long Term Debt",
                "Long Term Debt And Capital Lease Obligation",
                "Current Debt And Capital Lease Obligation",
            ),
            current_assets=pick(
                balance, "Current Assets", "CurrentAssets", "Total Current Assets"
            ),
            current_liabilities=pick(
                balance,
                "Current Liabilities", "CurrentLiabilities", "Total Current Liabilities",
            ),
            shares_outstanding=pick(
                balance,
                "Ordinary Shares Number", "Share Issued", "Common Stock",
                "Common Stock Shares Outstanding", "Diluted Average Shares",
            ),
        )

    async def run(self, ticker: str) -> Dict[str, Any]:
        financials = await self.call_tool("yfinance.get_financials", symbol=ticker)
        info = await self.call_tool("yfinance.get_ticker_info", symbol=ticker)

        score = 50
        metrics = []
        notes = []
        piotroski_data = None

        if "error" not in financials:
            current = self._period_from_statements(financials, 0, "current")
            prior = self._period_from_statements(financials, 1, "prior")
            pr = compute_piotroski(current, prior)
            piotroski_data = {
                "score": pr.score,
                "max_score": pr.max_score,
                "pct": pr.pct,
                "signals": {k: v for k, v in pr.signals.items() if v is not None},
                "category_scores": pr.category_scores,
            }
            # Piotroski is the primary driver of F score:
            # 0/9 → ~25,  5/9 → ~60,  9/9 → ~95
            if pr.max_score > 0:
                score = int(25 + (pr.pct * 0.70))
            metrics.append({
                "name": "Piotroski F-Score",
                "value": f"{pr.score}/{pr.max_score} ({pr.pct}%)",
            })
            # Surface category breakdowns as metrics
            for cat, cs in pr.category_scores.items():
                if cs["max"] > 0:
                    metrics.append({
                        "name": cat.replace("_", " / ").title(),
                        "value": f"{cs['score']}/{cs['max']}",
                    })
            notes.append(f"Piotroski F-Score {pr.score}/{pr.max_score} ({pr.pct}%)")
            if pr.max_score < 9:
                notes.append(f"{9 - pr.max_score} signal(s) excluded due to missing data")
        else:
            notes.append(f"Financials issue: {financials.get('error')}")

        # Secondary fundamental overlays (small adjustments only)
        if "error" not in info:
            roe = info.get("returnOnEquity")
            if roe is not None:
                roe_pct = roe * 100 if abs(roe) < 5 else roe
                metrics.append({"name": "ROE", "value": f"{roe_pct:.1f}%"})
                if roe > 0.20:
                    score = min(100, score + 4)
                elif roe < 0:
                    score = max(0, score - 5)
            de = info.get("debtToEquity")
            if de is not None:
                metrics.append({"name": "Debt/Equity", "value": f"{de:.1f}"})
            margins = info.get("operatingMargins")
            if margins is not None:
                metrics.append({"name": "Op. Margin", "value": f"{margins * 100:.1f}%"})

        score = max(0, min(100, int(score)))
        return {
            "dimension": "F",
            "label": "Financial Performance",
            "score": score,
            "metrics": metrics,
            "notes": notes,
            "piotroski": piotroski_data,
            "info_snapshot": {
                "roe": info.get("returnOnEquity") if "error" not in info else None,
                "debtToEquity": info.get("debtToEquity") if "error" not in info else None,
                "operatingMargins": info.get("operatingMargins") if "error" not in info else None,
            },
        }


class MomentumAgent(BaseAgent):
    """M – Market Momentum from real price history."""

    def __init__(self, governance, bus, yf):
        identity = AgentIdentity(
            agent_id="agent-momentum",
            name="momentum_agent",
            roles=["analyst"],
            allowed_capabilities={
                "yfinance.get_price_history",
                "yfinance.get_ticker_info",
                "score.momentum",
            },
        )
        super().__init__(identity, governance, bus, yf)

    async def run(self, ticker: str, momentum_period: str = "6mo") -> Dict[str, Any]:
        # Scoring requires consistent daily data
        hist_score = await self.call_tool("yfinance.get_price_history", symbol=ticker, period="6mo", interval="1d")
        
        if momentum_period == "6mo":
            hist_chart = hist_score
        else:
            hist_chart = await self.call_tool("yfinance.get_price_history", symbol=ticker, period=momentum_period, interval=None)

        info = await self.call_tool("yfinance.get_ticker_info", symbol=ticker)

        score = 50
        metrics = []
        notes = []
        returns = {}

        if "error" not in hist_score and hist_score.get("prices"):
            closes = [p["close"] for p in hist_score["prices"] if p.get("close")]
            if len(closes) >= 5:
                def ret(n):
                    if len(closes) < n + 1:
                        return None
                    return (closes[-1] - closes[-1 - n]) / closes[-1 - n]

                r1m = ret(21)
                r3m = ret(63)
                r6m = ret(min(120, len(closes) - 1))

                for label, val in [("1M", r1m), ("3M", r3m), ("6M", r6m)]:
                    if val is not None:
                        returns[label] = round(val * 100, 2)
                        metrics.append({"name": f"{label} Return", "value": f"{val*100:+.1f}%"})

                # Score from 3M return primarily
                primary = r3m if r3m is not None else r1m
                if primary is not None:
                    if primary > 0.20:
                        score = 90
                    elif primary > 0.10:
                        score = 78
                    elif primary > 0.03:
                        score = 65
                    elif primary > -0.05:
                        score = 52
                    elif primary > -0.15:
                        score = 38
                    else:
                        score = 25
                notes.append("Momentum from real OHLCV history")
        else:
            notes.append(f"Price history issue: {hist_score.get('error')}")

        if "error" not in info and info.get("currentPrice"):
            metrics.append({"name": "Price", "value": f"{info.get('currentPrice')}"})

        return {
            "dimension": "M",
            "label": "Market Momentum",
            "score": max(0, min(100, score)),
            "metrics": metrics,
            "notes": notes,
            "returns": returns,
            "price_history": hist_chart.get("prices", []) if "error" not in hist_chart else [],
        }


class CredibilityAgent(BaseAgent):
    """C – Credibility via holders + news."""

    def __init__(self, governance, bus, yf):
        identity = AgentIdentity(
            agent_id="agent-credibility",
            name="credibility_agent",
            roles=["analyst"],
            allowed_capabilities={
                "yfinance.get_holders",
                "yfinance.get_ticker_news",
                "score.credibility",
            },
        )
        super().__init__(identity, governance, bus, yf)

    async def run(self, ticker: str) -> Dict[str, Any]:
        holders = await self.call_tool("yfinance.get_holders", symbol=ticker)
        news = await self.call_tool("yfinance.get_ticker_news", symbol=ticker, limit=8)

        score = 55
        metrics = []
        notes = []

        if "error" not in holders:
            inst = holders.get("institutional_holders") or []
            insider = holders.get("insider_transactions") or []
            metrics.append({"name": "Institutional Holders", "value": str(len(inst))})
            metrics.append({"name": "Insider Txns (recent)", "value": str(len(insider))})
            if inst:
                score += 12
                notes.append("Institutional ownership data present")
            if insider:
                score += 8
                notes.append("Insider transaction history available")
        else:
            notes.append(f"Holders issue: {holders.get('error')}")

        if "error" not in news:
            items = news.get("news") or []
            metrics.append({"name": "Recent News", "value": str(len(items))})
            neg = ["fraud", "investigation", "lawsuit", "probe", "scandal", "restatement", "sec"]
            neg_count = sum(
                1 for n in items
                if any(k in (n.get("title") or "").lower() for k in neg)
            )
            if neg_count:
                score -= neg_count * 10
                metrics.append({"name": "Negative Flags", "value": str(neg_count)})
            else:
                score += 5
            notes.append(f"{len(items)} news items analysed")
        else:
            notes.append(f"News issue: {news.get('error')}")

        return {
            "dimension": "C",
            "label": "Credibility of Company",
            "score": max(0, min(100, score)),
            "metrics": metrics,
            "notes": notes,
            "news": (news.get("news") or [])[:5] if "error" not in news else [],
        }


class GrowthAgent(BaseAgent):
    """G – Sector growth + company growth signals."""

    def __init__(self, governance, bus, yf):
        identity = AgentIdentity(
            agent_id="agent-growth",
            name="growth_agent",
            roles=["analyst"],
            allowed_capabilities={
                "yfinance.get_top",
                "yfinance.get_ticker_info",
                "yfinance.get_financials",
                "score.growth",
            },
        )
        super().__init__(identity, governance, bus, yf)

    async def run(self, ticker: str) -> Dict[str, Any]:
        info = await self.call_tool("yfinance.get_ticker_info", symbol=ticker)
        sector = "Consumer Defensive"
        if "error" not in info and info.get("sector"):
            sector = info["sector"]

        peers = await self.call_tool("yfinance.get_top", sector=sector, count=8)

        score = 55
        metrics = []
        notes = []

        if "error" not in info:
            rg = info.get("revenueGrowth")
            eg = info.get("earningsGrowth")
            if rg is not None:
                metrics.append({"name": "Revenue Growth", "value": f"{rg*100:.1f}%"})
                if rg > 0.15:
                    score += 18
                elif rg > 0.05:
                    score += 10
                elif rg < 0:
                    score -= 10
            if eg is not None:
                metrics.append({"name": "Earnings Growth", "value": f"{eg*100:.1f}%"})
            notes.append(f"Sector: {sector}")
        else:
            notes.append(f"Info issue: {info.get('error')}")

        if "error" not in peers:
            peer_list = peers.get("peers") or []
            metrics.append({"name": "Sector Peers Tracked", "value": str(len(peer_list))})
            notes.append(f"Benchmarked against {len(peer_list)} sector peers")
            score += 5

        return {
            "dimension": "G",
            "label": "Growth of Sector",
            "score": max(0, min(100, score)),
            "metrics": metrics,
            "notes": notes,
            "sector": sector,
            "peers": peers.get("peers", []) if "error" not in peers else [],
        }


class SynthesizerAgent(BaseAgent):
    def __init__(self, governance, bus, yf):
        identity = AgentIdentity(
            agent_id="agent-synthesizer",
            name="synthesizer",
            roles=["synthesizer"],
            allowed_capabilities={"score.aggregate", "a2a_receive"},
        )
        super().__init__(identity, governance, bus, yf)

    async def run(self, ticker: str, dimension_results: List[Dict], info: Optional[Dict] = None) -> Dict[str, Any]:
        scores = {}
        details = {}
        for r in dimension_results:
            dim = r.get("dimension")
            scores[dim] = r.get("score", 0)
            details[dim] = r

        overall = round(sum(scores.values()) / max(len(scores), 1))
        label = (
            "Excellent" if overall >= 85 else
            "Good" if overall >= 70 else
            "Average" if overall >= 55 else
            "Weak"
        )

        return {
            "ticker": ticker.upper(),
            "name": (info or {}).get("shortName") or (info or {}).get("longName"),
            "sector": (info or {}).get("sector"),
            "industry": (info or {}).get("industry"),
            "currentPrice": (info or {}).get("currentPrice"),
            "marketCap": (info or {}).get("marketCap"),
            "overall_score": overall,
            "overall_label": label,
            "scores": scores,
            "details": details,
            "framework": "FMCG",
            "generated_at": datetime.utcnow().isoformat() + "Z",
        }
