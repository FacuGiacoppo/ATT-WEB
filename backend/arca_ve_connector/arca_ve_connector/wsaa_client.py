"""
Cliente WSAA (AFIP): TRA → firma CMS (OpenSSL) → LoginCms → token + sign.

Requiere certificado .crt/.pem y clave privada .key en formato PEM.
El nombre del servicio (ej. veconsumerws) debe coincidir con el manual del WSN.

Homologación: generationTime suele ir algunos minutos en el pasado respecto del
reloj del servidor WSAA para evitar rechazos por desfase (ver ayuda WSAA).
"""

from __future__ import annotations

import base64
import re
import subprocess
import tempfile
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

import requests

from .debug_util import dprint, is_arca_debug
from .ta_cache import (
    cache_fingerprint_key,
    default_cache_path,
    load_cached_ta,
    save_cached_ta,
)

# ARCA/AFIP usa -03:00 en el TRA
_AR = timezone(timedelta(hours=-3))

# Minutos a restar al "ahora" para generationTime (recomendación práctica WSAA)
TRA_GENERATION_SKEW_MINUTES = 5
# Ventana entre generation y expiration
TRA_VALIDITY_MINUTES = 10


@dataclass(frozen=True)
class TicketAcceso:
    token: str
    sign: str
    expiration: str | None
    from_cache: bool = False


class WSAARequestError(Exception):
    """Error al obtener el ticket WSAA (HTTP no OK, SOAP Fault o cuerpo inesperado)."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        fault: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.fault = fault


def _tra_datetimes() -> tuple[datetime, datetime]:
    """
    generationTime = ahora_AR − skew (evita errores si el reloj local va adelante).
    expirationTime = generationTime + TRA_VALIDITY_MINUTES.
    """
    now = datetime.now(_AR)
    gen = now - timedelta(minutes=TRA_GENERATION_SKEW_MINUTES)
    exp = gen + timedelta(minutes=TRA_VALIDITY_MINUTES)
    return gen, exp


def _fmt_ar(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S-03:00")


def build_login_ticket_request_xml(service: str) -> str:
    gen_dt, exp_dt = _tra_datetimes()
    unique = int(time.time()) % 1_000_000_000 + (uuid.uuid4().int % 10_000)
    gen, exp = _fmt_ar(gen_dt), _fmt_ar(exp_dt)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>{unique}</uniqueId>
    <generationTime>{gen}</generationTime>
    <expirationTime>{exp}</expirationTime>
  </header>
  <service>{service}</service>
</loginTicketRequest>
"""


def log_certificate_subject_issuer(cert_path: str) -> None:
    """Información del certificado PEM (openssl x509)."""
    cert = Path(cert_path).expanduser().resolve()
    if not cert.is_file():
        dprint(f"[arca-debug] certificado no encontrado: {cert}")
        return
    try:
        proc = subprocess.run(
            ["openssl", "x509", "-in", str(cert), "-noout", "-subject", "-issuer", "-dates"],
            check=True,
            capture_output=True,
            text=True,
        )
        dprint("[arca-debug] Certificado (openssl x509):")
        for line in proc.stdout.strip().splitlines():
            dprint(f"  {line}")
    except FileNotFoundError:
        dprint("[arca-debug] openssl no está en PATH; no se pudo leer subject/issuer.")
    except subprocess.CalledProcessError as e:
        dprint(f"[arca-debug] openssl x509 falló: {e.stderr or e}")


def sign_tra_openssl(tra_xml: str, cert_path: str, key_path: str) -> bytes:
    """Firma el TRA en PKCS#7 DER (nodetach) usando el binario openssl."""
    cert = Path(cert_path).expanduser().resolve()
    key = Path(key_path).expanduser().resolve()
    if not cert.is_file() or not key.is_file():
        raise FileNotFoundError(f"Cert o key inexistente: {cert} / {key}")

    with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False, encoding="utf-8") as f_in:
        f_in.write(tra_xml)
        tra_path = f_in.name
    cms_path = tra_path + ".cms"
    try:
        subprocess.run(
            [
                "openssl",
                "smime",
                "-sign",
                "-signer",
                str(cert),
                "-inkey",
                str(key),
                "-nodetach",
                "-outform",
                "DER",
                "-in",
                tra_path,
                "-out",
                cms_path,
            ],
            check=True,
            capture_output=True,
        )
        return Path(cms_path).read_bytes()
    finally:
        Path(tra_path).unlink(missing_ok=True)
        Path(cms_path).unlink(missing_ok=True)


