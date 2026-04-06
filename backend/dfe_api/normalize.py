"""
Normalización de respuestas VEConsumer (WSDL) → JSON estable para el frontend.

Campos listados según tipos reales:
- ComunicacionSimplificada / Comunicacion (ve.tecno.afip.gov.ar)
- RespuestaPaginada (pagina, totalPaginas, itemsPorPagina, totalItems, items)
- Estados → Estado[] (id, descripcion)

No se inventan valores: lo ausente en el WS queda null.
"""

from __future__ import annotations

from typing import Any

from zeep.helpers import serialize_object


def to_plain(obj: Any) -> Any:
    """Convierte respuesta Zeep a estructuras JSON-serializables."""
    if obj is None:
        return None
    try:
        return serialize_object(obj, target_cls=dict)
    except Exception:
        if hasattr(obj, "__dict__"):
            return {k: to_plain(v) for k, v in obj.__dict__.items() if not k.startswith("_")}
        return obj


def _unwrap_respuesta_paginada(plain: dict[str, Any]) -> dict[str, Any]:
    """
    Zeep devuelve a veces el body SOAP envuelto:
    consultarComunicacionesResponse → RespuestaPaginada (pagina, totalItems, items, …).
    Sin este paso, items queda vacío y el front muestra 0 resultados.
    """
    if not isinstance(plain, dict):
        return {}

    def _is_rp(d: dict[str, Any]) -> bool:
        return isinstance(d.get("pagina"), int) or any(
            k in d for k in ("items", "Items", "totalItems", "totalPaginas")
        )

    if _is_rp(plain):
        return plain

    for key in ("RespuestaPaginada", "respuestaPaginada"):
        inner = plain.get(key)
        if isinstance(inner, dict) and _is_rp(inner):
            return inner

    outer = plain.get("consultarComunicacionesResponse")
    if isinstance(outer, dict):
        if _is_rp(outer):
            return outer
        for key in ("RespuestaPaginada", "respuestaPaginada"):
            inner = outer.get(key)
            if isinstance(inner, dict) and _is_rp(inner):
                return inner

    return plain


def _unwrap_comunicacion(plain: dict[str, Any]) -> dict[str, Any]:
    """consumirComunicacionResponse → Comunicacion."""
    if not isinstance(plain, dict):
        return {}

    if plain.get("idComunicacion") is not None or plain.get("asunto") is not None:
        return plain

    for key in ("Comunicacion", "comunicacion"):
        inner = plain.get(key)
        if isinstance(inner, dict):
            return inner

    outer = plain.get("consumirComunicacionResponse")
    if isinstance(outer, dict):
        for key in ("Comunicacion", "comunicacion"):
            inner = outer.get(key)
            if isinstance(inner, dict):
                return inner

    return plain


def _unwrap_estados_container(plain: dict[str, Any]) -> dict[str, Any]:
    """consultarEstadosResponse → Estados (lista de Estado bajo Estado/estado)."""
    if not isinstance(plain, dict):
        return plain

    if plain.get("Estado") is not None or plain.get("estado") is not None:
        return plain

    for key in ("Estados", "estados"):
        inner = plain.get(key)
        if isinstance(inner, dict):
            return inner

    outer = plain.get("consultarEstadosResponse")
    if isinstance(outer, dict):
        for key in ("Estados", "estados"):
            inner = outer.get(key)
            if isinstance(inner, dict):
                return inner
        return outer

    return plain


def _extract_items_list(items_node: Any) -> list[dict[str, Any]]:
    """items puede ser dict con clave ComunicacionSimplificada o lista directa."""
    plain = to_plain(items_node)
    if plain is None:
        return []
    if isinstance(plain, list):
        return [x for x in plain if isinstance(x, dict)]
    if not isinstance(plain, dict):
        return []
    for key in ("ComunicacionSimplificada", "comunicacionSimplificada", "item", "items"):
        v = plain.get(key)
        if isinstance(v, list):
            return [x for x in v if isinstance(x, dict)]
        if isinstance(v, dict):
            return [v]
    # un solo dict que parece comunicación
    if "idComunicacion" in plain:
        return [plain]
    return []


def normalize_consultar_comunicaciones_response(result: Any) -> dict[str, Any]:
    plain = to_plain(result)
    if not isinstance(plain, dict):
        plain = {}

    plain = _unwrap_respuesta_paginada(plain)

    items_raw = plain.get("items") or plain.get("Items")
    rows = _extract_items_list(items_raw)

    comunicaciones = [normalize_comunicacion_list_item(row) for row in rows]

    return {
        "pagina": plain.get("pagina"),
        "totalPaginas": plain.get("totalPaginas"),
        "itemsPorPagina": plain.get("itemsPorPagina"),
        "totalItems": plain.get("totalItems"),
        "comunicaciones": comunicaciones,
        "raw": plain,
    }


