#!/usr/bin/env python3
"""
API HTTP DFE (Consultas DFE) para ATT-WEB.

Ejecutar desde la raíz del repo o desde esta carpeta:
  cd backend/dfe_api && python server.py

Variables de entorno: ver backend/dfe_api/ENVIRONMENTS.md
  - ARCA_ENV=homologacion|produccion (o qa|prod, etc.) + certificados y opcionalmente URLs.
Opcional: DFE_API_PORT=5050, DFE_API_HOST=127.0.0.1
Depuración: DFE_DEBUG=1 imprime body JSON recibido y traza en dfe_service (consola del servidor).
"""
from __future__ import annotations

import os
import sys
import traceback
from pathlib import Path

_API_DIR = Path(__file__).resolve().parent
_ARCA_PKG_PARENT = _API_DIR.parent / "arca_ve_connector"

for p in (str(_API_DIR), str(_ARCA_PKG_PARENT)):
    if p not in sys.path:
        sys.path.insert(0, p)

def _load_dotenv(path: Path) -> None:
    """Carga KEY=VALUE desde un archivo .env (no sobreescribe variables ya definidas)."""
    if not path.is_file():
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v


_load_dotenv(_API_DIR / ".env")
_load_dotenv(_ARCA_PKG_PARENT / ".env")

# Homologación / producción: defaults de WSAA y WSDL antes de importar dfe_service
from arca_runtime_env import ensure_arca_runtime_env

ensure_arca_runtime_env()

from flask import Flask, jsonify, request
from flask_cors import CORS

from dfe_service import DfeServiceError, consumir_comunicacion, consultar_comunicaciones, consultar_estados, health_check
from sanitize import sanitize
from google.cloud import firestore  # type: ignore

app = Flask(__name__)

def _cors_origins():
    # Cloud Run/Firebase Hosting: restringir por env (coma-separado). Default: "*".
    raw = (os.environ.get("DFE_CORS_ORIGINS") or "").strip()
    if not raw:
        return "*"
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    return parts or "*"


# IMPORTANTE:
# - En local, el frontend suele correr en http://localhost:3000
#   y el backend en http://127.0.0.1:5050 (distinto origen) → requiere CORS.
# - El patrón debe matchear rutas anidadas (/api/dfe/...) y permitir Authorization.
CORS(
    app,
    resources={r"/api/.*": {"origins": _cors_origins()}},
    allow_headers=["Content-Type", "Authorization"],
)

def _allowed_roles() -> set[str]:
    raw = (os.environ.get("DFE_ALLOWED_ROLES") or "").strip()
    if raw:
        return {r.strip() for r in raw.split(",") if r.strip()}
    # Default: mismos roles “colaborativos” del frontend
    return {"superadmin", "admin", "colaborador"}

def _sync_roles() -> set[str]:
    raw = (os.environ.get("DFE_SYNC_ROLES") or "").strip()
    if raw:
        return {r.strip() for r in raw.split(",") if r.strip()}
    # Default: solo admin/superadmin pueden disparar sync manual.
    return {"superadmin", "admin"}


def _get_bearer_token() -> str | None:
    h = (request.headers.get("Authorization") or "").strip()
    if not h:
        return None
    if not h.lower().startswith("bearer "):
        return None
    t = h[7:].strip()
    return t or None


def _normalize_dfe_request_path(path: str) -> str:
    """Colapsa barras duplicadas y barra final para matchear rutas (ej. /api/dfe/sync/cron/)."""
    parts = [x for x in (path or "").split("/") if x]
    return "/" + "/".join(parts) if parts else "/"


def _cron_sync_window_days() -> int:
    """Ventana de consulta ARCA para el job programado (default 90 días)."""
    raw = (os.environ.get("DFE_CRON_SYNC_DAYS") or "90").strip()
    try:
        return max(1, min(int(raw), 365))
    except Exception:
        return 90


