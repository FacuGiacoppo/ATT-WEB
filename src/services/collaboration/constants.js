/**
 * Convención transversal ATT-WEB: metadata colaborativa por entidad.
 * Doc ID en Firestore: `${moduleId}__${entityKey}` (entityKey sin caracteres raros).
 */
export const COLLAB_COLLECTION = "att_collaboration";

/** Módulos conocidos (extender al migrar requerimientos, operaciones, etc.). */
export const COLLAB_MODULES = {
  DFE: "dfe",
};

/** Tipos de evento en activityLog (extensible). */
export const COLLAB_EVENTS = {
  VIEWED: "viewed",
  MARKED_MANAGED: "marked_managed",
  UNMARKED_MANAGED: "unmarked_managed",
  NOTE_UPDATED: "note_updated",
  ATTACHMENT_DOWNLOADED: "attachment_downloaded",
};

export const COLLAB_SCHEMA_VERSION = 1;

/**
 * Tope de entradas en `activityLog` por documento (evita acercarse al límite 1MB de Firestore).
 * Se aplica en cada transacción: se conservan las N más recientes.
 * @see src/services/collaboration/COLLABORATION.md — riesgo y alternativa (subcolección events/)
 */
export const COLLAB_MAX_ACTIVITY_LOG_ENTRIES = 100;
