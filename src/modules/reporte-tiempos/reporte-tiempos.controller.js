import {
  collection,
  getDocs,
  orderBy,
  query,
  limit
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { db } from "../../config/firebase.js";
import { appState, setState } from "../../app/state.js";
import {
  DIMS,
  enrichRecord,
  renderPivot,
  renderDimPill,
  renderDropZone
} from "./reporte-tiempos.view.js";

const COL = "cumplimientos";
const MAX = 5000;

// ─── Carga de datos ──────────────────────────────────────────────────────────

export async function loadReporteTiempos() {
  try {
    const q = query(collection(db, COL), orderBy("createdAt", "desc"), limit(MAX));
    const snap = await getDocs(q);
    const items = snap.docs.map(d => {
      const x = d.data();
      let _createdAtMs = 0;
      if (x.createdAt?.toDate) _createdAtMs = x.createdAt.toDate().getTime();
      return enrichRecord({ id: d.id, ...x, _createdAtMs });
    });
    setState("reporteTiempos.items", items);
    setState("reporteTiempos.loadError", null);
  } catch (e) {
    console.error("loadReporteTiempos:", e);
    setState("reporteTiempos.loadError", e.message ?? "Error al cargar los datos de tiempos.");
  }
}

// ─── Pintura parcial ──────────────────────────────────────────────────────────

function paintPivot() {
  const st = appState.reporteTiempos;
  const wrap = document.getElementById("rt-pivot-wrap");
  if (!wrap) return;
  wrap.innerHTML = renderPivot(st.items ?? [], st);
}

function paintDimsAndBuilder() {
  const st = appState.reporteTiempos;

  // Actualizar chips
  const dimsList = document.getElementById("rt-dims-list");
  if (dimsList) {
    dimsList.innerHTML = DIMS.map(d => renderDimPill(d.id, d.label, st)).join("");
  }

  // Actualizar builder (drop zones)
  const builder = document.getElementById("rt-builder");
  if (builder) {
    builder.innerHTML =
      renderDropZone("row", st.rowDim, st) +
      renderDropZone("col", st.colDim, st);
  }
}

function paintAll() {
  paintDimsAndBuilder();
  paintPivot();
  showLoadError();
}

function showLoadError() {
  const el = document.getElementById("rt-load-error");
  if (!el) return;
  const err = appState.reporteTiempos.loadError;
  if (err) {
    el.textContent = err;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

// ─── Drag & Drop ─────────────────────────────────────────────────────────────

/** dimId que se está arrastrando actualmente. */
let _draggingDim = null;

function bindDragDrop(workspace) {
  // dragstart en pills
  workspace.addEventListener("dragstart", e => {
    const pill = e.target.closest(".rt-dim-pill:not(.rt-dim-pill--in-use)");
    if (!pill) { e.preventDefault(); return; }
    _draggingDim = pill.dataset.dim;
    e.dataTransfer.setData("text/plain", _draggingDim);
    e.dataTransfer.effectAllowed = "move";
    pill.classList.add("rt-dim-pill--dragging");
  });

  workspace.addEventListener("dragend", e => {
    const pill = e.target.closest(".rt-dim-pill");
    if (pill) pill.classList.remove("rt-dim-pill--dragging");
    _draggingDim = null;
  });

  // dragover en drop zones
  workspace.addEventListener("dragover", e => {
    const zone = e.target.closest(".rt-drop-zone");
    if (!zone) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    zone.classList.add("rt-drop-zone--over");
  });

  workspace.addEventListener("dragleave", e => {
    const zone = e.target.closest(".rt-drop-zone");
    if (!zone) return;
    // Solo quitar la clase si salimos del zone hacia afuera (no hacia un hijo)
    if (!zone.contains(e.relatedTarget)) {
      zone.classList.remove("rt-drop-zone--over");
    }
  });

  workspace.addEventListener("drop", e => {
    const zone = e.target.closest(".rt-drop-zone");
    if (!zone) return;
    e.preventDefault();
    zone.classList.remove("rt-drop-zone--over");

    const dimId = e.dataTransfer.getData("text/plain") || _draggingDim;
    if (!dimId) return;

    const isRow = zone.dataset.zone === "row";
    const st = appState.reporteTiempos;

    if (isRow) {
      // Si el dim ya está en cols, hacer swap
      if (st.colDim === dimId) {
        setState("reporteTiempos.colDim", st.rowDim);
      }
      setState("reporteTiempos.rowDim", dimId);
    } else {
      // Si el dim ya está en rows, hacer swap
      if (st.rowDim === dimId) {
        setState("reporteTiempos.rowDim", st.colDim);
      }
      setState("reporteTiempos.colDim", dimId);
    }

    paintAll();
  });
}

// ─── Clicks generales ────────────────────────────────────────────────────────

function bindClicks(workspace) {
  workspace.addEventListener("click", e => {
    // Botón ✕ en zona de drop (quitar dimensión)
    const removeBtn = e.target.closest("[data-rt-remove]");
    if (removeBtn) {
      const zone = removeBtn.dataset.rtRemove;
      if (zone === "row") setState("reporteTiempos.rowDim", null);
      else setState("reporteTiempos.colDim", null);
      paintAll();
      return;
    }
  });
}

// ─── Init (llamado desde router después de renderizar la vista) ───────────────

export function initReporteTiemposPage() {
  const workspace = document.querySelector(".rt-workspace");
  if (!workspace) return;

  bindDragDrop(workspace);
  bindClicks(workspace);
  paintAll();
}