def _verify_cloud_scheduler_oidc(expected_audience: str) -> dict | None:
    """
    Valida el JWT que Cloud Scheduler adjunta al invocar Cloud Run (OIDC).
    `expected_audience` debe ser la URL base del servicio (misma que --oidc-token-audience).
    Opcional: DFE_CRON_SA_EMAIL restringe al mail exacto del service account.
    """
    # Logging seguro (no imprimir JWT).
    if _auth_debug_enabled():
        has_auth = bool((request.headers.get("Authorization") or "").strip())
        _auth_log(f"cron oidc auth_header_present={has_auth}")
        _auth_log(f"cron oidc expected_audience={expected_audience!r}")
        _auth_log(f"cron oidc env DFE_CRON_SA_EMAIL={(os.environ.get('DFE_CRON_SA_EMAIL') or '').strip()!r}")

    token = _get_bearer_token()
    if not token:
        _auth_log("cron oidc missing/invalid bearer (not 'Bearer <token>')")
        return None
    try:
        from google.auth.transport import requests as ga_requests
        from google.oauth2 import id_token as ga_id_token

        info = ga_id_token.verify_oauth2_token(token, ga_requests.Request(), audience=expected_audience)
        # Claims relevantes (no sensibles)
        aud_claim = info.get("aud")
        iss = str(info.get("iss") or "").rstrip("/")
        sub = info.get("sub")
        email = (info.get("email") or "").strip().lower()
        _auth_log(f"cron oidc decoded aud={aud_claim!r} iss={iss!r} sub={sub!r} email={email!r}")

        if iss not in ("https://accounts.google.com", "accounts.google.com"):
            _auth_log(f"cron oidc denied: issuer mismatch iss={iss!r}")
            return None
        allow = (os.environ.get("DFE_CRON_SA_EMAIL") or "").strip().lower()
        if allow and email != allow:
            _auth_log(f"cron oidc denied: email mismatch got={email!r} expected={allow!r}")
            return None
        return {"sub": sub, "email": email}
    except Exception as e:
        _auth_log(f"cron oidc verify failed: {type(e).__name__} repr={e!r}")
        traceback.print_exc()
        return None


_FIREBASE_ADMIN_READY = False


def _ensure_firebase_admin():
    global _FIREBASE_ADMIN_READY
    if _FIREBASE_ADMIN_READY:
        return
    # En Cloud Run usa credenciales por defecto (service account). En local puede usar ADC.
    import firebase_admin

    if not firebase_admin._apps:
        pid = (
            os.environ.get("FIREBASE_PROJECT_ID")
            or os.environ.get("GOOGLE_CLOUD_PROJECT")
            or os.environ.get("GCLOUD_PROJECT")
        )
        # Para verify_id_token es clave tener projectId correcto (audience).
        # En Cloud Run esto suele venir por env; en local lo permitimos por FIREBASE_PROJECT_ID.
        opts = {"projectId": pid} if pid else None
        firebase_admin.initialize_app(options=opts)  # type: ignore[arg-type]
    _FIREBASE_ADMIN_READY = True


def _auth_debug_enabled() -> bool:
    return (os.environ.get("DFE_AUTH_DEBUG") or "").lower() in ("1", "true", "yes")


def _auth_log(msg: str) -> None:
    if _auth_debug_enabled():
        print(f"[dfe-auth] {msg}", flush=True)


def _require_att_user() -> dict:
    """
    Autenticación + autorización para DFE:
    - Authorization: Bearer <Firebase ID token>
    - Firestore users/{uid} existe, active=true, role ∈ allowed.
    """
    token = _get_bearer_token()
    if not token:
        _auth_log("missing bearer token")
        raise DfeServiceError("auth", "Falta token Bearer.", http_status=401)

    try:
        _ensure_firebase_admin()
        from firebase_admin import auth as fb_auth  # type: ignore

        _auth_log(f"bearer token len={len(token)}")
        decoded = fb_auth.verify_id_token(token)
        uid = decoded.get("uid") or decoded.get("user_id")
        if not uid:
            _auth_log("token verified but missing uid")
            raise DfeServiceError("auth", "Token inválido (sin uid).", http_status=401)
        _auth_log(f"token ok uid={uid!r} aud={decoded.get('aud')!r} iss={decoded.get('iss')!r}")
    except DfeServiceError:
        raise
    except Exception as e:
        _auth_log(f"verify_id_token failed: {type(e).__name__}: {e}")
        raise DfeServiceError("auth", "Token inválido.", http_status=401, detail={"kind": type(e).__name__})

    # Validación de perfil interno ATT-WEB
    try:
        from google.cloud import firestore  # type: ignore

        db = firestore.Client()
        snap = db.collection("users").document(uid).get()
        if not snap.exists:
            _auth_log(f"profile missing uid={uid!r}")
            raise DfeServiceError("forbidden", "Perfil de usuario no encontrado.", http_status=403)
        data = snap.to_dict() or {}
        if not data.get("active"):
            _auth_log(f"profile inactive uid={uid!r}")
            raise DfeServiceError("forbidden", "Usuario inactivo.", http_status=403)
        role = (data.get("role") or "lectura").strip()
        if role not in _allowed_roles():
            _auth_log(f"profile role denied uid={uid!r} role={role!r}")
            raise DfeServiceError("forbidden", "Sin permiso para Consultas DFE.", http_status=403)
        token_email = (decoded.get("email") or data.get("email") or "").strip() or None
        return {
            "uid": uid,
            "role": role,
            "name": data.get("name") or data.get("email") or uid,
            "email": token_email,
        }
    except DfeServiceError:
        raise
    except Exception:
        traceback.print_exc()
        raise DfeServiceError("forbidden", "No se pudo validar el perfil.", http_status=403)


