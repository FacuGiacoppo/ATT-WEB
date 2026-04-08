from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone

from dfe_service import consultar_comunicaciones, DfeServiceError
from google.cloud import firestore  # type: ignore


def _digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def _now():
    return datetime.now(timezone.utc)


def _date_yyyy_mm_dd(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d")


def _parse_afip_date_ms(s: str | None) -> int | None:
    if not s:
        return None
    t = str(s).strip()
    if not t:
        return None
    # "YYYY-MM-DD" o "YYYY-MM-DD HH:MM:SS"
    try:
        if " " in t:
            t = t.replace(" ", "T")
        # naive -> UTC
        dt = datetime.fromisoformat(t)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except Exception:
        return None


def _compute_window_days(default_days: int = 30) -> int:
    raw = (os.environ.get("DFE_SYNC_DAYS") or "").strip()
    if not raw:
        return default_days
    try:
        v = int(raw)
        return max(1, min(v, 365))
    except Exception:
        return default_days


def _sync_rpp() -> int:
    raw = (os.environ.get("DFE_SYNC_RPP") or "").strip()
    if not raw:
        return 50
    try:
        v = int(raw)
        return max(1, min(v, 100))
    except Exception:
        return 50


def _sync_max_pages() -> int:
    raw = (os.environ.get("DFE_SYNC_MAX_PAGES") or "").strip()
    if not raw:
        return 20
    try:
        v = int(raw)
        return max(1, min(v, 200))
    except Exception:
        return 20


def sync_cuit_into_firestore(
    *,
    db,
    cuit_representada: str,
    nombre_cliente: str | None,
) -> dict:
    """
    Sincroniza comunicaciones de un CUIT desde ARCA/AFIP y las persiste en Firestore:
    - collection: dfe_comunicaciones
    - docId: {cuit}__{idComunicacion}
    """
    cuit = _digits(cuit_representada)
    if len(cuit) != 11:
        raise DfeServiceError("parametros", "CUIT inválido para sync.", http_status=400)

    now = _now()
    days = _compute_window_days()
    fd = _date_yyyy_mm_dd(now - timedelta(days=days))
    fh = _date_yyyy_mm_dd(now)

    rpp = _sync_rpp()
    max_pages = _sync_max_pages()

    total_seen = 0
    total_upserted = 0
    newest_ms: int | None = None

    for page in range(1, max_pages + 1):
        resp = consultar_comunicaciones(cuit, fd, fh, page, rpp)
        rows = resp.get("comunicaciones") or []
        if not rows:
            break

        batch = db.batch()
        for r in rows:
            idc = r.get("idComunicacion")
            try:
                id_int = int(idc)
            except Exception:
                continue

            doc_id = f"{cuit}__{id_int}"

            pub = r.get("fechaPublicacion")
            notif = r.get("fechaNotificacion")
            pub_ms = _parse_afip_date_ms(pub) or 0
            notif_ms = _parse_afip_date_ms(notif)
            newest_ms = max(newest_ms or 0, pub_ms or 0) if pub_ms else newest_ms

            doc = {
                "schemaVersion": 1,
                "source": "afip",
                "cuitRepresentada": cuit,
                "nombreCliente": (nombre_cliente or "").strip() or None,
                "idComunicacion": id_int,
                "fechaPublicacion": pub,
                "fechaNotificacion": notif,
                "fechaVencimiento": r.get("fechaVencimiento"),
                "fechaLecturaAfip": r.get("leida"),
                "asunto": r.get("asunto"),
                "organismo": r.get("organismo"),
                "clasificacion": r.get("clasificacion"),
                "estadoAfip": r.get("estado"),
                "estadoAfipDescripcion": r.get("estadoDescripcion"),
                "tieneAdjuntos": bool(r.get("tieneAdjuntos") or r.get("tieneAdjunto")),
                "sistemaPublicador": r.get("sistemaPublicador"),
                "sistemaPublicadorDescripcion": r.get("sistemaPublicadorDescripcion"),
                "prioridad": r.get("prioridad"),
                "fechaPublicacionMs": int(pub_ms or 0),
                "fechaNotificacionMs": int(notif_ms) if notif_ms is not None else None,
                "importedAt": firestore.SERVER_TIMESTAMP,
                "lastSyncAt": firestore.SERVER_TIMESTAMP,
            }

            ref = db.collection("dfe_comunicaciones").document(doc_id)
            # merge: no borramos campos previos (por si se agregan)
            batch.set(ref, doc, merge=True)
            total_upserted += 1
            total_seen += 1

        batch.commit()

        total_items = resp.get("totalItems")
        total_pages = resp.get("totalPaginas")
        if isinstance(total_pages, int) and page >= total_pages:
            break
        if isinstance(total_items, int) and total_seen >= total_items:
            break

    return {
        "cuitRepresentada": cuit,
        "windowDays": days,
        "fechaDesde": fd,
        "fechaHasta": fh,
        "upserted": total_upserted,
        "newestFechaPublicacionMs": newest_ms,
    }


def list_enabled_clients(*, db, limit: int = 500) -> list[dict]:
    q = (
        db.collection("dfe_clients")
        .where("active", "==", True)
        .where("dfeEnabled", "==", True)
        .limit(limit)
    )
    out = []
    for doc in q.stream():
        d = doc.to_dict() or {}
        c = _digits(d.get("cuit") or doc.id)
        if len(c) != 11:
            continue
        out.append(
            {
                "id": doc.id,
                "cuit": c,
                "nombre": d.get("nombre") or d.get("nombreCliente") or None,
            }
        )
    return out

