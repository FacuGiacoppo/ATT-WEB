"""
Servicios Firestore para el panel DFE (listado, resumen, estado interno).

Conceptos (ver también docstring de ``normalize_comunicacion_for_api``):

- **Nueva (esNueva):** no leída internamente y no archivada. No usa estado AFIP.
- **Urgente (esUrgenteNueva):** es “nueva” en ese sentido *y* vencimiento en ≤ 5 días
  (``diasParaVencimiento`` no nulo). Es un subconjunto de nuevas.
- **Alerta visual (alertaVisualPendiente):** flag para badge/toast en UI. **No** equivale a ``esNueva``:
  una comunicación puede ser nueva sin alerta pendiente, o tener alerta ya apagada tras leer/descartar.

Listado / ``soloNuevas`` / ``GET .../nuevas``:
  Cuando se filtra con ``where("leidaInterna", "==", False)``, los documentos **sin** el campo
  ``leidaInterna`` no matchean en Firestore. Hasta que el sync hace backfill al tocar el doc,
  esos registros no entran en esa query (limitación conocida).

Orden: ``fechaPublicacionMs`` (>0) si existe; si no, ``importedAt`` (ms).

Índices: firestore.indexes.json.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from dfe_comunicaciones_model import (
    is_archivada_interna,
    is_leida_interna,
    is_nueva_interna,
    normalize_comunicacion_for_api,
)
from dfe_service import DfeServiceError
from google.cloud import firestore  # type: ignore


def _parse_query_date_ms(s: str | None) -> int | None:
    """Acepta YYYY-MM-DD (inicio UTC ese día) para filtros de listado."""
    if not s:
        return None
    t = str(s).strip()
    if not t:
        return None
    try:
        if len(t) == 10 and t[4] == "-" and t[7] == "-":
            dt = datetime(int(t[0:4]), int(t[5:7]), int(t[8:10]), tzinfo=timezone.utc)
            return int(dt.timestamp() * 1000)
    except Exception:
        return None
    return None


def _parse_query_date_end_ms(s: str | None) -> int | None:
    """Fin del día UTC (inclusive) para fechaHasta."""
    start = _parse_query_date_ms(s)
    if start is None:
        return None
    return start + 24 * 60 * 60 * 1000 - 1


def _parse_vencimiento_ms(val: Any) -> int | None:
    if val is None:
        return None
    t = str(val).strip()
    if not t:
        return None
    try:
        if " " in t:
            t = t.replace(" ", "T")
        dt = datetime.fromisoformat(t)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except Exception:
        return None


def _imported_at_ms(d: dict[str, Any]) -> int:
    imp = d.get("importedAt")
    if imp is None:
        return 0
    if hasattr(imp, "timestamp") and callable(getattr(imp, "timestamp")):
        try:
            return int(imp.timestamp() * 1000)
        except Exception:
            return 0
    return 0


def _effective_sort_ms(data: dict[str, Any], row: dict[str, Any]) -> int:
    fp = row.get("fechaPublicacionMs")
    if isinstance(fp, int) and fp > 0:
        return fp
    return _imported_at_ms(data)


def _ms_to_iso_utc(ms: int) -> str | None:
    if ms <= 0:
        return None
    dt = datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def _comunicacion_ref(db, doc_id: str):
    return db.collection("dfe_comunicaciones").document(doc_id)


def marcar_leida_interna(*, db, doc_id: str, user_email: str) -> dict[str, Any]:
    ref = _comunicacion_ref(db, doc_id)
    snap = ref.get()
    if not snap.exists:
        raise DfeServiceError("not_found", "Comunicación no encontrada.", http_status=404)
    ref.set(
        {
            "leidaInterna": True,
            "fechaLecturaInterna": firestore.SERVER_TIMESTAMP,
            "leidaInternaPor": user_email,
            "alertaVisualPendiente": False,
        },
        merge=True,
    )
    return normalize_comunicacion_for_api(doc_id, (ref.get().to_dict() or {}))


def marcar_no_leida_interna(*, db, doc_id: str, user_email: str) -> dict[str, Any]:
    ref = _comunicacion_ref(db, doc_id)
    snap = ref.get()
    if not snap.exists:
        raise DfeServiceError("not_found", "Comunicación no encontrada.", http_status=404)
    ref.set(
        {
            "leidaInterna": False,
            "fechaLecturaInterna": None,
            "leidaInternaPor": user_email,
        },
        merge=True,
    )
    return normalize_comunicacion_for_api(doc_id, (ref.get().to_dict() or {}))


def archivar_interna(*, db, doc_id: str, user_email: str) -> dict[str, Any]:
    ref = _comunicacion_ref(db, doc_id)
    snap = ref.get()
    if not snap.exists:
        raise DfeServiceError("not_found", "Comunicación no encontrada.", http_status=404)
    ref.set(
        {
            "archivadaInterna": True,
            "fechaArchivadoInterna": firestore.SERVER_TIMESTAMP,
            "archivadaInternaPor": user_email,
        },
        merge=True,
    )
    return normalize_comunicacion_for_api(doc_id, (ref.get().to_dict() or {}))


def desarchivar_interna(*, db, doc_id: str, user_email: str) -> dict[str, Any]:
    ref = _comunicacion_ref(db, doc_id)
    snap = ref.get()
    if not snap.exists:
        raise DfeServiceError("not_found", "Comunicación no encontrada.", http_status=404)
    ref.set(
        {
            "archivadaInterna": False,
            "fechaArchivadoInterna": None,
            "archivadaInternaPor": user_email,
        },
        merge=True,
    )
    return normalize_comunicacion_for_api(doc_id, (ref.get().to_dict() or {}))


def descartar_alerta_visual(*, db, doc_id: str) -> dict[str, Any]:
    ref = _comunicacion_ref(db, doc_id)
    snap = ref.get()
    if not snap.exists:
        raise DfeServiceError("not_found", "Comunicación no encontrada.", http_status=404)
    ref.set({"alertaVisualPendiente": False}, merge=True)
    return normalize_comunicacion_for_api(doc_id, (ref.get().to_dict() or {}))


ESTADOS_INTERNOS_PERMITIDOS = frozenset({"pendiente", "en_revision", "resuelta"})


def get_comunicacion_firestore(*, db, doc_id: str) -> dict[str, Any]:
    ref = _comunicacion_ref(db, doc_id)
    snap = ref.get()
    if not snap.exists:
        raise DfeServiceError("not_found", "Comunicación no encontrada.", http_status=404)
    return normalize_comunicacion_for_api(doc_id, snap.to_dict() or {})


def set_estado_interno_firestore(*, db, doc_id: str, estado_interno: str, actor: str) -> dict[str, Any]:
    if estado_interno not in ESTADOS_INTERNOS_PERMITIDOS:
        raise DfeServiceError(
            "parametros",
            "estadoInterno debe ser pendiente, en_revision o resuelta.",
            http_status=400,
        )
    ref = _comunicacion_ref(db, doc_id)
    snap = ref.get()
    if not snap.exists:
        raise DfeServiceError("not_found", "Comunicación no encontrada.", http_status=404)
    ref.set(
        {
            "estadoInterno": estado_interno,
            "fechaEstadoInterno": firestore.SERVER_TIMESTAMP,
            "estadoInternoPor": actor,
        },
        merge=True,
    )
    return normalize_comunicacion_for_api(doc_id, (ref.get().to_dict() or {}))


def set_responsable_interno_firestore(*, db, doc_id: str, responsable_interno: str | None) -> dict[str, Any]:
    ref = _comunicacion_ref(db, doc_id)
    snap = ref.get()
    if not snap.exists:
        raise DfeServiceError("not_found", "Comunicación no encontrada.", http_status=404)
    v = (responsable_interno or "").strip() or None
    if v is not None and len(v) > 500:
        raise DfeServiceError("parametros", "responsableInterno demasiado largo (máx. 500).", http_status=400)
    ref.set({"responsableInterno": v}, merge=True)
    return normalize_comunicacion_for_api(doc_id, (ref.get().to_dict() or {}))


def set_observacion_interna_firestore(*, db, doc_id: str, observacion_interna: str | None) -> dict[str, Any]:
    ref = _comunicacion_ref(db, doc_id)
    snap = ref.get()
    if not snap.exists:
        raise DfeServiceError("not_found", "Comunicación no encontrada.", http_status=404)
    raw = observacion_interna if observacion_interna is not None else ""
    v = str(raw).strip() or None
    if v is not None and len(v) > 10000:
        raise DfeServiceError("parametros", "observacionInterna demasiado larga (máx. 10000).", http_status=400)
    ref.set({"observacionInterna": v}, merge=True)
    return normalize_comunicacion_for_api(doc_id, (ref.get().to_dict() or {}))


def list_comunicaciones_firestore(
    *,
    db,
    cuit: str | None,
    solo_nuevas: bool,
    solo_archivadas: bool,
    solo_urgentes: bool,
    fecha_desde: str | None,
    fecha_hasta: str | None,
    limit: int,
    require_es_nueva: bool = False,
    incluir_archivadas_en_listado: bool = False,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    Lista desde Firestore. Orden: effective sort ms descendente.

    ``solo_urgentes``: deja solo filas con ``esUrgenteNueva`` (nueva + vencimiento ≤ 5 días).
    ``require_es_nueva``: además de la query de no leídas, filtra ``esNueva`` en memoria
    (p. ej. excluye archivadas aunque la query de Firestore no las traiga en la práctica).
    """
    lim = max(1, min(int(limit), 500))
    max_scan = max(lim, min(int(os.environ.get("DFE_LIST_MAX_SCAN") or "3000"), 20000))

    desde_ms = _parse_query_date_ms(fecha_desde)
    hasta_ms = _parse_query_date_end_ms(fecha_hasta)

    col = db.collection("dfe_comunicaciones")
    q: Any = col

    if cuit:
        cuit_d = "".join(c for c in cuit if c.isdigit())
        if len(cuit_d) != 11:
            raise DfeServiceError("parametros", "cuit inválido (11 dígitos).", http_status=400)
        q = q.where("cuitRepresentada", "==", cuit_d)

    if solo_archivadas:
        q = q.where("archivadaInterna", "==", True)
    if solo_nuevas or require_es_nueva:
        q = q.where("leidaInterna", "==", False)

    q = q.order_by("fechaPublicacionMs", direction=firestore.Query.DESCENDING)

    scanned = 0
    scored: list[tuple[int, dict[str, Any]]] = []
    for snap in q.stream():
        scanned += 1
        if scanned > max_scan:
            break
        data = snap.to_dict() or {}
        row = normalize_comunicacion_for_api(snap.id, data)

        if not solo_archivadas and not incluir_archivadas_en_listado and is_archivada_interna(data):
            continue

        if (solo_nuevas or require_es_nueva) and is_leida_interna(data):
            continue

        if require_es_nueva and not row.get("esNueva"):
            continue

        if solo_urgentes and not row.get("esUrgenteNueva"):
            continue

        fp_ms = row.get("fechaPublicacionMs")
        if isinstance(fp_ms, int):
            if desde_ms is not None and fp_ms < desde_ms:
                continue
            if hasta_ms is not None and fp_ms > hasta_ms:
                continue

        sm = _effective_sort_ms(data, row)
        scored.append((sm, row))

    scored.sort(key=lambda x: -x[0])
    matched = [r for _, r in scored[:lim]]

    meta = {
        "limit": lim,
        "scannedDocuments": scanned,
        "maxScan": max_scan,
        "truncated": scanned >= max_scan,
    }
    return matched, meta


