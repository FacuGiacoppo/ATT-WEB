import { appState, setState } from "../../app/state.js";
import { refreshRoute } from "../../app/route-refresh.js";
import { loadClientes } from "../clientes/clientes.controller.js";
import { loadOperaciones } from "../operaciones/operaciones.controller.js";
import { fetchUsers } from "../users/users.service.js";
import {
  deleteOperacion,
  deleteOperacionesMany,
  updateOperacionesVencimientos
} from "../operaciones/operaciones.service.js";
import {
  downloadPlantillaOperaciones,
  runOperacionesImport
} from "../operaciones/operaciones-import.js";
import { paintCentralOperacionesFilters, renderCentralRow } from "./central-operaciones.view.js";
import { esNombreTareaPlanIn } from "../../data/operaciones-scheduling.js";

const centralSelected = new Set();
let centralBound = false;

const CO_FILTER_ID_TO_STATE_KEY = {
  "co-filter-estado": "estadoFilter",
  "co-filter-cliente": "clienteFilter",
  "co-filter-obligacion": "obligacionFilter",
  "co-filter-mes-vto": "mesVtoFilter",
  "co-filter-usuario": "usuarioFilter"
};

function updateCoFilterBadge(filterId, selected) {
  const countEl = document.getElementById(`${filterId}-count`);
  const details = document.querySelector(`details.op-mfilter[data-filter-id="${filterId}"]`);
  if (countEl) {
    const hasActive = selected.length > 0;
    countEl.classList.toggle("is-hidden", !hasActive);
    countEl.textContent = hasActive ? String(selected.length) : "";
  }
  if (details) details.classList.toggle("is-active", selected.length > 0);
}

