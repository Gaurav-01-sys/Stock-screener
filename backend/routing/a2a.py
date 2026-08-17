"""Agent-to-Agent messaging with integrity signatures (ASI-07)."""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from enum import Enum
import uuid
import hashlib
import json


class MessageType(str, Enum):
    TASK = "task"
    RESULT = "result"
    QUERY = "query"
    HANDOFF = "handoff"
    ERROR = "error"


@dataclass
class A2AMessage:
    id: str
    sender_id: str
    receiver_id: str
    type: MessageType
    payload: Dict[str, Any]
    correlation_id: Optional[str] = None
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    signature: Optional[str] = None

    def sign(self, secret: str = "fmcg-a2a-secret") -> None:
        canonical = f"{self.id}|{self.sender_id}|{self.receiver_id}|{self.type}|{json.dumps(self.payload, sort_keys=True, default=str)}"
        self.signature = hashlib.sha256((canonical + secret).encode()).hexdigest()

    def verify(self, secret: str = "fmcg-a2a-secret") -> bool:
        if not self.signature:
            return False
        canonical = f"{self.id}|{self.sender_id}|{self.receiver_id}|{self.type}|{json.dumps(self.payload, sort_keys=True, default=str)}"
        expected = hashlib.sha256((canonical + secret).encode()).hexdigest()
        return self.signature == expected


class A2ABus:
    def __init__(self):
        self._inbox: Dict[str, List[A2AMessage]] = {}
        self._history: List[A2AMessage] = []

    def send(self, message: A2AMessage) -> None:
        message.sign()
        if not message.verify():
            raise ValueError("A2A message failed integrity check")
        self._inbox.setdefault(message.receiver_id, []).append(message)
        self._history.append(message)

    def receive(self, agent_id: str) -> List[A2AMessage]:
        messages = self._inbox.get(agent_id, [])
        self._inbox[agent_id] = []
        return messages