def normalize_comunicacion_list_item(d: dict[str, Any]) -> dict[str, Any]:
    """ComunicacionSimplificada → contrato listado UI."""
    estado_desc = d.get("estadoDesc") or d.get("estadoDescripcion")
    leida: bool | None = None
    if isinstance(estado_desc, str):
        low = estado_desc.lower()
        leida = "leíd" in low or "leido" in low or "leída" in low

    return {
        "idComunicacion": d.get("idComunicacion"),
        "fechaPublicacion": d.get("fechaPublicacion"),
        "fechaNotificacion": d.get("fechaNotificacion"),
        "fechaVencimiento": d.get("fechaVencimiento"),
        "asunto": d.get("asunto"),
        "organismo": d.get("sistemaPublicadorDesc"),
        "clasificacion": d.get("referencia2") or d.get("referencia1"),
        "estado": d.get("estado"),
        "estadoDescripcion": estado_desc,
        "leida": leida,
        "tieneAdjuntos": d.get("tieneAdjunto"),
        "sistemaPublicador": d.get("sistemaPublicador"),
        "sistemaPublicadorDescripcion": d.get("sistemaPublicadorDesc"),
        "prioridad": d.get("prioridad"),
        "referencia1": d.get("referencia1"),
        "referencia2": d.get("referencia2"),
        "cuitDestinatario": d.get("cuitDestinatario"),
        "raw": d,
    }


def _normalize_adjunto(a: dict[str, Any], include_base64: bool) -> dict[str, Any]:
    out = {
        "filename": a.get("filename"),
        "compressed": a.get("compressed"),
        "signed": a.get("signed"),
        "encrypted": a.get("encrypted"),
        "processed": a.get("processed"),
        "public": a.get("public"),
        "md5": a.get("md5"),
        "contentSize": a.get("contentSize"),
    }
    if include_base64 and a.get("content") is not None:
        out["contentBase64"] = a.get("content")
    else:
        out["contentOmitted"] = True
    return out


def _extract_adjuntos_list(adj_node: Any) -> list[dict[str, Any]]:
    plain = to_plain(adj_node)
    if plain is None:
        return []
    if isinstance(plain, list):
        return [x for x in plain if isinstance(x, dict)]
    if isinstance(plain, dict):
        for key in ("adjunto", "Adjunto"):
            v = plain.get(key)
            if isinstance(v, list):
                return [x for x in v if isinstance(x, dict)]
            if isinstance(v, dict):
                return [v]
    return []


def normalize_comunicacion_detalle(result: Any, *, include_adjunto_base64: bool = False) -> dict[str, Any]:
    d = to_plain(result)
    if not isinstance(d, dict):
        d = {}

    d = _unwrap_comunicacion(d)

    adjuntos_raw = _extract_adjuntos_list(d.get("adjuntos") or d.get("Adjuntos"))
    adjuntos = [_normalize_adjunto(a, include_adjunto_base64) for a in adjuntos_raw]

    estado_desc = d.get("estadoDesc") or d.get("estadoDescripcion")

    return {
        "idComunicacion": d.get("idComunicacion"),
        "asunto": d.get("asunto"),
        "organismo": d.get("sistemaPublicadorDesc"),
        "clasificacion": d.get("referencia2") or d.get("referencia1"),
        "fechaPublicacion": d.get("fechaPublicacion"),
        "fechaNotificacion": d.get("fechaNotificacion"),
        "fechaVencimiento": d.get("fechaVencimiento"),
        "fechaLectura": d.get("fechaLectura"),
        "estado": d.get("estado"),
        "estadoDescripcion": estado_desc,
        "cuerpo": d.get("mensaje"),
        "mensaje": d.get("mensaje"),
        "tiempoDeVida": d.get("tiempoDeVida"),
        "prioridad": d.get("prioridad"),
        "tieneAdjuntos": d.get("tieneAdjunto"),
        "referencia1": d.get("referencia1"),
        "referencia2": d.get("referencia2"),
        "cuitDestinatario": d.get("cuitDestinatario"),
        "sistemaPublicador": d.get("sistemaPublicador"),
        "adjuntos": adjuntos,
        "metadatos": {
            "sistemaPublicador": d.get("sistemaPublicador"),
            "sistemaPublicadorDescripcion": d.get("sistemaPublicadorDesc"),
        },
        "raw": d,
    }


def normalize_estados_response(result: Any) -> dict[str, Any]:
    plain = to_plain(result)
    if not isinstance(plain, dict):
        plain = {}
    plain = _unwrap_estados_container(plain)
    estados: list[dict[str, Any]] = []
    raw_list = plain.get("Estado") or plain.get("estado")
    if isinstance(raw_list, list):
        for e in raw_list:
            if isinstance(e, dict):
                estados.append(
                    {
                        "id": e.get("id"),
                        "descripcion": e.get("descripcion"),
                    }
                )
            elif e is not None:
                estados.append({"id": None, "descripcion": str(e)})
    return {"estados": estados, "raw": plain}
