"""Router Agent – orchestrates specialist agents via A2A."""

from __future__ import annotations
from typing import Any, Dict, Optional
import re
import uuid

from governance.policy import GovernanceEngine, AgentIdentity
from routing.a2a import A2ABus, A2AMessage, MessageType
from agents.specialists import (
    FinancialAgent, MomentumAgent, CredibilityAgent, GrowthAgent, SynthesizerAgent,
)
from mcp.yfinance_client import YFinanceClient


class RouterAgent:
    def __init__(
        self,
        governance: GovernanceEngine,
        bus: A2ABus,
        yf: YFinanceClient,
        financial: FinancialAgent,
        momentum: MomentumAgent,
        credibility: CredibilityAgent,
        growth: GrowthAgent,
        synthesizer: SynthesizerAgent,
    ):
        self.identity = AgentIdentity(
            agent_id="agent-router",
            name="router",
            roles=["orchestrator"],
            allowed_capabilities={"route", "a2a_send"},
        )
        self.governance = governance
        self.bus = bus
        self.yf = yf
        self.financial = financial
        self.momentum = momentum
        self.credibility = credibility
        self.growth = growth
        self.synthesizer = synthesizer
        self.governance.register_agent(self.identity)

    def extract_ticker(self, query: str) -> Optional[str]:
        # US market only (NYSE / NASDAQ)
        known = [
            "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NVDA", "TSLA", "NFLX",
            "JPM", "BAC", "GS", "MS", "V", "MA", "PYPL",
            "UNH", "JNJ", "LLY", "ABBV", "MRK", "PFE", "TMO",
            "XOM", "CVX", "COP",
            "WMT", "COST", "HD", "TGT", "LOW",
            "PG", "KO", "PEP", "CL", "KMB", "GIS", "MDLZ", "KHC",
            "AVGO", "ORCL", "CRM", "ADBE", "CSCO", "INTC", "AMD", "QCOM",
            "DIS", "BA", "CAT", "GE", "IBM", "UBER", "SHOP",
        ]
        q = query.upper()
        for k in known:
            if re.search(rf"\b{k}\b", q):
                return k
        # Generic 1–5 letter US ticker
        m = re.search(r"\b([A-Z]{1,5})\b", q)
        return m.group(1) if m else None

    async def handle(self, query: str) -> Dict[str, Any]:
        from tracing import tracer

        with tracer.run(
            name="fmcg_scorecard",
            run_type="chain",
            inputs={"query": query},
            extra={"framework": "FMCG", "market": "US"},
        ) as root:
            # Governance check
            with tracer.run("governance.route", run_type="governance", inputs={"agent": "router"}):
                verdict = self.governance.evaluate(
                    self.identity.agent_id, "route", input_data={"query": query}
                )
            if verdict.decision.value != "allow":
                out = {"error": f"Router blocked: {verdict.reason}"}
                tracer.end_with_outputs(root, out)
                return out

            ticker = self.extract_ticker(query)
            if not ticker:
                out = {
                    "error": "Could not identify a ticker. Try e.g. 'FMCG score for AAPL' or 'PG'",
                }
                tracer.end_with_outputs(root, out)
                return out

            correlation_id = str(uuid.uuid4())
            root.extra["ticker"] = ticker
            root.extra["correlation_id"] = correlation_id

            # Specialist agents (nested spans)
            with tracer.run("agent.financial", run_type="agent", inputs={"ticker": ticker}) as span:
                f_result = await self.financial.run(ticker)
                tracer.end_with_outputs(span, {"score": f_result.get("score"), "piotroski": f_result.get("piotroski")})

            with tracer.run("agent.momentum", run_type="agent", inputs={"ticker": ticker}) as span:
                m_result = await self.momentum.run(ticker)
                tracer.end_with_outputs(span, {"score": m_result.get("score"), "returns": m_result.get("returns")})

            with tracer.run("agent.credibility", run_type="agent", inputs={"ticker": ticker}) as span:
                c_result = await self.credibility.run(ticker)
                tracer.end_with_outputs(span, {"score": c_result.get("score")})

            with tracer.run("agent.growth", run_type="agent", inputs={"ticker": ticker}) as span:
                g_result = await self.growth.run(ticker)
                tracer.end_with_outputs(span, {"score": g_result.get("score"), "sector": g_result.get("sector")})

            # A2A fan-in
            with tracer.run("a2a.fan_in", run_type="chain", inputs={"correlation_id": correlation_id}):
                for result, agent_id in [
                    (f_result, self.financial.identity.agent_id),
                    (m_result, self.momentum.identity.agent_id),
                    (c_result, self.credibility.identity.agent_id),
                    (g_result, self.growth.identity.agent_id),
                ]:
                    self.bus.send(A2AMessage(
                        id=str(uuid.uuid4()),
                        sender_id=agent_id,
                        receiver_id=self.synthesizer.identity.agent_id,
                        type=MessageType.RESULT,
                        payload={"dimension": result.get("dimension"), "score": result.get("score")},
                        correlation_id=correlation_id,
                    ))

            with tracer.run("tool.get_ticker_info", run_type="tool", inputs={"ticker": ticker}):
                info = await self.yf.get_ticker_info(ticker)

            with tracer.run("agent.synthesizer", run_type="agent", inputs={"ticker": ticker}) as span:
                final = await self.synthesizer.run(
                    ticker,
                    dimension_results=[f_result, m_result, c_result, g_result],
                    info=info if "error" not in info else None,
                )
                tracer.end_with_outputs(span, {
                    "overall_score": final.get("overall_score"),
                    "overall_label": final.get("overall_label"),
                })

            final["a2a_correlation_id"] = correlation_id
            final["query"] = query
            final["trace_id"] = root.trace_id
            tracer.end_with_outputs(root, {
                "ticker": final.get("ticker"),
                "overall_score": final.get("overall_score"),
                "scores": final.get("scores"),
            })
            return final
