#!/usr/bin/env python3
"""
CLI de prueba: WSAA, inspección WSDL, VEConsumer, smoke-test homologación.

Uso:
  cd backend/arca_ve_connector
  cp .env.example .env   # completar cert, key, CUIT
  python -m arca_ve_connector.cli smoke-test --debug

  # o: ARCA_DEBUG=1 python -m arca_ve_connector.cli smoke-test
"""

from __future__ import annotations

import argparse
import os
import sys


def _load_dotenv() -> None:
    path = os.environ.get("ARCA_ENV_FILE", ".env")
    p = os.path.join(os.getcwd(), path)
    if not os.path.isfile(p):
        return
    with open(p, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v


def cmd_wsaa() -> int:
    from .config import ArcaConnectorConfig
    from .debug_util import configure_logging_debug
    from .wsaa_client import request_ticket

    configure_logging_debug()
    cfg = ArcaConnectorConfig.from_env()
    ta = request_ticket(
        cfg.wsaa_url,
        cfg.wsaa_service,
        cfg.cert_path,
        cfg.key_path,
    )
    src = "caché local" if ta.from_cache else "WSAA (nuevo TA)"
    print(f"OK — Ticket de acceso ({src})")
    print(f"  token (primeros 24): {ta.token[:24]}…")
    print(f"  sign  (primeros 24): {ta.sign[:24]}…")
    if ta.expiration:
        print(f"  expira: {ta.expiration}")
    return 0


def cmd_inspect_wsdl() -> int:
    wsdl = os.environ.get(
        "ARCA_VE_WSDL",
        "https://stable-middleware-tecno-ext.afip.gob.ar/ve-ws/services/veconsumer?wsdl",
    )
    from .veconsumer_client import list_wsdl_operations

    print(f"WSDL: {wsdl}\n")
    ops = list_wsdl_operations(wsdl)
    for name in ops:
        print(f"  - {name}")
    print(f"\nTotal: {len(ops)} operaciones")
    return 0


def _ve_client():
    from .config import ArcaConnectorConfig
    from .veconsumer_client import VEConsumerClient
    from .wsaa_client import request_ticket

    cfg = ArcaConnectorConfig.from_env()
    ta = request_ticket(
        cfg.wsaa_url,
        cfg.wsaa_service,
        cfg.cert_path,
        cfg.key_path,
    )
    return cfg, VEConsumerClient(cfg.ve_wsdl, ta, cfg.cuit_representada)


def cmd_probe_consultar_estados() -> int:
    from .veconsumer_client import format_soap_fault, history_dump

    _, ve = _ve_client()
    try:
        out = ve.consultar_estados()
    except Exception as e:
        print("Error en consultarEstados:", file=sys.stderr)
        print(format_soap_fault(e), file=sys.stderr)
        history_dump(ve.history, "consultarEstados")
        return 1
    print("OK — consultarEstados")
    print(repr(out)[:4000])
    return 0


def cmd_probe_consultar_comunicaciones() -> int:
    from .veconsumer_client import build_smoke_comunicaciones_filter, format_soap_fault, history_dump

    _, ve = _ve_client()
    flt = build_smoke_comunicaciones_filter()
    print(f"Filtro: {flt}")
    try:
        out = ve.consultar_comunicaciones(flt)
    except Exception as e:
        print("Error en consultarComunicaciones:", file=sys.stderr)
        print(format_soap_fault(e), file=sys.stderr)
        history_dump(ve.history, "consultarComunicaciones")
        return 1
    print("OK — consultarComunicaciones")
    print(repr(out)[:4000])
    return 0


def cmd_smoke_test() -> int:
    """
    Orden: WSAA → consultarEstados → consultarSistemasPublicadores (opcional) → consultarComunicaciones.
    Si consultarSistemasPublicadores falla (p. ej. id inválido), se informa y se sigue al paso (d).
    Recomendado con --debug o ARCA_DEBUG=1 para ver TRA, cert y SOAP.
    """
    from .config import ArcaConnectorConfig
    from .debug_util import configure_logging_debug
    from .veconsumer_client import (
        build_smoke_comunicaciones_filter,
        format_soap_fault,
        history_dump,
        VEConsumerClient,
    )
    from .wsaa_client import request_ticket

    configure_logging_debug()

    print("=== a) WSAA (ticket de acceso) ===")
    cfg = ArcaConnectorConfig.from_env()
    try:
        ta = request_ticket(
            cfg.wsaa_url,
            cfg.wsaa_service,
            cfg.cert_path,
            cfg.key_path,
        )
    except Exception as e:
        print(f"FALLA WSAA: {e}", file=sys.stderr)
        return 1
    src = "caché" if ta.from_cache else "WSAA"
    print(f"OK token/sign ({src}, expira: {ta.expiration or '?'})")

    ve = VEConsumerClient(cfg.ve_wsdl, ta, cfg.cuit_representada)

    print("\n=== b) consultarEstados ===")
    try:
        est = ve.consultar_estados()
        print("OK", repr(est)[:1500])
    except Exception as e:
        print(format_soap_fault(e), file=sys.stderr)
        history_dump(ve.history, "consultarEstados")
        return 2

    print("\n=== c) consultarSistemasPublicadores (opcional; no corta el flujo) ===")
    id_sys = int(os.environ.get("ARCA_SMOKE_ID_SISTEMA_PUBLICADOR", "0") or "0")
    step_c_ok = False
    try:
        sp = ve.consultar_sistemas_publicadores(id_sys)
        print("OK", repr(sp)[:1500])
        step_c_ok = True
    except Exception as e:
        print(
            f"AVISO paso (c): consultarSistemasPublicadores falló "
            f"(idSistemaPublicador={id_sys}). Se continúa con (d).",
            file=sys.stderr,
        )
        print(format_soap_fault(e), file=sys.stderr)
        history_dump(ve.history, "consultarSistemasPublicadores")
        print(
            "Si el error es por id inválido, probá otro ARCA_SMOKE_ID_SISTEMA_PUBLICADOR según manual.",
            file=sys.stderr,
        )

    print("\n=== d) consultarComunicaciones (filtro mínimo + fechas) ===")
    flt = build_smoke_comunicaciones_filter()
    print(f"filter = {flt}")
    try:
        com = ve.consultar_comunicaciones(flt)
        print("OK", repr(com)[:2500])
    except Exception as e:
        print(format_soap_fault(e), file=sys.stderr)
        history_dump(ve.history, "consultarComunicaciones")
        return 4

    print("\n=== smoke-test completado ===")
    if not step_c_ok:
        print(
            "(Nota: el paso (c) consultarSistemasPublicadores no respondió OK; "
            "(d) consultarComunicaciones sí.)",
            file=sys.stderr,
        )
    return 0


def _strip_debug_argv() -> bool:
    """
    Permite --debug en cualquier posición (p. ej. `smoke-test --debug`),
    ya que argparse con subparsers no siempre mezcla bien opciones globales.
    """
    out = [sys.argv[0]]
    seen = False
    for a in sys.argv[1:]:
        if a == "--debug":
            seen = True
        else:
            out.append(a)
    sys.argv[:] = out
    return seen


def main() -> int:
    _load_dotenv()
    if _strip_debug_argv():
        os.environ["ARCA_DEBUG"] = "1"

    parser = argparse.ArgumentParser(
        description="Conector ARCA VEConsumer + WSAA (homologación)",
        epilog="Depuración: colocá --debug en cualquier parte del comando (se elimina del parseo) "
        "o exportá ARCA_DEBUG=1. Escribe en stderr TRA, certificado y SOAP (Zeep).",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    for name, helpt in (
        ("wsaa", "Obtener token y sign vía WSAA"),
        ("inspect-wsdl", "Listar operaciones del WSDL VEConsumer"),
        ("probe-consultar-estados", "WSAA + consultarEstados"),
        ("probe-consultar-comunicaciones", "WSAA + consultarComunicaciones (fechas + paginación)"),
        (
            "smoke-test",
            "Secuencia homologación: WSAA → estados → sistemas publicadores → comunicaciones",
        ),
    ):
        sub.add_parser(name, help=helpt)

    args = parser.parse_args()

    if args.cmd == "wsaa":
        return cmd_wsaa()
    if args.cmd == "inspect-wsdl":
        return cmd_inspect_wsdl()
    if args.cmd == "probe-consultar-estados":
        return cmd_probe_consultar_estados()
    if args.cmd == "probe-consultar-comunicaciones":
        return cmd_probe_consultar_comunicaciones()
    if args.cmd == "smoke-test":
        return cmd_smoke_test()
    return 1


if __name__ == "__main__":
    sys.exit(main())
