# Colaboración ATT-WEB (`att_collaboration`)

## Rol

Capa de **metadata interna** compartida entre usuarios del estudio. No reemplaza datos de negocio externos (AFIP, APIs, etc.): solo **estado operativo**, notas y **trazabilidad**.

## Colección Firestore

- **Nombre:** `att_collaboration`
- **ID de documento:** `{moduleId}__{entityKey}`
  - Ejemplo DFE: `dfe__20279722796__610201380` donde `entityKey` = `{CUIT}__{idComunicacion}`.
- **Reglas:** lectura/escritura solo si `canColab()` (superadmin / admin / colaborador con perfil en `users/{uid}`). El rol **lectura** no escribe. Los permisos **por pantalla** (ej. ver módulo DFE) se aplican en la app; Firestore no distingue módulo dentro de esta colección.

## Campos transversales recomendados

| Campo | Uso |
|--------|-----|
| `moduleId` | Identificador corto del módulo (`dfe`, luego `req`, etc.) |
| `entityKey` | Clave estable dentro del módulo |
| `schemaVersion` | Versión del shape del documento |
| `lastUpdatedAt`, `lastUpdatedByUid/Name/Role` | Auditoría del último cambio |
| `activityLog` | Lista de eventos (ver abajo) |

## Esquema de `activityLog`

Cada elemento debería incluir:

- `type` — string (constantes en `constants.js` → `COLLAB_EVENTS`)
- `at` — `Timestamp` (hora del cliente; estable dentro del mapa)
- `byUid`, `byName`, `byRole` — actor
- `payload` — objeto opcional con datos del evento (ej. `{ filename }`), **sin** mezclar con el actor

Eventos antiguos pueden tener `filename` a nivel raíz o `by` en lugar de `byName`: la UI DFE tolera ambos.

## Límite de crecimiento

- En cliente, el array `activityLog` se **recorta** a las últimas **`COLLAB_MAX_ACTIVITY_LOG_ENTRIES`** (100) en cada transacción.
- **Riesgo:** mucha actividad en el mismo documento sigue creciendo en número de campos del doc; el techo duro de Firestore es ~1 MB por documento.
- **Mejora futura recomendada:** subcolección `att_collaboration/{id}/events/{eventId}` con `addDoc` y paginación en UI; el doc padre solo guarda resumen o puntero a “último evento”.

## Concurrencia

- **Nota interna:** *optimistic locking* con `expectedInternalNoteUpdatedAt` (timestamp del servidor al abrir el detalle). Si otro usuario guardó antes, la transacción aborta con `CollabWriteConflictError` y la UI debe mostrar la versión remota.
- **Gestionada:** mismo patrón con `expectedManaged` (boolean visto al abrir).

## Cómo extender a otro módulo

1. Agregar constante en `COLLAB_MODULES`.
2. Definir `entityKey` estable (sin `/`, preferir `[a-zA-Z0-9_-]`).
3. Crear un servicio fino (como `dfe-tracking.service.js`) que llame a `collaborationMergeWithActivity` y `getCollaborationDoc`.
4. Reglas: ya cubren toda `att_collaboration`; no hace falta regla por módulo salvo que quieras separar permisos (entonces claims o colecciones distintas).

## Prueba multiusuario (checklist)

1. Usuario A y B: mismo rol colaborador (o admin), ambos con perfil en `users`.
2. A abre Consultas DFE, consulta, **Ver detalle** de una comunicación.
3. B consulta la misma fila y **Ver detalle**.
4. B guarda una **nota interna** y cierra o deja abierto.
5. A (sin refrescar) intenta **Guardar nota**: debe ver conflicto y texto actualizado desde servidor.
6. **F5** en ambos: misma nota y mismo `activityLog` visible en el modal.
