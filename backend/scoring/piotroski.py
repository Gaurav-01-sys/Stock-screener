"""
Piotroski F-Score calculator.
Computes the classic 9-signal Piotroski F-Score from two comparable
financial-statement periods (current vs. prior).

Each signal scores 1 (pass) or 0 (fail). If a required field is missing
from either period, that signal is excluded entirely rather than guessed,
and max_score drops accordingly.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional


@dataclass
class FinancialPeriod:
    label: str
    net_income: Optional[float] = None
    operating_cash_flow: Optional[float] = None
    total_assets: Optional[float] = None
    total_revenue: Optional[float] = None
    gross_profit: Optional[float] = None
    total_debt: Optional[float] = None
    current_assets: Optional[float] = None
    current_liabilities: Optional[float] = None
    shares_outstanding: Optional[float] = None  # diluted avg shares, best effort


@dataclass
class PiotroskiResult:
    score: int
    max_score: int
    signals: dict
    category_scores: dict

    @property
    def pct(self) -> float:
        return round(100 * self.score / self.max_score, 1) if self.max_score else 0.0


def _safe_div(a, b):
    if a is None or b in (None, 0):
        return None
    return a / b


def compute_piotroski(current: FinancialPeriod, prior: FinancialPeriod) -> PiotroskiResult:
    signals = {}

    # --- Profitability (4 signals) ---
    signals["net_income_positive"] = (
        current.net_income > 0 if current.net_income is not None else None
    )
    signals["cash_flow_positive"] = (
        current.operating_cash_flow > 0 if current.operating_cash_flow is not None else None
    )
    roa_now = _safe_div(current.net_income, current.total_assets)
    roa_prior = _safe_div(prior.net_income, prior.total_assets)
    signals["roa_improving"] = (
        roa_now > roa_prior if roa_now is not None and roa_prior is not None else None
    )
    signals["earnings_quality"] = (
        current.operating_cash_flow > current.net_income
        if current.operating_cash_flow is not None and current.net_income is not None
        else None
    )

    # --- Leverage / Liquidity / Dilution (3 signals) ---
    lev_now = _safe_div(current.total_debt, current.total_assets)
    lev_prior = _safe_div(prior.total_debt, prior.total_assets)
    signals["leverage_decreasing"] = (
        lev_now < lev_prior if lev_now is not None and lev_prior is not None else None
    )
    cr_now = _safe_div(current.current_assets, current.current_liabilities)
    cr_prior = _safe_div(prior.current_assets, prior.current_liabilities)
    signals["liquidity_improving"] = (
        cr_now > cr_prior if cr_now is not None and cr_prior is not None else None
    )
    signals["no_dilution"] = (
        current.shares_outstanding <= prior.shares_outstanding
        if current.shares_outstanding is not None and prior.shares_outstanding is not None
        else None
    )

    # --- Operating Efficiency (2 signals) ---
    gm_now = _safe_div(current.gross_profit, current.total_revenue)
    gm_prior = _safe_div(prior.gross_profit, prior.total_revenue)
    signals["margin_improving"] = (
        gm_now > gm_prior if gm_now is not None and gm_prior is not None else None
    )
    at_now = _safe_div(current.total_revenue, current.total_assets)
    at_prior = _safe_div(prior.total_revenue, prior.total_assets)
    signals["turnover_improving"] = (
        at_now > at_prior if at_now is not None and at_prior is not None else None
    )

    categories = {
        "profitability": [
            "net_income_positive",
            "cash_flow_positive",
            "roa_improving",
            "earnings_quality",
        ],
        "leverage_liquidity": [
            "leverage_decreasing",
            "liquidity_improving",
            "no_dilution",
        ],
        "efficiency": ["margin_improving", "turnover_improving"],
    }

    category_scores = {}
    total_score = 0
    total_max = 0
    for cat, keys in categories.items():
        cat_score = sum(1 for k in keys if signals[k] is True)
        cat_max = sum(1 for k in keys if signals[k] is not None)
        category_scores[cat] = {"score": cat_score, "max": cat_max}
        total_score += cat_score
        total_max += cat_max

    return PiotroskiResult(
        score=total_score,
        max_score=total_max,
        signals=signals,
        category_scores=category_scores,
    )