@app.before_request
def _auth_guard():
    # Proteger solo DFE
    p = _normalize_dfe_request_path(request.path or "")
    if not (p.startswith("/api/dfe/") or p == "/api/dfe"):
        return None
    # Preflight CORS: no autenticar OPTIONS.
    if request.method == "OPTIONS":
        return None
    # Health público mínimo: no filtra config ni paths
    if p == "/api/dfe/health":
        return None
    # Cloud Scheduler → Cloud Run: SOLO Google OIDC (nunca Firebase Auth).
    if p == "/api/dfe/sync/cron" and request.method == "POST":
        aud = (os.environ.get("DFE_CRON_AUDIENCE") or "").strip()
        if _auth_debug_enabled():
            _auth_log("cron request received: /api/dfe/sync/cron (OIDC only, no Firebase)")
            _auth_log(f"cron env DFE_CRON_AUDIENCE={aud!r}")
            _auth_log(f"cron env DFE_CRON_SA_EMAIL={(os.environ.get('DFE_CRON_SA_EMAIL') or '').strip()!r}")
            _auth_log(f"cron method={request.method!r} raw_path={request.path!r} normalized_path={p!r}")
        if not aud:
            _auth_log("cron denied: missing DFE_CRON_AUDIENCE")
            return (
                jsonify(
                    sanitize(
                        {
                            "ok": False,
                            "error": "config",
                            "message": "Definí DFE_CRON_AUDIENCE en Cloud Run (URL del servicio, igual al audience del Scheduler).",
                        }
                    )
                ),
                503,
            )
        cron_claims = _verify_cloud_scheduler_oidc(aud)
        if not cron_claims:
            _auth_log("cron denied: OIDC invalid or not authorized (see previous logs)")
            return jsonify(sanitize({"ok": False, "error": "auth", "message": "OIDC inválido o no autorizado."})), 401
        request.att_user = {  # type: ignore[attr-defined]
            "uid": f"cron:{cron_claims.get('sub') or 'unknown'}",
            "role": "admin",
            "name": "Cloud Scheduler",
        }
        _auth_log("cron allowed: OIDC verified")
        return None
    # Todo lo demás requiere token + rol
    try:
        request.att_user = _require_att_user()  # type: ignore[attr-defined]
    except DfeServiceError as e:
        payload, st = _err_payload(e)
        return jsonify(sanitize(payload)), st
    return None


def _err_payload(exc: DfeServiceError) -> tuple[dict, int]:
    return (
        {
            "ok": False,
            "error": exc.code,
            "message": str(exc),
            "detail": exc.detail,
        },
        exc.http_status,
    )


@app.get("/api/dfe/health")
def route_health():
    try:
        # Público: solo "liveness", sin detalles del entorno/paths.
        return jsonify({"ok": True, "service": "dfe_api"})
    except Exception as e:
        return jsonify(sanitize({"ok": False, "error": "health", "message": str(e)})), 500


@app.get("/api/dfe/health/auth")
def route_health_auth():
    """Health más detallado, protegido por Firebase Auth + rol."""
    try:
        body = health_check()
        return jsonify(sanitize({"ok": bool(body.get("configPresent")), **body}))
    except Exception as e:
        return jsonify(sanitize({"ok": False, "error": "health", "message": str(e)})), 500


@app.get("/api/dfe/estados")
def route_estados():
    cuit = request.args.get("cuitRepresentada", "").strip()
    if not cuit:
        return jsonify({"ok": False, "error": "parametros", "message": "Falta query cuitRepresentada"}), 400
    try:
        data = consultar_estados(cuit)
        return jsonify(sanitize({"ok": True, "data": data}))
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(sanitize(p)), st
    except Exception as e:
        traceback.print_exc()
        return jsonify(sanitize({"ok": False, "error": "interno", "message": str(e)})), 500


