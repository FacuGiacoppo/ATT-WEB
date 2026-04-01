import { appState } from "../../app/state.js";

function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderClienteOptionsCentral() {
  const clientes = appState.clientes?.items ?? [];
  const sel = appState.centralOperaciones?.filterClienteId ?? "";
  return [
    `<option value="">Todos los clientes</option>`,
    ...clientes.map(
      (c) =>
        `<option value="${escapeHtml(c.id)}" ${c.id === sel ? "selected" : ""}>${escapeHtml(c.nombre)}</option>`
    )
  ].join("");
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
        <div class="co-filters">
          <select id="co-filter-cliente" class="op-select">${renderClienteOptionsCentral()}</select>
          <select id="co-filter-tipo" class="op-select">
            <option value="todos" ${f.filterTipo === "todos" ? "selected" : ""}>Tipo: todos</option>
            <option value="obligacion" ${f.filterTipo === "obligacion" ? "selected" : ""}>Solo obligaciones</option>
            <option value="tarea" ${f.filterTipo === "tarea" ? "selected" : ""}>Solo tareas</option>
          </select>
          <input id="co-filter-venc-month" class="op-select" type="month" value="${escapeHtml(f.filterVencMonth ?? "")}" title="Mes de vencimiento" />
          <input id="co-filter-oblig" type="search" class="req-search" placeholder="Contiene obligación/tarea…" value="${escapeHtml(f.filterObligacionContains ?? "")}" />
          <input id="co-filter-text" type="search" class="req-search" placeholder="Buscar texto libre…" value="${escapeHtml(f.filterText ?? "")}" />
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
