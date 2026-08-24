import contextlib
import uuid
from datetime import datetime, timezone
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import get_settings
from app.api.v1.auth import router as auth_router
from app.api.v1.accounts import router as accounts_router
from app.api.v1.targeting import router as targeting_router
from app.api.v1.engagements import router as engagements_router
from app.api.v1.billing import router as billing_router

settings = get_settings()

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(title="Instagro API", description="Enterprise-grade Instagram growth platform API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    rid = request.headers.get("X-Request-Id", str(uuid.uuid4()))
    response = await call_next(request)
    response.headers["X-Request-Id"] = rid
    return response

@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception):
    rid = request.headers.get("X-Request-Id", str(uuid.uuid4()))
    detail = str(exc) if settings.is_development else "Internal server error"
    return JSONResponse(status_code=500, content={"error": {"code": "internal_error", "message": detail}, "request_id": rid, "timestamp": datetime.now(timezone.utc).isoformat()})

@app.get("/health", tags=["health"])
async def health_check():
    return {"status": "ok", "version": "0.1.0", "environment": settings.environment, "timestamp": datetime.now(timezone.utc).isoformat()}

api_prefix = "/api/v1"
app.include_router(auth_router, prefix=api_prefix)
app.include_router(accounts_router, prefix=api_prefix)
app.include_router(targeting_router, prefix=api_prefix)
app.include_router(engagements_router, prefix=api_prefix)
app.include_router(billing_router, prefix=api_prefix)