def _fs_client():
    from google.cloud import firestore  # type: ignore

    return firestore.Client()


def _run_bulk_sync_all_clients(*, window_days: int | None, sync_source: str) -> list[dict]:
    """Recorre `dfe_clients` habilitados, persiste en `dfe_comunicaciones` y actualiza lastSync* por cliente."""
    from sync_service import list_enabled_clients, sync_cuit_into_firestore

    db = _fs_client()
    clients = list_enabled_clients(db=db)
    results: list[dict] = []
    for c in clients:
        ref = db.collection("dfe_clients").document(c["cuit"])
        try:
            r = sync_cuit_into_firestore(
                db=db,
                cuit_representada=c["cuit"],
                nombre_cliente=c.get("nombre"),
                window_days=window_days,
            )
            results.append({"ok": True, **r})
            ref.set(
                {
                    "cuit": c["cuit"],
                    "nombre": c.get("nombre"),
                    "dfeEnabled": True,
                    "active": True,
                    "lastSyncAt": firestore.SERVER_TIMESTAMP,
                    "lastSyncOk": True,
                    "lastSyncError": None,
                    "lastSyncFechaDesde": r.get("fechaDesde"),
                    "lastSyncFechaHasta": r.get("fechaHasta"),
                    "lastSyncWindowDays": r.get("windowDays"),
                    "lastSyncUpserted": r.get("upserted"),
                    "lastSyncSource": sync_source,
                },
                merge=True,
            )
        except Exception as e:
            results.append({"ok": False, "cuitRepresentada": c["cuit"], "message": str(e)})
            ref.set(
                {
                    "lastSyncAt": firestore.SERVER_TIMESTAMP,
                    "lastSyncOk": False,
                    "lastSyncError": str(e)[:400],
                    "lastSyncSource": sync_source,
                },
                merge=True,
            )
    return results


@app.post("/api/dfe/sync")
def route_sync_all():
    """Sync manual masivo: recorre dfe_clients habilitados y persiste dfe_comunicaciones."""
    u = getattr(request, "att_user", None) or {}
    if (u.get("role") or "") not in _sync_roles():
        return jsonify({"ok": False, "error": "forbidden", "message": "Sin permiso para sincronizar."}), 403
    try:
        results = _run_bulk_sync_all_clients(window_days=None, sync_source="manual")
        return jsonify({"ok": True, "count": len(results), "results": sanitize(results)})
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(sanitize(p)), st
    except Exception as e:
        traceback.print_exc()
        return jsonify(sanitize({"ok": False, "error": "interno", "message": str(e)})), 500


@app.post("/api/dfe/sync/cron")
def route_sync_cron():
    """
    Sync masivo para Cloud Scheduler + Cloud Run (OIDC).
    Ventana de días: DFE_CRON_SYNC_DAYS (default 90). Requiere DFE_CRON_AUDIENCE = URL del servicio.
    """
    u = getattr(request, "att_user", None) or {}
    if not str(u.get("uid") or "").startswith("cron:"):
        return jsonify({"ok": False, "error": "forbidden", "message": "Solo invocable con OIDC de Scheduler."}), 403
    try:
        days = _cron_sync_window_days()
        results = _run_bulk_sync_all_clients(window_days=days, sync_source="scheduler")
        return jsonify(
            sanitize(
                {
                    "ok": True,
                    "count": len(results),
                    "cronWindowDays": days,
                    "source": "scheduler",
                    "results": results,
                }
            )
        )
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(sanitize(p)), st
    except Exception as e:
        traceback.print_exc()
        return jsonify(sanitize({"ok": False, "error": "interno", "message": str(e)})), 500


