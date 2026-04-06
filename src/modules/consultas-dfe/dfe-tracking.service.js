import { doc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

import { db } from "../../config/firebase.js";
import { COLLAB_MODULES, COLLAB_EVENTS } from "../../services/collaboration/constants.js";
import {
  collabActorFromUser,
  collaborationMergeWithActivity,
  getCollaborationDoc,
  assertNoteWriteBaseline,
  assertManagedWriteBaseline,
} from "../../services/collaboration/collaboration.service.js";

const LEGACY_COL = "dfe_tracking";

function docIdLegacy(cuitRepresentada, idComunicacion) {
  const c = String(cuitRepresentada || "").replace(/\D/g, "");
  const id = String(idComunicacion || "").trim();
  return `${c}__${id}`;
}

/**
 * Lee metadata DFE: primero `att_collaboration`, si no hay doc cae a `dfe_tracking` (misma clave).
 */
async function getDfeTrackingMerged(cuitRepresentada, idComunicacion) {
  const key = docIdLegacy(cuitRepresentada, idComunicacion);
  let data = await getCollaborationDoc(COLLAB_MODULES.DFE, key);
  if (!data) {
    const snap = await getDoc(doc(db, LEGACY_COL, key));
    data = snap.exists() ? snap.data() : null;
  }
  return data;
}

export async function getTracking(cuitRepresentada, idComunicacion) {
  return getDfeTrackingMerged(cuitRepresentada, idComunicacion);
}

export async function getTrackingBatch(cuitRepresentada, ids) {
  const out = {};
  const uniq = Array.from(new Set((ids || []).map((x) => String(x))));
  await Promise.all(
    uniq.map(async (id) => {
      out[id] = await getDfeTrackingMerged(cuitRepresentada, id);
    })
  );
  return out;
}

export async function markViewedInApp({ cuitRepresentada, idComunicacion, user }) {
  const c = String(cuitRepresentada || "").replace(/\D/g, "");
  const idNum = Number(idComunicacion);
  const entityKey = docIdLegacy(c, idNum);

  await collaborationMergeWithActivity(
    COLLAB_MODULES.DFE,
    entityKey,
    user,
    (prev, u) => {
      const a = collabActorFromUser(u);
      const now = serverTimestamp();
      const base = {
        cuitRepresentada: c,
        idComunicacion: idNum,
        firstSeenAt: prev?.firstSeenAt || now,
        viewedInApp: true,
        viewedInAppAt: now,
        lastViewedAt: now,
        lastViewedBy: a.name,
        lastViewedByUid: a.uid,
        lastViewedByRole: a.role,
      };
      if (!prev?.firstViewedAt) {
        return {
          ...base,
          firstViewedAt: now,
          firstViewedBy: a.name,
          firstViewedByUid: a.uid,
          firstViewedByRole: a.role,
        };
      }
      return base;
    },
    COLLAB_EVENTS.VIEWED,
    {}
  );
}

/**
 * @param {object} opts
 * @param {boolean} [opts.expectedManaged] managed visto al abrir el detalle (concurrencia)
 */
export async function setManaged({ cuitRepresentada, idComunicacion, managed, user, expectedManaged }) {
  const c = String(cuitRepresentada || "").replace(/\D/g, "");
  const idNum = Number(idComunicacion);
  const entityKey = docIdLegacy(c, idNum);
  const isManaged = Boolean(managed);

  await collaborationMergeWithActivity(
    COLLAB_MODULES.DFE,
    entityKey,
    user,
    (prev, u) => {
      assertManagedWriteBaseline(prev, expectedManaged);
      const a = collabActorFromUser(u);
      const now = serverTimestamp();
      return {
        cuitRepresentada: c,
        idComunicacion: idNum,
        firstSeenAt: prev?.firstSeenAt || now,
        managed: isManaged,
        managedAt: isManaged ? now : null,
        managedBy: isManaged ? a.name : null,
        managedByUid: isManaged ? a.uid : null,
        managedByRole: isManaged ? a.role : null,
      };
    },
    isManaged ? COLLAB_EVENTS.MARKED_MANAGED : COLLAB_EVENTS.UNMARKED_MANAGED,
    {}
  );
}

/**
 * @param {object} opts
 * @param opts.expectedInternalNoteUpdatedAt timestamp del servidor al abrir el modal (optimistic locking)
 */
export async function saveInternalNote({
  cuitRepresentada,
  idComunicacion,
  note,
  user,
  expectedInternalNoteUpdatedAt,
}) {
  const c = String(cuitRepresentada || "").replace(/\D/g, "");
  const idNum = Number(idComunicacion);
  const entityKey = docIdLegacy(c, idNum);

  await collaborationMergeWithActivity(
    COLLAB_MODULES.DFE,
    entityKey,
    user,
    (prev, u) => {
      assertNoteWriteBaseline(prev, expectedInternalNoteUpdatedAt ?? null);
      const a = collabActorFromUser(u);
      const now = serverTimestamp();
      return {
        cuitRepresentada: c,
        idComunicacion: idNum,
        firstSeenAt: prev?.firstSeenAt || now,
        internalNote: String(note || "").slice(0, 4000),
        internalNoteUpdatedAt: now,
        internalNoteUpdatedBy: a.name,
        internalNoteUpdatedByUid: a.uid,
        internalNoteUpdatedByRole: a.role,
      };
    },
    COLLAB_EVENTS.NOTE_UPDATED,
    {}
  );
}

export async function logAttachmentDownload({ cuitRepresentada, idComunicacion, filename, user }) {
  const c = String(cuitRepresentada || "").replace(/\D/g, "");
  const idNum = Number(idComunicacion);
  const entityKey = docIdLegacy(c, idNum);

  await collaborationMergeWithActivity(
    COLLAB_MODULES.DFE,
    entityKey,
    user,
    (prev) => {
      const now = serverTimestamp();
      return {
        cuitRepresentada: c,
        idComunicacion: idNum,
        firstSeenAt: prev?.firstSeenAt || now,
      };
    },
    COLLAB_EVENTS.ATTACHMENT_DOWNLOADED,
    { filename: filename || null }
  );
}
