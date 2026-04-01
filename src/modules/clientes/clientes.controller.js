import { appState } from "../../app/state.js";
import {
  fetchClientes,
  createCliente,
  updateCliente,
  importClientesBatch
} from "./clientes.service.js";
import {
  fetchContactos,
  createContacto,
  updateContacto,
  deleteContacto
} from "./contactos.service.js";
import {
  renderClientesListHtml,
  renderClientesFormPanelHtml,
  renderInsightsPanelHtml,
  renderContactosSectionHtml,
  INSIGHTS_FIELDS,
  parseEtiquetas
} from "./clientes.view.js";
import { openInfoModal } from "../../components/modal.js";

let clientesEventsBound = false;

// ─── Load ──────────────────────────────────────────────────────────────────────

export async function loadClientes() {
  try {
    appState.clientes.items = await fetchClientes();
  } catch (err) {
    console.error("Error cargando clientes:", err);
  }
}

// ─── Rerender helpers ──────────────────────────────────────────────────────────

function rerenderList() {
  const el = document.getElementById("clientes-list");
  if (el) el.innerHTML = renderClientesListHtml();
}

function rerenderFormPanel() {
  const el = document.getElementById("clientes-form-panel");
  if (el) el.innerHTML = renderClientesFormPanelHtml();
}

function resetContactosState() {
  appState.contactos.items = [];
  appState.contactos.clienteId = null;
  appState.contactos.isAddingNew = false;
  appState.contactos.editId = null;
}

async function loadContactosForSelectedCliente() {
  const clienteId = appState.clientes.selectedId;
  if (!clienteId) {
    resetContactosState();
    return;
  }
  try {
    const items = await fetchContactos(clienteId);
    appState.contactos.items = items;
    appState.contactos.clienteId = clienteId;
    appState.contactos.isAddingNew = false;
    appState.contactos.editId = null;
  } catch (e) {
    console.error("fetchContactos:", e);
    appState.contactos.items = [];
    appState.contactos.clienteId = clienteId;
  }
}

function rerenderInsights() {
  const el = document.getElementById("clientes-insights-wrap");
  if (el) el.innerHTML = renderInsightsPanelHtml();
}

// ─── Import progress UI ────────────────────────────────────────────────────────

function showImportProgress(text) {
  const wrap = document.getElementById("clientes-import-progress");
  const msg  = document.getElementById("clientes-import-progress-text");
  const lbl  = document.getElementById("lbl-import-clientes");
  if (wrap) { wrap.style.display = "flex"; }
  if (msg)  { msg.textContent = text; }
  if (lbl)  { lbl.style.display = "none"; }
}

function hideImportProgress() {
  const wrap = document.getElementById("clientes-import-progress");
  const lbl  = document.getElementById("lbl-import-clientes");
  if (wrap) { wrap.style.display = "none"; }
  if (lbl)  { lbl.style.display = ""; }
}

// ─── Accesos DOM helpers ───────────────────────────────────────────────────────

const ORGANISMOS = ["ARCA", "DGR", "ARBA", "AFIP", "AGIP", "Municipalidad", "Otro"];

function addAccesoRow() {
  const list = document.getElementById("accesos-list");
  if (!list) return;
  const row = document.createElement("div");
  row.className = "acceso-row";
  row.innerHTML = `
    <select class="acc-org">
      <option value="">Organismo...</option>
      ${ORGANISMOS.map(o => `<option value="${o}">${o}</option>`).join("")}
    </select>
    <input type="text" class="acc-user" placeholder="Usuario / CUIT" value="">
    <button type="button" class="acceso-mini-btn" data-acceso-copy="user">Copiar</button>
    <input type="password" class="acc-pass" placeholder="Clave" value="">
    <button type="button" class="acceso-mini-btn" data-acceso-copy="pass">Copiar</button>
    <button type="button" class="acceso-mini-btn" data-acceso-toggle>👁</button>
    <button type="button" class="acceso-mini-btn acceso-mini-btn--danger" data-acceso-remove>✕</button>
  `;
  list.appendChild(row);
}

