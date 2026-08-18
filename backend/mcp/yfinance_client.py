"""
YFinance data client – tool surface aligned with narumiruna/yfinance-mcp.

Tools used by FMCG agents:
  F → get_financials + get_ticker_info
  M → get_price_history
  C → get_holders + get_ticker_news
  G → get_top (sector) + income growth signals
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
import logging
import time
import yfinance as yf
import pandas as pd


logger = logging.getLogger(__name__)


def _safe(val, default=None):
    if val is None:
        return default
    try:
        if pd.isna(val):
            return default
    except Exception:
        pass
    return val


def _df_to_records(df: Optional[pd.DataFrame], max_rows: int = 8) -> List[Dict]:
    if df is None or df.empty:
        return []
    # yfinance financials are usually columns=dates, index=line items
    try:
        df = df.iloc[:, :max_rows]  # most recent periods
        records = []
        for col in df.columns:
            period = str(col.date()) if hasattr(col, "date") else str(col)
            row = {"period": period}
            for idx in df.index:
                row[str(idx)] = _safe(df.loc[idx, col])
            records.append(row)
        return records
    except Exception:
        return []


class YFinanceClient:
    """Direct yfinance client with tool names matching yfinance-mcp style."""

    _INFO_CACHE_TTL_SECONDS = 60

    def __init__(self):
        # A scorecard asks for the same ticker info from several agents. Cache
        # successful/partial responses briefly to avoid repeated Yahoo requests
        # and reduce rate-limit failures on hosted datacenter IPs.
        self._info_cache: Dict[str, tuple[float, Dict[str, Any]]] = {}

    @staticmethod
    def _first_value(source: Any, *keys: str) -> Any:
        """Read the first usable value from a dict-like yfinance object."""
        for key in keys:
            try:
                value = source.get(key) if hasattr(source, "get") else source[key]
                value = _safe(value)
                if value is not None:
                    return value
            except Exception:
                continue
        return None

    async def get_ticker_info(self, symbol: str) -> Dict[str, Any]:
        symbol = symbol.upper()
        now = time.monotonic()
        cached = self._info_cache.get(symbol)
        if cached and cached[0] > now:
            return dict(cached[1])

        info_error = None
        fast_info_error = None
        history_error = None
        try:
            t = yf.Ticker(symbol)
            try:
                info = t.info or {}
            except Exception as exc:
                info = {}
                info_error = str(exc)

            current_price = _safe(info.get("currentPrice")) or _safe(info.get("regularMarketPrice"))
            market_cap = _safe(info.get("marketCap"))

            # fast_info uses price history/metadata and computes market cap from
            # shares when quoteSummary/info is unavailable.
            try:
                fast_info = t.fast_info
                current_price = current_price or self._first_value(
                    fast_info, "lastPrice", "last_price", "regularMarketPrice"
                )
                market_cap = market_cap or self._first_value(
                    fast_info, "marketCap", "market_cap"
                )
            except Exception as exc:
                fast_info_error = str(exc)
                fast_info = None

            # Last-resort price fallback: the chart endpoint is usually still
            # available when Yahoo's quoteSummary/info endpoint is rate-limited.
            if current_price is None:
                try:
                    history = t.history(period="5d", interval="1d", auto_adjust=False)
                    if history is not None and not history.empty:
                        closes = history["Close"].dropna()
                        if not closes.empty:
                            current_price = _safe(closes.iloc[-1])
                except Exception as exc:
                    history_error = str(exc)

            # Compute market cap from any available shares figure if yfinance's
            # fast_info could not do so itself.
            shares = _safe(info.get("sharesOutstanding")) or _safe(info.get("impliedSharesOutstanding"))
            if shares is None and fast_info is not None:
                shares = self._first_value(fast_info, "shares")
            if market_cap is None and shares is not None and current_price is not None:
                try:
                    market_cap = float(shares) * float(current_price)
                except (TypeError, ValueError):
                    pass

            previous_close = _safe(info.get("previousClose"))
            if previous_close is None and fast_info is not None:
                previous_close = self._first_value(fast_info, "previousClose", "previous_close")

            result = {
                "symbol": symbol,
                "shortName": info.get("shortName") or info.get("longName"),
                "longName": info.get("longName"),
                "sector": info.get("sector"),
                "industry": info.get("industry"),
                "marketCap": market_cap,
                "currentPrice": current_price,
                "previousClose": previous_close,
                "trailingPE": info.get("trailingPE"),
                "forwardPE": info.get("forwardPE"),
                "priceToBook": info.get("priceToBook"),
                "debtToEquity": info.get("debtToEquity"),
                "returnOnEquity": info.get("returnOnEquity"),
                "returnOnAssets": info.get("returnOnAssets"),
                "profitMargins": info.get("profitMargins"),
                "operatingMargins": info.get("operatingMargins"),
                "revenueGrowth": info.get("revenueGrowth"),
                "earningsGrowth": info.get("earningsGrowth"),
                "freeCashflow": info.get("freeCashflow"),
                "totalCash": info.get("totalCash"),
                "totalDebt": info.get("totalDebt"),
                "bookValue": info.get("bookValue"),
                "enterpriseValue": info.get("enterpriseValue"),
                "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh"),
                "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow"),
                "averageVolume": info.get("averageVolume"),
                "currency": info.get("currency") or self._first_value(fast_info, "currency"),
                "exchange": info.get("exchange") or self._first_value(fast_info, "exchange"),
                "website": info.get("website"),
                "longBusinessSummary": (info.get("longBusinessSummary") or "")[:600],
            }

            warnings = []
            if info_error:
                warnings.append(f"Ticker.info unavailable: {info_error}")
            if fast_info_error:
                warnings.append(f"fast_info unavailable: {fast_info_error}")
            if history_error:
                warnings.append(f"Price fallback unavailable: {history_error}")

            if warnings:
                result["warning"] = "; ".join(warnings)
                logger.warning("Metadata fallback for %s: %s", symbol, result["warning"])

            meaningful = any(
                result.get(key) is not None
                for key in ("shortName", "sector", "industry", "currentPrice", "marketCap")
            )
            if not meaningful:
                result["error"] = result.get("warning") or "No ticker metadata available"
                return result

            self._info_cache[symbol] = (time.monotonic() + self._INFO_CACHE_TTL_SECONDS, result)
            return result
        except Exception as e:
            return {"error": str(e), "symbol": symbol}

    async def get_financials(self, symbol: str) -> Dict[str, Any]:
        """Income statement, balance sheet, cash flow – annual."""
        try:
            t = yf.Ticker(symbol.upper())
            income = t.financials
            balance = t.balance_sheet
            cashflow = t.cashflow

            return {
                "symbol": symbol.upper(),
                "income_statement": _df_to_records(income),
                "balance_sheet": _df_to_records(balance),
                "cash_flow": _df_to_records(cashflow),
            }
        except Exception as e:
            return {"error": str(e), "symbol": symbol}

    async def get_price_history(
        self,
        symbol: str,
        period: str = "6mo",
        interval: Optional[str] = None,
    ) -> Dict[str, Any]:
        try:
            if not interval:
                if period in ["1d", "5d"]:
                    interval = "5m"
                elif period in ["1mo", "3mo", "6mo"]:
                    interval = "1d"
                elif period in ["1y", "ytd", "2y", "3y", "5y", "10y"]:
                    interval = "1wk"
                elif period == "max":
                    interval = "1mo"
                else:
                    interval = "1d"

            actual_period = "5y" if period == "3y" else period

            t = yf.Ticker(symbol.upper())
            hist = t.history(period=actual_period, interval=interval)
            if hist is None or hist.empty:
                return {"error": "No price history", "symbol": symbol}

            if period == "3y":
                # ~156 weeks
                hist = hist.tail(156)

            records = []
            for idx, row in hist.iterrows():
                records.append({
                    "date": str(idx),
                    "open": _safe(row.get("Open")),
                    "high": _safe(row.get("High")),
                    "low": _safe(row.get("Low")),
                    "close": _safe(row.get("Close")),
                    "volume": _safe(row.get("Volume")),
                })
            return {
                "symbol": symbol.upper(),
                "period": period,
                "interval": interval,
                "prices": records,
            }
        except Exception as e:
            return {"error": str(e), "symbol": symbol}

    async def get_holders(self, symbol: str) -> Dict[str, Any]:
        try:
            t = yf.Ticker(symbol.upper())
            major = t.major_holders
            institutional = t.institutional_holders
            insider = t.insider_transactions

            result: Dict[str, Any] = {"symbol": symbol.upper()}

            if major is not None and not major.empty:
                result["major_holders"] = major.reset_index().astype(str).to_dict(orient="records")
            if institutional is not None and not institutional.empty:
                result["institutional_holders"] = (
                    institutional.head(10).astype(str).to_dict(orient="records")
                )
            if insider is not None and not insider.empty:
                result["insider_transactions"] = (
                    insider.head(10).astype(str).to_dict(orient="records")
                )
            return result
        except Exception as e:
            return {"error": str(e), "symbol": symbol}

    async def get_ticker_news(self, symbol: str, limit: int = 8) -> Dict[str, Any]:
        try:
            t = yf.Ticker(symbol.upper())
            news = t.news or []
            items = []
            for n in news[:limit]:
                content = n.get("content") or n
                items.append({
                    "title": content.get("title") or n.get("title"),
                    "publisher": content.get("provider", {}).get("displayName")
                    if isinstance(content.get("provider"), dict)
                    else n.get("publisher"),
                    "link": content.get("canonicalUrl", {}).get("url")
                    if isinstance(content.get("canonicalUrl"), dict)
                    else n.get("link"),
                    "published": content.get("pubDate") or n.get("providerPublishTime"),
                })
            return {"symbol": symbol.upper(), "news": items}
        except Exception as e:
            return {"error": str(e), "symbol": symbol}

    async def get_top(
        self,
        sector: str = "Consumer Defensive",
        top_type: str = "top_growth_companies",
        count: int = 10,
    ) -> Dict[str, Any]:
        """
        Best-effort sector peers.
        yfinance does not expose a perfect 'top growth' screener publicly,
        so we return a curated set of well-known names for key sectors
        and attach live info where possible.
        """
        SECTOR_PEERS = {
            "Consumer Defensive": [
                "PG", "KO", "PEP", "CL", "KMB", "GIS", "KHC", "MDLZ", "COST", "WMT"
            ],
            "Technology": [
                "AAPL", "MSFT", "GOOGL", "NVDA", "META", "AVGO", "ORCL", "CRM", "ADBE", "CSCO"
            ],
            "Financial Services": [
                "JPM", "BAC", "WFC", "GS", "MS", "BLK", "SCHW", "AXP", "C", "USB"
            ],
            "Healthcare": [
                "UNH", "JNJ", "LLY", "ABBV", "MRK", "PFE", "TMO", "ABT", "DHR", "BMY"
            ],
            "Energy": [
                "XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO", "OXY", "HES"
            ],
        }
        peers = SECTOR_PEERS.get(sector, SECTOR_PEERS["Consumer Defensive"])[:count]
        results = []
        for sym in peers:
            info = await self.get_ticker_info(sym)
            if "error" not in info:
                results.append({
                    "symbol": sym,
                    "name": info.get("shortName"),
                    "sector": info.get("sector"),
                    "marketCap": info.get("marketCap"),
                    "revenueGrowth": info.get("revenueGrowth"),
                    "currentPrice": info.get("currentPrice"),
                })
        return {
            "sector": sector,
            "top_type": top_type,
            "peers": results,
        }


# Tool name map used by governance + agents
TOOL_MAP = {
    "yfinance.get_ticker_info": "get_ticker_info",
    "yfinance.get_financials": "get_financials",
    "yfinance.get_price_history": "get_price_history",
    "yfinance.get_holders": "get_holders",
    "yfinance.get_ticker_news": "get_ticker_news",
    "yfinance.get_top": "get_top",
}
