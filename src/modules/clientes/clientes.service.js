import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

import { db } from "../../config/firebase.js";

const COLLECTION = "clientes";

export async function fetchClientes() {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
}

export async function createCliente(payload) {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...payload,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  });
  return ref.id;
}

export async function updateCliente(id, payload) {
  await updateDoc(doc(db, COLLECTION, id), {
    ...payload,
    updated_at: serverTimestamp()
  });
}

export async function importClientesBatch(pending) {
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