def _soap_login_cms(cms_der_b64: str) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>{cms_der_b64}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>
"""


def _extract_inner_ticket_xml(soap_body: str) -> str:
    m = re.search(r"<loginCmsReturn[^>]*>(.*?)</loginCmsReturn>", soap_body, re.DOTALL)
    if not m:
        raise ValueError("Respuesta WSAA sin loginCmsReturn")
    inner = m.group(1).strip()
    inner = inner.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
    if inner.startswith("<?xml") or "<loginTicketResponse" in inner:
        return inner
    try:
        decoded = base64.b64decode(inner).decode("utf-8", errors="replace")
        if "<loginTicketResponse" in decoded or "<credentials" in decoded:
            return decoded
    except Exception:
        pass
    return inner


def _parse_ticket_xml(xml_str: str) -> TicketAcceso:
    token_m = re.search(r"<token[^>]*>([^<]+)</token>", xml_str)
    sign_m = re.search(r"<sign[^>]*>([^<]+)</sign>", xml_str)
    exp_m = re.search(r"<expirationTime[^>]*>([^<]+)</expirationTime>", xml_str)
    if not token_m or not sign_m:
        t = s = exp_val = None
        try:
            for el in ET.fromstring(xml_str).iter():
                tag = el.tag.split("}")[-1] if "}" in el.tag else el.tag
                if tag == "token" and el.text:
                    t = el.text.strip()
                elif tag == "sign" and el.text:
                    s = el.text.strip()
                elif tag == "expirationTime" and el.text:
                    exp_val = el.text.strip()
        except ET.ParseError:
            pass
        if t and s:
            return TicketAcceso(token=t, sign=s, expiration=exp_val, from_cache=False)
        raise ValueError(f"No se pudo parsear token/sign en respuesta WSAA: {xml_str[:500]}...")
    exp = exp_m.group(1).strip() if exp_m else None
    return TicketAcceso(
        token=token_m.group(1).strip(),
        sign=sign_m.group(1).strip(),
        expiration=exp,
        from_cache=False,
    )


def _looks_like_soap_fault(text: str) -> bool:
    """No buscar 'faultstring' en el cuerpo crudo: el base64 de loginCmsReturn podría contener esa subcadena."""
    if not text:
        return False
    return bool(re.search(r"<[^>]*:Fault\b", text) or re.search(r"<Fault\b", text, re.I))


def _parse_soap_fault_elements(text: str) -> dict[str, str]:
    """
    Extrae faultcode, faultstring y detail de una respuesta SOAP (cualquier prefijo de namespace).
    """
    out: dict[str, str] = {}
    for tag in ("faultcode", "faultstring", "detail"):
        m = re.search(
            rf"<(?:[\w.-]+:)?{tag}\b[^>]*>([\s\S]*?)</(?:[\w.-]+:)?{tag}\s*>",
            text,
            re.IGNORECASE,
        )
        if not m:
            continue
        raw = m.group(1).strip()
        raw = (
            raw.replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&amp;", "&")
            .replace("&quot;", '"')
            .replace("&#039;", "'")
        )
        out[tag] = raw
    return out


def _format_wsaa_fault_message(fault: dict[str, str], body: str) -> str:
    parts: list[str] = []
    if fault.get("faultcode"):
        parts.append(f"faultcode={fault['faultcode']}")
    if fault.get("faultstring"):
        parts.append(f"faultstring={fault['faultstring']}")
    if fault.get("detail"):
        det = fault["detail"]
        if len(det) > 4000:
            det = det[:4000] + "…"
        parts.append(f"detail={det}")
    if parts:
        return "WSAA SOAP Fault: " + " | ".join(parts)
    snippet = (body or "")[:2000]
    return f"WSAA SOAP Fault (sin faultcode/faultstring/detail parseables): {snippet!r}"


def _is_already_authenticated_fault(fault: dict[str, str], raw_text: str) -> bool:
    """WSAA coe.alreadyAuthenticated: el CEE ya tiene un TA válido para ese WSN."""
    fs = (fault.get("faultstring") or "").lower()
    blob = " ".join(
        [
            fault.get("faultcode") or "",
            fault.get("faultstring") or "",
            fault.get("detail") or "",
            raw_text,
        ]
    ).lower()
    compact = blob.replace(".", "").replace("_", "")
    if "alreadyauthenticated" in compact:
        return True
    if "ya posee" in fs and "ta" in fs and ("válido" in fs or "valido" in fs):
        return True
    return False


def _debug_wsaa_response(r: requests.Response, text: str) -> None:
    dprint(f"[arca-debug] WSAA HTTP status_code: {r.status_code}")
    for hk in ("Content-Type", "Content-Length", "Server", "Date"):
        if hk in r.headers:
            dprint(f"[arca-debug]   {hk}: {r.headers[hk]}")
    dprint("[arca-debug] WSAA response body (completo):")
    dprint(text if text else "(vacío)")


def request_ticket(
    wsaa_url: str,
    service: str,
    cert_path: str,
    key_path: str,
    timeout: int = 60,
    *,
    debug: bool | None = None,
    cache_path: Path | None = None,
) -> TicketAcceso:
    dbg = is_arca_debug() if debug is None else debug
    path = cache_path or default_cache_path()
    fp = cache_fingerprint_key(wsaa_url, service, cert_path, key_path)

    cached = load_cached_ta(path, fp, wsaa_url, service)
    if cached:
        tok, sig, exp = cached
        if dbg:
            dprint("[arca-debug] Reutilizando TA desde caché local (aún vigente).")
        return TicketAcceso(token=tok, sign=sig, expiration=exp, from_cache=True)

    if dbg:
        log_certificate_subject_issuer(cert_path)

    tra = build_login_ticket_request_xml(service)
    if dbg:
        dprint("[arca-debug] TRA XML (antes de firmar con openssl):")
        dprint(tra)

    cms_der = sign_tra_openssl(tra, cert_path, key_path)
    cms_b64 = base64.b64encode(cms_der).decode("ascii")
    soap = _soap_login_cms(cms_b64)
    headers = {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": '""',
    }
    r = requests.post(wsaa_url, data=soap.encode("utf-8"), headers=headers, timeout=timeout)
    text = r.text if r.text is not None else ""

    if dbg:
        _debug_wsaa_response(r, text)

    fault_fields = _parse_soap_fault_elements(text)
    soap_fault = _looks_like_soap_fault(text)

    if fault_fields or soap_fault:
        if dbg:
            if fault_fields.get("faultcode"):
                dprint(f"[arca-debug] SOAP Fault faultcode: {fault_fields['faultcode']}")
            if fault_fields.get("faultstring"):
                dprint(f"[arca-debug] SOAP Fault faultstring: {fault_fields['faultstring']}")
            if fault_fields.get("detail"):
                dprint(f"[arca-debug] SOAP Fault detail: {fault_fields['detail']}")

        if _is_already_authenticated_fault(fault_fields, text):
            cached2 = load_cached_ta(path, fp, wsaa_url, service)
            if cached2:
                tok, sig, exp = cached2
                if dbg:
                    dprint(
                        "[arca-debug] WSAA coe.alreadyAuthenticated: "
                        "usando TA vigente desde caché local."
                    )
                return TicketAcceso(token=tok, sign=sig, expiration=exp, from_cache=True)
            raise WSAARequestError(
                "WSAA devolvió coe.alreadyAuthenticated (el CEE ya tiene un TA válido para este WSN) "
                "pero no hay un TA vigente en caché local. "
                "Esperá a que expire el TA en el servidor, reintentá en unos minutos, "
                "o ejecutá desde el mismo equipo donde se obtuvo el último TA.",
                status_code=r.status_code,
                fault=fault_fields or None,
            )

        msg = _format_wsaa_fault_message(fault_fields, text)
        raise WSAARequestError(msg, status_code=r.status_code, fault=fault_fields or None)

    if r.status_code >= 400:
        snippet = text[:3000] if text else "(sin cuerpo)"
        raise WSAARequestError(
            f"WSAA HTTP {r.status_code} sin SOAP Fault reconocible. Cuerpo (inicio): {snippet!r}",
            status_code=r.status_code,
            fault=None,
        )

    try:
        inner = _extract_inner_ticket_xml(text)
    except ValueError as e:
        raise WSAARequestError(
            f"Respuesta WSAA inesperada (HTTP {r.status_code}): {e}. Cuerpo (inicio): {text[:2000]!r}",
            status_code=r.status_code,
        ) from e

    try:
        ta = _parse_ticket_xml(inner)
    except ValueError as e:
        raise WSAARequestError(
            f"No se pudo obtener token/sign (HTTP {r.status_code}): {e}",
            status_code=r.status_code,
        ) from e

    save_cached_ta(path, fp, wsaa_url, service, ta.token, ta.sign, ta.expiration)
    if dbg:
        dprint(f"[arca-debug] TA guardado en caché: {path}")
    return ta
