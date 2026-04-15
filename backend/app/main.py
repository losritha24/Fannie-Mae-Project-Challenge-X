from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from uuid import uuid4
from .core.config import settings
from .core.redaction import install as install_redaction
from .core.rate_limit import RateLimitMiddleware
from .api.routes import router

install_redaction()

app = FastAPI(title=settings.app_name, version=settings.version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + ["http://localhost:1717"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimitMiddleware, rate_per_min=180, burst=40)


@app.middleware("http")
async def correlation_id(request, call_next):
    cid = request.headers.get("X-Correlation-Id") or str(uuid4())
    response = await call_next(request)
    response.headers["X-Correlation-Id"] = cid
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name, "version": settings.version,
            "mock_mode": settings.mock_mode}


app.include_router(router)
