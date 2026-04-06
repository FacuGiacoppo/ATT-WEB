import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  arrayUnion,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

import { db } from "../../config/firebase.js";

const COL = "dfe_tracking";

/** Firestore no admite bien `serverTimestamp()` dentro de mapas en `arrayUnion`; usamos Timestamp del cliente. */
function nowForActivityLog() {
  return Timestamp.now();
}

function docId(cuitRepresentada, idComunicacion) {
  const c = String(cuitRepresentada || "").replace(/\D/g, "");
  const id = String(idComunicacion || "").trim();
  return `${c}__${id}`;
}

function refFor(cuitRepresentada, idComunicacion) {
  return doc(db, COL, docId(cuitRepresentada, idComunicacion));
}

export async function getTracking(cuitRepresentada, idComunicacion) {
  const snap = await getDoc(refFor(cuitRepresentada, idComunicacion));
  return snap.exists() ? snap.data() : null;
}

export async function getTrackingBatch(cuitRepresentada, ids) {
  const out = {};
  const uniq = Array.from(new Set((ids || []).map((x) => String(x))));
  const snaps = await Promise.all(uniq.map((id) => getDoc(refFor(cuitRepresentada, id))));
  for (let i = 0; i < uniq.length; i += 1) {
    const s = snaps[i];
    out[uniq[i]] = s.exists() ? s.data() : null;
  }
  return out;
}

export async function markViewedInApp({ cuitRepresentada, idComunicacion, user }) {
  const ref = refFor(cuitRepresentada, idComunicacion);
  const uid = user?.uid ?? null;
  const name = user?.name ?? user?.email ?? null;
  await setDoc(
    ref,
    {
      cuitRepresentada: String(cuitRepresentada || "").replace(/\D/g, ""),
      idComunicacion: Number(idComunicacion),
      firstSeenAt: serverTimestamp(),
      viewedInApp: true,
      viewedInAppAt: serverTimestamp(),
      firstViewedAt: serverTimestamp(),
      firstViewedBy: name,
      firstViewedByUid: uid,
      lastViewedAt: serverTimestamp(),
      lastViewedBy: name,
      lastViewedByUid: uid,
      activityLog: arrayUnion({
        type: "viewed",
        at: nowForActivityLog(),
        by: name,
        byUid: uid,
      }),
    },
    { merge: true }
  );
}

export async function setManaged({ cuitRepresentada, idComunicacion, managed, user }) {
  const ref = refFor(cuitRepresentada, idComunicacion);
  const uid = user?.uid ?? null;
  const name = user?.name ?? user?.email ?? null;
  const isManaged = Boolean(managed);
  await setDoc(
    ref,
    {
      cuitRepresentada: String(cuitRepresentada || "").replace(/\D/g, ""),
      idComunicacion: Number(idComunicacion),
      firstSeenAt: serverTimestamp(),
      managed: isManaged,
      managedAt: isManaged ? serverTimestamp() : null,
      managedBy: isManaged ? name : null,
      managedByUid: isManaged ? uid : null,
      activityLog: arrayUnion({
        type: isManaged ? "marked_managed" : "unmarked_managed",
        at: nowForActivityLog(),
        by: name,
        byUid: uid,
      }),
    },
    { merge: true }
  );
}

export async function saveInternalNote({ cuitRepresentada, idComunicacion, note, user }) {
  const ref = refFor(cuitRepresentada, idComunicacion);
  const uid = user?.uid ?? null;
  const name = user?.name ?? user?.email ?? null;
  await setDoc(
    ref,
    {
      cuitRepresentada: String(cuitRepresentada || "").replace(/\D/g, ""),
      idComunicacion: Number(idComunicacion),
      firstSeenAt: serverTimestamp(),
      internalNote: String(note || "").slice(0, 4000),
      internalNoteUpdatedAt: serverTimestamp(),
      internalNoteUpdatedBy: name,
      internalNoteUpdatedByUid: uid,
      activityLog: arrayUnion({
        type: "note_updated",
        at: nowForActivityLog(),
        by: name,
        byUid: uid,
      }),
    },
    { merge: true }
  );
}

export async function logAttachmentDownload({ cuitRepresentada, idComunicacion, filename, user }) {
  const ref = refFor(cuitRepresentada, idComunicacion);
  const uid = user?.uid ?? null;
  const name = user?.name ?? user?.email ?? null;
  await setDoc(
    ref,
    {
      cuitRepresentada: String(cuitRepresentada || "").replace(/\D/g, ""),
      idComunicacion: Number(idComunicacion),
      firstSeenAt: serverTimestamp(),
      activityLog: arrayUnion({
        type: "attachment_downloaded",
        at: nowForActivityLog(),
        by: name,
        byUid: uid,
        filename: filename || null,
      }),
    },
    { merge: true }
  );
}
