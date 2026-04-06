"""
Helper para garantizar que las respuestas sean JSON-serializables.

Problema típico: Zeep/AFIP puede devolver algunos campos como `bytes` (p. ej. adjuntos),
lo que rompe `jsonify`/`json.dumps` con:
  TypeError: Object of type bytes is not JSON serializable

Estrategia:
- bytes -> string base64 (ASCII) para no perder información binaria.
- dict/list/tuple -> recursivo
- set -> list
"""

from __future__ import annotations

import base64
from typing import Any


def sanitize(obj: Any) -> Any:
    if obj is None:
        return None
    if isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, bytes):
        # base64 ASCII; no cambia la estructura, solo hace serializable.
        return base64.b64encode(obj).decode("ascii")
    if isinstance(obj, dict):
        out: dict[str, Any] = {}
        for k, v in obj.items():
            # JSON exige claves string; si vienen raras, las stringify.
            ks = k if isinstance(k, str) else str(k)
            out[ks] = sanitize(v)
        return out
    if isinstance(obj, (list, tuple)):
        return [sanitize(x) for x in obj]
    if isinstance(obj, set):
        return [sanitize(x) for x in obj]
    # fallback: stringify objetos no serializables (Zeep/lxml/etc.)
    return str(obj)

