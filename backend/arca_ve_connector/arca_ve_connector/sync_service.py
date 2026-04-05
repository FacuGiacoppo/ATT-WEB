"""
Sincronización incremental comunicaciones ARCA → almacén propio (Etapa 3+).

Diseño previsto:
- Por cada CUIT con delegación activa: consultarComunicaciones paginado.
- Dedupe por idComunicacion; actualizar estados y adjuntos.
- Emitir alertas para novedades.

Este módulo queda como contrato; la implementación se completa cuando Firestore
y reglas de negocio estén definidas.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from .veconsumer_client import VEConsumerClient


class ComunicacionesRepository(Protocol):
    def upsert_comunicacion(self, cuit: str, payload: dict[str, Any]) -> None: ...
    def get_last_sync_marker(self, cuit: str) -> Any: ...


def sync_cuit_stub(_client: VEConsumerClient, _cuit: str, _repo: ComunicacionesRepository) -> int:
    """Placeholder: devolvería cantidad de registros nuevos/actualizados."""
    raise NotImplementedError("Implementar en Etapa 3 (Firestore + paginado real).")
