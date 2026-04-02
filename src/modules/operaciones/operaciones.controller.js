import { appState, setState } from "../../app/state.js";
import { refreshRoute } from "../../app/route-refresh.js";
import {
  fetchOperaciones,
  createOperacion,
  createOperacionesMany,
  updateOperacion,
  deleteOperacion
} from "./operaciones.service.js";
import { fetchContactos } from "../clientes/contactos.service.js";
import { estadoInicialSegunVencimiento } from "./operaciones-estado.js";
import {
  filterAndSortOperaciones,
  computeOperacionKpis,
  renderOperacionRow,
  paintOperacionesFilters
} from "./operaciones.view.js";
import { saveCumplimiento } from "./cumplimentar.service.js";
import {
  sugerirVencimientoIvaReferencia,
  ultimoDigitoCuit
} from "../../data/arca-calendario.js";
import { findObligacionByNombre, obligacionGeneraMesesFuturos } from "../../data/obligaciones-catalog.js";
import {
  calcularVencimiento,
  monthInputToPeriodo,
  enumerateMonthsYmInclusiveRange,
  tipoPeriodoImplicitoObligacion
} from "../../data/vencimientos-engine.js";
import {
  ULTIMO_PERIODO_CALENDARIO_OPERATIVO,
  validarPeriodoObligacionVsCalendario,
  validarTareaPeriodoYVencimiento
} from "../../data/calendario-fiscal-limits.js";

function setOperacionesLoadError(message) {
  setState("operaciones.loadError", message);
}

const FILTER_ID_TO_STATE_KEY = {
  "op-filter-estado": "estadoFilter",
  "op-filter-cliente": "clienteFilter",
  "op-filter-obligacion": "obligacionFilter",
  "op-filter-mes-vto": "mesVtoFilter",
  "op-filter-usuario": "usuarioFilter"
};

function closeAllFilterPanels() {
  document.querySelectorAll(".op-mfilter-panel").forEach((p) => p.classList.remove("is-visible"));
  document.querySelectorAll("[data-filter-toggle]").forEach((b) => b.classList.remove("is-open"));
}

function updateFilterBadge(filterId, selected) {
  const countEl = document.getElementById(`${filterId}-count`);
  const btn = document.querySelector(`[data-filter-toggle="${filterId}"]`);
  if (countEl) {
    const hasActive = selected.length > 0;
    countEl.classList.toggle("is-hidden", !hasActive);
    countEl.textContent = hasActive ? String(selected.length) : "";
  }
  if (btn) btn.classList.toggle("is-active", selected.length > 0);
}

let opEventsBound = false;

