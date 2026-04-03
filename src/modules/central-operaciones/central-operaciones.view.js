import { appState } from "../../app/state.js";
import { buildMultiFilterOpts, renderMultiFilter } from "../operaciones/operaciones.view.js";

function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const ESTADOS = ["Pendiente", "Cumplido", "Cumplido Tardio", "Vencido"];
const MESES_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function syncCentralFilterDetailsActive() {
  const st = appState.centralOperaciones;
  const pairs = [
    ["co-filter-cliente", st.clienteFilter],
    ["co-filter-obligacion", st.obligacionFilter],
    ["co-filter-mes-vto", st.mesVtoFilter],
    ["co-filter-estado", st.estadoFilter],
    ["co-filter-usuario", st.usuarioFilter]
  ];
  for (const [id, sel] of pairs) {
    const details = document.querySelector(`details.op-mfilter[data-filter-id="${id}"]`);
    if (details) details.classList.toggle("is-active", (sel ?? []).length > 0);
  }
}

/** Mismas opciones y estilo que Obligaciones (multi-filtro + badges). */
export function paintCentralOperacionesFilters(items) {
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "es"));
  const st = appState.centralOperaciones;

  buildMultiFilterOpts("co-filter-cliente", uniq(items.map((r) => r.clienteNombre)), st.clienteFilter ?? []);
  buildMultiFilterOpts("co-filter-obligacion", uniq(items.map((r) => r.obligacion)), st.obligacionFilter ?? []);

  const meses = uniq(items.map((r) => r.vencimiento?.slice(0, 7)).filter(Boolean)).sort();
  buildMultiFilterOpts("co-filter-mes-vto", meses, st.mesVtoFilter ?? [], (ym) => {
    const [y, m] = ym.split("-");
    return `${MESES_ES[Number(m) - 1]}-${y}`;
  });

  buildMultiFilterOpts("co-filter-estado", ESTADOS, st.estadoFilter ?? []);
  buildMultiFilterOpts("co-filter-usuario", uniq(items.map((r) => r.responsable)), st.usuarioFilter ?? []);
  syncCentralFilterDetailsActive();
  document.querySelectorAll("#co-filters-row .op-mfilter-search").forEach((el) => {
    el.value = "";
  });
}

