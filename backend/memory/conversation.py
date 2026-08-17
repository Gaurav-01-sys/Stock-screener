"""
ConversationBuffer – sliding-window memory for the FMCG chatbot.

Stores per-session:
  - All scorecard results analysed this session (keyed by ticker)
  - The full conversation turn history (bounded to MAX_TURNS)
  - Metadata about the session (order of analysis, timestamps)
"""

from __future__ import annotations

import time
from collections import OrderedDict
from typing import Any, Dict, List, Optional


MAX_TURNS = 40  # Rolling window – older turns dropped when exceeded


class ConversationBuffer:
    """
    Holds conversation state for a single browser session.

    Layout of self._history entries:
        {
            "role":      "user" | "assistant",
            "content":   str,
            "timestamp": float,      # unix epoch
            "metadata":  dict,       # arbitrary context (ticker, intent, etc.)
        }
    """

    def __init__(self) -> None:
        self._history: List[Dict[str, Any]] = []
        # ticker → full scorecard result dict
        self._scorecards: OrderedDict[str, Dict[str, Any]] = OrderedDict()
        self.created_at: float = time.time()

    # ------------------------------------------------------------------
    # Scorecard memory
    # ------------------------------------------------------------------

    def add_scorecard(self, ticker: str, result: Dict[str, Any]) -> None:
        """Inject a completed scorecard into memory."""
        self._scorecards[ticker.upper()] = result
        # Move to end so iteration order = analysis order
        self._scorecards.move_to_end(ticker.upper())
        # Synthetic assistant context message
        self._append(
            role="assistant",
            content=f"[system] Scorecard for {ticker.upper()} loaded into memory.",
            metadata={"type": "scorecard_ingested", "ticker": ticker.upper()},
        )

    def get_scorecard(self, ticker: str) -> Optional[Dict[str, Any]]:
        return self._scorecards.get(ticker.upper())

    def list_tickers(self) -> List[str]:
        return list(self._scorecards.keys())

    def last_ticker(self) -> Optional[str]:
        if not self._scorecards:
            return None
        return next(reversed(self._scorecards))

    # ------------------------------------------------------------------
    # Turn management
    # ------------------------------------------------------------------

    def add_turn(
        self,
        user_message: str,
        assistant_reply: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        self._append("user", user_message)
        self._append("assistant", assistant_reply, metadata or {})

    def _append(
        self,
        role: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        self._history.append(
            {
                "role": role,
                "content": content,
                "timestamp": time.time(),
                "metadata": metadata or {},
            }
        )
        # Enforce rolling window (keep system messages, trim user/assistant)
        visible = [m for m in self._history if m["role"] in ("user", "assistant")
                   and m["metadata"].get("type") != "scorecard_ingested"]
        if len(visible) > MAX_TURNS * 2:
            # Drop the oldest user+assistant pair
            for i, m in enumerate(self._history):
                if m["role"] in ("user", "assistant") and m["metadata"].get("type") != "scorecard_ingested":
                    self._history.pop(i)
                    break

    def get_visible_history(self) -> List[Dict[str, Any]]:
        """Return only user/assistant turns (not internal system messages)."""
        return [
            m for m in self._history
            if m["role"] in ("user", "assistant")
            and m["metadata"].get("type") != "scorecard_ingested"
        ]

    # ------------------------------------------------------------------
    # Helpers for ChatEngine
    # ------------------------------------------------------------------

    def context_snapshot(self) -> Dict[str, Any]:
        """Return a compact snapshot of all in-memory scorecards."""
        snapshot = {}
        for ticker, r in self._scorecards.items():
            snapshot[ticker] = {
                "overall_score": r.get("overall_score"),
                "overall_label": r.get("overall_label"),
                "scores": r.get("scores", {}),
                "sector": r.get("sector"),
                "industry": r.get("industry"),
                "name": r.get("name"),
                "currentPrice": r.get("currentPrice"),
                "details": r.get("details", {}),
            }
        return snapshot