@app.post("/api/dfe/sync-client")
def route_sync_client():
    """Sync manual por CUIT: body { cuitRepresentada, nombreCliente? }."""
    u = getattr(request, "att_user", None) or {}
    if (u.get("role") or "") not in _sync_roles():
        return jsonify({"ok": False, "error": "forbidden", "message": "Sin permiso para sincronizar."}), 403
    body = request.get_json(silent=True) or {}
    cuit = (body.get("cuitRepresentada") or "").strip()
    nombre = (body.get("nombreCliente") or "").strip() or None
    try:
        from sync_service import sync_cuit_into_firestore

        _auth_log(
            f"sync-client requested by uid={u.get('uid')!r} role={u.get('role')!r} cuitRepresentada={cuit!r}"
        )
        db = _fs_client()
        r = sync_cuit_into_firestore(db=db, cuit_representada=cuit, nombre_cliente=nombre)
        _auth_log(
            f"sync-client result cuit={r.get('cuitRepresentada')!r} upserted={r.get('upserted')!r} windowDays={r.get('windowDays')!r}"
        )
        db.collection("dfe_clients").document(r["cuitRepresentada"]).set(
            {
                "cuit": r["cuitRepresentada"],
                "nombre": nombre,
                "dfeEnabled": True,
                "active": True,
                "lastSyncAt": firestore.SERVER_TIMESTAMP,
                "lastSyncOk": True,
                "lastSyncError": None,
                "lastSyncFechaDesde": r.get("fechaDesde"),
                "lastSyncFechaHasta": r.get("fechaHasta"),
                "lastSyncWindowDays": r.get("windowDays"),
                "lastSyncUpserted": r.get("upserted"),
                "lastSyncSource": "manual",
            },
            merge=True,
        )
        return jsonify(sanitize({"ok": True, "result": r}))
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(sanitize(p)), st
    except Exception as e:
        traceback.print_exc()
        return jsonify(sanitize({"ok": False, "error": "interno", "message": str(e)})), 500


@app.get("/api/dfe/whoami")
def route_whoami():
    """Debug dirigido: confirma si el token valida y qué rol ve el backend."""
    u = getattr(request, "att_user", None) or {}
    return jsonify(
        sanitize(
            {
                "ok": True,
                "uid": u.get("uid"),
                "role": u.get("role"),
                "name": u.get("name"),
            }
        )
    )


def _dfe_panel_log(action: str, *, doc_id: str | None = None, user: str | None = None) -> None:
    parts = [f"[dfe] {action}"]
    if doc_id is not None:
        parts.append(f"doc_id={doc_id}")
    if user is not None:
        parts.append(f"user={user}")
    print(" ".join(parts), flush=True)


def _audit_actor_from_token() -> str:
    """
    Identificador para *leidaInternaPor* / *archivadaInternaPor*: email del token si existe, si no uid.
    (Usuarios sin email en el JWT —p. ej. solo teléfono— siguen pudiendo actuar.)
    """
    u = getattr(request, "att_user", None) or {}
    email = (u.get("email") or "").strip()
    if email:
        return email
    uid = (u.get("uid") or "").strip()
    if uid:
        return uid
    raise DfeServiceError(
        "parametros",
        "No se pudo determinar usuario (sin email ni uid en la sesión).",
        http_status=400,
    )


def _assert_comunicacion_doc_id(doc_id: str) -> None:
    from dfe_comunicaciones_model import parse_comunicacion_doc_id

    if parse_comunicacion_doc_id(doc_id) is None:
        raise DfeServiceError(
            "parametros",
            "doc_id inválido; formato esperado: {CUIT11}__{idComunicacion}.",
            http_status=400,
        )


def _parse_query_bool(val: str | None, default: bool) -> bool:
    if val is None or val == "":
        return default
    return str(val).strip().lower() in ("1", "true", "yes", "on")


@app.get("/api/dfe/comunicaciones")
def route_comunicaciones_firestore_list():
    """
    Lista comunicaciones persistidas en Firestore (panel DFE).
    Por defecto excluye archivadas internas (incluye documentos sin campo = no archivado).
    """
    try:
        from dfe_comunicaciones_service import list_comunicaciones_firestore

        u = getattr(request, "att_user", None) or {}
        _dfe_panel_log("GET /api/dfe/comunicaciones", user=(u.get("email") or u.get("uid") or ""))

        cuit = (request.args.get("cuit") or "").strip() or None
        solo_nuevas = _parse_query_bool(request.args.get("soloNuevas"), False)
        solo_archivadas = _parse_query_bool(request.args.get("soloArchivadas"), False)
        solo_urgentes = _parse_query_bool(request.args.get("soloUrgentes"), False)
        fecha_desde = (request.args.get("fechaDesde") or "").strip() or None
        fecha_hasta = (request.args.get("fechaHasta") or "").strip() or None
        try:
            limit = int(request.args.get("limit") or "100")
        except (TypeError, ValueError):
            limit = 100

        db = _fs_client()
        items, meta = list_comunicaciones_firestore(
            db=db,
            cuit=cuit,
            solo_nuevas=solo_nuevas,
            solo_archivadas=solo_archivadas,
            solo_urgentes=solo_urgentes,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
            limit=limit,
        )
        return jsonify(
            sanitize(
                {
                    "ok": True,
                    "items": items,
                    "total": len(items),
                    "limit": meta.get("limit"),
                    "scannedDocuments": meta.get("scannedDocuments"),
                    "truncated": meta.get("truncated"),
                }
            )
        )
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(sanitize(p)), st
    except Exception as e:
        traceback.print_exc()
        return jsonify(sanitize({"ok": False, "error": "interno", "message": str(e)})), 500


