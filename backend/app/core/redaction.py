"""PII + secret redaction for logs."""
import logging
import re

PATTERNS = [
    (re.compile(r"sk-[A-Za-z0-9_\-]{20,}"), "sk-***REDACTED***"),
    (re.compile(r"\bBearer\s+[A-Za-z0-9._\-]+", re.I), "Bearer ***REDACTED***"),
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "***SSN***"),
    (re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"), "***EMAIL***"),
    (re.compile(r"\b(?:\d[ -]*?){13,19}\b"), "***CARD***"),
]


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:
            return True
        for pat, repl in PATTERNS:
            msg = pat.sub(repl, msg)
        record.msg = msg
        record.args = ()
        return True


def install() -> None:
    f = RedactingFilter()
    for name in ("", "uvicorn", "uvicorn.access", "uvicorn.error", "fastapi"):
        logging.getLogger(name).addFilter(f)
