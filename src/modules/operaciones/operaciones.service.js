import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

import { db } from "../../config/firebase.js";

const COLLECTION = "operaciones";

export async function fetchOperaciones() {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createOperacion(payload) {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

/** Varias altas en lotes (p. ej. IVA mensual futuro). */
export async function createOperacionesMany(payloads) {
  if (!payloads.length) return 0;
  const BATCH_SIZE = 450;
  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const p of payloads.slice(i, i + BATCH_SIZE)) {
      const ref = doc(collection(db, COLLECTION));
      batch.set(ref, {
        ...p,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    await batch.commit();
  }
  return payloads.length;
}

export async function updateOperacion(id, payload) {
  await updateDoc(doc(db, COLLECTION, id), {
    ...payload,
    updatedAt: serverTimestamp()
  });
}

export async function deleteOperacion(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}

export async function importOperacionesBatch(pending) {
  const BATCH_SIZE = 490;
  let batch = writeBatch(db);
  let n = 0;
  let total = 0;

  for (const { docId, payload } of pending) {
    batch.set(
      doc(db, COLLECTION, docId),
      { ...payload, updated_at: serverTimestamp() },
      { merge: true }
    );
    n++;
    total++;
    if (n >= BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(db);
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
  return total;
}

export async function deleteOperacionesMany(ids) {
  if (!ids.length) return;
  const BATCH_SIZE = 400;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const id of ids.slice(i, i + BATCH_SIZE)) {
      batch.delete(doc(db, COLLECTION, id));
    }
    await batch.commit();
  }
}

export async function updateOperacionesVencimientos(updates) {
  if (!updates.length) return;
  const BATCH_SIZE = 400;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const u of updates.slice(i, i + BATCH_SIZE)) {
      batch.update(doc(db, COLLECTION, u.id), {
        vencimiento: u.vencimiento,
        updatedAt: serverTimestamp()
      });
    }
    await batch.commit();
  }
}
