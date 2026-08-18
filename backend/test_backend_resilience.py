"""Regression tests for repeated scorecard requests and backend failures."""

from __future__ import annotations

import sys
import os
from pathlib import Path
from unittest import IsolatedAsyncioTestCase

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from agents.specialists import (  # noqa: E402
    CredibilityAgent,
    FinancialAgent,
    GrowthAgent,
    MomentumAgent,
    SynthesizerAgent,
)
from governance.policy import GovernanceEngine  # noqa: E402
from routing.a2a import A2ABus  # noqa: E402
from routing.router import RouterAgent  # noqa: E402


class FakeYFinanceClient:
    """Small deterministic data source; no Yahoo/network access in tests."""

    async def get_financials(self, symbol):
        return {
            "symbol": symbol,
            "income_statement": [],
            "balance_sheet": [],
            "cash_flow": [],
        }

    async def get_ticker_info(self, symbol):
        return {
            "symbol": symbol,
            "shortName": f"{symbol} Test Company",
            "sector": "Technology",
            "industry": "Software",
            "currentPrice": 100.0,
            "marketCap": 1_000_000.0,
            "returnOnEquity": 0.1,
            "debtToEquity": 20.0,
            "operatingMargins": 0.2,
            "revenueGrowth": 0.1,
            "earningsGrowth": 0.1,
        }

    async def get_price_history(self, symbol, period="6mo", interval=None):
        return {
            "symbol": symbol,
            "period": period,
            "interval": interval or "1d",
            "prices": [
                {"date": f"2026-01-{i:02d}", "close": float(i), "volume": 1000}
                for i in range(1, 130)
            ],
        }

    async def get_holders(self, symbol):
        return {
            "symbol": symbol,
            "institutional_holders": [],
            "insider_transactions": [],
        }

    async def get_ticker_news(self, symbol, limit=8):
        return {"symbol": symbol, "news": []}

    async def get_top(self, sector="Technology", top_type="top_growth_companies", count=8):
        return {"sector": sector, "top_type": top_type, "peers": []}


class ExplodingAgent:
    def __init__(self, agent_id="agent-credibility"):
        self.identity = type("Identity", (), {"agent_id": agent_id})()

    async def run(self, ticker):
        raise RuntimeError("simulated specialist failure")


def build_router():
    governance = GovernanceEngine(
        audit_path=os.devnull,
        policy_path=str(ROOT / "config" / "policy.yaml"),
    )
    bus = A2ABus()
    yf = FakeYFinanceClient()
    financial = FinancialAgent(governance, bus, yf)
    momentum = MomentumAgent(governance, bus, yf)
    credibility = CredibilityAgent(governance, bus, yf)
    growth = GrowthAgent(governance, bus, yf)
    synthesizer = SynthesizerAgent(governance, bus, yf)
    router = RouterAgent(
        governance, bus, yf, financial, momentum, credibility, growth, synthesizer
    )
    return governance, router


class BackendResilienceTests(IsolatedAsyncioTestCase):
    async def test_tool_budgets_reset_for_each_scorecard(self):
        governance, router = build_router()

        results = [await router.handle(symbol) for symbol in ["AAPL", "MSFT", "NVDA", "PG", "COST"]]

        self.assertTrue(all("error" not in result for result in results))
        self.assertTrue(all(set(result["scores"]) == {"F", "M", "C", "G"} for result in results))
        self.assertEqual(governance.status()["total_denials"], 0)

    async def test_one_specialist_failure_returns_partial_scorecard(self):
        governance, router = build_router()
        router.credibility = ExplodingAgent()

        result = await router.handle("AAPL")

        self.assertNotIn("error", result)
        self.assertEqual(result["scores"]["C"], 50)
        self.assertTrue(result["details"]["C"]["notes"])
