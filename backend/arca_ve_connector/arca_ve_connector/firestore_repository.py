"""
Persistencia en Firestore (opcional).

Descomentá google-cloud-firestore en requirements.txt y configurá
GOOGLE_APPLICATION_CREDENTIALS para usar esta capa.

Estructura sugerida (charla de diseño):
- clientes/{clienteId}/comunicaciones/{idComunicacion}
- arca_integrations/config (tenant)
"""

from __future__ import annotations

from typing import Any


class FirestoreComunicacionesRepository:
    """Stub: reemplazar con Client de firebase-admin o google.cloud.firestore."""

    def __init__(self, _project_id: str | None = None) -> None:
        raise NotImplementedError(
            "Instalá google-cloud-firestore y credenciales; "
            "implementá colecciones según README del conector."
        )

    def upsert_comunicacion(self, cuit: str, payload: dict[str, Any]) -> None:
        raise NotImplementedError

    def get_last_sync_marker(self, cuit: str) -> Any:
        raise NotImplementedError
