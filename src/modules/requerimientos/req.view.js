import { appState } from "../../app/state.js";
import { renderModal } from "../../components/modal.js";
import {
  canCreateRequirement,
  canDeleteRequirement,
  canEditRequirement
} from "../../utils/permissions.js";

export function renderRequerimientosView() {
  const items = appState.requerimientos.items;
  const total = items.length;
  const stageFilter = appState.requerimientos.stageFilter ?? "todos";
  const search = appState.requerimientos.search ?? "";
  const user = appState.session.user;

  return `
    <section class="req-page">
      <div class="req-hero">
        <div class="req-hero-left">
          <div class="req-eyebrow">Módulo activo</div>
          <h1 class="req-title">Requerimientos</h1>
          <p class="req-subtitle">
            Seguimiento integral de intimaciones, requerimientos, fiscalizaciones y expedientes.
          </p>
        </div>

        <div class="req-hero-right">
          ${
            canCreateRequirement(user)
              ? `<button id="btn-new-req" class="btn-primary">Nuevo requerimiento</button>`
              : ``
          }
        </div>
      </div>

      <div class="req-toolbar">
        <div class="req-toolbar-left">
          <div class="req-chip">📌 <strong>${total}</strong> requerimiento(s) cargado(s)</div>
          <button type="button" class="req-chip-btn ${stageFilter === "todos" ? "active" : ""}" data-stage-filter="todos">Todos</button>
          <button type="button" class="req-chip-btn ${stageFilter === "recibido" ? "active" : ""}" data-stage-filter="recibido">Recibido</button>
          <button type="button" class="req-chip-btn ${stageFilter === "analisis" ? "active" : ""}" data-stage-filter="analisis">En análisis</button>
          <button type="button" class="req-chip-btn ${stageFilter === "presentado" ? "active" : ""}" data-stage-filter="presentado">Presentado</button>
          <button type="button" class="req-chip-btn ${stageFilter === "cerrado" ? "active" : ""}" data-stage-filter="cerrado">Cerrado</button>
        </div>

        <div class="req-toolbar-right">
          <input
            id="req-search"
            class="req-search"
            type="text"
            placeholder="Buscar por organismo, cliente o descripción..."
            value="${escapeHtml(search)}"
          />
        </div>
      </div>

      <div id="req-board-root" class="req-board${stageFilter !== "todos" ? " req-board--single" : ""}">
        ${renderRequirementsBoardHtml()}
      </div>

      ${renderRequirementModalByState()}
    </section>
  `;
}

const ALL_STAGES = [
  { key: "recibido",   title: "Recibido" },
  { key: "analisis",   title: "En análisis" },
  { key: "presentado", title: "Presentado" },
  { key: "cerrado",    title: "Cerrado" }
];

/** Solo columnas del tablero: la búsqueda y el filtro actualizan esto sin reemplazar el hero/toolbar. */
export function renderRequirementsBoardHtml() {
  const items = appState.requerimientos.items;
  const filteredItems = applyFilters(items);
  const user = appState.session.user;
  const stageFilter = appState.requerimientos.stageFilter ?? "todos";

  const stagesToShow = stageFilter === "todos"
    ? ALL_STAGES
    : ALL_STAGES.filter((s) => s.key === stageFilter);

  return stagesToShow
    .map((s) => renderStageColumn(s.title, s.key, filteredItems, user))
    .join("");
}

