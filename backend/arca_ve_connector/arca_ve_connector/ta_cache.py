"""
Caché local de Ticket de Acceso (TA) WSAA en JSON (reutilización entre corridas).

Clave: hash del certificado + URL WSAA + nombre de servicio WSN.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

_AR = timezone(timedelta(hours=-3))

# Margen antes del vencimiento para no usar un TA al límite (segundos)
TA_EXPIRY_MARGIN_SEC = 120

_CACHE_VERSION = 1


def default_cache_path() -> Path:
    custom = os.environ.get("ARCA_TA_CACHE_PATH", "").strip()
    if custom:
        return Path(custom).expanduser().resolve()
    base = Path(tempfile.gettempdir()) / "arca_ve_connector"
    base.mkdir(parents=True, exist_ok=True)
    return base / "wsaa_ta_cache.json"


def cache_fingerprint_key(wsaa_url: str, service: str, cert_path: str, key_path: str) -> str:
    """Identifica un TA por ambiente WSAA, servicio y material criptográfico."""
    cert = Path(cert_path).expanduser().resolve()
    key = Path(key_path).expanduser().resolve()
    h = hashlib.sha256()
    h.update(wsaa_url.strip().encode("utf-8"))
    h.update(b"\0")
    h.update(service.strip().encode("utf-8"))
    h.update(b"\0")
    if cert.is_file():
        h.update(cert.read_bytes())
    h.update(b"\0")
    if key.is_file():
        h.update(key.read_bytes())
    return h.hexdigest()[:40]


def _parse_expiration(exp_str: str | None) -> datetime | None:
    if not exp_str or not str(exp_str).strip():
        return None
    s = str(exp_str).strip()
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_AR)
    return dt.astimezone(_AR)


def _entry_is_valid(entry: dict[str, Any]) -> bool:
    token = entry.get("token")
    sign = entry.get("sign")
    if not token or not sign:
        return False
    exp = _parse_expiration(entry.get("expirationTime"))
    if exp is None:
        return False
    now = datetime.now(_AR)
    return now < exp - timedelta(seconds=TA_EXPIRY_MARGIN_SEC)


def _read_store(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {"version": _CACHE_VERSION, "entries": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {"version": _CACHE_VERSION, "entries": {}}
        if "entries" not in data or not isinstance(data["entries"], dict):
            data["entries"] = {}
        data["version"] = _CACHE_VERSION
        return data
    except (OSError, json.JSONDecodeError):
        return {"version": _CACHE_VERSION, "entries": {}}


def _atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    try:
        tmp.write_text(
            json.dumps(data, indent=0, ensure_ascii=False),
            encoding="utf-8",
        )
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def load_cached_ta(
    cache_path: Path,
    fingerprint: str,
    wsaa_url: str,
    service: str,
) -> tuple[str, str, str | None] | None:
    """
    Devuelve (token, sign, expirationTime) si hay entrada válida que coincida
    con wsaa_url y service guardados en el entry.
    """
    store = _read_store(cache_path)
    entry = store["entries"].get(fingerprint)
    if not isinstance(entry, dict):
        return None
    if entry.get("wsaa_url") != wsaa_url.strip() or entry.get("service") != service.strip():
        return None
    if not _entry_is_valid(entry):
        return None
    return (
        str(entry["token"]),
        str(entry["sign"]),
        entry.get("expirationTime"),
    )


def save_cached_ta(
    cache_path: Path,
    fingerprint: str,
    wsaa_url: str,
    service: str,
    token: str,
    sign: str,
    expiration: str | None,
) -> None:
    store = _read_store(cache_path)
    store["entries"][fingerprint] = {
        "wsaa_url": wsaa_url.strip(),
        "service": service.strip(),
        "token": token,
        "sign": sign,
        "expirationTime": expiration,
    }
    _atomic_write_json(cache_path, store)
