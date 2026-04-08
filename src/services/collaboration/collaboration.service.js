/**
 * Capa transversal de persistencia colaborativa (Firestore).
 * Separación: datos de negocio externos (AFIP, etc.) vs metadata interna ATT-WEB.
 *
 * @see ./COLLABORATION.md
 */
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

import { db } from "../../config/firebase.js";
import {
  COLLAB_COLLECTION,
  COLLAB_SCHEMA_VERSION,
  COLLAB_MAX_ACTIVITY_LOG_ENTRIES,
} from "./constants.js";

function omitUndefined(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** @param {object|null|undefined} user */
export function collabActorFromUser(user) {
  return {
    uid: user?.uid ?? null,
    name: user?.name ?? user?.email ?? null,
    role: user?.role ?? null,
  };
}

/**
 * Conflicto de escritura (nota o estado gestionado) detectado en transacción.
 * No silenciar: el caller debe mostrar UI y/o recargar metadata.
 */
export class CollabWriteConflictError extends Error {
  /**
   * @param {"note" | "managed"} kind
   * @param {string} message
   * @param {object} [remote]
   */
  constructor(kind, message, remote = null) {
    super(message);
    this.name = "CollabWriteConflictError";
    this.kind = kind;
    this.remote = remote;
  }
}

/** Normaliza Timestamp de Firestore (SDK web) u objeto plano con seconds. */
export function timestampToMillis(ts) {
  if (ts == null) return null;
  if (typeof ts.toMillis === "function") {
    try {
      return ts.toMillis();
    } catch {
      return null;
    }
  }
  const sec = typeof ts.seconds === "number" ? ts.seconds : ts._seconds;
  if (typeof sec !== "number") return null;
  const nano = typeof ts.nanoseconds === "number" ? ts.nanoseconds : ts._nanoseconds ?? 0;
  return sec * 1000 + Math.floor(nano / 1e6);
}

export function timestampsEqual(a, b) {
  const ma = timestampToMillis(a);
  const mb = timestampToMillis(b);
  if (ma == null || mb == null) return false;
  return ma === mb;
}

/**
 * ¿Podemos guardar la nota sin pisar un cambio ajeno?
 * - Sin baseline y sin nota previa en servidor: OK.
 * - Sin baseline pero ya hay nota en servidor: conflicto (alguien escribió antes de que abrieras / condición de carrera).
 * - Con baseline: el servidor debe seguir con el mismo internalNoteUpdatedAt.
 */
export function assertNoteWriteBaseline(prev, baselineInternalNoteUpdatedAt) {
  const prevTs = prev?.internalNoteUpdatedAt;
  const hasPrevNote = Boolean(prevTs);
  const hasBaseline = baselineInternalNoteUpdatedAt != null && timestampToMillis(baselineInternalNoteUpdatedAt) != null;

  if (!hasBaseline && !hasPrevNote) return;
  if (!hasBaseline && hasPrevNote) {
    throw new CollabWriteConflictError(
      "note",
      "La nota fue actualizada por otro usuario antes de guardar. Se muestra la versión del servidor.",
      { internalNote: prev?.internalNote, internalNoteUpdatedAt: prev?.internalNoteUpdatedAt }
    );
  }
  if (hasBaseline && !hasPrevNote) {
    throw new CollabWriteConflictError(
      "note",
      "La nota cambió en el servidor. Actualizá el detalle y volvé a intentar.",
      { internalNote: prev?.internalNote, internalNoteUpdatedAt: prev?.internalNoteUpdatedAt }
    );
  }
  if (!timestampsEqual(prevTs, baselineInternalNoteUpdatedAt)) {
    throw new CollabWriteConflictError(
      "note",
      "La nota fue modificada por otro usuario. Se muestra la versión del servidor.",
      { internalNote: prev?.internalNote, internalNoteUpdatedAt: prev?.internalNoteUpdatedAt }
    );
  }
}

/**
 * @param {boolean} expectedManaged estado `managed` que el usuario vio al abrir el modal
 */
export function assertManagedWriteBaseline(prev, expectedManaged) {
  if (typeof expectedManaged !== "boolean") return;
  const cur = Boolean(prev?.managed);
  if (cur !== expectedManaged) {
    throw new CollabWriteConflictError(
      "managed",
      "El estado gestionado cambió en el servidor (otro usuario). Se actualizó la vista.",
      { managed: prev?.managed, managedAt: prev?.managedAt, managedBy: prev?.managedBy }
    );
  }
}

/**
 * @param {string} moduleId
 * @param {string} entityKey clave estable dentro del módulo (ej. CUIT__idComunicacion)
 */
export function collabDocumentId(moduleId, entityKey) {
  const m = String(moduleId || "").trim();
  const e = String(entityKey || "").trim();
  if (!m || !e) throw new Error("collabDocumentId: moduleId y entityKey son obligatorios");
  return `${m}__${e}`;
}

export function collabRef(moduleId, entityKey) {
  return doc(db, COLLAB_COLLECTION, collabDocumentId(moduleId, entityKey));
}

/**
 * Evento de actividad (esquema estable).
 * - type, at, byUid, byName, byRole
 * - payload: datos extra (ej. { filename }) — no mezclar con campos de actor
 */
export function buildActivityEntry(type, user, payload = {}) {
  const a = collabActorFromUser(user);
  const entry = omitUndefined({
    type: String(type),
    at: Timestamp.now(),
    byUid: a.uid,
    byName: a.name,
    byRole: a.role,
  });
  const p = omitUndefined(payload);
  if (Object.keys(p).length) entry.payload = p;
  return entry;
}

function appendCappedActivityLog(prev, entry, maxLen) {
  const prevLog = Array.isArray(prev?.activityLog) ? [...prev.activityLog] : [];
  const next = [...prevLog, entry];
  if (next.length <= maxLen) return next;
  return next.slice(-maxLen);
}

/**
 * Lectura simple (solo colección nueva).
 */
export async function getCollaborationDoc(moduleId, entityKey) {
  const snap = await getDoc(collabRef(moduleId, entityKey));
  return snap.exists() ? snap.data() : null;
}

/**
 * Merge transaccional + un evento en activityLog (array acotado).
 * mergeFn(prev, user) → campos a persistir (sin FieldValue salvo que se documente).
 *
 * @param {string} moduleId
 * @param {string} entityKey
 * @param {object|null} user
 * @param {(prev: object|null, user: object|null) => object} mergeFn
 * @param {string} activityType
 * @param {object} [activityPayload]
 */
export async function collaborationMergeWithActivity(
  moduleId,
  entityKey,
  user,
  mergeFn,
  activityType,
  activityPayload = {}
) {
  const id = collabDocumentId(moduleId, entityKey);
  const ref = doc(db, COLLAB_COLLECTION, id);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists() ? snap.data() : null;
    const patch = omitUndefined(mergeFn(prev, user) || {});
    const actor = collabActorFromUser(user);
    const entry = buildActivityEntry(activityType, user, activityPayload);
    const nextLog = appendCappedActivityLog(prev, entry, COLLAB_MAX_ACTIVITY_LOG_ENTRIES);

    tx.set(
      ref,
      omitUndefined({
        moduleId,
        entityKey,
        schemaVersion: COLLAB_SCHEMA_VERSION,
        ...patch,
        lastUpdatedAt: serverTimestamp(),
        lastUpdatedByUid: actor.uid,
        lastUpdatedByName: actor.name,
        lastUpdatedByRole: actor.role,
        activityLog: nextLog,
      }),
      { merge: true }
    );
  });
}

/**
 * Merge transaccional SIN activityLog.
 * Útil para estados agregados (lectores únicos, comentarios) donde no queremos un historial verboso.
 *
 * @param {string} moduleId
 * @param {string} entityKey
 * @param {object|null} user
 * @param {(prev: object|null, user: object|null) => object} mergeFn
 */
export async function collaborationMerge(moduleId, entityKey, user, mergeFn) {
  const id = collabDocumentId(moduleId, entityKey);
  const ref = doc(db, COLLAB_COLLECTION, id);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists() ? snap.data() : null;
    const patch = omitUndefined(mergeFn(prev, user) || {});
    const actor = collabActorFromUser(user);

    tx.set(
      ref,
      omitUndefined({
        moduleId,
        entityKey,
        schemaVersion: COLLAB_SCHEMA_VERSION,
        ...patch,
        lastUpdatedAt: serverTimestamp(),
        lastUpdatedByUid: actor.uid,
        lastUpdatedByName: actor.name,
        lastUpdatedByRole: actor.role,
      }),
      { merge: true }
    );
  });
}
