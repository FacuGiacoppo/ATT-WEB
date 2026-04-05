"""
Conector backend ATT-WEB: WSAA + VEConsumer (comunicaciones e-Ventanilla / ARCA).

Sin automatización de navegador: delegación + web services oficiales.
"""

__version__ = "0.1.0"

from .wsaa_client import WSAARequestError, TicketAcceso, request_ticket  # noqa: E402

__all__ = ["WSAARequestError", "TicketAcceso", "request_ticket", "__version__"]
