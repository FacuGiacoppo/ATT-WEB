import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { db } from "../../config/firebase.js";

const CLIENTES_COL  = "clientes";
const CONTACTOS_COL = "contactos";

function contactosRef(clienteId) {
  return collection(db, CLIENTES_COL, clienteId, CONTACTOS_COL);
}

export async function fetchContactos(clienteId) {
  const snap = await getDocs(
    query(contactosRef(clienteId), orderBy("nombre"))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createContacto(clienteId, payload) {
  const ref = await addDoc(contactosRef(clienteId), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateContacto(clienteId, contactoId, payload) {
  await updateDoc(
    doc(db, CLIENTES_COL, clienteId, CONTACTOS_COL, contactoId),
    { ...payload, updatedAt: serverTimestamp() }
  );
}

export async function deleteContacto(clienteId, contactoId) {
  await deleteDoc(
    doc(db, CLIENTES_COL, clienteId, CONTACTOS_COL, contactoId)
  );
}
