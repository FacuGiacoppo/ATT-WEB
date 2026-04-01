import { appState, setState } from "../../app/state.js";
import { refreshRoute } from "../../app/route-refresh.js";
import {
  fetchRequirements,
  createRequirement,
  updateRequirement,
  deleteRequirement
} from "./req.service.js";
import { renderRequirementsBoardHtml } from "./req.view.js";

let reqEventsBound = false;

export function rerenderRequirementsBoardOnly() {
  const root = document.getElementById("req-board-root");
  if (!root) return;
  const stageFilter = appState.requerimientos.stageFilter ?? "todos";
  root.className = stageFilter === "todos" ? "req-board" : "req-board req-board--single";
  root.innerHTML = renderRequirementsBoardHtml();
}

function syncStageFilterChips() {
  const stageFilter = appState.requerimientos.stageFilter ?? "todos";
  document.querySelectorAll("[data-stage-filter]").forEach((btn) => {
    const v = btn.dataset.stageFilter;
    btn.classList.toggle("active", v === stageFilter);
  });
}

export function bindReqEvents() {
  if (reqEventsBound) return;
  reqEventsBound = true;

  document.addEventListener("click", async (event) => {
    const newReqBtn = event.target.closest("#btn-new-req");
    if (newReqBtn) {
      setState("ui.modal", "new-requirement");
      setState("ui.modalPayload", null);
      await refreshRoute();
      return;
    }

    const closeModalBtn = event.target.closest("[data-action='close-modal']");
    if (closeModalBtn) {
      closeModal();
      return;
    }

    const saveBtn = event.target.closest("[data-action='save-requirement']");
    if (saveBtn) {
      await saveRequirement();
      return;
    }

    const deleteBtn = event.target.closest("[data-action='delete-requirement']");
    if (deleteBtn) {
      const reqId = deleteBtn.dataset.id;
      openDeleteConfirmation(reqId);
      return;
    }

    const confirmDeleteBtn = event.target.closest("[data-action='confirm-delete-requirement']");
    if (confirmDeleteBtn) {
      const reqId = confirmDeleteBtn.dataset.id;
      await removeRequirement(reqId);
      return;
    }

    const stageFilterBtn = event.target.closest("[data-stage-filter]");
    if (stageFilterBtn) {
      const value = stageFilterBtn.dataset.stageFilter;
      setState("requerimientos.stageFilter", value);
      rerenderRequirementsBoardOnly();
      syncStageFilterChips();
      return;
    }

    const reqCard = event.target.closest("[data-action='edit-requirement']");
    if (reqCard && !event.target.closest("[data-action='delete-requirement']")) {
      const reqId = reqCard.dataset.id;
      openEditRequirement(reqId);
    }
  });

  document.addEventListener("input", (event) => {
    const searchInput = event.target.closest("#req-search");
    if (searchInput) {
      setState("requerimientos.search", searchInput.value);
      rerenderRequirementsBoardOnly();
    }

    const clienteInput = event.target.closest("#req-cliente");
    if (clienteInput) {
      const query = clienteInput.value.trim().toLowerCase();
      const suggestionsEl = document.getElementById("req-cliente-suggestions");
      if (!suggestionsEl) return;

      if (!query) {
        suggestionsEl.style.display = "none";
        suggestionsEl.innerHTML = "";
        return;
      }

      const matches = appState.clientes.items
        .filter((c) => c.nombre && c.nombre.toLowerCase().includes(query))
        .slice(0, 8);

      if (!matches.length) {
        suggestionsEl.style.display = "none";
        suggestionsEl.innerHTML = "";
        return;
      }

      suggestionsEl.innerHTML = matches
        .map(
          (c) =>
            `<button type="button" class="req-client-suggestion-item" data-name="${c.nombre.replaceAll('"', "&quot;")}">${c.nombre}</button>`
        )
        .join("");
      suggestionsEl.style.display = "block";
    }
  });

  document.addEventListener("click", (event) => {
    const suggestionItem = event.target.closest(".req-client-suggestion-item");
    if (suggestionItem) {
      const name = suggestionItem.dataset.name;
      const input = document.getElementById("req-cliente");
      if (input) input.value = name;
      const suggestionsEl = document.getElementById("req-cliente-suggestions");
      if (suggestionsEl) {
        suggestionsEl.style.display = "none";
        suggestionsEl.innerHTML = "";
      }
      return;
    }

    // Close suggestions when clicking outside
    const autocompleteWrap = event.target.closest(".req-client-autocomplete");
    if (!autocompleteWrap) {
      const suggestionsEl = document.getElementById("req-cliente-suggestions");
      if (suggestionsEl) {
        suggestionsEl.style.display = "none";
      }
    }
  }, true);
}

export async function loadRequirements() {
  try {
    appState.requerimientos.items = await fetchRequirements();
  } catch (error) {
    console.error("Error cargando requerimientos:", error);
    alert("No se pudieron cargar los requerimientos desde Firebase.");
  }
}

function closeModal() {
  setState("ui.modal", null);
  setState("ui.modalPayload", null);
  void refreshRoute();
}

function openEditRequirement(reqId) {
  const item = appState.requerimientos.items.find((req) => req.id === reqId);
  if (!item) return;

  setState("ui.modal", "edit-requirement");
  setState("ui.modalPayload", item);
  void refreshRoute();
}

function openDeleteConfirmation(reqId) {
  const item = appState.requerimientos.items.find((req) => req.id === reqId);
  if (!item) return;

  setState("ui.modal", "delete-requirement");
  setState("ui.modalPayload", item);
  void refreshRoute();
}

async function saveRequirement() {
  const id = document.getElementById("req-id")?.value?.trim();
  const organismo = document.getElementById("req-organismo")?.value?.trim();
  const cliente = document.getElementById("req-cliente")?.value?.trim();
  const descripcion = document.getElementById("req-descripcion")?.value?.trim();
  const stage = document.getElementById("req-stage")?.value;
  const fechaIngreso = document.getElementById("req-fecha-ingreso")?.value;
  const fechaLimite = document.getElementById("req-fecha-limite")?.value;
  const responsable = document.getElementById("req-responsable")?.value?.trim();
  const expediente = document.getElementById("req-expediente")?.value?.trim();
  const observaciones = document.getElementById("req-observaciones")?.value?.trim();

  if (!organismo || !cliente || !descripcion || !stage) {
    alert("Completá organismo, cliente, descripción y estado.");
    return;
  }

  const payload = {
    organismo,
    cliente,
    descripcion,
    stage,
    fechaIngreso,
    fechaLimite,
    responsable,
    expediente,
    observaciones
  };

  try {
    if (id) {
      await updateRequirement(id, payload);
    } else {
      await createRequirement(payload);
    }

    await loadRequirements();
    closeModal();
  } catch (error) {
    console.error("Error guardando requerimiento:", error);
    alert("No se pudo guardar el requerimiento en Firebase.");
  }
}

async function removeRequirement(id) {
  if (!id) return;

  try {
    await deleteRequirement(id);
    await loadRequirements();
    closeModal();
  } catch (error) {
    console.error("Error eliminando requerimiento:", error);
    alert("No se pudo eliminar el requerimiento.");
  }
}
