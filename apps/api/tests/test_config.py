import pytest
from pydantic import ValidationError

from app.config import Settings

BASE = {"DATABASE_URL": "x", "DATABASE_URL_SYNC": "y"}
STRONG = "k" * 32


def _settings(monkeypatch, **env):
    for key in ("ENVIRONMENT", "JWT_SECRET_KEY"):
        monkeypatch.delenv(key, raising=False)
    for key, value in {**BASE, **env}.items():
        monkeypatch.setenv(key, value)
    return Settings(_env_file=None)


def test_development_allows_default_secret(monkeypatch):
    assert _settings(monkeypatch).jwt_secret_key == "change-me"


@pytest.mark.parametrize("environment", ["staging", "production"])
@pytest.mark.parametrize("secret", ["change-me", "change-me-in-production", "short"])
def test_non_dev_rejects_weak_secret(monkeypatch, environment, secret):
    with pytest.raises(ValidationError):
        _settings(monkeypatch, ENVIRONMENT=environment, JWT_SECRET_KEY=secret)


def test_non_dev_rejects_missing_secret(monkeypatch):
    with pytest.raises(ValidationError):
        _settings(monkeypatch, ENVIRONMENT="production")


def test_production_accepts_strong_secret(monkeypatch):
    assert _settings(monkeypatch, ENVIRONMENT="production", JWT_SECRET_KEY=STRONG).is_production
