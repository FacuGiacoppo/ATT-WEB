"""
Capa de servicio DFE: configuración, WSAA (caché), VEConsumer, errores uniformes.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

# Paquete arca_ve_connector (hermano de dfe_api/)
_ARCA_ROOT = Path(__file__).resolve().parent.parent / "arca_ve_connector"
if str(_ARCA_ROOT) not in sys.path:
    sys.path.insert(0, str(_ARCA_ROOT))

from arca_runtime_env import ensure_arca_runtime_env, get_arc_env_public_snapshot

ensure_arca_runtime_env()

from zeep.exceptions import Fault

from arca_ve_connector.config import ArcaConnectorConfig
from arca_ve_connector.veconsumer_client import VEConsumerClient
from arca_ve_connector.wsaa_client import WSAARequestError, request_ticket

from normalize import (
    normalize_comunicacion_detalle,
    normalize_consultar_comunicaciones_response,
    normalize_estados_response,
    to_plain,
)


class DfeServiceError(Exception):
    def __init__(self, code: str, message: str, *, http_status: int = 502, detail: dict | None = None):
        super().__init__(message)
        self.code = code
        self.http_status = http_status
        self.detail = detail or {}


def _digits_cuit(cuit: str) -> str:
    return re.sub(r"\D", "", cuit or "")


def _validate_cuit(cuit: str) -> str:
    d = _digits_cuit(cuit)
    if len(d) != 11:
        raise DfeServiceError("parametros", "cuitRepresentada debe tener 11 dígitos.", http_status=400)
    return d


def _validate_date(s: str, name: str) -> str:
    if not s or not re.match(r"^\d{4}-\d{2}-\d{2}$", s.strip()):
        raise DfeServiceError("parametros", f"{name} debe ser YYYY-MM-DD.", http_status=400)
    return s.strip()


def _dfe_debug(msg: str) -> None:
    if os.environ.get("DFE_DEBUG", "").lower() in ("1", "true", "yes"):
        print(f"[dfe] {msg}", flush=True)


def _coerce_to_yyyy_mm_dd(s: str, field: str) -> str:
    """Acepta YYYY-MM-DD (HTML date) o DD/MM/AAAA por si el cliente envía otro formato."""
    raw = (s or "").strip()
    if not raw:
        raise DfeServiceError("parametros", f"{field} vacío.", http_status=400)
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        return raw
    m = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$", raw)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if not (1 <= month <= 12 and 1 <= day <= 31):
            raise DfeServiceError(
                "parametros",
                f"{field}: fecha DD/MM/AAAA inválida ({raw!r}).",
                http_status=400,
            )
        return f"{year:04d}-{month:02d}-{day:02d}"
    raise DfeServiceError(
        "parametros",
        f"{field} debe ser YYYY-MM-DD o DD/MM/AAAA. Recibido: {raw[:48]!r}",
        http_status=400,
    )


def _ve_client(cuit: str) -> VEConsumerClient:
    cfg = ArcaConnectorConfig.from_env()
    snap = get_arc_env_public_snapshot()
    _dfe_debug(
        "env efectivo: "
        f"environment={snap.get('environment')!r} wsaaUrl={snap.get('wsaaUrl')!r} veWsdl={snap.get('veWsdl')!r} "
        f"wsaaService={cfg.wsaa_service!r}"
    )
    # No imprimir contenido de cert/key. Solo basename para confirmar qué archivo toma.
    _dfe_debug(
        "cert/key: "
        f"cert={os.path.basename(cfg.cert_path)!r} key={os.path.basename(cfg.key_path)!r}"
    )
    ta = request_ticket(
        cfg.wsaa_url,
        cfg.wsaa_service,
        cfg.cert_path,
        cfg.key_path,
    )
    return VEConsumerClient(cfg.ve_wsdl, ta, cuit)


def consultar_estados(cuit_representada: str) -> dict:
    cuit = _validate_cuit(cuit_representada)
    try:
        ve = _ve_client(cuit)
        raw = ve.consultar_estados()
    except WSAARequestError as e:
        raise DfeServiceError("wsaa", str(e), http_status=502, detail={"status": e.status_code}) from e
    except Fault as e:
        raise DfeServiceError("soap_fault", getattr(e, "message", str(e)) or "Fault SOAP", http_status=502) from e
    return normalize_estados_response(raw)


def consultar_comunicaciones(
    cuit_representada: str,
    fecha_desde: str,
    fecha_hasta: str,
    pagina: int,
    resultados_por_pagina: int,
) -> dict:
    cuit = _validate_cuit(cuit_representada)
    fd = _coerce_to_yyyy_mm_dd(fecha_desde, "fechaDesde")
    fh = _coerce_to_yyyy_mm_dd(fecha_hasta, "fechaHasta")
    if pagina < 1:
        raise DfeServiceError("parametros", "pagina debe ser >= 1", http_status=400)
    if resultados_por_pagina < 1 or resultados_por_pagina > 100:
        raise DfeServiceError("parametros", "resultadosPorPagina debe estar entre 1 y 100", http_status=400)

    filter_ = {
        "fechaDesde": fd,
        "fechaHasta": fh,
        "pagina": pagina,
        "resultadosPorPagina": resultados_por_pagina,
    }
    _dfe_debug(f"consultar_comunicaciones cuit={cuit!r} filter={filter_!r} pagina={pagina} rpp={resultados_por_pagina}")
    try:
        ve = _ve_client(cuit)
        raw = ve.consultar_comunicaciones(filter_)
    except WSAARequestError as e:
        raise DfeServiceError("wsaa", str(e), http_status=502, detail={"status": e.status_code}) from e
    except Fault as e:
        raise DfeServiceError("soap_fault", getattr(e, "message", str(e)) or "Fault SOAP", http_status=502) from e
    rp = to_plain(raw)
    if isinstance(rp, dict):
        _dfe_debug(f"SOAP root keys: {list(rp.keys())!r}")
    else:
        _dfe_debug(f"SOAP root tipo: {type(rp).__name__!r}")
    data = normalize_consultar_comunicaciones_response(raw)
    _dfe_debug(
        f"normalizado totalItems={data.get('totalItems')!r} n_comunicaciones={len(data.get('comunicaciones') or [])}"
    )
    return data


def consumir_comunicacion(
    cuit_representada: str,
    id_comunicacion: int,
    incluir_adjuntos: bool,
) -> dict:
    cuit = _validate_cuit(cuit_representada)
    if id_comunicacion < 1:
        raise DfeServiceError("parametros", "idComunicacion inválido", http_status=400)
    # Para descarga, si el cliente pide incluirAdjuntos=True, incluimos contentBase64.
    # El env DFE_INCLUDE_ADJUNTO_BASE64 queda como override para debugging.
    include_b64 = incluir_adjuntos or (
        os.environ.get("DFE_INCLUDE_ADJUNTO_BASE64", "").lower() in ("1", "true", "yes")
    )
    try:
        ve = _ve_client(cuit)
        raw = ve.consumir_comunicacion(id_comunicacion, incluir_adjuntos=incluir_adjuntos)
    except WSAARequestError as e:
        raise DfeServiceError("wsaa", str(e), http_status=502, detail={"status": e.status_code}) from e
    except Fault as e:
        raise DfeServiceError("soap_fault", getattr(e, "message", str(e)) or "Fault SOAP", http_status=502) from e
    return normalize_comunicacion_detalle(raw, include_adjunto_base64=include_b64)


def health_check() -> dict:
    """Sin llamar AFIP: config mínima + snapshot de entorno (homologación / producción)."""
    ensure_arca_runtime_env()
    snap = get_arc_env_public_snapshot()
    try:
        ArcaConnectorConfig.from_env()
        return {
            "connector": "arca_ve_connector",
            "configPresent": True,
            "configMessage": None,
            **snap,
        }
    except ValueError as e:
        return {
            "connector": "arca_ve_connector",
            "configPresent": False,
            "configMessage": str(e),
            **snap,
        }
