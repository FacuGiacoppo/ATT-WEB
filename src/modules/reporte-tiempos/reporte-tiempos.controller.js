import {
  collection,
  getDocs,
  orderBy,
  query,
  limit
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { db } from "../../config/firebase.js";
import { appState, setState } from "../../app/state.js";
import { getCurrentRole } from "../../utils/permissions.js";
import {
  DIMS,
  enrichRecord,
  dimFmt,
  renderPivot,
  renderDimPill,
  renderDropZones
} from "./reporte-tiempos.view.js";

const COL = "cumplimientos";
const MAX = 5000;

// ─── Carga de datos ───────────────────────────────────────────────────────────

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

// ─── Filtrado de datos ────────────────────────────────────────────────────────

/** Datos base filtrados por rol: colaboradores solo ven sus propios registros. */
function getBaseItems() {
  const user = appState.session.user;
  const role = getCurrentRole(user);
  const all = appState.reporteTiempos.items ?? [];
  if (role !== "superadmin" && role !== "admin") {
    const me = user?.name ?? user?.email ?? "";
    return all.filter(r => r.cumplidoPor === me);
  }
  return all;
}

/**
 * Aplica los filtros de dimensión del estado.
 * filters[id] = null/undefined → sin filtro (todo pasa)
 * filters[id] = []             → nada pasa (estado transitorio mientras se selecciona)
 * filters[id] = ["a","b"]      → solo esos valores pasan
 */
function getFilteredItems() {
  const filters = appState.reporteTiempos.filters ?? {};
  return getBaseItems().filter(r => {
    for (const [dimId, allowed] of Object.entries(filters)) {
      if (allowed == null) continue;
      if (allowed.length === 0) return false;
      if (!allowed.includes(String(r[dimId] ?? ""))) return false;
    }
    return true;
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ─── Pintura de filtros ───────────────────────────────────────────────────────

function populateDimFilter(dimId) {
  const container = document.getElementById(`rt-fo-${dimId}`);
  if (!container) return;

  const base = getBaseItems();
  const allowed = appState.reporteTiempos.filters?.[dimId]; // null | [] | [...]

  // Valores únicos ordenados
  const valSet = new Set();
  for (const r of base) valSet.add(String(r[dimId] ?? ""));
  const vals = [...valSet].sort((a, b) => a.localeCompare(b, "es"));

  container.innerHTML = vals.map(v => {
    const isChecked = allowed == null || allowed.includes(v);
    const display = dimFmt(dimId, v);
    return `<label class="op-mfilter-opt">
      <input type="checkbox" value="${escHtml(v)}"
             data-rt-filter-cb="${dimId}"
             ${isChecked ? "checked" : ""} />
      <span>${escHtml(display)}</span>
    </label>`;
  }).join("");
}

function populateAllFilters() {
  for (const d of DIMS) populateDimFilter(d.id);
}

function updateFilterCount(dimId) {
  const el = document.getElementById(`rt-fc-${dimId}`);
  if (!el) return;
  const allowed = appState.reporteTiempos.filters?.[dimId];
  const count = allowed?.length ?? 0;
  el.textContent = count > 0 ? count : "";
  el.classList.toggle("is-hidden", count === 0);
}

// ─── Pintura de la UI ─────────────────────────────────────────────────────────

function paintPivot() {
  const st = appState.reporteTiempos;
  const wrap = document.getElementById("rt-pivot-wrap");
  if (!wrap) return;
  wrap.innerHTML = renderPivot(getFilteredItems(), st);
}

function paintDimsAndBuilder() {
  const st = appState.reporteTiempos;

  const dimsList = document.getElementById("rt-dims-list");
  if (dimsList) {
    dimsList.innerHTML = DIMS.map(d => renderDimPill(d.id, d.label, st)).join("");
    populateAllFilters();
  }

  const builder = document.getElementById("rt-builder");
  if (builder) {
    builder.innerHTML = renderDropZones(st);
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
  if (err) { el.textContent = err; el.hidden = false; }
  else el.hidden = true;
}

// ─── Drag & Drop ──────────────────────────────────────────────────────────────

let _draggingDim = null;

function bindDragDrop(workspace) {
  workspace.addEventListener("dragstart", e => {
    // Solo desde el summary de un pill, nunca desde dentro del panel de filtro
    const summary = e.target.closest("summary.rt-dim-pill-summary");
    if (!summary || e.target.closest(".rt-dim-pill-panel")) {
      e.preventDefault();
      return;
    }
    const pill = summary.closest(".rt-dim-pill");
    if (!pill) { e.preventDefault(); return; }
    _draggingDim = pill.dataset.dim;
    e.dataTransfer.setData("text/plain", _draggingDim);
    e.dataTransfer.effectAllowed = "move";
    pill.classList.add("rt-dim-pill--dragging");
  });

  workspace.addEventListener("dragend", () => {
    workspace.querySelectorAll(".rt-dim-pill--dragging")
      .forEach(el => el.classList.remove("rt-dim-pill--dragging"));
    _draggingDim = null;
  });

  workspace.addEventListener("dragover", e => {
    const zone = e.target.closest(".rt-drop-zone");
    if (!zone) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    zone.classList.add("rt-drop-zone--over");
  });

  workspace.addEventListener("dragleave", e => {
    const zone = e.target.closest(".rt-drop-zone");
    if (zone && !zone.contains(e.relatedTarget)) {
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

    const targetZone = zone.dataset.zone; // "row" | "col"
    const st = appState.reporteTiempos;
    let rowDims = (st.rowDims ?? []).filter(d => d !== dimId);
    let colDims = (st.colDims ?? []).filter(d => d !== dimId);

    if (targetZone === "row") rowDims.push(dimId);
    else colDims.push(dimId);

    setState("reporteTiempos.rowDims", rowDims);
    setState("reporteTiempos.colDims", colDims);
    paintAll();
  });
}

// ─── Clicks y cambios ─────────────────────────────────────────────────────────

function bindClicks(workspace) {
  workspace.addEventListener("click", e => {

    // Cerrar otros pills al abrir uno
    const summary = e.target.closest("summary.rt-dim-pill-summary");
    if (summary) {
      const thisPill = summary.closest(".rt-dim-pill");
      document.querySelectorAll("details.rt-dim-pill[open]").forEach(d => {
        if (d !== thisPill) d.removeAttribute("open");
      });
    }

    // ✕ Quitar dimensión de zona
    const removeBtn = e.target.closest("[data-rt-remove-zone]");
    if (removeBtn) {
      const zone = removeBtn.dataset.rtRemoveZone;
      const dimId = removeBtn.dataset.rtRemoveDim;
      const st = appState.reporteTiempos;
      if (zone === "row") {
        setState("reporteTiempos.rowDims", (st.rowDims ?? []).filter(d => d !== dimId));
      } else {
        setState("reporteTiempos.colDims", (st.colDims ?? []).filter(d => d !== dimId));
      }
      paintAll();
      return;
    }

    // Marcar todos
    const allBtn = e.target.closest("[data-rt-filter-all]");
    if (allBtn) {
      const dimId = allBtn.dataset.rtFilterAll;
      setState(`reporteTiempos.filters.${dimId}`, null);
      populateDimFilter(dimId);
      updateFilterCount(dimId);
      paintPivot();
      return;
    }

    // Ninguno
    const noneBtn = e.target.closest("[data-rt-filter-none]");
    if (noneBtn) {
      const dimId = noneBtn.dataset.rtFilterNone;
      setState(`reporteTiempos.filters.${dimId}`, []);
      populateDimFilter(dimId);
      updateFilterCount(dimId);
      paintPivot();
      return;
    }
  });

  // Checkbox de filtro
  workspace.addEventListener("change", e => {
    const cb = e.target.closest("[data-rt-filter-cb]");
    if (!cb) return;
    const dimId = cb.dataset.rtFilterCb;
    const container = document.getElementById(`rt-fo-${dimId}`);
    if (!container) return;

    const all = [...container.querySelectorAll(`input[data-rt-filter-cb="${dimId}"]`)];
    const checked = all.filter(i => i.checked).map(i => i.value);
    const newFilter = checked.length === all.length ? null : checked;

    setState(`reporteTiempos.filters.${dimId}`, newFilter);
    updateFilterCount(dimId);
    paintPivot();
  });

  // Búsqueda dentro del panel de filtro
  workspace.addEventListener("input", e => {
    const searchInput = e.target.closest("[data-rt-search]");
    if (!searchInput) return;
    const dimId = searchInput.dataset.rtSearch;
    const q = searchInput.value.toLowerCase();
    const container = document.getElementById(`rt-fo-${dimId}`);
    if (!container) return;
    container.querySelectorAll(".op-mfilter-opt").forEach(opt => {
      const text = opt.querySelector("span")?.textContent?.toLowerCase() ?? "";
      opt.style.display = text.includes(q) ? "" : "none";
    });
  });
}

// ─── Cierre al hacer click fuera ──────────────────────────────────────────────

function bindOutsideClick() {
  document.addEventListener("click", e => {
    if (!document.querySelector(".rt-workspace")) return; // ya no estamos en esta página
    if (!e.target.closest(".rt-dim-pill")) {
      document.querySelectorAll("details.rt-dim-pill[open]")
        .forEach(d => d.removeAttribute("open"));
    }
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initReporteTiemposPage() {
  const workspace = document.querySelector(".rt-workspace");
  if (!workspace) return;

  showLoadError();
  populateAllFilters();
  bindDragDrop(workspace);
  bindClicks(workspace);
  bindOutsideClick();
  paintPivot();
}