@app.get("/api/dfe/comunicaciones/nuevas")
def route_comunicaciones_nuevas():
    """Solo comunicaciones nuevas (no leídas internas y no archivadas)."""
    try:
        from dfe_comunicaciones_service import list_comunicaciones_nuevas_firestore

        u = getattr(request, "att_user", None) or {}
        _dfe_panel_log("GET /api/dfe/comunicaciones/nuevas", user=(u.get("email") or u.get("uid") or ""))

        cuit = (request.args.get("cuit") or "").strip() or None
        fecha_desde = (request.args.get("fechaDesde") or "").strip() or None
        fecha_hasta = (request.args.get("fechaHasta") or "").strip() or None
        try:
            limit = int(request.args.get("limit") or "50")
        except (TypeError, ValueError):
            limit = 50

        db = _fs_client()
        items, meta = list_comunicaciones_nuevas_firestore(
            db=db,
            cuit=cuit,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
            limit=limit,
        )
        return jsonify(
            sanitize(
                {
                    "ok": True,
                    "items": items,
                    "total": len(items),
                    "limit": meta.get("limit"),
                    "scannedDocuments": meta.get("scannedDocuments"),
                    "truncated": meta.get("truncated"),
                }
            )
        )
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(sanitize(p)), st
    except Exception as e:
        traceback.print_exc()
        return jsonify(sanitize({"ok": False, "error": "interno", "message": str(e)})), 500


@app.get("/api/dfe/comunicaciones/<doc_id>")
def route_comunicacion_get(doc_id: str):
    """Una comunicación por doc_id Firestore (normalizada, incluye gestión interna)."""
    try:
        from dfe_comunicaciones_service import get_comunicacion_firestore

        _assert_comunicacion_doc_id(doc_id)
        u = getattr(request, "att_user", None) or {}
        _dfe_panel_log("GET /api/dfe/comunicaciones/<id>", doc_id=doc_id, user=(u.get("email") or u.get("uid") or ""))
        db = _fs_client()
        item = get_comunicacion_firestore(db=db, doc_id=doc_id)
        return jsonify(sanitize({"ok": True, "item": item}))
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(sanitize(p)), st
    except Exception as e:
        traceback.print_exc()
        return jsonify(sanitize({"ok": False, "error": "interno", "message": str(e)})), 500


@app.get("/api/dfe/resumen")
def route_dfe_resumen():
    try:
        from dfe_comunicaciones_service import compute_resumen

        u = getattr(request, "att_user", None) or {}
        _dfe_panel_log("GET /api/dfe/resumen", user=(u.get("email") or u.get("uid") or ""))

        db = _fs_client()
        data = compute_resumen(db=db)
        return jsonify(sanitize({"ok": True, **data}))
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(sanitize(p)), st
    except Exception as e:
        traceback.print_exc()
        return jsonify(sanitize({"ok": False, "error": "interno", "message": str(e)})), 500


@app.post("/api/dfe/comunicaciones/<doc_id>/estado-interno")
def route_comunicacion_estado_interno(doc_id: str):
    try:
        from dfe_comunicaciones_service import set_estado_interno_firestore

        _assert_comunicacion_doc_id(doc_id)
        actor = _audit_actor_from_token()
        body = request.get_json(silent=True) or {}
        estado = body.get("estadoInterno")
        if not isinstance(estado, str):
            return (
                jsonify(
                    sanitize(
                        {"ok": False, "error": "parametros", "message": "Falta o es inválido estadoInterno (string)."}
                    )
                ),
                400,
            )
        _dfe_panel_log("POST estado-interno", doc_id=doc_id, user=actor)
        db = _fs_client()
        item = set_estado_interno_firestore(db=db, doc_id=doc_id, estado_interno=estado.strip(), actor=actor)
        return jsonify(sanitize({"ok": True, "item": item}))
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(sanitize(p)), st
    except Exception as e:
        traceback.print_exc()
        return jsonify(sanitize({"ok": False, "error": "interno", "message": str(e)})), 500