function getCentralFiltered() {
  const items = appState.operaciones.items ?? [];
  const f = appState.centralOperaciones;
  const q = (f.search ?? "").trim().toLowerCase();

  return items.filter((it) => {
    if (f.estadoFilter?.length > 0 && !f.estadoFilter.includes(it.estado)) return false;
    if (f.clienteFilter?.length > 0 && !f.clienteFilter.includes(it.clienteNombre)) return false;
    if (f.obligacionFilter?.length > 0 && !f.obligacionFilter.includes(it.obligacion)) return false;
    if (f.mesVtoFilter?.length > 0 && !f.mesVtoFilter.some((m) => (it.vencimiento ?? "").startsWith(m))) {
      return false;
    }
    if (f.usuarioFilter?.length > 0 && !f.usuarioFilter.includes(it.responsable)) return false;
    if (!q) return true;
    const hay = [it.responsable, it.clienteNombre, it.obligacion, it.periodo, it.estado]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function paintCentralOperacionesTable() {
  const tbody = document.getElementById("co-tbody");
  const empty = document.getElementById("co-empty");
  const countEl = document.getElementById("co-count-info");
  if (!tbody) return;

  const rows = getCentralFiltered();
  if (countEl) {
    countEl.textContent = `${rows.length} registro(s) con filtros actuales · ${centralSelected.size} seleccionados`;
  }

  if (!rows.length) {
    tbody.innerHTML = "";
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  tbody.innerHTML = rows.map((r) => renderCentralRow(r, centralSelected.has(r.id))).join("");

  const allIds = new Set(rows.map((r) => r.id));
  const allSelected = rows.length && rows.every((r) => centralSelected.has(r.id));
  const checkAll = document.getElementById("co-check-all");
  if (checkAll) {
    checkAll.checked = allSelected;
    checkAll.indeterminate = !allSelected && rows.some((r) => centralSelected.has(r.id));
  }
}

async function afterImportReload() {
  await loadOperaciones();
  paintCentralOperacionesFilters(appState.operaciones.items ?? []);
  paintCentralOperacionesTable();
}

export async function initCentralOperacionesPage() {
  await Promise.all([
    loadOperaciones(),
    appState.clientes.items.length ? Promise.resolve() : loadClientes(),
    (async () => {
      try {
        const users = await fetchUsers();
        appState.centralOperaciones.__usuariosCache = users
          .map((u) => u.name || u.email || "")
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, "es"));
      } catch (e) {
        console.error(e);
        appState.centralOperaciones.__usuariosCache = [];
      }
    })()
  ]);
}

export function bindCentralOperacionesEvents() {
  if (centralBound) return;
  centralBound = true;

  document.addEventListener("click", async (ev) => {
    if (!document.body.contains(document.getElementById("co-tbody"))) return;

    if (ev.target.closest("#co-btn-download-template")) {
      const nombresClientes = (appState.clientes.items ?? []).map((c) => c.nombre).filter(Boolean);
      const nombresUsuarios =
        appState.centralOperaciones.__usuariosCache?.length
          ? appState.centralOperaciones.__usuariosCache
          : [appState.session.user?.name || appState.session.user?.email || "Usuario"].filter(Boolean);
      await downloadPlantillaOperaciones({ nombresClientes, nombresUsuarios });
      return;
    }

    if (ev.target.closest("#co-btn-clear-filters")) {
      setState("centralOperaciones.search", "");
      setState("centralOperaciones.clienteFilter", []);
      setState("centralOperaciones.obligacionFilter", []);
      setState("centralOperaciones.mesVtoFilter", []);
      setState("centralOperaciones.estadoFilter", []);
      setState("centralOperaciones.usuarioFilter", []);
      await refreshRoute();
      paintCentralOperacionesTable();
      return;
    }

    const mfilterAll = ev.target.closest("[data-mfilter-all]");
    if (mfilterAll && mfilterAll.closest("#co-filters-row")) {
      ev.preventDefault();
      const filterId = mfilterAll.dataset.mfilterAll;
      const stateKey = CO_FILTER_ID_TO_STATE_KEY[filterId];
      const optsEl = document.getElementById(`${filterId}-opts`);
      if (stateKey && optsEl) {
        const selected = [];
        optsEl.querySelectorAll(".op-mfilter-opt").forEach((row) => {
          const inp = row.querySelector("input[type='checkbox']");
          if (inp) {
            inp.checked = true;
            try {
              selected.push(decodeURIComponent(inp.value));
            } catch {
              selected.push(inp.value);
            }
          }
        });
        setState(`centralOperaciones.${stateKey}`, selected);
        updateCoFilterBadge(filterId, selected);
        paintCentralOperacionesTable();
      }
      return;
    }

    const mfilterClear = ev.target.closest("[data-mfilter-clear]");
    if (mfilterClear && mfilterClear.closest("#co-filters-row")) {
      ev.preventDefault();
      const filterId = mfilterClear.dataset.mfilterClear;
      const stateKey = CO_FILTER_ID_TO_STATE_KEY[filterId];
      if (stateKey) {
        setState(`centralOperaciones.${stateKey}`, []);
        document.querySelectorAll(`input[name="${filterId}"]`).forEach((c) => {
          c.checked = false;
        });
        updateCoFilterBadge(filterId, []);
        paintCentralOperacionesTable();
      }
      return;
    }

    if (ev.target.closest("#co-btn-clear-selection")) {
      centralSelected.clear();
      paintCentralOperacionesTable();
      return;
    }

    if (ev.target.closest("#co-btn-select-visible")) {
      getCentralFiltered().forEach((r) => centralSelected.add(r.id));
      paintCentralOperacionesTable();
      return;
    }

    if (ev.target.closest("#co-btn-del-selected")) {
      const ids = Array.from(centralSelected);
      if (!ids.length) {
        alert("No hay filas seleccionadas.");
        return;
      }
      if (!confirm(`¿Eliminar ${ids.length} registro(s) seleccionados? No se puede deshacer.`)) return;
      try {
        await deleteOperacionesMany(ids);
        centralSelected.clear();
        await loadOperaciones();
        paintCentralOperacionesTable();
      } catch (e) {
        console.error(e);
        alert("Error al eliminar.");
      }
      return;
    }

    if (ev.target.closest("#co-btn-del-filtered")) {
      const ids = getCentralFiltered().map((r) => r.id);
      if (!ids.length) {
        alert("No hay registros con los filtros actuales.");
        return;
      }
      const confirmTxt = prompt(
        `Se eliminarán ${ids.length} registro(s) que cumplen el filtro.\nEscribí ELIMINAR para confirmar:`
      );
      if (confirmTxt !== "ELIMINAR") return;
      try {
        await deleteOperacionesMany(ids);
        centralSelected.clear();
        await loadOperaciones();
        paintCentralOperacionesTable();
      } catch (e) {
        console.error(e);
        alert("Error al eliminar.");
      }
      return;
    }

    const oneDel = ev.target.closest(".co-one-del");
    if (oneDel) {
      const id = oneDel.dataset.id;
      if (!confirm("¿Eliminar este registro?")) return;
      try {
        await deleteOperacion(id);
        centralSelected.delete(id);
        await loadOperaciones();
        paintCentralOperacionesTable();
      } catch (e) {
        console.error(e);
        alert("No se pudo eliminar.");
      }
      return;
    }

    if (ev.target.closest("#co-btn-preview-shift")) {
      const updates = computeShiftVencimientos();
      const prev = document.getElementById("co-shift-preview");
      if (!prev) return;
      if (!updates.length) {
        prev.hidden = false;
        prev.textContent = "Ningún registro coincide con mes/día y reglas indicadas.";
        return;
      }
      prev.hidden = false;
      prev.textContent = `Se actualizarían ${updates.length} vencimiento(s). Ejemplo: ${updates[0].id.slice(0, 8)}… ${updates[0].antes} → ${updates[0].vencimiento}`;
      return;
    }

    if (ev.target.closest("#co-btn-apply-shift")) {
      const updates = computeShiftVencimientos();
      if (!updates.length) {
        alert("Nada que cambiar (revisá mes, día origen/destino y 'solo tareas').");
        return;
      }
      if (!confirm(`¿Actualizar ${updates.length} fecha(s) de vencimiento?`)) return;
      try {
        await updateOperacionesVencimientos(updates.map((u) => ({ id: u.id, vencimiento: u.vencimiento })));
        await loadOperaciones();
        paintCentralOperacionesTable();
        const prev = document.getElementById("co-shift-preview");
        if (prev) {
          prev.hidden = false;
          prev.textContent = `Listo: ${updates.length} registro(s) actualizados.`;
        }
      } catch (e) {
        console.error(e);
        alert("Error al actualizar.");
      }
      return;
    }
  });

  document.addEventListener("change", (ev) => {
    if (ev.target.id === "co-import-input") {
      const file = ev.target.files?.[0];
      if (file) {
        void runOperacionesImport(file, { progressPrefix: "co", onAfterImport: afterImportReload });
      }
      ev.target.value = "";
      return;
    }

    if (ev.target.id === "co-check-all") {
      const checked = ev.target.checked;
      const rows = getCentralFiltered();
      rows.forEach((r) => {
        if (checked) centralSelected.add(r.id);
        else centralSelected.delete(r.id);
      });
      paintCentralOperacionesTable();
      return;
    }

    if (ev.target.classList?.contains("co-row-check")) {
      const id = ev.target.dataset.id;
      if (ev.target.checked) centralSelected.add(id);
      else centralSelected.delete(id);
      paintCentralOperacionesTable();
      return;
    }

    const coCheckbox = ev.target.closest(".op-mfilter-panel input[type='checkbox']");
    if (coCheckbox && coCheckbox.closest("#co-filters-row")) {
      const panel = coCheckbox.closest(".op-mfilter-panel");
      const filterId = panel?.id?.replace("-panel", "");
      const stateKey = filterId ? CO_FILTER_ID_TO_STATE_KEY[filterId] : null;
      if (stateKey) {
        const selected = [...document.querySelectorAll(`input[name="${filterId}"]:checked`)].map((el) => {
          try {
            return decodeURIComponent(el.value);
          } catch {
            return el.value;
          }
        });
        setState(`centralOperaciones.${stateKey}`, selected);
        updateCoFilterBadge(filterId, selected);
        paintCentralOperacionesTable();
      }
    }
  });

  document.addEventListener("input", (ev) => {
    if (ev.target.id === "co-search") {
      setState("centralOperaciones.search", ev.target.value);
      paintCentralOperacionesTable();
    }
  });
}

function computeShiftVencimientos() {
  const ym = document.getElementById("co-shift-month")?.value ?? "";
  const dFrom = Number(document.getElementById("co-shift-day-from")?.value ?? 0);
  const dTo = Number(document.getElementById("co-shift-day-to")?.value ?? 0);
  const soloT = document.getElementById("co-shift-solo-tareas")?.checked ?? false;
  if (!ym || !dFrom || !dTo || dFrom === dTo) return [];

  const [Y, M] = ym.split("-").map(Number);
  const dim = new Date(Y, M, 0).getDate();
  const safeTo = Math.min(dTo, dim);

  const updates = [];
  for (const it of getCentralFiltered()) {
    if (soloT && it.tipo !== "tarea" && !esNombreTareaPlanIn(it.obligacion)) continue;
    const iso = it.vencimiento ? String(it.vencimiento).slice(0, 10) : "";
    if (!iso || iso.length < 10) continue;
    const [y, m, d] = iso.split("-").map(Number);
    if (y !== Y || m !== M || d !== dFrom) continue;
    const nv = `${Y}-${String(M).padStart(2, "0")}-${String(safeTo).padStart(2, "0")}`;
    if (nv !== iso) updates.push({ id: it.id, vencimiento: nv, antes: iso });
  }
  return updates;
}
