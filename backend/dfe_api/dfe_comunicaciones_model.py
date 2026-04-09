"""
Campos internos de `dfe_comunicaciones` (ATT-WEB), independientes de AFIP.

El sync solo escribe datos externos; en creación agrega defaults internos.
En actualización nunca incluye claves internas en el payload (merge=True preserva).
"""
from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Any

# id documento Firestore: 11 dígitos CUIT + __ + id numérico AFIP
COMUNICACION_DOC_ID_RE = re.compile(r"^(\d{11})__(\d+)$")

# Claves que el sync / AFIP no deben sobrescribir en updates.
INTERNAL_FIELD_KEYS = frozenset(
    {
        "leidaInterna",
        "fechaLecturaInterna",
        "leidaInternaPor",
        "archivadaInterna",
        "fechaArchivadoInterna",
        "archivadaInternaPor",
        "detectadaInternamente",
        "fechaDeteccionInterna",
        "alertaVisualPendiente",
        "estadoInterno",
        "responsableInterno",
        "observacionInterna",
        "fechaEstadoInterno",
        "estadoInternoPor",
    }
)


def internal_defaults_for_create() -> dict[str, Any]:
    """Defaults para lectura/archivo (create + backfill de docs viejos). Sin campos de detección."""
    return {
        "leidaInterna": False,
        "fechaLecturaInterna": None,
        "leidaInternaPor": None,
        "archivadaInterna": False,
        "fechaArchivadoInterna": None,
        "archivadaInternaPor": None,
        "estadoInterno": None,
        "responsableInterno": None,
        "observacionInterna": None,
        "fechaEstadoInterno": None,
        "estadoInternoPor": None,
    }


def internal_fields_for_new_document(firestore_mod: Any) -> dict[str, Any]:
    """
    Solo en alta de documento (sync primera vez): estado interno + detección para alertas futuras.
    """
    return {
        **internal_defaults_for_create(),
        "detectadaInternamente": True,
        "fechaDeteccionInterna": firestore_mod.SERVER_TIMESTAMP,
        "alertaVisualPendiente": True,
    }


def is_archivada_interna(d: dict[str, Any] | None) -> bool:
    if not d:
        return False
    return bool(d.get("archivadaInterna"))


def is_leida_interna(d: dict[str, Any] | None) -> bool:
    if not d:
        return False
    return bool(d.get("leidaInterna"))


def is_nueva_interna(d: dict[str, Any] | None) -> bool:
    """
    Nueva en ATT-WEB: no leída internamente y no archivada (independiente de AFIP).
    Docs sin campos cuentan como no leídos / no archivados.
    """
    if not d:
        return False
    return not is_archivada_interna(d) and not is_leida_interna(d)


def parse_comunicacion_doc_id(doc_id: str) -> tuple[str, int] | None:
    """Valida formato `{CUIT11}__{idComunicacion}`. Retorna (cuit, id_int) o None."""
    m = COMUNICACION_DOC_ID_RE.match((doc_id or "").strip())
    if not m:
        return None
    return m.group(1), int(m.group(2))


def _dias_para_vencimiento(fecha_vencimiento: Any) -> int | None:
    """Días desde hoy (UTC, solo fecha) hasta el vencimiento; None si no hay fecha válida."""
    if fecha_vencimiento is None:
        return None
    t = str(fecha_vencimiento).strip()
    if len(t) < 10 or t[4] != "-" or t[7] != "-":
        return None
    try:
        y, mo, d = int(t[0:4]), int(t[5:7]), int(t[8:10])
        v = date(y, mo, d)
    except Exception:
        return None
    today = datetime.now(timezone.utc).date()
    return (v - today).days


def _firestore_value_to_json(val: Any) -> Any:
    if val is None:
        return None
    # google.cloud.firestore_v1._helpers.DatetimeWithNanoseconds
    if hasattr(val, "timestamp") and callable(getattr(val, "timestamp")):
        try:
            dt = datetime.fromtimestamp(val.timestamp(), tz=timezone.utc)
            return dt.isoformat().replace("+00:00", "Z")
        except Exception:
            pass
    if isinstance(val, datetime):
        if val.tzinfo is None:
            val = val.replace(tzinfo=timezone.utc)
        return val.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return val


def normalize_comunicacion_for_api(doc_id: str, data: dict[str, Any] | None) -> dict[str, Any]:
    """
    Documento Firestore → JSON para el panel. Defaults si faltan campos en docs viejos.

    Campos de negocio expuestos explícitamente (el front no debe inferirlos):
    - esNueva: regla ATT (no leída interna y no archivada).
    - esUrgenteNueva: esNueva y vencimiento en ≤ 5 días (diasParaVencimiento no null).
    - alertaVisualPendiente: si el sistema marcó alerta UI pendiente (≠ esNueva: puede ser false con esNueva true).
    - detectadaInternamente / fechaDeteccionInterna: metadatos de detección al dar de alta (viejos sin campo → false / null).
    """
    d = dict(data or {})
    leida = bool(d.get("leidaInterna"))
    arch = bool(d.get("archivadaInterna"))
    dias = _dias_para_vencimiento(d.get("fechaVencimiento"))
    es_nueva = is_nueva_interna(d)
    out: dict[str, Any] = {
        "id": doc_id,
        "idComunicacion": d.get("idComunicacion"),
        "cuitRepresentada": d.get("cuitRepresentada"),
        "nombreCliente": d.get("nombreCliente"),
        "asunto": d.get("asunto"),
        "organismo": d.get("organismo"),
        "sistemaPublicadorDescripcion": d.get("sistemaPublicadorDescripcion"),
        "fechaPublicacion": d.get("fechaPublicacion"),
        "fechaPublicacionMs": d.get("fechaPublicacionMs"),
        "fechaVencimiento": d.get("fechaVencimiento"),
        "estadoAfipDescripcion": d.get("estadoAfipDescripcion"),
        "tieneAdjuntos": d.get("tieneAdjuntos"),
        "prioridad": d.get("prioridad"),
        "leidaInterna": leida,
        "archivadaInterna": arch,
        "esNueva": es_nueva,
        "diasParaVencimiento": dias,
        "esUrgenteNueva": bool(es_nueva and dias is not None and dias <= 5),
        "fechaLecturaInterna": _firestore_value_to_json(d.get("fechaLecturaInterna")),
        "leidaInternaPor": d.get("leidaInternaPor"),
        "fechaArchivadoInterna": _firestore_value_to_json(d.get("fechaArchivadoInterna")),
        "archivadaInternaPor": d.get("archivadaInternaPor"),
        "detectadaInternamente": bool(d.get("detectadaInternamente")),
        "fechaDeteccionInterna": _firestore_value_to_json(d.get("fechaDeteccionInterna")),
        "alertaVisualPendiente": bool(d.get("alertaVisualPendiente")),
        "estadoInterno": d.get("estadoInterno") if d.get("estadoInterno") is not None else None,
        "responsableInterno": d.get("responsableInterno") if d.get("responsableInterno") is not None else None,
        "observacionInterna": d.get("observacionInterna") if d.get("observacionInterna") is not None else None,
        "fechaEstadoInterno": _firestore_value_to_json(d.get("fechaEstadoInterno")),
        "estadoInternoPor": d.get("estadoInternoPor") if d.get("estadoInternoPor") is not None else None,
    }
    return out


def strip_internal_fields(payload: dict[str, Any]) -> dict[str, Any]:
    """Quita claves internas de un dict (p. ej. antes de un set merge desde sync legacy)."""
    return {k: v for k, v in payload.items() if k not in INTERNAL_FIELD_KEYS}