async function copyToClipboard(text, btn) {
  if (!text.trim()) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = "✓";
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }
  } catch {
    await openInfoModal("No se pudo copiar. Usá Ctrl+C / Cmd+C.");
  }
}

// ─── Form payload ──────────────────────────────────────────────────────────────

function getFormPayload() {
  const accesos = [...document.querySelectorAll("#accesos-list .acceso-row")]
    .map(row => ({
      organismo: row.querySelector(".acc-org")?.value?.trim() ?? "",
      usuario:   row.querySelector(".acc-user")?.value?.trim() ?? "",
      clave:     row.querySelector(".acc-pass")?.value?.trim() ?? ""
    }))
    .filter(a => a.organismo || a.usuario || a.clave);

  const g = id => document.getElementById(id)?.value?.trim() ?? "";

  return {
    id_cliente:            g("cf-id_cliente"),
    nombre:                g("cf-nombre"),
    tipo_societario:       g("cf-tipo_societario"),
    ganancias:             g("cf-ganancias"),
    iva:                   g("cf-iva"),
    tipo_iibb:             g("cf-tipo_iibb"),
    cuit:                  g("cf-cuit"),
    mes_cierre:            g("cf-mes_cierre"),
    telefono:              g("cf-telefono"),
    direccion:             g("cf-direccion"),
    jurisdiccion_domicilio: g("cf-jurisdiccion_domicilio"),
    etiquetas:             g("cf-etiquetas"),
    accesos,
    claves:                "",
    notas:                 g("cf-notas"),
    updated_by:            appState.session.user?.name ?? ""
  };
}

// ─── Excel Import (mismo comportamiento que HTML ESTUDIO ATT) ──────────────────

