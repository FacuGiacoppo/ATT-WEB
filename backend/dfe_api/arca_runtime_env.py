"""
Resolución de entorno ARCA/DFE (homologación vs producción) para la API dfe_api.

- Lee ARCA_ENV o DFE_ARCA_ENV (sin romper el default actual = homologación).
- Si faltan ARCA_WSAA_URL / ARCA_VE_WSDL, aplica URLs por defecto según el entorno.
- Certificados: opcionalmente ARCA_CERT_PATH_* y ARCA_KEY_PATH_* por entorno.

Las variables explícitas en el entorno siempre tienen prioridad (salvo override de cert
solo cuando definís el par *_PRODUCCION / *_HOMOLOGACION según corresponda).
"""

from __future__ import annotations

import os

# Defaults oficiales (homologación = QA AFIP; producción = AFIP productivo)
_DEFAULT_WSAA_HOMOLOGACION = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms"
_DEFAULT_WSAA_PRODUCCION = "https://wsaa.afip.gov.ar/ws/services/LoginCms"
_DEFAULT_WSDL_HOMOLOGACION = (
    "https://stable-middleware-tecno-ext.afip.gob.ar/ve-ws/services/veconsumer?wsdl"
)
_DEFAULT_WSDL_PRODUCCION = "https://infraestructura.afip.gob.ar/ve-ws/services/veconsumer?wsdl"

_ensured = False


def _nonempty(name: str) -> bool:
    v = os.environ.get(name)
    return v is not None and str(v).strip() != ""


def normalized_arca_env() -> str:
    """
    Valor interno estable: 'homologacion' | 'produccion'.
    Sin variable → homologación (comportamiento histórico del conector).
    """
    raw = (os.environ.get("ARCA_ENV") or os.environ.get("DFE_ARCA_ENV") or "").strip().lower()
    if not raw:
        return "homologacion"
    if raw in ("qa", "homo", "homologacion", "homologación", "test", "staging"):
        return "homologacion"
    if raw in ("prod", "produccion", "producción", "production", "live"):
        return "produccion"
    return "homologacion"


def apply_cert_overrides_for_env(env: str) -> None:
    """Si hay rutas específicas del entorno, las copia a ARCA_CERT_PATH / ARCA_KEY_PATH."""
    c = k = None
    if env == "produccion":
        c = os.environ.get("ARCA_CERT_PATH_PRODUCCION")
        k = os.environ.get("ARCA_KEY_PATH_PRODUCCION")
    else:
        c = os.environ.get("ARCA_CERT_PATH_HOMOLOGACION") or os.environ.get("ARCA_CERT_PATH_HOMO")
        k = os.environ.get("ARCA_KEY_PATH_HOMOLOGACION") or os.environ.get("ARCA_KEY_PATH_HOMO")
    if c and str(c).strip():
        os.environ["ARCA_CERT_PATH"] = str(c).strip()
    if k and str(k).strip():
        os.environ["ARCA_KEY_PATH"] = str(k).strip()


def ensure_arca_runtime_env() -> None:
    """
    Idempotente. Debe ejecutarse antes de ArcaConnectorConfig.from_env() en este proceso
    (p. ej. al importar dfe_service o justo después de cargar .env en server.py).
    """
    global _ensured
    if _ensured:
        return
    _ensured = True

    env = normalized_arca_env()
    os.environ["ARCA_ENV_RESOLVED"] = env

    # Si el usuario definió URLs específicas por entorno, tienen prioridad.
    # Esto permite operar prod/homo sin editar ARCA_WSAA_URL / ARCA_VE_WSDL globales.
    if env == "produccion":
        wsaa_env = os.environ.get("ARCA_WSAA_URL_PRODUCCION")
        wsdl_env = os.environ.get("ARCA_VE_WSDL_PRODUCCION")
    else:
        wsaa_env = os.environ.get("ARCA_WSAA_URL_HOMOLOGACION") or os.environ.get("ARCA_WSAA_URL_HOMO")
        wsdl_env = os.environ.get("ARCA_VE_WSDL_HOMOLOGACION") or os.environ.get("ARCA_VE_WSDL_HOMO")
    if wsaa_env and str(wsaa_env).strip():
        os.environ["ARCA_WSAA_URL"] = str(wsaa_env).strip()
    if wsdl_env and str(wsdl_env).strip():
        os.environ["ARCA_VE_WSDL"] = str(wsdl_env).strip()

    # Defaults según entorno: si faltan, se rellenan. Si estamos en producción y
    # quedaron seteadas URLs de homologación (p.ej. heredadas del shell), se corrigen.
    if not _nonempty("ARCA_WSAA_URL") or (
        env == "produccion" and os.environ.get("ARCA_WSAA_URL") == _DEFAULT_WSAA_HOMOLOGACION
    ):
        os.environ["ARCA_WSAA_URL"] = (
            _DEFAULT_WSAA_HOMOLOGACION if env == "homologacion" else _DEFAULT_WSAA_PRODUCCION
        )
    if not _nonempty("ARCA_VE_WSDL") or (
        env == "produccion" and os.environ.get("ARCA_VE_WSDL") == _DEFAULT_WSDL_HOMOLOGACION
    ):
        os.environ["ARCA_VE_WSDL"] = (
            _DEFAULT_WSDL_HOMOLOGACION if env == "homologacion" else _DEFAULT_WSDL_PRODUCCION
        )

    apply_cert_overrides_for_env(env)


def get_arc_env_public_snapshot() -> dict:
    """Datos no sensibles para /api/dfe/health (sin rutas de certificados)."""
    ensure_arca_runtime_env()
    env = normalized_arca_env()
    raw = os.environ.get("ARCA_ENV") or os.environ.get("DFE_ARCA_ENV")
    return {
        "environment": env,
        "arcaEnvRaw": raw if raw else None,
        "wsaaUrl": os.environ.get("ARCA_WSAA_URL"),
        "veWsdl": os.environ.get("ARCA_VE_WSDL"),
        "wsaaService": os.environ.get("ARCA_WSAA_SERVICE") or "veconsumerws",
    }