export function renderCentralOperacionesView() {
  const f = appState.centralOperaciones ?? {};

  return `
    <section class="co-page">
      <div class="co-hero">
        <div>
          <div class="req-eyebrow">Administración · superadmin</div>
          <h1 class="req-title">Central de operaciones</h1>
          <p class="req-subtitle">
            Importación con plantilla (listas desplegables), filtros y acciones masivas sobre obligaciones y tareas.
            La vista <strong>Obligaciones</strong> del menú sigue siendo el panel día a día para el equipo.
          </p>
        </div>
      </div>

      <div class="co-panel">
        <h2 class="co-panel-title">Plantilla e importación</h2>
        <p class="co-panel-desc">
          La plantilla usa <strong>ExcelJS</strong> (listas desde la hoja oculta <em>Listas</em>). Si no cargó la librería, se descarga una versión simple sin desplegables.
          Columnas alineadas a la importación existente (Obligaciones / Tareas / Plan-in).
        </p>
        <div class="co-toolbar">
          <button type="button" id="co-btn-download-template" class="btn-secondary">📋 Descargar plantilla</button>
          <label class="btn-primary clientes-import-label" id="co-import-label">
            📥 Importar Excel
            <input type="file" id="co-import-input" accept=".xlsx,.xls,.csv" style="display:none" />
          </label>
        </div>
        <div id="co-import-progress" class="clientes-import-progress" style="display:none">
          <div class="clientes-import-spinner"></div>
          <span id="co-import-progress-text">Importando...</span>
        </div>
      </div>

      <div class="co-panel">
        <h2 class="co-panel-title">Filtros del listado</h2>
        <p class="co-panel-desc co-filters-hint">
          Mismos criterios que <strong>Obligaciones</strong>: cliente, obligación/tarea, mes de vencimiento, estado, usuario y búsqueda libre.
        </p>
        <div class="op-toolbar co-op-toolbar">
          <div class="op-toolbar-top">
            <div class="op-filters-row" id="co-filters-row">
              ${renderMultiFilter("co-filter-cliente", "Cliente")}
              ${renderMultiFilter("co-filter-obligacion", "Obligación / Tarea")}
              ${renderMultiFilter("co-filter-mes-vto", "Mes Vto.")}
              ${renderMultiFilter("co-filter-estado", "Estado")}
              ${renderMultiFilter("co-filter-usuario", "Usuario")}
            </div>
          </div>
          <input
            id="co-search"
            class="req-search op-search"
            type="search"
            placeholder="Buscar..."
            value="${escapeHtml(f.search ?? "")}"
          />
        </div>
        <div class="co-actions">
          <button type="button" id="co-btn-clear-filters" class="btn-secondary">Limpiar filtros</button>
          <span id="co-count-info" class="co-count-info"></span>
        </div>
      </div>

      <div class="co-panel co-panel--danger">
        <h2 class="co-panel-title">Acciones masivas</h2>
        <p class="co-panel-desc">
          Convención: primero ajustá los filtros; el listado de abajo muestra solo esos registros. Podés marcar filas, o actuar sobre <strong>todos los filtrados</strong>.
        </p>
        <div class="co-bulk-bar">
          <button type="button" id="co-btn-del-selected" class="btn-secondary">Eliminar seleccionados</button>
          <button type="button" id="co-btn-del-filtered" class="btn-secondary co-btn-danger">Eliminar todos los filtrados</button>
          <button type="button" id="co-btn-select-visible" class="btn-secondary">Seleccionar todos los visibles</button>
          <button type="button" id="co-btn-clear-selection" class="btn-secondary">Limpiar selección</button>
        </div>
      </div>

      <div class="co-panel">
        <h2 class="co-panel-title">Corregir día de vencimiento (por mes)</h2>
        <p class="co-panel-desc">
          Ejemplo: todas las que <strong>vencen</strong> en marzo de 2026 con día 25 pasan a día 26 (solo tareas si marcás la casilla).
        </p>
        <div class="co-dia-row">
          <label>Mes de vencimiento <input type="month" id="co-shift-month" /></label>
          <label>Día actual <input type="number" id="co-shift-day-from" min="1" max="31" value="25" /></label>
          <label>Nuevo día <input type="number" id="co-shift-day-to" min="1" max="31" value="26" /></label>
          <label class="co-check-label"><input type="checkbox" id="co-shift-solo-tareas" checked /> Solo tareas</label>
          <button type="button" id="co-btn-preview-shift" class="btn-secondary">Vista previa</button>
          <button type="button" id="co-btn-apply-shift" class="btn-primary">Aplicar cambios</button>
        </div>
        <div id="co-shift-preview" class="co-shift-preview" hidden></div>
      </div>

      <div class="op-table-card co-table-card">
        <table class="op-table">
          <thead>
            <tr>
              <th class="co-th-check"><input type="checkbox" id="co-check-all" title="Seleccionar visibles" /></th>
              <th>Cliente</th>
              <th>Obligación / tarea</th>
              <th>Tipo</th>
              <th>Período</th>
              <th>Vencimiento</th>
              <th>Responsable</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="co-tbody"></tbody>
        </table>
        <div id="co-empty" class="op-empty" hidden>Nada coincide con los filtros.</div>
      </div>
    </section>
  `;
}

export function renderCentralRow(item, selected) {
  const chk = selected ? " checked" : "";
  const tipo = item.tipo === "tarea" ? "tarea" : "obligacion";
  const v = item.vencimiento ? String(item.vencimiento).slice(0, 10) : "—";
  return `
    <tr>
      <td><input type="checkbox" class="co-row-check" data-id="${escapeHtml(item.id)}"${chk} /></td>
      <td>${escapeHtml(item.clienteNombre || "—")}</td>
      <td>${escapeHtml(item.obligacion || "—")}</td>
      <td>${escapeHtml(tipo)}</td>
      <td>${escapeHtml(item.periodo || "—")}</td>
      <td>${escapeHtml(v)}</td>
      <td>${escapeHtml(item.responsable || "—")}</td>
      <td><button type="button" class="btn-secondary btn-sm co-one-del" data-id="${escapeHtml(item.id)}">Eliminar</button></td>
    </tr>
  `;
}
