from collections.abc import AsyncGenerator
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

settings = get_settings()

_engine: Optional[object] = None
_async_session: Optional[async_sessionmaker] = None


def _get_engine():
    """Lazy-initialize the engine so unit tests that don't need DB don't fail."""
    global _engine, _async_session
    if _engine is None:
        if settings.database_url.startswith("sqlite"):
            _engine = create_async_engine(settings.database_url, echo=False)
        else:
            _engine = create_async_engine(
                settings.database_url, echo=False, pool_pre_ping=True,
                pool_size=10, max_overflow=20,
            )
        _async_session = async_sessionmaker(
            _engine, class_=AsyncSession, expire_on_commit=False, autoflush=False,
        )
    return _engine


def _get_sessionmaker():
    _get_engine()
    return _async_session


class Base(DeclarativeBase):
    pass


class _LazyEngineProxy:
    """Proxy that lazily initializes the engine on first attribute access."""

    def __getattr__(self, name):
        return getattr(_get_engine(), name)


engine = _LazyEngineProxy()


def get_session():
    """Get a new session instance."""
    sm = _get_sessionmaker()
    return sm()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a database session."""
    sm = _get_sessionmaker()
    async with sm() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
