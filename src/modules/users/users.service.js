import {
  collection,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

import { db } from "../../config/firebase.js";

export async function fetchUsers() {
  const snap = await getDocs(collection(db, "users"));

  return snap.docs.map((docSnap) => ({
    ...docSnap.data(),
    id: docSnap.id,
  }));
}

export async function setRoleForUser(uid, role) {
  const userRef = doc(db, "users", uid);

  await updateDoc(userRef, {
    role,
    updatedAt: serverTimestamp(),
  });
}

export async function setActiveForUser(uid, active) {
  const userRef = doc(db, "users", uid);

  await updateDoc(userRef, {
    active,
    updatedAt: serverTimestamp(),
  });
}
