"""
Live verification of Piotroski F-Score for US tickers.

Usage:
  cd backend
  source .venv/bin/activate
  python test_piotroski.py AAPL
  python test_piotroski.py MSFT PG KO
"""

from __future__ import annotations
import sys
import asyncio
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich import box

from mcp.yfinance_client import YFinanceClient
from scoring.piotroski import FinancialPeriod, compute_piotroski

console = Console()


def _num(val):
    try:
        if val is None:
            return None
        return float(val)
    except Exception:
        return None


def _extract(records, idx):
    if not records or idx >= len(records):
        return {}
    return records[idx] or {}


def pick(d, *keys):
    if not d:
        return None
    lower_map = {str(k).lower().strip(): v for k, v in d.items()}
    for key in keys:
        if key in d and d[key] is not None:
            return _num(d[key])
        lk = key.lower().strip()
        if lk in lower_map and lower_map[lk] is not None:
            return _num(lower_map[lk])
        for dk, dv in lower_map.items():
            if lk in dk and dv is not None:
                return _num(dv)
    return None


def to_period(financials, idx, label) -> FinancialPeriod:
    income = _extract(financials.get("income_statement") or [], idx)
    balance = _extract(financials.get("balance_sheet") or [], idx)
    cashflow = _extract(financials.get("cash_flow") or [], idx)
    return FinancialPeriod(
        label=label,
        net_income=pick(income, "Net Income", "Net Income Common Stockholders"),
        operating_cash_flow=pick(
            cashflow, "Operating Cash Flow", "Total Cash From Operating Activities"
        ),
        total_assets=pick(balance, "Total Assets"),
        total_revenue=pick(income, "Total Revenue", "Operating Revenue"),
        gross_profit=pick(income, "Gross Profit"),
        total_debt=pick(balance, "Total Debt", "Long Term Debt"),
        current_assets=pick(balance, "Current Assets", "Total Current Assets"),
        current_liabilities=pick(balance, "Current Liabilities", "Total Current Liabilities"),
        shares_outstanding=pick(
            balance, "Ordinary Shares Number", "Share Issued", "Common Stock"
        ),
    )


async def run_one(symbol: str, yf: YFinanceClient):
    console.print(f"\n[bold cyan]▸ {symbol}[/bold cyan]")
    financials = await yf.get_financials(symbol)
    if "error" in financials:
        console.print(f"  [red]Error: {financials['error']}[/red]")
        return

    current = to_period(financials, 0, "current")
    prior = to_period(financials, 1, "prior")
    pr = compute_piotroski(current, prior)

    # Summary panel
    console.print(
        Panel(
            f"Piotroski F-Score: [bold]{pr.score}/{pr.max_score}[/bold]  ({pr.pct}%)",
            border_style="blue",
        )
    )

    # Category table
    cat_table = Table(box=box.SIMPLE, show_header=True, header_style="bold")
    cat_table.add_column("Category")
    cat_table.add_column("Score", justify="right")
    for name, cs in pr.category_scores.items():
        cat_table.add_row(name.replace("_", " / "), f"{cs['score']}/{cs['max']}")
    console.print(cat_table)

    # Signal table
    sig_table = Table(box=box.SIMPLE, show_header=True, header_style="bold")
    sig_table.add_column("Signal")
    sig_table.add_column("Result", justify="center")
    for k, v in pr.signals.items():
        if v is None:
            result = "[dim]n/a[/dim]"
        elif v:
            result = "[green]PASS[/green]"
        else:
            result = "[red]FAIL[/red]"
        sig_table.add_row(k.replace("_", " "), result)
    console.print(sig_table)

    # Field coverage
    fields = [
        ("net_income", current.net_income, prior.net_income),
        ("operating_cash_flow", current.operating_cash_flow, prior.operating_cash_flow),
        ("total_assets", current.total_assets, prior.total_assets),
        ("total_revenue", current.total_revenue, prior.total_revenue),
        ("gross_profit", current.gross_profit, prior.gross_profit),
        ("total_debt", current.total_debt, prior.total_debt),
        ("current_assets", current.current_assets, prior.current_assets),
        ("current_liabilities", current.current_liabilities, prior.current_liabilities),
        ("shares_outstanding", current.shares_outstanding, prior.shares_outstanding),
    ]
    cov = Table(title="Field coverage", box=box.SIMPLE, show_header=True)
    cov.add_column("Field")
    cov.add_column("Current", justify="right")
    cov.add_column("Prior", justify="right")
    for name, cur, pri in fields:
        cov.add_row(
            name,
            f"{cur:,.0f}" if cur is not None else "[dim]—[/dim]",
            f"{pri:,.0f}" if pri is not None else "[dim]—[/dim]",
        )
    console.print(cov)


async def main():
    symbols = sys.argv[1:] or ["AAPL", "MSFT", "PG"]
    yf = YFinanceClient()
    console.print("[bold]Piotroski F-Score live test (US market)[/bold]")
    try:
        for sym in symbols:
            await run_one(sym.upper(), yf)
    finally:
        pass


if __name__ == "__main__":
    asyncio.run(main())
