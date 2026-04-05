"""
Cliente SOAP para VEConsumer (WSCCOMU / e-Ventanilla).

AuthRequest (solo dentro del body SOAP): token, sign, cuitRepresentada (long).

Con ARCA_DEBUG=1 se adjunta HistoryPlugin (último request/response SOAP en Zeep).
"""

from __future__ import annotations

import sys
from typing import Any

from zeep import Client
from zeep.exceptions import Fault
from zeep.plugins import HistoryPlugin
from zeep.transports import Transport

from .debug_util import dprint, is_arca_debug
from .wsaa_client import TicketAcceso


def dump_zeep_binding_info(client: Client, file=sys.stderr) -> None:
    """Imprime service → port (URL) → operación + firma de entrada."""
    for svc_name, service in client.wsdl.services.items():
        print(f"Service: {svc_name!r}", file=file)
        for port_name, port in service.ports.items():
            loc = port.binding_options.get("address") or port.location or "?"
            print(f"  Port: {port_name!r}  address={loc!r}", file=file)
            for op_name, op in port.binding._operations.items():
                sig = op.input.signature() if op.input else "?"
                print(f"    {op_name}{sig}", file=file)


def format_soap_fault(exc: BaseException) -> str:
    """Texto ampliado para Fault de Zeep (homologación)."""
    if not isinstance(exc, Fault):
        return f"{type(exc).__name__}: {exc}"
    lines = [f"Fault message: {exc.message!r}"]
    if getattr(exc, "code", None):
        lines.append(f"  code: {exc.code!r}")
    detail = getattr(exc, "detail", None)
    if detail is not None:
        try:
            from lxml import etree

            if hasattr(detail, "tag"):
                lines.append("  detail (XML):")
                lines.append(etree.tostring(detail, encoding="unicode", pretty_print=True))
            else:
                lines.append(f"  detail: {detail!r}")
        except Exception:
            lines.append(f"  detail: {detail!r}")
    return "\n".join(lines)


def history_dump(history: HistoryPlugin | None, label: str) -> None:
    if not history:
        return
    dprint(f"[arca-debug] --- {label}: último envío SOAP ---")
    try:
        if history.last_sent:
            dprint(history.last_sent["envelope"])
    except Exception as e:
        dprint(f"(no se pudo leer last_sent: {e})")
    dprint(f"[arca-debug] --- {label}: última respuesta SOAP ---")
    try:
        if history.last_received:
            dprint(history.last_received["envelope"])
    except Exception as e:
        dprint(f"(no se pudo leer last_received: {e})")


class VEConsumerClient:
    def __init__(
        self,
        wsdl_url: str,
        ta: TicketAcceso,
        cuit_representada: str,
        timeout: int = 120,
        *,
        debug: bool | None = None,
    ) -> None:
        self._ta = ta
        self._cuit = int(cuit_representada.replace("-", "").strip())
        self._debug = is_arca_debug() if debug is None else debug
        transport = Transport(timeout=timeout, operation_timeout=timeout)
        self._history: HistoryPlugin | None = None
        plugins: list[Any] = []
        if self._debug:
            self._history = HistoryPlugin()
            plugins.append(self._history)
        self._client = Client(wsdl_url, transport=transport, plugins=plugins)
        if self._debug:
            dprint("[arca-debug] Zeep: binding detectado")
            dump_zeep_binding_info(self._client)

    @property
    def zeep_client(self) -> Client:
        return self._client

    @property
    def history(self) -> HistoryPlugin | None:
        return self._history

    def _auth_request(self) -> dict[str, Any]:
        if self._debug:
            dprint(
                f"[arca-debug] authRequest: token(len)={len(self._ta.token)} "
                f"sign(len)={len(self._ta.sign)} cuitRepresentada={self._cuit}"
            )
        return {
            "token": self._ta.token,
            "sign": self._ta.sign,
            "cuitRepresentada": self._cuit,
        }

    def consultar_estados(self) -> Any:
        return self._client.service.consultarEstados(authRequest=self._auth_request())

    def consultar_comunicaciones(self, filter_: dict[str, Any] | None = None) -> Any:
        """
        filter_: tipo Filter del WSDL (resultadosPorPagina, pagina, fechaDesde/Hasta YYYY-MM-dd, etc.).
        """
        f = filter_ if filter_ is not None else {"pagina": 1, "resultadosPorPagina": 10}
        if self._debug:
            dprint(f"[arca-debug] consultarComunicaciones filter={f!r}")
        return self._client.service.consultarComunicaciones(
            authRequest=self._auth_request(),
            filter=f,
        )

    def consumir_comunicacion(self, id_comunicacion: int, incluir_adjuntos: bool = False) -> Any:
        return self._client.service.consumirComunicacion(
            authRequest=self._auth_request(),
            idComunicacion=id_comunicacion,
            incluirAdjuntos=incluir_adjuntos,
        )

    def consultar_sistemas_publicadores(self, id_sistema_publicador: int = 0) -> Any:
        """
        id_sistema_publicador: usar 0 o el id indicado en manual/WSDL para listar según reglas del servicio.
        """
        if self._debug:
            dprint(f"[arca-debug] consultarSistemasPublicadores idSistemaPublicador={id_sistema_publicador}")
        return self._client.service.consultarSistemasPublicadores(
            authRequest=self._auth_request(),
            idSistemaPublicador=id_sistema_publicador,
        )


def list_wsdl_operations(wsdl_url: str, timeout: int = 60) -> list[str]:
    transport = Transport(timeout=timeout)
    client = Client(wsdl_url, transport=transport)
    names: list[str] = []
    for service in client.wsdl.services.values():
        for port in service.ports.values():
            names.extend(port.binding._operations.keys())
    return sorted(set(names))


def build_smoke_comunicaciones_filter() -> dict[str, Any]:
    """
    Filtro mínimo para homologación. Sobrescribible por env:
      ARCA_SMOKE_FECHA_DESDE, ARCA_SMOKE_FECHA_HASTA (YYYY-MM-dd)
      ARCA_SMOKE_PAGINA (default 1)
      ARCA_SMOKE_RESULTADOS_POR_PAGINA (default 10)
    """
    import os
    from datetime import datetime, timedelta

    now = datetime.now()
    default_desde = (now - timedelta(days=35)).strftime("%Y-%m-%d")
    default_hasta = now.strftime("%Y-%m-%d")
    fd = os.environ.get("ARCA_SMOKE_FECHA_DESDE", default_desde).strip()
    fh = os.environ.get("ARCA_SMOKE_FECHA_HASTA", default_hasta).strip()
    pag = int(os.environ.get("ARCA_SMOKE_PAGINA", "1") or "1")
    n = int(os.environ.get("ARCA_SMOKE_RESULTADOS_POR_PAGINA", "10") or "10")
    return {
        "pagina": pag,
        "resultadosPorPagina": n,
        "fechaDesde": fd,
        "fechaHasta": fh,
    }
