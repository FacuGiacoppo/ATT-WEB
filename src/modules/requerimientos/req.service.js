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

const COLLECTION_NAME = "requirements";

export async function fetchRequirements() {
  const q = query(collection(db, COLLECTION_NAME), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => ({
    ...docSnap.data(),
    id: docSnap.id
  }));
}

export async function createRequirement(payload) {
  const ref = await addDoc(collection(db, COLLECTION_NAME), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return ref.id;
}

export async function updateRequirement(id, payload) {
  const ref = doc(db, COLLECTION_NAME, id);

  await updateDoc(ref, {
    ...payload,
    updatedAt: serverTimestamp()
  });
}

export async function deleteRequirement(id) {
  const ref = doc(db, COLLECTION_NAME, id);
  await deleteDoc(ref);
}
