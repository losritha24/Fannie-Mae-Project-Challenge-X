"""Simple in-memory token-bucket rate limit middleware.

Per-IP, per-endpoint-group. Swap for Redis-backed limiter in production.
"""
from __future__ import annotations
import time
from collections import defaultdict
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, rate_per_min: int = 120, burst: int = 30) -> None:
        super().__init__(app)
        self.rate = rate_per_min / 60.0
        self.burst = burst
        self.buckets: dict[str, list[float]] = defaultdict(lambda: [float(burst), time.monotonic()])

    async def dispatch(self, request: Request, call_next):
        if request.url.path in ("/health", "/docs", "/openapi.json"):
            return await call_next(request)
        ip = request.client.host if request.client else "unknown"
        key = f"{ip}:{request.url.path.split('/')[3] if request.url.path.startswith('/api/v1/') else 'other'}"
        tokens, last = self.buckets[key]
        now = time.monotonic()
        tokens = min(self.burst, tokens + (now - last) * self.rate)
        if tokens < 1:
            self.buckets[key] = [tokens, now]
            return JSONResponse({"detail": "rate_limit_exceeded"}, status_code=429)
        self.buckets[key] = [tokens - 1, now]
        return await call_next(request)