@app.post("/api/dfe/comunicaciones/<doc_id>/asignar-responsable")
def route_comunicacion_asignar_responsable(doc_id: str):
    try:
        from dfe_comunicaciones_service import set_responsable_interno_firestore

        _assert_comunicacion_doc_id(doc_id)
        actor = _audit_actor_from_token()
        body = request.get_json(silent=True) or {}
        resp = body.get("responsableInterno")
        if resp is not None and not isinstance(resp, str):
            return (
                jsonify(
                    sanitize(
                        {
                            "ok": False,
                            "error": "parametros",
                            "message": "responsableInterno debe ser string o null.",
                        }
                    )
                ),
                400,
            )
        _dfe_panel_log("POST asignar-responsable", doc_id=doc_id, user=actor)
        db = _fs_client()
        item = set_responsable_interno_firestore(db=db, doc_id=doc_id, responsable_interno=resp)
        return jsonify(sanitize({"ok": True, "item": item}))
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(sanitize(p)), st
    except Exception as e:
        traceback.print_exc()
        return jsonify(sanitize({"ok": False, "error": "interno", "message": str(e)})), 500


@app.post("/api/dfe/comunicaciones/<doc_id>/observacion")
def route_comunicacion_observacion(doc_id: str):
    try:
        from dfe_comunicaciones_service import set_observacion_interna_firestore

        _assert_comunicacion_doc_id(doc_id)
        actor = _audit_actor_from_token()
        body = request.get_json(silent=True) or {}
        obs = body.get("observacionInterna")
        if obs is not None and not isinstance(obs, str):
            return (
                jsonify(
                    sanitize(
                        {"ok": False, "error": "parametros", "message": "observacionInterna debe ser string."}
                    )
                ),
                400,
            )
        _dfe_panel_log("POST observacion", doc_id=doc_id, user=actor)
        db = _fs_client()
        item = set_observacion_interna_firestore(db=db, doc_id=doc_id, observacion_interna=obs)
        return jsonify(sanitize({"ok": True, "item": item}))
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(sanitize(p)), st
    except Exception as e:
        traceback.print_exc()
        return jsonify(sanitize({"ok": False, "error": "interno", "message": str(e)})), 500


@app.post("/api/dfe/comunicaciones/<doc_id>/descartar-alerta")
def route_comunicacion_descartar_alerta(doc_id: str):
    try:
        from dfe_comunicaciones_service import descartar_alerta_visual

        _assert_comunicacion_doc_id(doc_id)
        actor = _audit_actor_from_token()
        _dfe_panel_log("POST descartar-alerta", doc_id=doc_id, user=actor)
        db = _fs_client()
        item = descartar_alerta_visual(db=db, doc_id=doc_id)
        return jsonify(sanitize({"ok": True, "item": item}))
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(sanitize(p)), st
    except Exception as e:
        traceback.print_exc()
        return jsonify(sanitize({"ok": False, "error": "interno", "message": str(e)})), 500


@app.post("/api/dfe/comunicaciones/<doc_id>/marcar-leida")
def route_comunicacion_marcar_leida(doc_id: str):
    try:
        from dfe_comunicaciones_service import marcar_leida_interna

        _assert_comunicacion_doc_id(doc_id)
        actor = _audit_actor_from_token()
        _dfe_panel_log("POST marcar-leida", doc_id=doc_id, user=actor)
        db = _fs_client()
        item = marcar_leida_interna(db=db, doc_id=doc_id, user_email=actor)
        return jsonify(sanitize({"ok": True, "item": item}))
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(sanitize(p)), st
    except Exception as e:
        traceback.print_exc()
        return jsonify(sanitize({"ok": False, "error": "interno", "message": str(e)})), 500


