"""Configuración desde variables de entorno."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env(name: str, default: str | None = None) -> str | None:
    v = os.environ.get(name)
    if v is not None and v.strip() != "":
        return v.strip()
    return default


@dataclass(frozen=True)
class ArcaConnectorConfig:
    wsaa_url: str
    wsaa_service: str
    cert_path: str
    key_path: str
    ve_wsdl: str
    cuit_representada: str

    @classmethod
    def from_env(cls) -> ArcaConnectorConfig:
        wsaa = _env("ARCA_WSAA_URL", "https://wsaahomo.afip.gov.ar/ws/services/LoginCms")
        service = _env("ARCA_WSAA_SERVICE", "veconsumerws")
        cert = _env("ARCA_CERT_PATH")
        key = _env("ARCA_KEY_PATH")
        wsdl = _env(
            "ARCA_VE_WSDL",
            "https://stable-middleware-tecno-ext.afip.gob.ar/ve-ws/services/veconsumer?wsdl",
        )
        cuit = _env("ARCA_CUIT_REPRESENTADA", "")
        if not cert or not key:
            raise ValueError("Definí ARCA_CERT_PATH y ARCA_KEY_PATH (PEM del certificado de firma).")
        if not cuit:
            raise ValueError("Definí ARCA_CUIT_REPRESENTADA (11 dígitos, sin guiones).")
        return cls(
            wsaa_url=wsaa,
            wsaa_service=service,
            cert_path=cert,
            key_path=key,
            ve_wsdl=wsdl,
            cuit_representada=cuit.replace("-", "").strip(),
        )
