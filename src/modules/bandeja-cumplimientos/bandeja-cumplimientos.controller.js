import { appState, setState } from "../../app/state.js";
import { fetchCumplimientosBandeja } from "./bandeja-cumplimientos.service.js";
import {
  filterAndSortBandeja,
  paintBandejaFilters,
  renderBandejaRow,
  updateBandejaVistaBarDisplay
} from "./bandeja-cumplimientos.view.js";

const BC_FILTER_ID_TO_STATE_KEY = {
  "bc-filter-estado": "estadoFilter",
  "bc-filter-cliente": "clienteFilter",
  "bc-filter-obligacion": "obligacionFilter",
  "bc-filter-mes-cumpl": "mesCumplFilter",
  "bc-filter-usuario": "usuarioFilter"
};

function updateBcFilterBadge(filterId, selected) {
  const countEl = document.getElementById(`${filterId}-count`);
  const details = document.querySelector(`#bc-filters-row details.op-mfilter[data-filter-id="${filterId}"]`);
  if (countEl) {
    const hasActive = selected.length > 0;
    countEl.classList.toggle("is-hidden", !hasActive);
    countEl.textContent = hasActive ? String(selected.length) : "";
  }
  if (details) details.classList.toggle("is-active", selected.length > 0);
}

export async function loadBandejaCumplimientos() {
  setState("bandejaCumplimientos.loadError", null);
  try {
    appState.bandejaCumplimientos.items = await fetchCumplimientosBandeja();
  } catch (e) {
    console.error("loadBandejaCumplimientos:", e);
    appState.bandejaCumplimientos.items = [];
    setState(
      "bandejaCumplimientos.loadError",
      "No se pudieron cargar los cumplimientos. Si ves permission-denied, revisá las reglas de Firestore o la sesión."
    );
  }
}

function paintBandejaRowsOnly() {
  const tbody = document.getElementById("bc-tbody");
  const empty = document.getElementById("bc-empty");
  if (!tbody) return;
  const st = appState.bandejaCumplimientos;
  const filtered = filterAndSortBandeja(st.items ?? [], st);
  if (!filtered.length) {
    tbody.innerHTML = "";
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  tbody.innerHTML = filtered.map((r) => renderBandejaRow(r)).join("");
}

/** Primera carga o tras refrescar datos: repuebla filtros y grilla. */
export function paintBandejaTable() {
  const tbody = document.getElementById("bc-tbody");
  const alertEl = document.getElementById("bc-load-error");
  if (!tbody) return;

  const st = appState.bandejaCumplimientos;
  if (alertEl) {
    if (st.loadError) {
      alertEl.hidden = false;
      alertEl.textContent = st.loadError;
    } else {
      alertEl.hidden = true;
      alertEl.textContent = "";
    }
  }

  paintBandejaFilters(st.items ?? []);
  paintBandejaRowsOnly();
}

/** Solo actualiza la tabla (filtros ya armados). */
export function paintBandejaRows() {
  const alertEl = document.getElementById("bc-load-error");
  const st = appState.bandejaCumplimientos;
  if (alertEl) {
    if (st.loadError) {
      alertEl.hidden = false;
      alertEl.textContent = st.loadError;
    } else {
      alertEl.hidden = true;
      alertEl.textContent = "";
    }
  }
  paintBandejaRowsOnly();
}

let bcEventsBound = false;

export function bindBandejaCumplimientosEvents() {
  if (bcEventsBound) return;
  bcEventsBound = true;

  document.addEventListener("click", (event) => {
    const mfilterClear = event.target.closest("[data-mfilter-clear]");
    if (mfilterClear && mfilterClear.closest("#bc-filters-row")) {
      event.preventDefault();
      const filterId = mfilterClear.dataset.mfilterClear;
      const stateKey = BC_FILTER_ID_TO_STATE_KEY[filterId];
      if (stateKey) {
        setState(`bandejaCumplimientos.${stateKey}`, []);
        document.querySelectorAll(`input[name="${filterId}"]`).forEach((c) => {
          c.checked = false;
        });
        updateBcFilterBadge(filterId, []);
        paintBandejaRows();
      }
      return;
    }

    const mfilterVisible = event.target.closest("[data-mfilter-visible]");
    if (mfilterVisible && mfilterVisible.closest("#bc-filters-row")) {
      event.preventDefault();
      const filterId = mfilterVisible.dataset.mfilterVisible;
      const stateKey = BC_FILTER_ID_TO_STATE_KEY[filterId];
      const optsEl = document.getElementById(`${filterId}-opts`);
      if (stateKey && optsEl) {
        const selected = [];
        optsEl.querySelectorAll(".op-mfilter-opt").forEach((row) => {
          if (row.classList.contains("op-mfilter-opt--hidden")) return;
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
        setState(`bandejaCumplimientos.${stateKey}`, selected);
        updateBcFilterBadge(filterId, selected);
        paintBandejaRows();
      }
      return;
    }

    const vistaTab = event.target.closest("[data-bc-vista]");
    if (vistaTab && document.getElementById("bc-vista-bar")) {
      const mode = vistaTab.dataset.bcVista;
      setState("bandejaCumplimientos.vistaMode", mode);
      if (mode !== "todos" && !appState.bandejaCumplimientos.vistaRefDate) {
        const t = new Date();
        setState("bandejaCumplimientos.vistaRefDate", t.toISOString().slice(0, 10));
      }
      updateBandejaVistaBarDisplay();
      paintBandejaRows();
      return;
    }

    const vistaNav = event.target.closest("[data-bc-vista-nav]");
    if (vistaNav && document.getElementById("bc-vista-bar")) {
      const dir = Number(vistaNav.dataset.bcVistaNav);
      const { vistaMode, vistaRefDate } = appState.bandejaCumplimientos;
      if (vistaMode === "todos") return;
      const ref = vistaRefDate ? new Date(vistaRefDate + "T00:00:00") : new Date();
      if (vistaMode === "dia") ref.setDate(ref.getDate() + dir);
      else if (vistaMode === "semana") ref.setDate(ref.getDate() + dir * 7);
      else if (vistaMode === "mes") ref.setMonth(ref.getMonth() + dir);
      setState("bandejaCumplimientos.vistaRefDate", ref.toISOString().slice(0, 10));
      updateBandejaVistaBarDisplay();
      paintBandejaRows();
    }
  });

  document.addEventListener("change", (event) => {
    const checkbox = event.target.closest("#bc-filters-row .op-mfilter-panel input[type='checkbox']");
    if (!checkbox) return;
    const panel = checkbox.closest(".op-mfilter-panel");
    const filterId = panel?.id?.replace("-panel", "");
    const stateKey = filterId ? BC_FILTER_ID_TO_STATE_KEY[filterId] : null;
    if (!stateKey) return;
    const selected = [...document.querySelectorAll(`input[name="${filterId}"]:checked`)].map((el) => {
      try {
        return decodeURIComponent(el.value);
      } catch {
        return el.value;
      }
    });
    setState(`bandejaCumplimientos.${stateKey}`, selected);
    updateBcFilterBadge(filterId, selected);
    paintBandejaRows();
  });

  document.addEventListener("input", (event) => {
    if (event.target.id === "bc-search") {
      setState("bandejaCumplimientos.search", event.target.value);
      paintBandejaRows();
    }
  });
}