function applyFilters(items) {
  const search = (appState.requerimientos.search ?? "").trim().toLowerCase();
  const stageFilter = appState.requerimientos.stageFilter ?? "todos";

  return items.filter((item) => {
    const matchesStage = stageFilter === "todos" ? true : item.stage === stageFilter;

    const haystack = [
      item.organismo,
      item.cliente,
      item.descripcion,
      item.expediente,
      item.responsable
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch = search ? haystack.includes(search) : true;

    return matchesStage && matchesSearch;
  });
}

function renderStageColumn(title, stage, items, user) {
  const filtered = items.filter((item) => item.stage === stage);

  return `
    <section class="req-column">
      <div class="req-column-header">
        <h3 class="req-column-title">${title}</h3>
        <span class="req-column-count">${filtered.length}</span>
      </div>

      <div class="req-column-body">
        ${
          filtered.length
            ? filtered.map((item) => renderCard(item, user)).join("")
            : `<div class="req-empty">Sin registros en esta etapa.</div>`
        }
      </div>
    </section>
  `;
}

function renderCard(item, user) {
  const editable = canEditRequirement(user);
  const deletable = canDeleteRequirement(user);

  return `
    <article class="req-card" ${editable ? `data-action="edit-requirement" data-id="${item.id}"` : ""}>
      <div class="req-card-top">
        <div class="req-card-org">${escapeHtml(item.organismo)}</div>
      </div>

      <div class="req-card-title">${escapeHtml(item.descripcion)}</div>
      <div class="req-card-client">${escapeHtml(item.cliente)}</div>

      <div class="req-card-meta">
        <div><strong>Responsable:</strong> ${escapeHtml(item.responsable || "—")}</div>
        <div><strong>Expediente:</strong> ${escapeHtml(item.expediente || "—")}</div>
        <div><strong>Ingreso:</strong> ${formatDate(item.fechaIngreso)}</div>
        <div><strong>Límite:</strong> ${formatDate(item.fechaLimite)}</div>
      </div>

      <div class="req-card-footer">
        <span class="req-form-help">${editable ? "Click para editar" : "Solo lectura"}</span>
        ${
          deletable
            ? `
          <button
            class="req-delete-btn"
            data-action="delete-requirement"
            data-id="${item.id}"
            type="button"
          >
            Eliminar
          </button>
        `
            : ``
        }
      </div>
    </article>
  `;
}

function renderRequirementModalByState() {
  if (appState.ui.modal === "new-requirement") {
    return renderRequirementModal({
      title: "Nuevo requerimiento",
      item: null
    });
  }

  if (appState.ui.modal === "edit-requirement") {
    return renderRequirementModal({
      title: "Editar requerimiento",
      item: appState.ui.modalPayload ?? null
    });
  }

  if (appState.ui.modal === "delete-requirement") {
    return renderDeleteRequirementModal(appState.ui.modalPayload ?? null);
  }

  return "";
}

function renderRequirementModal({ title, item }) {
  return renderModal({
    title,
    body: `
      <form id="requirement-form" class="req-form">
        <input type="hidden" id="req-id" value="${item?.id ?? ""}" />

        <div class="req-form-grid">
          <label class="req-form-field">
            <span>Organismo</span>
            <input type="text" id="req-organismo" required placeholder="Ej: ARCA, ARBA, Municipalidad..." value="${escapeHtml(item?.organismo ?? "")}" />
          </label>

          <div class="req-form-field">
            <span>Cliente</span>
            <div class="req-client-autocomplete">
              <input
                type="text"
                id="req-cliente"
                class="req-client-input"
                required
                autocomplete="off"
                placeholder="Escribí para buscar un cliente..."
                value="${escapeHtml(item?.cliente ?? "")}"
              />
              <div id="req-cliente-suggestions" class="req-client-suggestions" style="display:none;"></div>
            </div>
          </div>

          <label class="req-form-field req-form-field--full">
            <span>Descripción</span>
            <textarea id="req-descripcion" rows="4" required placeholder="Describí el requerimiento, intimación o expediente...">${escapeHtml(item?.descripcion ?? "")}</textarea>
          </label>

          <label class="req-form-field">
            <span>Estado</span>
            <select id="req-stage" required>
              ${renderStageOption("recibido", "Recibido", item?.stage)}
              ${renderStageOption("analisis", "En análisis", item?.stage)}
              ${renderStageOption("presentado", "Presentado", item?.stage)}
              ${renderStageOption("cerrado", "Cerrado", item?.stage)}
            </select>
          </label>

          <label class="req-form-field">
            <span>Responsable</span>
            <select id="req-responsable">
              <option value="">— Sin asignar —</option>
              ${["Facundo Giacoppo", "Ramiro Joya", "Rosa Herrera", "Marcos Hinojosa", "Jose Garzon"]
                .map((n) => `<option value="${n}" ${(item?.responsable ?? "") === n ? "selected" : ""}>${n}</option>`)
                .join("")}
            </select>
          </label>

          <label class="req-form-field">
            <span>Fecha de ingreso</span>
            <input type="date" id="req-fecha-ingreso" value="${item?.fechaIngreso ?? ""}" />
          </label>

          <label class="req-form-field">
            <span>Fecha límite</span>
            <input type="date" id="req-fecha-limite" value="${item?.fechaLimite ?? ""}" />
          </label>

          <label class="req-form-field req-form-field--full">
            <span>Expediente</span>
            <input type="text" id="req-expediente" placeholder="Número de expediente o referencia interna" value="${escapeHtml(item?.expediente ?? "")}" />
          </label>

          <label class="req-form-field req-form-field--full">
            <span>Observaciones</span>
            <textarea id="req-observaciones" rows="4" placeholder="Notas internas, próximos pasos, comentarios...">${escapeHtml(item?.observaciones ?? "")}</textarea>
          </label>
        </div>
      </form>
    `,
    footer: `
      <button type="button" class="btn-secondary" data-action="close-modal">Cancelar</button>
      <button type="button" class="btn-primary" data-action="save-requirement">Guardar</button>
    `
  });
}

function renderDeleteRequirementModal(item) {
  if (!item) return "";

  return renderModal({
    title: "Eliminar requerimiento",
    body: `
      <div class="req-confirm-delete">
        <div class="req-confirm-icon">🗑️</div>
        <div class="req-confirm-text">
          <p>Estás por eliminar este requerimiento:</p>
          <strong>${escapeHtml(item.descripcion ?? "Sin descripción")}</strong>
          <span>${escapeHtml(item.cliente ?? "Sin cliente")}</span>
        </div>
      </div>
    `,
    footer: `
      <button type="button" class="btn-secondary" data-action="close-modal">Cancelar</button>
      <button
        type="button"
        class="btn-danger"
        data-action="confirm-delete-requirement"
        data-id="${item.id}"
      >
        Sí, eliminar
      </button>
    `
  });
}

function renderStageOption(value, label, current) {
  return `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`;
}

function formatDate(value) {
  if (!value) return "—";
  const s = String(value);
  const [year, month, day] = s.split("-");
  if (!year || !month || !day) return s;
  return `${day}/${month}/${year}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