def list_comunicaciones_nuevas_firestore(
    *,
    db,
    cuit: str | None,
    fecha_desde: str | None,
    fecha_hasta: str | None,
    limit: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    Solo ``esNueva`` (regla ATT), no archivadas. Usa ``leidaInterna == false`` en Firestore;
    docs sin ese campo no aparecen hasta backfill (véase docstring del módulo).
    """
    return list_comunicaciones_firestore(
        db=db,
        cuit=cuit,
        solo_nuevas=True,
        solo_archivadas=False,
        solo_urgentes=False,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        limit=limit,
        require_es_nueva=True,
    )


def compute_resumen(*, db) -> dict[str, Any]:
    """
    Un pase en memoria sobre ``dfe_comunicaciones``.

    ``nuevasUrgentes`` cuenta comunicaciones con ``esNueva`` y vencimiento ≤ 5 días (no es un conteo
    de ``alertaVisualPendiente``).

    Límite: ``DFE_RESUMEN_MAX_DOCS`` (default 50000). Si se alcanza, ``resumenTruncado=true``.
    """
    max_docs_raw = (os.environ.get("DFE_RESUMEN_MAX_DOCS") or "50000").strip()
    try:
        max_docs = max(1000, min(int(max_docs_raw), 200000))
    except Exception:
        max_docs = 50000

    now = datetime.now(timezone.utc)
    start_today_ms = int(
        datetime(now.year, now.month, now.day, tzinfo=timezone.utc).timestamp() * 1000
    )

    total_comunicaciones = 0
    no_leidas = 0
    archivadas = 0
    con_vencimiento = 0
    nuevas_urgentes = 0
    ultima_ms_no_arch = 0
    por_cliente: dict[str, dict[str, Any]] = {}

    n = 0
    truncated = False
    for snap in db.collection("dfe_comunicaciones").stream():
        n += 1
        if n > max_docs:
            truncated = True
            break
        d = snap.to_dict() or {}
        total_comunicaciones += 1

        cuit = str(d.get("cuitRepresentada") or "")
        nombre = d.get("nombreCliente") or ""

        arch = is_archivada_interna(d)
        leida = is_leida_interna(d)

        if arch:
            archivadas += 1

        if not arch and not leida:
            no_leidas += 1

        row_norm = normalize_comunicacion_for_api(snap.id, d)

        if not arch:
            v_ms = _parse_vencimiento_ms(d.get("fechaVencimiento"))
            if v_ms is not None and v_ms >= start_today_ms:
                con_vencimiento += 1
            sm = _effective_sort_ms(d, row_norm)
            if sm > ultima_ms_no_arch:
                ultima_ms_no_arch = sm

        if is_nueva_interna(d):
            dias = row_norm.get("diasParaVencimiento")
            if dias is not None and dias <= 5:
                nuevas_urgentes += 1

        bucket = por_cliente.setdefault(
            cuit or "_sin_cuit",
            {
                "cuit": cuit or None,
                "nombreCliente": nombre or None,
                "total": 0,
                "noLeidas": 0,
                "nuevasUrgentes": 0,
            },
        )
        bucket["total"] += 1
        if not arch and not leida:
            bucket["noLeidas"] += 1
        if is_nueva_interna(d):
            dias_b = row_norm.get("diasParaVencimiento")
            if dias_b is not None and dias_b <= 5:
                bucket["nuevasUrgentes"] = bucket.get("nuevasUrgentes", 0) + 1

    por_list = sorted(
        [p for p in por_cliente.values() if p.get("cuit")],
        key=lambda x: (
            -(x.get("nuevasUrgentes") or 0),
            -(x.get("noLeidas") or 0),
            -(x.get("total") or 0),
            str(x.get("cuit") or ""),
        ),
    )

    return {
        "totalComunicaciones": total_comunicaciones,
        "noLeidas": no_leidas,
        "archivadas": archivadas,
        "conVencimiento": con_vencimiento,
        "nuevasUrgentes": nuevas_urgentes,
        "ultimaComunicacionFecha": _ms_to_iso_utc(ultima_ms_no_arch),
        "porCliente": por_list,
        "resumenTruncado": truncated,
        "resumenMaxDocs": max_docs,
    }
