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


_FIREBASE_ADMIN_READY = False


def _ensure_firebase_admin():
    global _FIREBASE_ADMIN_READY
    if _FIREBASE_ADMIN_READY:
        return
    # En Cloud Run usa credenciales por defecto (service account). En local puede usar ADC.
    import firebase_admin

    if not firebase_admin._apps:
        firebase_admin.initialize_app()
    _FIREBASE_ADMIN_READY = True


def _require_att_user() -> dict:
    """
    Autenticación + autorización para DFE:
    - Authorization: Bearer <Firebase ID token>
    - Firestore users/{uid} existe, active=true, role ∈ allowed.
    """
    token = _get_bearer_token()
    if not token:
        raise DfeServiceError("auth", "Falta token Bearer.", http_status=401)

    try:
        _ensure_firebase_admin()
        from firebase_admin import auth as fb_auth  # type: ignore

        decoded = fb_auth.verify_id_token(token)
        uid = decoded.get("uid") or decoded.get("user_id")
        if not uid:
            raise DfeServiceError("auth", "Token inválido (sin uid).", http_status=401)
    except DfeServiceError:
        raise
    except Exception:
        raise DfeServiceError("auth", "Token inválido.", http_status=401)

    # Validación de perfil interno ATT-WEB
    try:
        from google.cloud import firestore  # type: ignore

        db = firestore.Client()
        snap = db.collection("users").document(uid).get()
        if not snap.exists:
            raise DfeServiceError("forbidden", "Perfil de usuario no encontrado.", http_status=403)
        data = snap.to_dict() or {}
        if not data.get("active"):
            raise DfeServiceError("forbidden", "Usuario inactivo.", http_status=403)
        role = (data.get("role") or "lectura").strip()
        if role not in _allowed_roles():
            raise DfeServiceError("forbidden", "Sin permiso para Consultas DFE.", http_status=403)
        return {"uid": uid, "role": role, "name": data.get("name") or data.get("email") or uid}
    except DfeServiceError:
        raise
    except Exception:
        traceback.print_exc()
        raise DfeServiceError("forbidden", "No se pudo validar el perfil.", http_status=403)


@app.before_request
def _auth_guard():
    # Proteger solo DFE
    p = request.path or ""
    if not p.startswith("/api/dfe/"):
        return None
    # Preflight CORS: no autenticar OPTIONS.
    if request.method == "OPTIONS":
        return None
    # Health público mínimo: no filtra config ni paths
    if p == "/api/dfe/health":
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


@app.post("/api/dfe/sync")
def route_sync_all():
    """Sync manual masivo: recorre dfe_clients habilitados y persiste dfe_comunicaciones."""
    u = getattr(request, "att_user", None) or {}
    if (u.get("role") or "") not in _sync_roles():
        return jsonify({"ok": False, "error": "forbidden", "message": "Sin permiso para sincronizar."}), 403
    try:
        from sync_service import list_enabled_clients, sync_cuit_into_firestore

        db = _fs_client()
        clients = list_enabled_clients(db=db)
        results = []
        for c in clients:
            # status por cliente
            ref = db.collection("dfe_clients").document(c["cuit"])
            try:
                r = sync_cuit_into_firestore(db=db, cuit_representada=c["cuit"], nombre_cliente=c.get("nombre"))
                results.append({"ok": True, **r})
                ref.set(
                    {
                        "cuit": c["cuit"],
                        "nombre": c.get("nombre"),
                        "dfeEnabled": True,
                        "active": True,
                        "lastSyncAt": db.SERVER_TIMESTAMP,
                        "lastSyncOk": True,
                        "lastSyncError": None,
                    },
                    merge=True,
                )
            except Exception as e:
                results.append({"ok": False, "cuitRepresentada": c["cuit"], "message": str(e)})
                ref.set(
                    {
                        "lastSyncAt": db.SERVER_TIMESTAMP,
                        "lastSyncOk": False,
                        "lastSyncError": str(e)[:400],
                    },
                    merge=True,
                )
        return jsonify({"ok": True, "count": len(results), "results": sanitize(results)})
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

        db = _fs_client()
        r = sync_cuit_into_firestore(db=db, cuit_representada=cuit, nombre_cliente=nombre)
        db.collection("dfe_clients").document(r["cuitRepresentada"]).set(
            {
                "cuit": r["cuitRepresentada"],
                "nombre": nombre,
                "dfeEnabled": True,
                "active": True,
                "lastSyncAt": db.SERVER_TIMESTAMP,
                "lastSyncOk": True,
                "lastSyncError": None,
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
