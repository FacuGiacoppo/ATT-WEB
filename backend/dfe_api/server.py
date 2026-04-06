#!/usr/bin/env python3
"""
API HTTP DFE (Consultas DFE) para ATT-WEB.

Ejecutar desde la raíz del repo o desde esta carpeta:
  cd backend/dfe_api && python server.py

Variables de entorno: mismas que arca_ve_connector (ARCA_WSAA_*, ARCA_CERT_PATH, ARCA_KEY_PATH, ARCA_VE_WSDL).
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

# Cargar .env del conector si existe (no sobreescribe variables ya definidas)
def _load_dotenv_connector() -> None:
    env_path = _ARCA_PKG_PARENT / ".env"
    if not env_path.is_file():
        return
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v


_load_dotenv_connector()

from flask import Flask, jsonify, request
from flask_cors import CORS

from dfe_service import DfeServiceError, consumir_comunicacion, consultar_comunicaciones, consultar_estados, health_check

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


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
        body = health_check()
        return jsonify({"ok": bool(body.get("configPresent")), **body})
    except Exception as e:
        return jsonify({"ok": False, "error": "health", "message": str(e)}), 500


@app.get("/api/dfe/estados")
def route_estados():
    cuit = request.args.get("cuitRepresentada", "").strip()
    if not cuit:
        return jsonify({"ok": False, "error": "parametros", "message": "Falta query cuitRepresentada"}), 400
    try:
        data = consultar_estados(cuit)
        return jsonify({"ok": True, "data": data})
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(p), st
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": "interno", "message": str(e)}), 500


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
        return jsonify({"ok": True, "data": data})
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(p), st
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": "interno", "message": str(e)}), 500


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
        return jsonify({"ok": True, "data": data})
    except DfeServiceError as e:
        p, st = _err_payload(e)
        return jsonify(p), st
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": "interno", "message": str(e)}), 500


if __name__ == "__main__":
    host = os.environ.get("DFE_API_HOST", "127.0.0.1")
    port = int(os.environ.get("DFE_API_PORT", "5050"))
    print(f"DFE API en http://{host}:{port}  (Consultas DFE → ATT-WEB)")
    app.run(host=host, port=port, debug=os.environ.get("DFE_API_DEBUG", "").lower() in ("1", "true"))
