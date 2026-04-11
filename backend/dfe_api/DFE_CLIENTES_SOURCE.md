# DFE: fuente única de clientes (`clientes`)

## Objetivo

El sync DFE (cron y manual masivo) ya **no depende** de mantener CUITs duplicados en `dfe_clients`. La lista de clientes a sincronizar sale de la colección **`clientes`**, campo booleano **`dfeEnabled`**.

## Modelo en `clientes/{docId}`

| Campo | Tipo | Uso |
|-------|------|-----|
| `dfeEnabled` | boolean | Si es `true`, el CUIT de la ficha entra en el sync masivo (cron y `POST /api/dfe/sync`). |
| `cuit` | string | CUIT tal como lo muestra la UI (puede llevar guiones). |
| `cuit11` | string | **11 dígitos**, sin guiones. Lo rellena la app al guardar/importar; el backend lo usa para resolver el documento en sync manual por CUIT. |
| `dfeLastSyncAt` | timestamp | Última corrida de sync que tocó este cliente. |
| `dfeLastSyncOk` | boolean | Si la última corrida terminó bien. |
| `dfeLastSyncError` | string \| null | Mensaje acotado si falló. |
| `dfeLastSyncFechaDesde` / `dfeLastSyncFechaHasta` | string | Ventana consultada a ARCA. |
| `dfeLastSyncWindowDays` | number | Días de ventana. |
| `dfeLastSyncUpserted` | number | Comunicaciones upserted en esa corrida. |
| `dfeLastSyncSource` | string | `scheduler` \| `manual`. |

No se duplica nombre/CUIT en otra colección: el nombre sigue siendo el de la ficha de **Clientes**.

## UI

En **Clientes**, en la ficha, hay un checkbox **“Incluir este cliente en la sincronización…”** que persiste `dfeEnabled`. La lista muestra una pastilla **DFE** cuando está habilitado.

## Backend

- `sync_service.list_enabled_clients`: arma la lista desde **`clientes`** (`dfeEnabled == true`) y, opcionalmente, une CUITs que solo existan en **`dfe_clients`** (ver abajo).
- `sync_service.write_sync_metadata_after_cuit_sync`: escribe los `dfeLastSync*` en **`clientes`** cuando conoce el `cliente_doc_id` del listado; en sync manual también puede resolver por **`cuit11`**. Si no hay ficha en `clientes`, mantiene compatibilidad escribiendo `lastSync*` en **`dfe_clients/{cuit}`**.

## Fallback temporal: `dfe_clients`

Variable de entorno:

| Variable | Default | Significado |
|----------|---------|-------------|
| `DFE_USE_LEGACY_DFE_CLIENTS` | `1` (activo) | Si **no** es `0` / `false` / `no`, se agregan al sync los CUITs que estén en `dfe_clients` con `active` y `dfeEnabled`, **solo si ese CUIT no salió ya de `clientes`**. |

Así podés migrar: marcás `dfeEnabled` en **Clientes** y, cuando ya no necesités el legado, ponés `DFE_USE_LEGACY_DFE_CLIENTS=0` en Cloud Run y dejás de leer `dfe_clients` para el cron.

## Cómo probar

1. **Firestore:** en un cliente de prueba, `dfeEnabled: true` y CUIT válido; opcionalmente comprobar que exista `cuit11` tras guardar desde la app.
2. **API (rol con permiso de sync):** `POST /api/dfe/sync` con token Firebase → debe incluir ese CUIT si cumple la regla.
3. **Cron:** tras desplegar Cloud Run, ejecutar el job o `POST /api/dfe/sync/cron` con OIDC y revisar en el documento del cliente los campos `dfeLastSync*`.
4. **Fallback:** con un CUIT solo en `dfe_clients` (y sin `dfeEnabled` en `clientes`), verificar que sigue entrando mientras el env no deshabilita el legado.

## Pasos para dejar de usar `dfe_clients`

1. Asegurar que **todos** los CUIT que necesitás en DFE tengan ficha en **Clientes** con `dfeEnabled: true` y CUIT/`cuit11` correctos.
2. Poner **`DFE_USE_LEGACY_DFE_CLIENTS=0`** en el servicio Cloud Run (y local si aplica).
3. Redeploy de la API.
4. (Opcional) Archivar o borrar documentos viejos en `dfe_clients`; ajustar reglas de Firestore si ya no deben editarse desde la consola.
5. La colección `dfe_clients` puede quedar vacía o eliminarse a nivel de proceso; el código ya no **lista** desde ahí si el fallback está apagado.
