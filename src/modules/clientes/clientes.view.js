import { appState } from "../../app/state.js";
import {
  canCreateCliente,
  canEditCliente,
  canImportClientes,
} from "../../utils/permissions.js";

// ─── Shared helpers ────────────────────────────────────────────────────────────
// (escapeHtml defined below — used by contactos section too)

// ─── Contactos section (exported for controller rerenders) ────────────────────

export function renderContactosSectionHtml() {
  const clienteId   = appState.clientes?.selectedId;
  if (!clienteId) return "";

  const contacts    = appState.contactos?.items       ?? [];
  const isAddingNew = appState.contactos?.isAddingNew ?? false;
  const editId      = appState.contactos?.editId      ?? null;

  return `
    <div class="contactos-section" id="contactos-section">
      <div class="contactos-header">
        <div class="contactos-title">Contactos del cliente</div>
        <button type="button" class="btn-secondary btn-sm" id="btn-add-contacto">
          + Agregar contacto
        </button>
      </div>

      <div class="contactos-list" id="contactos-list">
        ${contacts.length === 0 && !isAddingNew
          ? `<div class="contactos-empty">Sin contactos registrados.<br>Agreg&aacute; los destinatarios habituales del cliente.</div>`
          : contacts.map(c => renderContactoCardHtml(c, editId)).join("")
        }
      </div>

      ${isAddingNew ? renderContactoFormHtml(null) : ""}
    </div>
  `;
}

