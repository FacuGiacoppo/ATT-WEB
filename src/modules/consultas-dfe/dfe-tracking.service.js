import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

import { db } from "../../config/firebase.js";

const COL = "dfe_tracking";

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
  const base = {
    cuitRepresentada: String(cuitRepresentada || "").replace(/\D/g, ""),
    idComunicacion: Number(idComunicacion),
    firstSeenAt: serverTimestamp(),
  };
  // upsert básico (si no existe)
  await setDoc(ref, base, { merge: true });

  const uid = user?.uid ?? null;
  const name = user?.name ?? user?.email ?? null;
  await updateDoc(ref, {
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
      at: serverTimestamp(),
      by: name,
      byUid: uid,
    }),
  });
}

export async function setManaged({ cuitRepresentada, idComunicacion, managed, user }) {
  const ref = refFor(cuitRepresentada, idComunicacion);
  const uid = user?.uid ?? null;
  const name = user?.name ?? user?.email ?? null;
  await setDoc(
    ref,
    {
      cuitRepresentada: String(cuitRepresentada || "").replace(/\D/g, ""),
      idComunicacion: Number(idComunicacion),
      firstSeenAt: serverTimestamp(),
    },
    { merge: true }
  );
  await updateDoc(ref, {
    managed: Boolean(managed),
    managedAt: Boolean(managed) ? serverTimestamp() : null,
    managedBy: Boolean(managed) ? name : null,
    managedByUid: Boolean(managed) ? uid : null,
    activityLog: arrayUnion({
      type: Boolean(managed) ? "marked_managed" : "unmarked_managed",
      at: serverTimestamp(),
      by: name,
      byUid: uid,
    }),
  });
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
    },
    { merge: true }
  );
  await updateDoc(ref, {
    internalNote: String(note || "").slice(0, 4000),
    internalNoteUpdatedAt: serverTimestamp(),
    internalNoteUpdatedBy: name,
    internalNoteUpdatedByUid: uid,
    activityLog: arrayUnion({
      type: "note_updated",
      at: serverTimestamp(),
      by: name,
      byUid: uid,
    }),
  });
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
    },
    { merge: true }
  );
  await updateDoc(ref, {
    activityLog: arrayUnion({
      type: "attachment_downloaded",
      at: serverTimestamp(),
      by: name,
      byUid: uid,
      filename: filename || null,
    }),
  });
}

