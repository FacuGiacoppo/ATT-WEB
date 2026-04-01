import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCEhq-Wv7DLvbFg0U3xo7p-fChHbyeWrsY",
  authDomain: "att-web-2809.firebaseapp.com",
  projectId: "att-web-2809",
  storageBucket: "att-web-2809.firebasestorage.app",
  messagingSenderId: "479443509918",
  appId: "1:479443509918:web:8dd34b66fed350775fd18f"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