function renderContactoCardHtml(c, editId) {
  if (editId === c.id) return renderContactoFormHtml(c);

  // escapeHtml is defined later in the file but hoisted as a function declaration
  const esc = v => String(v ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");

  const flags = [
    c.principal           ? `<span class="ctag ctag--principal">Principal</span>`   : "",
    c.recibe_obligaciones ? `<span class="ctag">Obligaciones</span>`                : "",
    c.recibe_impuestos    ? `<span class="ctag">Impuestos</span>`                   : "",
    c.recibe_laboral      ? `<span class="ctag">Laboral</span>`                     : "",
    c.activo === false    ? `<span class="ctag ctag--inactive">Inactivo</span>`     : ""
  ].filter(Boolean).join("");

  return `
    <div class="contacto-card ${c.activo === false ? "contacto-card--inactive" : ""}">
      <div class="contacto-card-main">
        <div class="contacto-name">${esc(c.nombre || "Sin nombre")}</div>
        <div class="contacto-meta">
          ${c.email ? `<span class="contacto-email">${esc(c.email)}</span>` : ""}
          ${c.cargo ? `<span class="contacto-cargo">${esc(c.cargo)}</span>` : ""}
        </div>
        ${flags ? `<div class="contacto-flags">${flags}</div>` : ""}
      </div>
      <div class="contacto-card-actions">
        <button type="button" class="btn-secondary btn-sm"
          data-action="edit-contacto" data-cid="${esc(c.id)}">Editar</button>
        <button type="button" class="btn-secondary btn-sm contacto-btn-del"
          data-action="delete-contacto" data-cid="${esc(c.id)}">&#x2715;</button>
      </div>
    </div>
  `;
}

function renderContactoFormHtml(c) {
  const esc   = v => String(v ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const v     = f => esc(c ? (c[f] ?? "") : "");
  const isEdit = !!c;

  return `
    <div class="contacto-form" id="contacto-form">
      <div class="contacto-form-title">${isEdit ? "Editar contacto" : "Nuevo contacto"}</div>
      <input type="hidden" id="contacto-id" value="${v("id")}" />
      <div class="cf-grid">
        <label class="cf-field">
          <span>Nombre *</span>
          <input type="text" id="contacto-nombre" value="${v("nombre")}"
            placeholder="Nombre completo">
        </label>
        <label class="cf-field">
          <span>Email</span>
          <input type="email" id="contacto-email" value="${v("email")}"
            placeholder="correo@ejemplo.com">
        </label>
        <label class="cf-field">
          <span>Cargo / Rol</span>
          <input type="text" id="contacto-cargo" value="${v("cargo")}"
            placeholder="Ej: Administracion, Impuestos, Gerente">
        </label>
      </div>
      <div class="contacto-flags-form">
        <label class="contacto-flag-label">
          <input type="checkbox" id="contacto-principal"
            ${c?.principal ? "checked" : ""}>
          <span>Contacto principal</span>
        </label>
        <label class="contacto-flag-label">
          <input type="checkbox" id="contacto-recibe-oblig"
            ${c?.recibe_obligaciones ? "checked" : ""}>
          <span>Recibe obligaciones</span>
        </label>
        <label class="contacto-flag-label">
          <input type="checkbox" id="contacto-recibe-imp"
            ${c?.recibe_impuestos !== false ? "checked" : ""}>
          <span>Recibe impuestos</span>
        </label>
        <label class="contacto-flag-label">
          <input type="checkbox" id="contacto-recibe-lab"
            ${c?.recibe_laboral ? "checked" : ""}>
          <span>Recibe laboral</span>
        </label>
        <label class="contacto-flag-label">
          <input type="checkbox" id="contacto-activo"
            ${c?.activo !== false ? "checked" : ""}>
          <span>Activo</span>
        </label>
      </div>
      <div class="contacto-form-actions">
        <button type="button" class="btn-secondary" data-action="cancel-contacto">Cancelar</button>
        <button type="button" class="btn-primary"   data-action="save-contacto">Guardar contacto</button>
      </div>
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────────────────────

function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Misma lógica que `normalizeDfeEnabled` en `clientes.service.js` (no importar el .service acá: Safari cachea ese módulo sin ?v= y rompe los bindings). */
function clienteDfeActivado(c) {
  const v = c?.dfeEnabled;
  if (v === true || v === 1 || v === "1") return true;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "s" || s === "si" || s === "sí" || s === "yes";
}

// Parsea el campo "etiquetas" al formato [{ tipo, valor }]
// Maneja entradas compuestas como "Rubro: Comercial – Empleador: de 11 a 50 empleados"
// separándolas en dos tags distintos (igual que HTML ESTUDIO ATT)
export function parseEtiquetas(raw) {
  const parts = (raw || "").toString().split(/\n|,|;/).map(x => x.trim()).filter(Boolean);
  const result = [];
  const cleanTipo = t => (t || "").replace(/^[\s\-–•—]+/, "").trim();

  // Detecta múltiples pares "Tipo: Valor" dentro de un mismo segmento
  // separados por " - " o " – " (guion o raya)
  const multiTagRegex = /([A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ ./_-]+):\s*(.+?)(?=\s*[-–]\s*[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ ./_-]+:\s*|$)/g;

  for (const p of parts) {
    const matches = [...p.matchAll(multiTagRegex)];
    if (matches.length >= 2) {
      // Hay varios pares → separarlos
      for (const m of matches) {
        const tipo  = cleanTipo(m[1]);
        const valor = (m[2] || "").trim();
        if (tipo && valor) result.push({ tipo, valor });
      }
    } else {
      const i = p.indexOf(":");
      if (i > -1) {
        const tipo  = cleanTipo(p.slice(0, i)) || "General";
        const valor = p.slice(i + 1).trim();
        if (valor) result.push({ tipo, valor });
      } else {
        result.push({ tipo: "General", valor: p });
      }
    }
  }
  return result;
}

// ─── Insights field definitions ────────────────────────────────────────────────

export const INSIGHTS_FIELDS = [
  { key: "tipo_societario",       label: "Tipo societario" },
  { key: "mes_cierre",            label: "Mes de cierre" },
  { key: "iva",                   label: "IVA" },
  { key: "ganancias",             label: "Ganancias" },
  { key: "tipo_iibb",             label: "Tipo IIBB" },
  { key: "terminacion_cuit",      label: "Terminación de CUIT" },
  { key: "jurisdiccion_domicilio", label: "Jurisdicción fiscal" }
];

function getFieldValue(c, key) {
  if (key === "terminacion_cuit") {
    const digits = (c.cuit || "").replace(/\D/g, "");
    return digits ? digits.slice(-1) : "";
  }
  return (c[key] || "").toString().trim();
}

// Returns items filtered by the insights checkboxes (including etiquetas)
export function getInsightsFilteredItems() {
  const items   = appState.clientes?.items ?? [];
  const filters = appState.clientes?.insightsFilters ?? {};
  const etiqTipo   = appState.clientes?.insightsEtiquetaTipo ?? "";
  const etiqValues = appState.clientes?.insightsEtiquetaValues ?? [];

  return items.filter(c => {
    // Base field filters
    for (const { key } of INSIGHTS_FIELDS) {
      const selected = filters[key] ?? [];
      if (!selected.length) continue; // empty = TODOS
      const val = getFieldValue(c, key);
      if (!selected.includes(val)) return false;
    }
    // Etiqueta filter
    if (etiqTipo && etiqValues.length > 0) {
      const clientVals = parseEtiquetas(c.etiquetas)
        .filter(e => e.tipo === etiqTipo)
        .map(e => e.valor);
      if (!clientVals.some(v => etiqValues.includes(v))) return false;
    }
    return true;
  });
}

// ─── Main view ─────────────────────────────────────────────────────────────────

export function renderClientesView() {
  const user      = appState.session.user;
  const canCreate = canCreateCliente(user);
  const canImport = canImportClientes(user);
  const search    = appState.clientes?.search ?? "";

  return `
    <section class="clientes-page">

      <div class="clientes-hero">
        <div class="clientes-hero-left">
          <div class="req-eyebrow">Módulo activo</div>
          <h1 class="req-title">Clientes</h1>
          <p class="req-subtitle">Gestión de fichas, accesos y datos fiscales del estudio.</p>
        </div>
        <div class="clientes-hero-right">
          ${canCreate ? `<button type="button" id="btn-new-cliente" class="btn-primary btn-sm">Nuevo cliente</button>` : ""}
        </div>
      </div>

      ${canImport ? renderImportBanner() : ""}

      <div class="clientes-layout">

        <!-- ── Lista lateral ───────────────────────── -->
        <div class="clientes-list-panel">
          <div class="clientes-list-head">
            <input
              id="clientes-search"
              class="clientes-search-input"
              type="text"
              placeholder="Buscar cliente, CUIT, email..."
              value="${escapeHtml(search)}"
            />
          </div>
          <div id="clientes-list" class="clientes-list">
            ${renderClientesListHtml()}
          </div>
        </div>

        <!-- ── Columna derecha ─────────────────────── -->
        <div class="clientes-right-col">

          <div id="clientes-form-panel" class="clientes-form-panel">
            ${renderClientesFormPanelHtml()}
          </div>

          <div id="clientes-insights-wrap">
            ${renderInsightsPanelHtml()}
          </div>

        </div>
      </div>

    </section>
  `;
}

// ─── Import banner ─────────────────────────────────────────────────────────────

function renderImportBanner() {
  return `
    <div class="clientes-import-banner">
      <div class="clientes-import-banner-left">
        <div class="clientes-import-banner-title">Importar clientes desde Excel</div>
        <div class="clientes-import-banner-desc">
          Solo superadmin · Formatos aceptados: <strong>.xlsx</strong>
          · Los datos existentes <strong>no se sobreescriben</strong>
        </div>
      </div>
      <div class="clientes-import-banner-right">
        <label class="btn-primary btn-sm clientes-import-label" id="lbl-import-clientes">
          📥 Seleccionar archivo Excel
          <input type="file" id="clientes-import-input" accept=".xlsx,.xls,.csv" style="display:none">
        </label>
      </div>
      <div id="clientes-import-progress" class="clientes-import-progress" style="display:none">
        <div class="clientes-import-spinner"></div>
        <span id="clientes-import-progress-text">Importando...</span>
      </div>
    </div>
  `;
}

// ─── Client list ───────────────────────────────────────────────────────────────

export function renderClientesListHtml() {
  const search = (appState.clientes?.search ?? "").trim().toLowerCase();
  let items = appState.clientes?.items ?? [];

  if (search) {
    items = items.filter(c => {
      const hay = [c.nombre, c.id_cliente, c.cuit, c.email, c.tipo_societario]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(search);
    });
  }

  if (!items.length) {
    return `<div class="clientes-list-empty">Sin clientes cargados.</div>`;
  }

  const selectedId = appState.clientes?.selectedId;
  return items.map(c => `
    <button class="cliente-item ${selectedId === c.id ? "active" : ""}" data-client-select-id="${c.id}">
      <div class="cliente-item-name">
        <span class="cliente-item-name-text">${escapeHtml(String(c.nombre || "Sin nombre").trim().toLocaleUpperCase("es-AR"))}</span>
        ${clienteDfeActivado(c) ? '<span class="cliente-dfe-pill" title="DFE habilitado en ARCA / sync activo">DFE</span>' : ""}
      </div>
      <div class="cliente-item-meta">
        ID: ${escapeHtml(c.id_cliente || "—")} · ${escapeHtml(c.tipo_societario || "—")} · ${escapeHtml(c.cuit || "Sin CUIT")}
      </div>
    </button>
  `).join("");
}

// ─── Form panel ────────────────────────────────────────────────────────────────

export function renderClientesFormPanelHtml() {
  const { selectedId, isNew, items } = appState.clientes ?? {};
  const user    = appState.session.user;
  const canEdit = canEditCliente(user);

  if (isNew)       return renderClienteFormHtml(null, canEdit);
  if (!selectedId) return renderFormEmptyState();

  const c = (items ?? []).find(x => x.id === selectedId);
  if (!c) return renderFormEmptyState();
  return renderClienteFormHtml(c, canEdit);
}

function renderFormEmptyState() {
  return `
    <div class="clientes-form-empty">
      <div class="clientes-form-empty-icon">👤</div>
      <p>Seleccioná un cliente de la lista<br>para ver y editar su ficha.</p>
    </div>
  `;
}

function renderAccesosRows(accesos = [], legacyClaves = "") {
  let rows = Array.isArray(accesos) ? accesos : [];
  if (!rows.length && legacyClaves?.trim()) {
    rows = [{ organismo: "Otro", usuario: "", clave: legacyClaves.trim() }];
  }
  if (!rows.length) rows = [{ organismo: "", usuario: "", clave: "" }];

  const ORGS = ["ARCA", "DGR", "ARBA", "AFIP", "AGIP", "Municipalidad", "Otro"];
  return rows.map((a, idx) => `
    <div class="acceso-row" data-idx="${idx}">
      <select class="acc-org">
        <option value="">Organismo...</option>
        ${ORGS.map(o => `<option value="${o}" ${a.organismo === o ? "selected" : ""}>${o}</option>`).join("")}
      </select>
      <input type="text"     class="acc-user" placeholder="Usuario / CUIT" value="${escapeHtml(a.usuario || "")}">
      <button type="button"  class="acceso-mini-btn" data-acceso-copy="user">Copiar</button>
      <input type="password" class="acc-pass" placeholder="Clave" value="${escapeHtml(a.clave || "")}">
      <button type="button"  class="acceso-mini-btn" data-acceso-copy="pass">Copiar</button>
      <button type="button"  class="acceso-mini-btn" data-acceso-toggle>👁</button>
      <button type="button"  class="acceso-mini-btn acceso-mini-btn--danger" data-acceso-remove>✕</button>
    </div>
  `).join("");
}

function renderClienteFormHtml(c, canEdit) {
  const v    = f => escapeHtml(c ? (c[f] ?? "") : "");
  const isNew = !c;
  const title = isNew ? "Nuevo cliente" : escapeHtml(c.nombre || "Ficha del cliente");
  const user = appState.session.user;
  const canToggleDfe = (user?.role === "superadmin");
  const dfeInputDisabled = !canToggleDfe;

  return `
    <div class="clientes-form-inner">
      <div class="clientes-form-title">${title}</div>
      <div class="cf-grid">
        <div class="cf-field cf-field--full cliente-dfe-field cliente-dfe-field--first">
          <span class="cf-label">Bandeja DFE (ARCA)</span>
          <div class="cliente-dfe-panel">
            <label class="cliente-dfe-toggle ${dfeInputDisabled ? "cliente-dfe-toggle--disabled" : ""}">
              <input type="checkbox" id="cf-dfe-enabled" ${clienteDfeActivado(c) ? "checked" : ""} ${dfeInputDisabled ? "disabled" : ""}>
              <span>${
                canToggleDfe
                  ? "Marcá esto solo cuando la delegación en ARCA esté hecha. Incluye al cliente en la sincronización DFE (usa el CUIT más abajo)."
                  : "Solo un superadmin puede activar o desactivar DFE tras la delegación en ARCA. Si falta, avisale al responsable."
              }</span>
            </label>
          </div>
        </div>
        <label class="cf-field"><span>ID Cliente</span>
          <input type="text" id="cf-id_cliente" value="${v("id_cliente")}" placeholder="Ej: 1234">
        </label>
        <label class="cf-field"><span>Nombre / Razón social *</span>
          <input type="text" id="cf-nombre" value="${v("nombre")}" placeholder="Nombre completo o razón social">
        </label>
        <label class="cf-field"><span>Tipo societario</span>
          <input type="text" id="cf-tipo_societario" value="${v("tipo_societario")}" placeholder="Ej: SRL, SA, Monotributo...">
        </label>
        <label class="cf-field"><span>Mes de cierre</span>
          <input type="text" id="cf-mes_cierre" value="${v("mes_cierre")}" placeholder="Ej: 12">
        </label>
        <label class="cf-field"><span>Ganancias</span>
          <input type="text" id="cf-ganancias" value="${v("ganancias")}">
        </label>
        <label class="cf-field"><span>IVA</span>
          <input type="text" id="cf-iva" value="${v("iva")}">
        </label>
        <label class="cf-field"><span>Tipo IIBB</span>
          <input type="text" id="cf-tipo_iibb" value="${v("tipo_iibb")}">
        </label>
        <label class="cf-field"><span>CUIT / CUIL</span>
          <input type="text" id="cf-cuit" value="${v("cuit")}" placeholder="XX-XXXXXXXX-X">
        </label>
        <label class="cf-field"><span>Teléfono</span>
          <input type="text" id="cf-telefono" value="${v("telefono")}">
        </label>
        <label class="cf-field cf-field--full"><span>Domicilio fiscal</span>
          <input type="text" id="cf-direccion" value="${v("direccion")}">
        </label>
        <label class="cf-field cf-field--full"><span>Jurisdicción domicilio fiscal</span>
          <input type="text" id="cf-jurisdiccion_domicilio" value="${v("jurisdiccion_domicilio")}">
        </label>
        <label class="cf-field cf-field--full"><span>Etiquetas</span>
          <input type="text" id="cf-etiquetas" value="${v("etiquetas")}" placeholder="Ej: Tipo: SRL, Sector: Comercio">
        </label>
        <div class="cf-field cf-field--full">
          <span class="cf-label">Accesos a organismos</span>
          <div class="accesos-wrap">
            <div class="accesos-header-row">
              <span>Organismo</span><span>Usuario / CUIT</span><span></span>
              <span>Clave</span><span></span><span></span><span></span>
            </div>
            <div id="accesos-list">
              ${renderAccesosRows(c?.accesos ?? [], c?.claves ?? "")}
            </div>
            <button type="button" class="acceso-add-btn" id="btn-add-acceso">+ Agregar acceso</button>
          </div>
        </div>
        <label class="cf-field cf-field--full"><span>Notas internas</span>
          <textarea id="cf-notas" rows="3" placeholder="Observaciones, vencimientos, info adicional...">${escapeHtml(c?.notas ?? "")}</textarea>
        </label>
      </div>
      <div class="clientes-form-actions">
        ${isNew ? `<button type="button" class="btn-secondary" id="btn-cancel-new-cliente">Cancelar</button>` : ""}
        <button type="button" class="btn-primary" id="btn-save-cliente" data-client-id="${c?.id ?? ""}">
          Guardar ficha
        </button>
      </div>

      ${!isNew ? renderContactosSectionHtml() : ""}
    </div>
  `;
}

// ─── Insights panel ────────────────────────────────────────────────────────────

export function renderInsightsPanelHtml() {
  const items      = appState.clientes?.items ?? [];
  const filters    = appState.clientes?.insightsFilters ?? {};
  const etiqTipo   = appState.clientes?.insightsEtiquetaTipo ?? "";
  const etiqValues = appState.clientes?.insightsEtiquetaValues ?? [];

  const filtered = getInsightsFilteredItems();

  // All unique etiqueta types across all clients
  const etiqTypes = [...new Set(
    items.flatMap(c => parseEtiquetas(c.etiquetas).map(e => e.tipo)).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "es"));

  // Etiqueta values for selected type
  const etiqValueOptions = etiqTipo
    ? [...new Set(
        items.flatMap(c =>
          parseEtiquetas(c.etiquetas).filter(e => e.tipo === etiqTipo).map(e => e.valor)
        ).filter(Boolean)
      )].sort((a, b) => a.localeCompare(b, "es"))
    : [];

  const etiqAllChecked = etiqValueOptions.length > 0 && etiqValues.length === etiqValueOptions.length;

  return `
    <div class="clientes-insights">
      <div class="insights-header">
        <div class="insights-title">Consultas rápidas</div>
        <button class="insights-clear-btn" id="btn-insights-clear">Limpiar filtros</button>
      </div>

      <div class="insights-facets-grid">
        ${INSIGHTS_FIELDS.map(f => renderFacetHtml(f.key, f.label, items, filters)).join("")}

        <!-- Etiquetas -->
        <div class="insights-facet">
          <div class="insights-facet-title">Etiquetas</div>
          <div class="insights-etiq-type-wrap">
            <select class="insights-etiq-select" id="insights-etiq-type">
              <option value="">Tipo de etiqueta...</option>
              ${etiqTypes.map(t => `<option value="${t}" ${etiqTipo === t ? "selected" : ""}>${escapeHtml(t)}</option>`).join("")}
            </select>
          </div>
          <div class="insights-facet-list">
            ${!etiqTipo
              ? `<div class="insights-facet-empty">Elegí un tipo</div>`
              : `
                <label class="insights-facet-item">
                  <input type="checkbox" class="insights-cb" ${etiqAllChecked ? "checked" : ""}
                    data-insights-etiq-all>
                  <span>TODOS</span>
                </label>
                ${etiqValueOptions.map(v => `
                  <label class="insights-facet-item">
                    <input type="checkbox" class="insights-cb"
                      ${etiqValues.includes(v) ? "checked" : ""}
                      data-insights-etiq-value="${encodeURIComponent(v)}">
                    <span>${escapeHtml(v)}</span>
                  </label>
                `).join("")}
              `
            }
          </div>
        </div>
      </div>

      <div class="insights-results">
        <div class="insights-kpi">
          <strong>${filtered.length}</strong> cliente${filtered.length !== 1 ? "s" : ""} encontrado${filtered.length !== 1 ? "s" : ""}
        </div>
        ${filtered.length
          ? `<ul class="insights-list">
              ${filtered.map(c => `
                <li>
                  <button class="insights-client-link" data-client-select-id="${c.id}">
                    ${escapeHtml(c.nombre || "Sin nombre")}${c.id_cliente ? ` — ID ${escapeHtml(c.id_cliente)}` : ""}
                  </button>
                </li>
              `).join("")}
            </ul>`
          : `<div class="insights-no-results">Sin clientes para esos filtros.</div>`
        }
      </div>
    </div>
  `;
}

function renderFacetHtml(key, label, allItems, filters) {
  // Get unique values sorted
  const valSet = new Set();
  for (const c of allItems) {
    const v = getFieldValue(c, key);
    if (v) valSet.add(v);
  }

  let values = [...valSet];
  if (key === "mes_cierre" || key === "terminacion_cuit") {
    values.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  } else {
    values.sort((a, b) => a.localeCompare(b, "es"));
  }

  const selected    = filters[key] ?? [];
  const allChecked  = values.length > 0 && selected.length === values.length;

  return `
    <div class="insights-facet">
      <div class="insights-facet-title">${label}</div>
      ${values.length === 0
        ? `<div class="insights-facet-empty">Sin datos</div>`
        : `
          <div class="insights-facet-list">
            <label class="insights-facet-item">
              <input type="checkbox" class="insights-cb" ${allChecked ? "checked" : ""}
                data-insights-all="${key}">
              <span>TODOS</span>
            </label>
            ${values.map(v => `
              <label class="insights-facet-item">
                <input type="checkbox" class="insights-cb"
                  ${selected.includes(v) ? "checked" : ""}
                  data-insights-value="${key}"
                  data-insights-val="${encodeURIComponent(v)}">
                <span>${escapeHtml(v)}</span>
              </label>
            `).join("")}
          </div>
        `
      }
    </div>
  `;
}
