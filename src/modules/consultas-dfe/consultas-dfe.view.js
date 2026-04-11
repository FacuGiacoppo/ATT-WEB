/**
 * Vista estática Consultas DFE (tabla y estados se pintan desde el controller).
 */
export function renderConsultasDfeView() {
  return `
    <section class="page-section dfe-page" id="dfe-root">
      <header class="page-header dfe-header">
        <div class="dfe-header-main">
          <h1 class="page-title">Consultas DFE</h1>
          <p class="page-subtitle dfe-subtitle">
            Comunicaciones sincronizadas desde ARCA. Se actualizan solas al entrar y en segundo plano.
            Abrí una fila para leer el mensaje completo y descargar adjuntos.
          </p>
        </div>
        <div class="dfe-header-meta" id="dfe-api-meta" aria-live="polite">Panel DFE</div>
      </header>

      <section class="dfe-dashboard dfe-api-panel" aria-label="Panel DFE">
        <div class="dfe-api-layout" id="dfe-api-layout">
          <div class="dfe-api-main-col">
            <div class="dfe-api-badges" id="dfe-api-badges"></div>
            <p class="dfe-api-toolbar-hint dfe-muted" id="dfe-api-actions-hint" aria-live="polite"></p>
            <p class="dfe-api-row-hint dfe-muted">Abrí el detalle con “Ver”. Los comentarios y “quién leyó” son compartidos por el equipo.</p>
            <div class="dfe-filterbar dfe-api-filterbar" id="dfe-api-filters">
              <label class="dfe-filter">
                <span class="dfe-filter-label">Cliente</span>
                <select id="dfe-api-filter-cliente">
                  <option value="" selected>Todos</option>
                </select>
              </label>
              <label class="dfe-filter dfe-filter--grow">
                <span class="dfe-filter-label">Buscar</span>
                <input type="search" id="dfe-api-search" placeholder="Nombre, CUIT o asunto…" autocomplete="off" />
              </label>
              <label class="dfe-filter dfe-filter--check">
                <span class="dfe-filter-label">Mostrar</span>
                <span class="dfe-filter-check-row">
                  <input type="checkbox" id="dfe-api-solo-nuevas" />
                  <span>Solo no leídas</span>
                </span>
              </label>
            </div>
            <div class="dfe-table-scroll dfe-api-table-wrap">
              <table class="dfe-table dfe-api-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Fecha</th>
                    <th>Asunto</th>
                    <th>Organismo</th>
                    <th>Estado</th>
                    <th class="dfe-th-action">Acción</th>
                  </tr>
                </thead>
                <tbody id="dfe-api-table-body"></tbody>
              </table>
            </div>
            <div class="att-pager dfe-api-pager is-hidden" id="dfe-api-pager">
              <span class="att-pager-meta" id="dfe-api-pager-meta"></span>
              <div class="att-pager-actions">
                <button type="button" class="btn-secondary att-pager-btn" id="dfe-api-pager-prev">Anterior</button>
                <button type="button" class="btn-secondary att-pager-btn" id="dfe-api-pager-next">Siguiente</button>
              </div>
            </div>
            <div class="dfe-empty is-hidden" id="dfe-api-empty">
              <div class="dfe-empty-icon" aria-hidden="true">📭</div>
              <p class="dfe-empty-title" id="dfe-api-empty-title">No hay comunicaciones para mostrar</p>
              <p class="dfe-empty-hint" id="dfe-api-empty-hint"></p>
            </div>
            <p class="dfe-api-status is-hidden" id="dfe-api-status" role="status"></p>
          </div>
        </div>
        <div id="dfe-bandeja-modal-mount" class="dfe-bandeja-modal-mount" aria-live="polite"></div>
      </section>

      <details class="dfe-guide is-hidden" id="dfe-superadmin-guide">
        <summary class="dfe-guide-summary">
          <span class="dfe-guide-title">Guía interna (solo superadmin)</span>
          <span class="dfe-guide-sub">Instructivo de delegación</span>
        </summary>
        <div class="dfe-guide-body" id="dfe-superadmin-guide-body"></div>
      </details>

      <div class="dfe-status-zone" aria-live="polite">
        <div class="dfe-loading is-hidden" id="dfe-loading">
          <span class="dfe-spinner" aria-hidden="true"></span>
          <span>Consultando AFIP…</span>
        </div>
        <div class="dfe-alert dfe-alert--error is-hidden" id="dfe-error" role="alert"></div>
      </div>

    </section>
  `;
}
