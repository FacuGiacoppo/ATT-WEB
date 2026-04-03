import {
  collection,
  getDocs,
  limit,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { db } from "../../config/firebase.js";

const COL = "cumplimientos";
const MAX = 2000;

/**
 * @returns {Promise<Array<object>>}
 */
export async function fetchCumplimientosBandeja() {
  const q = query(collection(db, COL), orderBy("createdAt", "desc"), limit(MAX));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const x = d.data();
    let createdAtMs = 0;
    let createdAtLabel = "—";
    if (x.createdAt?.toDate) {
      const dt = x.createdAt.toDate();
      createdAtMs = dt.getTime();
      createdAtLabel = dt.toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    }
    return {
      id: d.id,
      ...x,
      _createdAtMs: createdAtMs,
      _createdAtLabel: createdAtLabel
    };
  });
}
