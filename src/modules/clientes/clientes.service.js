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

function normalizeDfeEnabled(v) {
  if (v === true || v === 1 || v === "1") return true;
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "true" || s === "s" || s === "si" || s === "sí" || s === "yes") return true;
  return false;
}

/** Misma regla que al leer Firestore (UI y payload deben coincidir). */
export function isDfeEnabledValue(v) {
  return normalizeDfeEnabled(v);
}

export async function fetchClientes() {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        dfeEnabled: normalizeDfeEnabled(data.dfeEnabled),
      };
    })
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

/**
 * Plan-in: ítems del maestro asignados al cliente + responsables (varios por ítem: emails únicos).
 * @param {string} clienteId
 * @param {{ ids: string[], responsables?: Record<string, string[]|string> }} payload
 */
export async function updateClientePlanIn(clienteId, payload) {
  const ids = Array.isArray(payload?.ids) ? payload.ids : [];
  const responsables =
    payload?.responsables && typeof payload.responsables === "object" ? payload.responsables : {};
  const pruned = {};
  for (const id of ids) {
    const v = responsables[id];
    let arr = [];
    if (Array.isArray(v)) arr = v.map((x) => String(x).trim()).filter(Boolean);
    else if (typeof v === "string" && v.trim()) arr = [v.trim()];
    const uniq = [...new Set(arr)];
    if (uniq.length) pruned[id] = uniq;
  }
  await updateDoc(doc(db, COLLECTION, clienteId), {
    planInSeleccionIds: ids,
    planInResponsables: pruned,
    planInSeleccionUpdatedAt: serverTimestamp(),
    updated_at: serverTimestamp(),
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
