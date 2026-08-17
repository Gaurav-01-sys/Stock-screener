"""
LangSmith-style tracing for the FMCG agentic pipeline.

Features:
  - Hierarchical run trees (root → agents → tools → governance)
  - Local JSONL persistence (always on)
  - Optional LangSmith cloud export when LANGSMITH_API_KEY is set
  - Token/latency-friendly metadata on every span

Env:
  LANGSMITH_API_KEY   – enables cloud export
  LANGSMITH_PROJECT   – project name (default: fmcg-scorecard)
  LANGSMITH_TRACING   – set to "false" to disable cloud even if key exists
  TRACE_LOG_PATH      – local JSONL path (default: logs/traces.jsonl)
"""

from __future__ import annotations

import json
import os
import time
import traceback
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional

from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / "config" / ".env"
load_dotenv(dotenv_path=env_path)

# ---------- Context (propagates parent run across async calls) ----------
_current_run: ContextVar[Optional["TraceRun"]] = ContextVar("current_run", default=None)


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class TraceRun:
    id: str
    name: str
    run_type: str  # chain | agent | tool | llm | parser | governance
    start_time: str
    end_time: Optional[str] = None
    parent_id: Optional[str] = None
    trace_id: Optional[str] = None  # root id for the whole tree
    inputs: Dict[str, Any] = field(default_factory=dict)
    outputs: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)
    children: List["TraceRun"] = field(default_factory=list)

    @property
    def latency_ms(self) -> Optional[float]:
        if not self.end_time:
            return None
        try:
            s = datetime.fromisoformat(self.start_time.replace("Z", "+00:00"))
            e = datetime.fromisoformat(self.end_time.replace("Z", "+00:00"))
            return round((e - s).total_seconds() * 1000, 1)
        except Exception:
            return None

    def to_dict(self) -> Dict[str, Any]:
        d = {
            "id": self.id,
            "name": self.name,
            "run_type": self.run_type,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "parent_id": self.parent_id,
            "trace_id": self.trace_id,
            "inputs": self.inputs,
            "outputs": _safe_json(self.outputs),
            "error": self.error,
            "extra": self.extra,
            "latency_ms": self.latency_ms,
            "children": [c.to_dict() for c in self.children],
        }
        return d


def _safe_json(obj: Any, depth: int = 0) -> Any:
    """Make outputs JSON-serializable; truncate large blobs."""
    if depth > 6:
        return str(obj)[:200]
    if obj is None or isinstance(obj, (bool, int, float, str)):
        if isinstance(obj, str) and len(obj) > 2000:
            return obj[:2000] + "…"
        return obj
    if isinstance(obj, dict):
        return {str(k): _safe_json(v, depth + 1) for k, v in list(obj.items())[:40]}
    if isinstance(obj, (list, tuple)):
        return [_safe_json(v, depth + 1) for v in list(obj)[:30]]
    return str(obj)[:500]


class Tracer:
    """
    Central tracer – LangSmith-compatible shape, local-first.
    """

    def __init__(self):
        self.enabled = True
        log_path = os.getenv("TRACE_LOG_PATH", str(Path(__file__).resolve().parent.parent / "logs" / "traces.jsonl"))
        self.log_path = Path(log_path)
        self.log_path.parent.mkdir(parents=True, exist_ok=True)

        self.langsmith_key = os.getenv("LANGSMITH_API_KEY") or os.getenv("LANGCHAIN_API_KEY")
        self.langsmith_project = os.getenv("LANGSMITH_PROJECT", "fmcg-scorecard")
        self.langsmith_enabled = (
            bool(self.langsmith_key)
            and os.getenv("LANGSMITH_TRACING", "true").lower() != "false"
        )
        self._ls_client = None

        if self.langsmith_enabled:
            try:
                from langsmith import Client
                self._ls_client = Client(api_key=self.langsmith_key)
            except Exception as e:
                # Soft fail – local tracing still works
                self.langsmith_enabled = False
                self._ls_client = None
                self._boot_warning = str(e)
        else:
            self._boot_warning = None

    # ---- core API --------------------------------------------------------

    @contextmanager
    def run(
        self,
        name: str,
        run_type: str = "chain",
        inputs: Optional[Dict[str, Any]] = None,
        extra: Optional[Dict[str, Any]] = None,
    ) -> Generator[TraceRun, None, None]:
        if not self.enabled:
            dummy = TraceRun(
                id=str(uuid.uuid4()),
                name=name,
                run_type=run_type,
                start_time=_utcnow(),
            )
            yield dummy
            return

        parent = _current_run.get()
        run = TraceRun(
            id=str(uuid.uuid4()),
            name=name,
            run_type=run_type,
            start_time=_utcnow(),
            parent_id=parent.id if parent else None,
            trace_id=parent.trace_id if parent else None,
            inputs=_safe_json(inputs or {}),
            extra=extra or {},
        )
        if run.trace_id is None:
            run.trace_id = run.id  # this is the root

        if parent:
            parent.children.append(run)

        token = _current_run.set(run)
        t0 = time.perf_counter()
        try:
            yield run
        except Exception as e:
            run.error = f"{type(e).__name__}: {e}"
            run.extra["traceback"] = traceback.format_exc()[-1500:]
            raise
        finally:
            run.end_time = _utcnow()
            run.extra["latency_ms"] = round((time.perf_counter() - t0) * 1000, 1)
            _current_run.reset(token)

            # Persist root runs (full tree) to local JSONL
            if parent is None:
                self._persist_local(run)
                if self.langsmith_enabled and self._ls_client:
                    self._export_langsmith(run)

    def end_with_outputs(self, run: TraceRun, outputs: Dict[str, Any]) -> None:
        run.outputs = _safe_json(outputs)

    # ---- persistence -----------------------------------------------------

    def _persist_local(self, root: TraceRun) -> None:
        try:
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(root.to_dict(), default=str) + "\n")
        except Exception:
            pass

    def _export_langsmith(self, root: TraceRun) -> None:
        """Best-effort push of the run tree to LangSmith."""
        try:
            from langsmith import run_trees

            def _walk(node: TraceRun, parent_run=None):
                rt = run_trees.RunTree(
                    name=node.name,
                    run_type=node.run_type if node.run_type in (
                        "chain", "llm", "prompt", "tool", "retriever", "parser"
                    ) else "chain",
                    inputs=node.inputs or {},
                    project_name=self.langsmith_project,
                    parent=parent_run,
                    id=node.id,
                )
                if node.error:
                    rt.error = node.error
                if node.outputs:
                    rt.end(outputs=node.outputs)
                else:
                    rt.end()
                for child in node.children:
                    _walk(child, parent_run=rt)
                return rt

            tree = _walk(root)
            tree.post()
        except Exception:
            # Never break the product path for tracing failures
            pass


# Singleton used across the app
tracer = Tracer()
