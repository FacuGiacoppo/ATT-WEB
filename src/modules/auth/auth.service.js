import {
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

import { auth, db } from "../../config/firebase.js";

export async function loginWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  const firebaseUser = result.user;

  const userRef = doc(db, "users", firebaseUser.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists) {
    await signOut(auth);
    throw new Error("USER_PROFILE_NOT_FOUND");
  }

  const profile = userSnap.data();

  if (!profile.active) {
    await signOut(auth);
    throw new Error("USER_INACTIVE");
  }

  await updateDoc(userRef, {
    lastLoginAt: serverTimestamp()
  });

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    name: profile.name ?? firebaseUser.email,
    role: profile.role ?? "lectura",
    active: profile.active ?? false,
    mustChangePassword: profile.mustChangePassword ?? false
  };
}

export async function logout() {
  await signOut(auth);
}
