from datetime import datetime, timezone
from uuid import uuid4
from typing import Any, Optional

# In-memory immutable event log (append-only). Swap for Postgres table in prod.
_AUDIT_LOG: list[dict] = []


def log_event(actor: str, action: str, entity: str, entity_id: str, details: Optional[dict[str, Any]] = None) -> dict:
    event = {
        "event_id": str(uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "actor": actor,
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
        "details": details or {},
    }
    _AUDIT_LOG.append(event)
    return event


def get_events(entity_id: Optional[str] = None) -> list[dict]:
    if entity_id:
        return [e for e in _AUDIT_LOG if e["entity_id"] == entity_id]
    return list(_AUDIT_LOG)