@app.post("/api/dfe/comunicaciones/<doc_id>/marcar-no-leida")
def route_comunicacion_marcar_no_leida(doc_id: str):
    try:
        from dfe_comunicaciones_service import marcar_no_leida_interna

        _assert_comunicacion_doc_id(doc_id)
        actor = _audit_actor_from_token()
        _dfe_panel_log("POST marcar-no-leida", doc_id=doc_id, user=actor)
        db = _fs_client()
        item = marcar_no_leida_interna(db=db, doc_id=doc_id, user_email=actor)
        return jsonify(sanitize({"ok": True, "item": item}))
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(sanitize(p)), st
    except Exception as e:
        traceback.print_exc()
        return jsonify(sanitize({"ok": False, "error": "interno", "message": str(e)})), 500


@app.post("/api/dfe/comunicaciones/<doc_id>/archivar")
def route_comunicacion_archivar(doc_id: str):
    try:
        from dfe_comunicaciones_service import archivar_interna

        _assert_comunicacion_doc_id(doc_id)
        actor = _audit_actor_from_token()
        _dfe_panel_log("POST archivar", doc_id=doc_id, user=actor)
        db = _fs_client()
        item = archivar_interna(db=db, doc_id=doc_id, user_email=actor)
        return jsonify(sanitize({"ok": True, "item": item}))
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(sanitize(p)), st
    except Exception as e:
        traceback.print_exc()
        return jsonify(sanitize({"ok": False, "error": "interno", "message": str(e)})), 500


@app.post("/api/dfe/comunicaciones/<doc_id>/desarchivar")
def route_comunicacion_desarchivar(doc_id: str):
    try:
        from dfe_comunicaciones_service import desarchivar_interna

        _assert_comunicacion_doc_id(doc_id)
        actor = _audit_actor_from_token()
        _dfe_panel_log("POST desarchivar", doc_id=doc_id, user=actor)
        db = _fs_client()
        item = desarchivar_interna(db=db, doc_id=doc_id, user_email=actor)
        return jsonify(sanitize({"ok": True, "item": item}))
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(sanitize(p)), st
    except Exception as e:
        traceback.print_exc()
        return jsonify(sanitize({"ok": False, "error": "interno", "message": str(e)})), 500


@app.post("/api/dfe/comunicaciones")
def route_comunicaciones():
    body = request.get_json(silent=True) or {}
    if os.environ.get("DFE_DEBUG", "").lower() in ("1", "true", "yes"):
        print(f"[dfe] POST /api/dfe/comunicaciones body recibido: {body!r}", flush=True)
    cuit = (body.get("cuitRepresentada") or "").strip()
    fd = (body.get("fechaDesde") or "").strip()
    fh = (body.get("fechaHasta") or "").strip()
    try:
        pagina = int(body.get("pagina", 1))
    except (TypeError, ValueError):
        pagina = 1
    try:
        rpp = int(body.get("resultadosPorPagina", 10))
    except (TypeError, ValueError):
        rpp = 10
    if not cuit:
        return jsonify({"ok": False, "error": "parametros", "message": "Falta cuitRepresentada"}), 400
    try:
        data = consultar_comunicaciones(cuit, fd, fh, pagina, rpp)
        return jsonify(sanitize({"ok": True, "data": data}))
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(sanitize(p)), st
    except Exception as e:
        traceback.print_exc()
        return jsonify(sanitize({"ok": False, "error": "interno", "message": str(e)})), 500


@app.post("/api/dfe/comunicacion-detalle")
def route_detalle():
    body = request.get_json(silent=True) or {}
    cuit = (body.get("cuitRepresentada") or "").strip()
    try:
        id_com = int(body.get("idComunicacion", 0))
    except (TypeError, ValueError):
        id_com = 0
    inc = body.get("incluirAdjuntos", False)
    if isinstance(inc, str):
        inc = inc.lower() in ("1", "true", "yes", "on")
    if not cuit:
        return jsonify({"ok": False, "error": "parametros", "message": "Falta cuitRepresentada"}), 400
    try:
        data = consumir_comunicacion(cuit, id_com, bool(inc))
        return jsonify(sanitize({"ok": True, "data": data}))
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(sanitize(p)), st
    except Exception as e:
        traceback.print_exc()
        return jsonify(sanitize({"ok": False, "error": "interno", "message": str(e)})), 500


if __name__ == "__main__":
    host = os.environ.get("DFE_API_HOST", "0.0.0.0")
    port = int(os.environ.get("PORT") or os.environ.get("DFE_API_PORT", "5050"))
    print(f"DFE API en http://{host}:{port}  (Consultas DFE → ATT-WEB)")
    app.run(host=host, port=port, debug=os.environ.get("DFE_API_DEBUG", "").lower() in ("1", "true"))