function normalizeKey(cell) {
  return String(cell ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\-_/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headerMatches(cell, keys) {
  const raw     = normalizeKey(cell);
  const compact = raw.replace(/\s+/g, "");
  return keys.some(k => {
    const nk = normalizeKey(k);
    return raw === nk || compact === nk.replace(/\s+/g, "");
  });
}

async function handleImportExcel(file) {
  showImportProgress("Leyendo archivo...");
  try {
    const XLSX = window.XLSX;
    if (!XLSX) {
      hideImportProgress();
      await openInfoModal("No se pudo cargar el lector de Excel. Verificá tu conexión a internet y recargá la página.");
      return;
    }

    const ab  = await file.arrayBuffer();
    const wb  = XLSX.read(ab);
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    if (!raw.length) {
      hideImportProgress();
      await openInfoModal("El archivo está vacío.");
      return;
    }

    // ── Detección de encabezados ────────────────────────────────────────────
    const isNameHeader = c => headerMatches(c, [
      "cliente", "nombre", "razon social", "razon_social", "apellido y nombre"
    ]);
    const isAnyKnownHeader = c => headerMatches(c, [
      "cliente", "nombre", "razon social", "razon_social", "apellido y nombre",
      "nro cliente", "nro. cliente", "numero cliente", "id", "id cliente",
      "tipo societario", "ganancias", "iva",
      "domicilio fiscal", "jurisdiccion domicilio fiscal",
      "cuit", "cuil", "dni", "mes de cierre", "tipo iibb", "etiquetas",
      "telefono", "tel", "celular", "movil",
      "email", "correo", "mail",
      "direccion", "domicilio",
      "claves", "clave", "accesos", "usuario y clave",
      "notas", "observaciones", "comentarios"
    ]);

    let headerRow = -1;
    for (let i = 0; i < Math.min(raw.length, 30); i++) {
      const row = raw[i] || [];
      const knownCount = row.filter(isAnyKnownHeader).length;
      if (row.some(isNameHeader) || knownCount >= 2) { headerRow = i; break; }
    }

    const pending    = [];
    const updatedBy  = appState.session.user?.name ?? "";

    if (headerRow >= 0) {
      // ── Archivo con encabezados reconocibles ──────────────────────────────
      const headers = raw[headerRow] || [];
      const idx = keys => headers.findIndex(h => headerMatches(h, keys));

      const iIdCliente    = idx(["nro cliente", "nro. cliente", "numero cliente", "id", "id cliente"]);
      const iNombre       = idx(["cliente", "nombre", "razon social", "razon_social", "apellido y nombre"]);
      const iTipoSoc      = idx(["tipo societario"]);
      const iGanancias    = idx(["ganancias"]);
      const iIva          = idx(["iva"]);
      const iDomicilio    = idx(["domicilio fiscal", "direccion", "domicilio"]);
      const iJurisdiccion = idx(["jurisdiccion domicilio fiscal"]);
      const iCuit         = idx(["cuit", "cuil", "dni"]);
      const iMesCierre    = idx(["mes de cierre"]);
      const iTipoIibb     = idx(["tipo iibb"]);
      const iEtiquetas    = idx(["etiquetas"]);
      const iTel          = idx(["telefono", "tel", "celular", "movil"]);
      const iEmail        = idx(["email", "correo", "mail"]);
      const iClaves       = idx(["claves", "clave", "accesos", "usuario y clave"]);
      const iNotas        = idx(["notas", "observaciones", "comentarios"]);

      const g = (row, i) => i >= 0 ? (row[i] ?? "").toString().trim() : "";

      for (let i = headerRow + 1; i < raw.length; i++) {
        const row    = raw[i] || [];
        const nombre = iNombre >= 0 ? g(row, iNombre) : (row[0] ?? "").toString().trim();
        if (!nombre) continue;

        const notas   = g(row, iNotas);
        const payload = {
          id_cliente:            g(row, iIdCliente),
          nombre,
          tipo_societario:       g(row, iTipoSoc),
          ganancias:             g(row, iGanancias),
          iva:                   g(row, iIva),
          tipo_iibb:             g(row, iTipoIibb),
          cuit:                  g(row, iCuit),
          mes_cierre:            g(row, iMesCierre),
          telefono:              g(row, iTel),
          email:                 g(row, iEmail),
          direccion:             g(row, iDomicilio),
          jurisdiccion_domicilio: g(row, iJurisdiccion),
          etiquetas:             g(row, iEtiquetas),
          claves:                g(row, iClaves),
          updated_by:            updatedBy
        };
        // Solo agrega notas si el Excel trae texto: así merge conserva las notas guardadas en la app
        if (notas) payload.notas = notas;

        const docId =
          nombre
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")
            .slice(0, 80) || `cliente-${Date.now()}-${i}`;

        pending.push({ docId, payload });
      }
    } else {
      // ── Sin encabezados: primera columna como nombre ───────────────────────
      for (let i = 0; i < raw.length; i++) {
        const row    = raw[i] || [];
        const nombre = (row[0] ?? "").toString().trim();
        if (!nombre) continue;
        if (normalizeKey(nombre) === "cliente") continue;
        if (/^\d+$/.test(nombre)) continue;
        if (nombre.length < 3) continue;

        const payload = {
          id_cliente: "", nombre,
          tipo_societario: "", ganancias: "", iva: "", tipo_iibb: "",
          cuit: "", mes_cierre: "", telefono: "", email: "",
          direccion: "", jurisdiccion_domicilio: "", etiquetas: "",
          claves: "", updated_by: updatedBy
        };
        const docId =
          nombre
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")
            .slice(0, 80) || `cliente-${Date.now()}-${i}`;

        pending.push({ docId, payload });
      }
    }

    if (!pending.length) {
      hideImportProgress();
      await openInfoModal("No se pudieron detectar clientes en el archivo.\n\nVerificá que el archivo tenga una columna de nombres.");
      return;
    }

    // ── Subida por lotes a Firestore ────────────────────────────────────────
    const BATCH_SIZE = 490;
    let uploaded = 0;

    showImportProgress(`Subiendo ${pending.length} clientes a la nube...`);

    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const chunk = pending.slice(i, i + BATCH_SIZE);
      await importClientesBatch(chunk);
      uploaded += chunk.length;
      if (pending.length > BATCH_SIZE) {
        const pct = Math.round((uploaded / pending.length) * 100);
        showImportProgress(`Subiendo... ${pct}% (${uploaded}/${pending.length})`);
      }
    }

    // ── Guardar metadata del último import ──────────────────────────────────
    const now = new Date().toLocaleString("es-AR");
    appState.clientes.lastImport = `${file.name} — ${pending.length} clientes — ${now}`;

    appState.clientes.items = await fetchClientes();
    hideImportProgress();
    rerenderList();

    await openInfoModal(
      `✓ ${pending.length} cliente(s) importados correctamente.\n\nLos datos existentes no fueron sobreescritos — solo se actualizaron o agregaron campos nuevos.`
    );
  } catch (err) {
    console.error("Error importando Excel:", err);
    hideImportProgress();
    await openInfoModal(`No se pudo importar el archivo.\n\nDetalle: ${err?.message ?? String(err)}\n\nVerificá que sea un Excel válido (.xlsx) y volvé a intentarlo.`);
  }
}

// ─── Event binding ─────────────────────────────────────────────────────────────

export function bindClientesEvents() {
  if (clientesEventsBound) return;
  clientesEventsBound = true;

  // ── Click delegation ───────────────────────────────────────────────────────
  document.addEventListener("click", async event => {

    // 1. Guardar ficha (primero para evitar conflictos con data-client-select-id)
    const saveBtn = event.target.closest("#btn-save-cliente");
    if (saveBtn) {
      const id      = saveBtn.dataset.clientId;
      const payload = getFormPayload();

      if (!payload.nombre) {
        await openInfoModal("El nombre del cliente es obligatorio.");
        return;
      }

      try {
        if (id) {
          await updateCliente(id, payload);
          await openInfoModal("✓ Ficha guardada correctamente.");
        } else {
          const newId = await createCliente(payload);
          appState.clientes.selectedId = newId;
          appState.clientes.isNew      = false;
          await loadContactosForSelectedCliente();
          await openInfoModal("✓ Cliente creado correctamente.");
        }
        appState.clientes.items = await fetchClientes();
        rerenderList();
        rerenderFormPanel();
      } catch (err) {
        console.error(err);
        await openInfoModal("No se pudo guardar. Intentá de nuevo.");
      }
      return;
    }

    // 2. Nuevo cliente
    const newBtn = event.target.closest("#btn-new-cliente");
    if (newBtn) {
      appState.clientes.selectedId = null;
      appState.clientes.isNew      = true;
      resetContactosState();
      rerenderList();
      rerenderFormPanel();
      return;
    }

    // 3. Cancelar nuevo cliente
    const cancelBtn = event.target.closest("#btn-cancel-new-cliente");
    if (cancelBtn) {
      appState.clientes.isNew = false;
      resetContactosState();
      rerenderFormPanel();
      return;
    }

    // 4. Seleccionar cliente de la lista
    const clientItem = event.target.closest("[data-client-select-id]");
    if (clientItem) {
      const id = clientItem.dataset.clientSelectId;
      appState.clientes.selectedId = id;
      appState.clientes.isNew      = false;
      await loadContactosForSelectedCliente();
      rerenderList();
      rerenderFormPanel();
      return;
    }

    // ── Contactos del cliente ───────────────────────────────────────────────
    const addContactoBtn = event.target.closest("#btn-add-contacto");
    if (addContactoBtn) {
      if (!appState.clientes.selectedId) {
        await openInfoModal("Primero seleccioná un cliente para poder agregar contactos.");
        return;
      }
      appState.contactos.isAddingNew = true;
      appState.contactos.editId = null;
      rerenderFormPanel();
      return;
    }

    const cancelContacto = event.target.closest("[data-action='cancel-contacto']");
    if (cancelContacto) {
      appState.contactos.isAddingNew = false;
      appState.contactos.editId = null;
      rerenderFormPanel();
      return;
    }

    const editContacto = event.target.closest("[data-action='edit-contacto']");
    if (editContacto) {
      appState.contactos.isAddingNew = false;
      appState.contactos.editId = editContacto.dataset.cid || null;
      rerenderFormPanel();
      return;
    }

    const delContacto = event.target.closest("[data-action='delete-contacto']");
    if (delContacto) {
      const clienteId = appState.clientes.selectedId;
      const contactoId = delContacto.dataset.cid;
      if (!clienteId || !contactoId) return;
      const ok = confirm("¿Eliminar este contacto?");
      if (!ok) return;
      try {
        await deleteContacto(clienteId, contactoId);
        await loadContactosForSelectedCliente();
        rerenderFormPanel();
      } catch (e) {
        console.error(e);
        await openInfoModal("No se pudo eliminar el contacto. Intentá de nuevo.");
      }
      return;
    }

    const saveContacto = event.target.closest("[data-action='save-contacto']");
    if (saveContacto) {
      const clienteId = appState.clientes.selectedId;
      if (!clienteId) return;
      const contactoId = document.getElementById("contacto-id")?.value?.trim();
      const nombre = document.getElementById("contacto-nombre")?.value?.trim() ?? "";
      const email = document.getElementById("contacto-email")?.value?.trim() ?? "";
      const cargo = document.getElementById("contacto-cargo")?.value?.trim() ?? "";
      if (!nombre) {
        await openInfoModal("El nombre del contacto es obligatorio.");
        return;
      }
      const payload = {
        nombre,
        email,
        cargo,
        principal: Boolean(document.getElementById("contacto-principal")?.checked),
        recibe_obligaciones: Boolean(document.getElementById("contacto-recibe-oblig")?.checked),
        recibe_impuestos: Boolean(document.getElementById("contacto-recibe-imp")?.checked),
        recibe_laboral: Boolean(document.getElementById("contacto-recibe-lab")?.checked),
        activo: Boolean(document.getElementById("contacto-activo")?.checked)
      };
      try {
        if (contactoId) await updateContacto(clienteId, contactoId, payload);
        else await createContacto(clienteId, payload);
        await loadContactosForSelectedCliente();
        rerenderFormPanel();
      } catch (e) {
        console.error(e);
        await openInfoModal("No se pudo guardar el contacto. Intentá de nuevo.");
      }
      return;
    }

    // 5. Agregar fila de acceso
    if (event.target.closest("#btn-add-acceso")) {
      addAccesoRow();
      return;
    }

    // 6. Eliminar fila de acceso
    const removeBtn = event.target.closest("[data-acceso-remove]");
    if (removeBtn) {
      const row  = removeBtn.closest(".acceso-row");
      const list = document.getElementById("accesos-list");
      if (row && list) {
        row.remove();
        if (!list.querySelector(".acceso-row")) addAccesoRow();
      }
      return;
    }

    // 7. Mostrar / ocultar clave
    const toggleBtn = event.target.closest("[data-acceso-toggle]");
    if (toggleBtn) {
      const row  = toggleBtn.closest(".acceso-row");
      const pass = row?.querySelector(".acc-pass");
      if (pass) pass.type = pass.type === "password" ? "text" : "password";
      return;
    }

    // 8. Copiar usuario o clave
    const copyBtn = event.target.closest("[data-acceso-copy]");
    if (copyBtn) {
      const field = copyBtn.dataset.accesoCopy;
      const row   = copyBtn.closest(".acceso-row");
      const input = row?.querySelector(field === "user" ? ".acc-user" : ".acc-pass");
      if (input) await copyToClipboard(input.value, copyBtn);
      return;
    }

    // 9. Insights — limpiar filtros
    if (event.target.closest("#btn-insights-clear")) {
      appState.clientes.insightsFilters       = {};
      appState.clientes.insightsEtiquetaTipo  = "";
      appState.clientes.insightsEtiquetaValues = [];
      rerenderInsights();
      return;
    }

    // 10. Insights — checkbox "TODOS" por campo
    const insightsAllBtn = event.target.closest("[data-insights-all]");
    if (insightsAllBtn) {
      const key    = insightsAllBtn.dataset.insightsAll;
      const items  = appState.clientes.items ?? [];
      const valSet = new Set();
      for (const c of items) {
        let v;
        if (key === "terminacion_cuit") {
          const digits = (c.cuit || "").replace(/\D/g, "");
          v = digits ? digits.slice(-1) : "";
        } else {
          v = (c[key] || "").toString().trim();
        }
        if (v) valSet.add(v);
      }
      const allValues = [...valSet];
      const current   = appState.clientes.insightsFilters[key] ?? [];
      // Toggle: if all selected → deselect all; else → select all
      appState.clientes.insightsFilters = {
        ...appState.clientes.insightsFilters,
        [key]: current.length === allValues.length ? [] : allValues
      };
      rerenderInsights();
      return;
    }

    // 11. Insights — checkbox de valor individual
    const insightsValBtn = event.target.closest("[data-insights-value]");
    if (insightsValBtn) {
      const key   = insightsValBtn.dataset.insightsValue;
      const val   = decodeURIComponent(insightsValBtn.dataset.insightsVal);
      const current = [...(appState.clientes.insightsFilters[key] ?? [])];
      const idx   = current.indexOf(val);
      if (idx === -1) current.push(val);
      else current.splice(idx, 1);
      appState.clientes.insightsFilters = {
        ...appState.clientes.insightsFilters,
        [key]: current
      };
      rerenderInsights();
      return;
    }

    // 12. Insights — checkbox TODOS etiquetas
    if (event.target.closest("[data-insights-etiq-all]")) {
      const tipo    = appState.clientes.insightsEtiquetaTipo;
      const items   = appState.clientes.items ?? [];
      const allVals = [...new Set(
        items.flatMap(c =>
          parseEtiquetas(c.etiquetas)
            .filter(e => e.tipo === tipo)
            .map(e => e.valor)
        ).filter(Boolean)
      )];
      const cur = appState.clientes.insightsEtiquetaValues;
      appState.clientes.insightsEtiquetaValues =
        cur.length === allVals.length ? [] : allVals;
      rerenderInsights();
      return;
    }

    // 13. Insights — checkbox valor etiqueta
    const etiqValBtn = event.target.closest("[data-insights-etiq-value]");
    if (etiqValBtn) {
      const val    = decodeURIComponent(etiqValBtn.dataset.insightsEtiqValue);
      const cur    = [...(appState.clientes.insightsEtiquetaValues ?? [])];
      const idx    = cur.indexOf(val);
      if (idx === -1) cur.push(val);
      else cur.splice(idx, 1);
      appState.clientes.insightsEtiquetaValues = cur;
      rerenderInsights();
      return;
    }
  });

  // ── Search ─────────────────────────────────────────────────────────────────
  document.addEventListener("input", event => {
    const searchInput = event.target.closest("#clientes-search");
    if (searchInput) {
      appState.clientes.search = searchInput.value;
      rerenderList();
    }
  });

  // ── Change (file input + etiqueta type select) ─────────────────────────────
  document.addEventListener("change", async event => {
    // Import file
    const fileInput = event.target.closest("#clientes-import-input");
    if (fileInput && fileInput.files[0]) {
      const file = fileInput.files[0];
      fileInput.value = "";
      await handleImportExcel(file);
      return;
    }

    // Etiqueta type selector
    const etiqSelect = event.target.closest("#insights-etiq-type");
    if (etiqSelect) {
      appState.clientes.insightsEtiquetaTipo   = etiqSelect.value;
      appState.clientes.insightsEtiquetaValues = [];
      rerenderInsights();
      return;
    }
  });
}