function normalizeUserKey(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function canCumplimentarTarea(item, user) {
  if (!item) return false;
  if (item.tipo !== "tarea") return true; // restricción pedida solo para tareas
  const resp = normalizeUserKey(item.responsable);
  const name = normalizeUserKey(user?.name);
  const email = normalizeUserKey(user?.email);
  return Boolean(resp && (resp === name || resp === email));
}

function buildMailtoUrl({ to, subject, body }) {
  const toStr = Array.isArray(to) ? to.filter(Boolean).join(",") : String(to || "");
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  return `mailto:${encodeURIComponent(toStr)}?${params.toString().replaceAll("+", "%20")}`;
}

function buildMsOutlookUrl({ to, subject, body }) {
  const toStr = Array.isArray(to) ? to.filter(Boolean).join(";") : String(to || "");
  const params = new URLSearchParams();
  if (toStr) params.set("to", toStr);
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  // Intenta abrir Outlook app (si está instalado y el esquema está habilitado)
  return `ms-outlook://compose?${params.toString()}`;
}

/**
 * Intenta abrir Outlook (`ms-outlook://`); si el navegador bloquea o no aplica, usa `mailto:` en nueva pestaña
 * para no sacarte de la app antes de guardar en Firestore.
 */
function openOutlookCompose({ to, subject, body }) {
  const mailto = buildMailtoUrl({ to, subject, body });
  const a = document.createElement("a");
  a.href = mailto;
  a.click();
}

function syncTareaProgramacionPanels() {
  const sel = document.getElementById("op-tipo-programacion")?.value ?? "";
  document.querySelectorAll("[data-op-prog-for]").forEach((el) => {
    const v = el.getAttribute("data-op-prog-for");
    el.classList.toggle("op-prog-sub--hidden", v !== sel);
  });
}

function readProgramacionDetalleFromForm(tipoProgramacion) {
  const out = {};
  switch (tipoProgramacion) {
    case "Días de la semana": {
      const sel = [...document.querySelectorAll('input[name="op-dow"]:checked')].map((c) => Number(c.value));
      out.diasSemana = sel.sort((a, b) => a - b);
      break;
    }
    case "Días del mes": {
      const sel = [...document.querySelectorAll('input[name="op-dom"]:checked')].map((c) => Number(c.value));
      out.diasMes = sel.sort((a, b) => a - b);
      break;
    }
    case "Día del año": {
      const v = document.getElementById("op-prog-dia-anual")?.value;
      if (v) out.diaAnual = v.slice(5);
      break;
    }
    case "Un día fijo": {
      const n = Number(document.getElementById("op-prog-dia-fijo")?.value);
      if (n >= 1 && n <= 31) out.diaFijoMes = n;
      break;
    }
    case "Varios días fijos": {
      const ul = document.getElementById("op-prog-varias-list");
      out.fechasFijas = ul
        ? [...ul.querySelectorAll(".op-prog-varias-iso")].map((el) => el.textContent.trim()).filter(Boolean)
        : [];
      break;
    }
    default:
      break;
  }
  return out;
}

function validarDetalleProgramacion(tipoProgramacion, det) {
  switch (tipoProgramacion) {
    case "Días de la semana":
      if (!det.diasSemana?.length) return "Marcá al menos un día de la semana.";
      break;
    case "Días del mes":
      if (!det.diasMes?.length) return "Marcá al menos un día del mes.";
      break;
    case "Día del año":
      if (!det.diaAnual) return "Indicá la fecha del año (se repetirá cada año).";
      break;
    case "Un día fijo":
      if (!det.diaFijoMes) return "Indicá el día del mes (1–31).";
      break;
    case "Varios días fijos":
      if (!det.fechasFijas?.length) return "Agregá al menos una fecha con «Agregar fecha».";
      break;
    default:
      break;
  }
  return null;
}


async function closeModal() {
  setState("ui.modal", null);
  setState("ui.modalPayload", null);
  await refreshRoute();
}

export async function loadOperaciones() {
  setOperacionesLoadError(null);
  try {
    appState.operaciones.items = await fetchOperaciones();
    paintOperacionesFilters(appState.operaciones.items);
  } catch (e) {
    console.error("loadOperaciones:", e?.code, e?.message, e);
    appState.operaciones.items = [];

    let msg =
      "No se pudieron cargar las obligaciones. Revisá la consola del navegador (F12) para el detalle técnico.";

    if (e?.code === "permission-denied") {
      msg =
        "Firebase rechazó la lectura (permission-denied). Suele pasar si todavía no desplegaste las reglas que agregan la colección operaciones. Desde la carpeta del proyecto: firebase deploy --only firestore:rules — o cargá en la consola de Firebase las mismas reglas que tenés en firestore.rules.";
    } else if (e?.code === "unauthenticated") {
      msg = "No hay sesión activa. Volvé a iniciar sesión e intentá de nuevo.";
    } else if (e?.message) {
      msg = `${msg} Código: ${e.code || "—"} · ${e.message}`;
    }

    setOperacionesLoadError(msg);
  }
}

export function paintOperacionesTable() {
  const tbody = document.getElementById("op-tbody");
  const kpis = document.getElementById("op-kpis");
  const empty = document.getElementById("op-empty");
  const alertEl = document.getElementById("op-load-error");
  if (!tbody || !kpis) return;

  if (alertEl) {
    const err = appState.operaciones.loadError;
    if (err) {
      alertEl.hidden = false;
      alertEl.textContent = err;
    } else {
      alertEl.hidden = true;
      alertEl.textContent = "";
    }
  }

  const user = appState.session.user;
  const all = appState.operaciones.items ?? [];
  const filtered = filterAndSortOperaciones(all, appState.operaciones);
  const k = computeOperacionKpis(all);

  kpis.innerHTML = `
    <div class="op-kpi"><span class="op-kpi-n">${k.total}</span><span class="op-kpi-l">Total cargados</span></div>
    <div class="op-kpi op-kpi--pend"><span class="op-kpi-n">${k.pendientes}</span><span class="op-kpi-l">Pendientes</span></div>
    <div class="op-kpi op-kpi--soon"><span class="op-kpi-n">${k.prox7}</span><span class="op-kpi-l">Vencen en 7 días</span></div>
    <div class="op-kpi op-kpi--bad"><span class="op-kpi-n">${k.vencidas}</span><span class="op-kpi-l">Vencidas (abiertas)</span></div>
    <div class="op-kpi op-kpi--ok"><span class="op-kpi-n">${k.cerradas}</span><span class="op-kpi-l">Cerradas</span></div>
  `;

  if (!filtered.length) {
    tbody.innerHTML = "";
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  tbody.innerHTML = filtered.map((row) => renderOperacionRow(row, user)).join("");

  syncSortHeaders();
}

function syncSortHeaders() {
  const { sortKey, sortDir } = appState.operaciones;
  document.querySelectorAll("[data-op-sort]").forEach((btn) => {
    const k = btn.dataset.opSort;
    const active = k === sortKey;
    btn.classList.toggle("is-active", active);
    const ico = btn.querySelector(".op-sort-ico");
    if (ico && active) ico.textContent = sortDir === "asc" ? "↑" : "↓";
    else if (ico) ico.textContent = "↕";
  });
}

function toggleArcaPanel() {
  const org   = document.getElementById("op-organismo")?.value;
  const panel = document.getElementById("op-arca-panel");
  if (panel) panel.classList.toggle("is-hidden", org !== "ARCA");
}

/**
 * Calcula automáticamente la fecha de vencimiento cuando se selecciona
 * una obligación del catálogo y hay período + cliente definidos.
 */
function autoCalcVencimiento() {
  const obligacionInput = document.getElementById("op-obligacion");
  const periodoInput    = document.getElementById("op-periodo");     // type="month" → "2026-03"
  const clienteSel      = document.getElementById("op-cliente-id");
  const vencInput       = document.getElementById("op-vencimiento");
  const orgSel          = document.getElementById("op-organismo");
  const hintEl          = document.getElementById("op-calc-hint");

  if (!obligacionInput || !vencInput) return;

  if (document.getElementById("op-tipo")?.value === "tarea") {
    if (hintEl) hintEl.textContent = "";
    return;
  }

  const nombre      = obligacionInput.value.trim();
  const catalogItem = findObligacionByNombre(nombre);

  if (!catalogItem) {
    if (hintEl) hintEl.textContent = "";
    return; // no está en el catálogo → fecha manual
  }

  // Auto-completar organismo desde el catálogo
  if (orgSel && catalogItem.organismo) {
    orgSel.value = catalogItem.organismo;
  }

  const periodoRaw = periodoInput?.value ?? ""; // "2026-03"
  if (!periodoRaw) {
    if (hintEl) hintEl.textContent = "📅 Seleccioná el período para calcular el vencimiento.";
    return;
  }

  const clienteId  = clienteSel?.value ?? "";
  const cliente    = appState.clientes.items.find(c => c.id === clienteId);
  const cuit       = cliente?.cuit ?? "";

  const resultado  = calcularVencimiento(catalogItem.calcRule, periodoRaw, cuit);

  if (resultado.iso) {
    vencInput.value = resultado.iso;
    if (hintEl) {
      hintEl.textContent = resultado.advertencia
        ? `📅 Auto-calculado. ${resultado.advertencia}`
        : "📅 Fecha calculada automáticamente desde el calendario oficial.";
    }
  } else if (hintEl) {
    hintEl.textContent = resultado.advertencia ?? "";
  }
}

export function bindOperacionesEvents() {
  if (opEventsBound) return;
  opEventsBound = true;

  document.addEventListener("click", async (event) => {
    const newBtn = event.target.closest("#btn-new-op");
    if (newBtn) {
      setState("ui.modal", "new-operacion");
      setState("ui.modalPayload", null);
      await refreshRoute();
      toggleArcaPanel();
      return;
    }

    const newTareaBtn = event.target.closest("#btn-new-tarea");
    if (newTareaBtn) {
      setState("ui.modal", "new-tarea");
      setState("ui.modalPayload", null);
      await refreshRoute();
      syncTareaProgramacionPanels();
      return;
    }

    const editBtn = event.target.closest("[data-action='edit-operacion']");
    if (editBtn) {
      const id = editBtn.dataset.id;
      const item = appState.operaciones.items.find((x) => x.id === id);
      if (!item) return;
      setState("ui.modal", "edit-operacion");
      setState("ui.modalPayload", item);
      await refreshRoute();
      toggleArcaPanel();
      if (document.getElementById("op-tipo-programacion")) syncTareaProgramacionPanels();
      return;
    }

    const cumpBtn = event.target.closest("[data-action='cumplimentar']");
    if (cumpBtn) {
      const id = cumpBtn.dataset.id;
      const item = appState.operaciones.items.find((x) => x.id === id);
      if (!item) return;
      if (!canCumplimentarTarea(item, appState.session.user)) {
        alert("Solo el responsable puede cumplimentar esta tarea. Podés verla, pero no cerrarla.");
        return;
      }
      try {
        const contactos = item.clienteId ? await fetchContactos(item.clienteId) : [];
        setState("operaciones.cumplimentarContactos", contactos);
      } catch (e) {
        console.error("fetchContactos:", e);
        setState("operaciones.cumplimentarContactos", []);
      }
      setState("ui.modal", "cumplimentar");
      setState("ui.modalPayload", item);
      await refreshRoute();
      // default: envío desactivado; el panel se muestra al tildar el checkbox
      return;
    }

    if (event.target.closest("#op-prog-varias-add") && document.getElementById("op-form")) {
      const picker = document.getElementById("op-prog-varias-picker");
      const ul = document.getElementById("op-prog-varias-list");
      const iso = picker?.value;
      if (!iso) {
        alert("Elegí una fecha para agregar.");
        return;
      }
      if (ul && [...ul.querySelectorAll(".op-prog-varias-iso")].some((s) => s.textContent.trim() === iso)) {
        alert("Esa fecha ya está en la lista.");
        return;
      }
      if (ul) {
        const li = document.createElement("li");
        li.className = "op-prog-varias-item";
        li.innerHTML = `<span class="op-prog-varias-iso">${iso}</span><button type="button" class="op-prog-varias-remove" data-iso="${iso}" aria-label="Quitar">×</button>`;
        ul.appendChild(li);
      }
      if (picker) picker.value = "";
      return;
    }

    const remVarias = event.target.closest(".op-prog-varias-remove");
    if (remVarias && document.getElementById("op-form")) {
      remVarias.closest("li")?.remove();
      return;
    }

    const delBtn = event.target.closest("[data-action='delete-operacion']");
    if (delBtn) {
      const id = delBtn.dataset.id;
      const item = appState.operaciones.items.find((x) => x.id === id);
      if (!item) return;
      setState("ui.modal", "delete-operacion");
      setState("ui.modalPayload", item);
      await refreshRoute();
      return;
    }

    const confirmDel = event.target.closest("[data-action='confirm-delete-operacion']");
    if (confirmDel) {
      const id = confirmDel.dataset.id;
      try {
        await deleteOperacion(id);
        await loadOperaciones();
        await closeModal();
      } catch (e) {
        console.error(e);
        alert("No se pudo eliminar el registro.");
      }
      return;
    }

    const saveBtn = event.target.closest("[data-action='save-operacion']");
    if (saveBtn) {
      await saveOperacion();
      return;
    }

    const confirmCump = event.target.closest("[data-action='confirm-cumplimentar']");
    if (confirmCump) {
      await confirmCumplimentar();
      return;
    }

    const openOutlookBtn = event.target.closest("[data-action='open-outlook-compose']");
    if (openOutlookBtn) {
      const requiereEnvio = Boolean(document.getElementById("op-cump-enviar")?.checked);
      if (!requiereEnvio) {
        alert("Primero activá «Registrar envío al cliente» y seleccioná destinatarios.");
        return;
      }
      const contactos = appState.operaciones.cumplimentarContactos ?? [];
      const selectedIds = [...document.querySelectorAll('input[name="op-cump-dest"]:checked')].map((el) => el.value);
      const emails = contactos
        .filter((c) => selectedIds.includes(c.id))
        .map((c) => c.email ?? "")
        .filter(Boolean);
      if (!emails.length) {
        alert("Seleccioná al menos un destinatario con email.");
        return;
      }
      const asunto = document.getElementById("op-cump-asunto")?.value?.trim() ?? "";
      const cuerpo = document.getElementById("op-cump-cuerpo")?.value ?? "";
      openOutlookCompose({ to: emails, subject: asunto, body: cuerpo });
      return;
    }

    // Close filter panels when clicking outside
    if (!event.target.closest(".op-mfilter")) {
      closeAllFilterPanels();
    }

    // Toggle multi-select filter panel
    const filterToggle = event.target.closest("[data-filter-toggle]");
    if (filterToggle) {
      const id = filterToggle.dataset.filterToggle;
      const panel = document.getElementById(`${id}-panel`);
      if (!panel) return;
      const isOpen = panel.classList.contains("is-visible");
      closeAllFilterPanels();
      if (!isOpen) {
        panel.classList.add("is-visible");
        filterToggle.classList.add("is-open");
      }
      return;
    }

    const sortBtn = event.target.closest("[data-op-sort]");
    if (sortBtn && document.getElementById("op-tbody")) {
      const key = sortBtn.dataset.opSort;
      if (appState.operaciones.sortKey === key) {
        setState(
          "operaciones.sortDir",
          appState.operaciones.sortDir === "asc" ? "desc" : "asc"
        );
      } else {
        setState("operaciones.sortKey", key);
        setState("operaciones.sortDir", "asc");
      }
      paintOperacionesTable();
      return;
    }

    const sugerir = event.target.closest("#op-btn-sugerir-arca");
    if (sugerir) {
      const monthEl = document.getElementById("op-arca-month");
      const clienteSel = document.getElementById("op-cliente-id");
      const vencInput = document.getElementById("op-vencimiento");
      const ym = monthEl?.value;
      if (!ym) {
        alert("Elegí el mes de vencimiento para calcular la sugerencia.");
        return;
      }
      const [y, m] = ym.split("-").map(Number);
      const opt = clienteSel?.selectedOptions?.[0];
      const clienteId = clienteSel?.value;
      if (!clienteId) {
        alert("Seleccioná un cliente (necesitamos el CUIT de la ficha).");
        return;
      }
      const c = appState.clientes.items.find((x) => x.id === clienteId);
      const cuit = c?.cuit ?? "";
      if (!ultimoDigitoCuit(cuit)) {
        alert("El cliente no tiene CUIT cargado: no podemos sugerir el día por terminación.");
        return;
      }
      const iso = sugerirVencimientoIvaReferencia({ cuit, year: y, month: m });
      if (!iso) {
        alert("No se pudo calcular la fecha.");
        return;
      }
      vencInput.value = iso;
      return;
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.id === "op-organismo") toggleArcaPanel();

    // Multi-select filter checkboxes
    const checkbox = event.target.closest(".op-mfilter-panel input[type='checkbox']");
    if (checkbox) {
      const panel = checkbox.closest(".op-mfilter-panel");
      const filterId = panel?.id?.replace("-panel", "");
      const stateKey = filterId ? FILTER_ID_TO_STATE_KEY[filterId] : null;
      if (stateKey) {
        const selected = [...document.querySelectorAll(`input[name="${filterId}"]:checked`)].map((el) => el.value);
        setState(`operaciones.${stateKey}`, selected);
        updateFilterBadge(filterId, selected);
        paintOperacionesTable();
      }
      return;
    }

    if (event.target.id === "op-periodo" || event.target.id === "op-cliente-id") {
      if (document.getElementById("op-tipo")?.value !== "tarea") autoCalcVencimiento();
    }
    if (event.target.id === "op-tipo-programacion") {
      syncTareaProgramacionPanels();
    }
    if (event.target.id === "op-cump-enviar") {
      const panel = document.getElementById("op-cump-envio");
      if (panel) panel.classList.toggle("op-prog-sub--hidden", !event.target.checked);
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.id === "op-search") {
      setState("operaciones.search", event.target.value);
      paintOperacionesTable();
    }
    if (event.target.id === "op-obligacion") {
      if (document.getElementById("op-tipo")?.value !== "tarea") autoCalcVencimiento();
    }
  });
}

async function confirmCumplimentar() {
  if (!document.getElementById("op-cump-form")) return;
  const id = document.getElementById("op-cump-id")?.value?.trim();
  const item = appState.operaciones.items.find((x) => x.id === id) || appState.ui.modalPayload;
  if (!item?.id) {
    alert("No se encontró la operación a cumplimentar.");
    return;
  }
  if (!canCumplimentarTarea(item, appState.session.user)) {
    alert("Solo el responsable puede cumplimentar esta tarea.");
    return;
  }

  const fechaCumplimiento = document.getElementById("op-cump-fecha")?.value ?? "";
  if (!fechaCumplimiento) {
    alert("Ingresá la fecha de cumplimiento.");
    return;
  }

  const tiempoStr = document.getElementById("op-cump-tiempo")?.value?.trim() ?? "";
  const tiempoInsumidoMin = parseInt(tiempoStr, 10);
  if (!tiempoStr || isNaN(tiempoInsumidoMin) || tiempoInsumidoMin < 1) {
    alert("Ingresá el tiempo insumido en minutos (mínimo 1 minuto).");
    return;
  }

  const comentarioInterno = document.getElementById("op-cump-coment")?.value?.trim() ?? "";
  const requiereEnvio = Boolean(document.getElementById("op-cump-enviar")?.checked);

  const contactos = appState.operaciones.cumplimentarContactos ?? [];
  const selectedIds = requiereEnvio
    ? [...document.querySelectorAll('input[name="op-cump-dest"]:checked')].map((el) => el.value)
    : [];
  const destinatarios = requiereEnvio
    ? contactos
        .filter((c) => selectedIds.includes(c.id))
        .map((c) => ({
          contactoId: c.id,
          nombre: c.nombre ?? "",
          email: c.email ?? ""
        }))
        .filter((d) => d.email)
    : [];

  if (requiereEnvio && destinatarios.length === 0) {
    alert("Seleccioná al menos un destinatario con email.");
    return;
  }

  const asunto = requiereEnvio ? (document.getElementById("op-cump-asunto")?.value?.trim() ?? "") : "";
  const cuerpo = requiereEnvio ? (document.getElementById("op-cump-cuerpo")?.value ?? "") : "";

  const venc = String(item.vencimiento || "").slice(0, 10);
  const nuevoEstado = venc && fechaCumplimiento > venc ? "Cumplido Tardio" : "Cumplido";

  const who = appState.session.user?.name ?? appState.session.user?.email ?? "";

  try {
    await saveCumplimiento(
      item.id,
      {
        clienteId: item.clienteId ?? "",
        clienteNombre: item.clienteNombre ?? "",
        obligacion: item.obligacion ?? "",
        periodo: item.periodo ?? "",
        fechaCumplimiento,
        tiempoInsumidoMin,
        comentarioInterno,
        requiereEnvio,
        destinatarios,
        asunto,
        cuerpo,
        cumplidoPor: who
      },
      nuevoEstado
    );
    await loadOperaciones();
    await closeModal();
    // Después de guardar: abrir Outlook / mailto (adjuntos en el cliente de correo)
    if (requiereEnvio) {
      openOutlookCompose({
        to: destinatarios.map((d) => d.email),
        subject: asunto,
        body: cuerpo
      });
    }
  } catch (e) {
    console.error(e);
    alert("No se pudo registrar el cumplimiento.");
  }
}

async function saveOperacion() {
  if (!document.getElementById("op-form")) return;

  const id = document.getElementById("op-id")?.value?.trim();
  const isEdit = Boolean(id);
  const clienteSel = document.getElementById("op-cliente-id");
  const clienteId = clienteSel?.value;
  const opt = clienteSel?.selectedOptions?.[0];
  const clienteNombre = opt?.dataset?.nombre?.trim() || opt?.textContent?.trim() || "";
  const cliente = appState.clientes.items.find((c) => c.id === clienteId);

  const obligacion = document.getElementById("op-obligacion")?.value?.trim();
  const organismo = document.getElementById("op-organismo")?.value;
  const periodoRaw = document.getElementById("op-periodo")?.value ?? "";
  const periodo = monthInputToPeriodo(periodoRaw) || periodoRaw;
  let vencimiento = document.getElementById("op-vencimiento")?.value ?? "";
  const responsable = document.getElementById("op-responsable")?.value?.trim() ?? "";
  const notas = document.getElementById("op-notas")?.value?.trim() ?? "";
  const tipo = document.getElementById("op-tipo")?.value === "tarea" ? "tarea" : "obligacion";

  let tipoPeriodo = null;
  let tipoProgramacion = null;
  let programacionDetalle = null;

  if (!clienteId || !obligacion) {
    alert("Cliente y descripción son obligatorios.");
    return;
  }

  if (tipo === "tarea") {
    tipoPeriodo = document.getElementById("op-tipo-periodo")?.value ?? "";
    tipoProgramacion = document.getElementById("op-tipo-programacion")?.value ?? "";
    if (!periodoRaw) {
      alert("En tareas el período es obligatorio.");
      return;
    }
    if (!tipoPeriodo || !tipoProgramacion) {
      alert("En tareas completá tipo de período y tipo de programación.");
      return;
    }
    if (!vencimiento) {
      alert("En tareas el vencimiento es obligatorio.");
      return;
    }
    const errTarea = validarTareaPeriodoYVencimiento(periodoRaw, vencimiento);
    if (errTarea) {
      alert(errTarea);
      return;
    }
    programacionDetalle = readProgramacionDetalleFromForm(tipoProgramacion);
    const perr = validarDetalleProgramacion(tipoProgramacion, programacionDetalle);
    if (perr) {
      alert(perr);
      return;
    }
    if (!Object.keys(programacionDetalle).length) programacionDetalle = null;
  } else {
    if (!periodoRaw) {
      alert("Seleccioná el período para poder calcular o verificar el vencimiento de la obligación.");
      return;
    }
    if (!vencimiento) {
      const cat = findObligacionByNombre(obligacion);
      if (cat) {
        const r = calcularVencimiento(cat.calcRule, periodoRaw, cliente?.cuit ?? "");
        if (r.iso) vencimiento = r.iso;
      }
    }
    if (!vencimiento) {
      alert(
        "No hay vencimiento: elegí una obligación del catálogo con período y CUIT en el cliente, o ingresá la fecha manualmente."
      );
      return;
    }
    const limObl = validarPeriodoObligacionVsCalendario(periodoRaw);
    if (!limObl.ok) {
      alert(limObl.mensaje);
      return;
    }
  }

  const cat = tipo === "obligacion" ? findObligacionByNombre(obligacion) : null;
  const tipoPeriodoGuardado =
    tipo === "tarea"
      ? tipoPeriodo
      : cat
        ? tipoPeriodoImplicitoObligacion(cat.calcRule) ?? "Mes vencido"
        : "Mes vencido";

  try {
    if (tipo === "obligacion" && !isEdit && cat && obligacionGeneraMesesFuturos(cat)) {
      const mesesYm = enumerateMonthsYmInclusiveRange(periodoRaw, ULTIMO_PERIODO_CALENDARIO_OPERATIVO);
      if (!mesesYm.length) {
        alert(
          "No hay meses a generar: revisá el período inicial y el tope del calendario cargado en el sistema."
        );
        return;
      }
      const primer = monthInputToPeriodo(mesesYm[0]);
      const ultimo = monthInputToPeriodo(mesesYm[mesesYm.length - 1]);
      if (
        !confirm(
          `Se crearán ${mesesYm.length} registros de «${obligacion}» (${primer} … ${ultimo}), uno por mes impositivo, con vencimiento calculado mes a mes según el calendario/tabla cargada (tope ${ULTIMO_PERIODO_CALENDARIO_OPERATIVO}). ¿Continuar?`
        )
      ) {
        return;
      }
      const payloads = [];
      for (const ym of mesesYm) {
        const r = calcularVencimiento(cat.calcRule, ym, cliente?.cuit ?? "");
        if (!r.iso) {
          alert(`No se pudo calcular el vencimiento para el período ${monthInputToPeriodo(ym)}.`);
          return;
        }
        payloads.push({
          tipo: "obligacion",
          clienteId,
          clienteNombre,
          obligacion,
          organismo: organismo || cat.organismo || "Otro",
          periodo: monthInputToPeriodo(ym),
          vencimiento: r.iso,
          estado: estadoInicialSegunVencimiento(r.iso),
          responsable,
          notas,
          tipoPeriodo: tipoPeriodoImplicitoObligacion(cat.calcRule) ?? "Mes vencido",
          tipoProgramacion: null
        });
      }
      await createOperacionesMany(payloads);
      await loadOperaciones();
      await closeModal();
      return;
    }

    const estado = isEdit
      ? document.getElementById("op-estado")?.value ?? "Pendiente"
      : estadoInicialSegunVencimiento(vencimiento);

    const payload = {
      tipo,
      clienteId,
      clienteNombre,
      obligacion,
      organismo: organismo || "Otro",
      periodo,
      vencimiento,
      estado,
      responsable,
      notas,
      tipoPeriodo: tipoPeriodoGuardado,
      tipoProgramacion: tipo === "tarea" ? tipoProgramacion : null
    };
    if (tipo === "tarea") payload.programacionDetalle = programacionDetalle;

    if (id) await updateOperacion(id, payload);
    else await createOperacion(payload);
    await loadOperaciones();
    await closeModal();
  } catch (e) {
    console.error(e);
    alert("No se pudo guardar en Firebase.");
  }
}
