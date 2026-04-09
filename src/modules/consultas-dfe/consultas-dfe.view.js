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
            Comunicaciones sincronizadas desde ARCA: lectura interna, archivado y consulta en vivo AFIP (avanzado).
          </p>
        </div>
        <div class="dfe-header-meta" id="dfe-api-meta" aria-live="polite">Panel API</div>
      </header>

      <section class="dfe-dashboard dfe-api-panel" aria-label="Panel DFE">
        <div class="dfe-api-layout" id="dfe-api-layout">
          <div class="dfe-api-main-col">
            <div class="dfe-api-badges" id="dfe-api-badges"></div>
            <div class="dfe-actions-bar">
              <div class="dfe-actions-left">
                <button type="button" class="btn-secondary dfe-btn-sm" id="dfe-api-reload">Recargar</button>
                <button type="button" class="btn-primary dfe-btn-sm is-hidden" id="dfe-inbox-sync">Sincronizar ahora</button>
              </div>
              <div class="dfe-actions-right dfe-muted" id="dfe-api-actions-hint"></div>
            </div>
            <p class="dfe-api-row-hint dfe-muted">Tip: clic en una fila abre el panel de gestión interna (no marca como leída).</p>
            <div class="dfe-filterbar dfe-api-filterbar" id="dfe-api-filters">
              <label class="dfe-filter">
                <span class="dfe-filter-label">Cliente</span>
                <select id="dfe-api-filter-cliente">
                  <option value="" selected>Todos</option>
                </select>
              </label>
              <label class="dfe-filter dfe-filter--check">
                <input type="checkbox" id="dfe-api-solo-nuevas" />
                <span>Solo nuevas (no leídas)</span>
              </label>
              <label class="dfe-filter dfe-filter--check">
                <input type="checkbox" id="dfe-api-solo-urgentes" />
                <span>Solo urgentes</span>
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
                    <th>Vencimiento</th>
                    <th>Estado</th>
                    <th class="dfe-th-compact">Estado interno</th>
                    <th class="dfe-th-compact">Responsable</th>
                    <th>Nueva</th>
                    <th class="dfe-th-action">Acción</th>
                  </tr>
                </thead>
                <tbody id="dfe-api-table-body"></tbody>
              </table>
            </div>
            <div class="dfe-empty is-hidden" id="dfe-api-empty">
              <div class="dfe-empty-icon" aria-hidden="true">📭</div>
              <p class="dfe-empty-title" id="dfe-api-empty-title">No hay comunicaciones para mostrar</p>
              <p class="dfe-empty-hint" id="dfe-api-empty-hint"></p>
            </div>
            <p class="dfe-api-status is-hidden" id="dfe-api-status" role="status"></p>
          </div>
          <aside
            class="dfe-api-detail is-hidden"
            id="dfe-api-detail"
            aria-labelledby="dfe-api-detail-heading"
            aria-hidden="true"
          >
            <div class="dfe-api-detail-head">
              <h2 class="dfe-api-detail-heading" id="dfe-api-detail-heading">Gestión interna</h2>
              <button type="button" class="btn-secondary dfe-btn-sm" id="dfe-api-detail-close" aria-label="Cerrar panel">
                Cerrar
              </button>
            </div>
            <div class="dfe-api-detail-indicators" id="dfe-api-detail-indicators" aria-label="Resumen de la comunicación"></div>
            <p class="dfe-api-detail-feedback is-hidden" id="dfe-api-detail-feedback" role="status" aria-live="polite"></p>
            <p class="dfe-api-detail-status is-hidden" id="dfe-api-detail-status" role="status"></p>
            <div class="dfe-api-detail-scroll" id="dfe-api-detail-body"></div>
          </aside>
        </div>
      </section>

      <details class="dfe-guide is-hidden" id="dfe-superadmin-guide">
        <summary class="dfe-guide-summary">
          <span class="dfe-guide-title">Guía interna (solo superadmin)</span>
          <span class="dfe-guide-sub">Instructivo de delegación</span>
        </summary>
        <div class="dfe-guide-body" id="dfe-superadmin-guide-body"></div>
      </details>

      <details class="dfe-advanced" id="dfe-advanced">
        <summary class="dfe-guide-summary">
          <span class="dfe-guide-title">Consulta avanzada</span>
          <span class="dfe-guide-sub">Buscar por CUIT y rango</span>
        </summary>
        <div class="dfe-card dfe-form-card">
        <form class="dfe-form" id="dfe-form" autocomplete="off">
          <div class="dfe-form-grid">
            <label class="dfe-field">
              <span class="dfe-label">CUIT representado</span>
              <input type="text" id="dfe-cuit" name="cuit" inputmode="numeric" placeholder="11 dígitos" maxlength="14" />
            </label>
            <label class="dfe-field">
              <span class="dfe-label">Fecha desde</span>
              <input type="date" id="dfe-fecha-desde" name="fechaDesde" value="2025-04-12" />
            </label>
            <label class="dfe-field">
              <span class="dfe-label">Fecha hasta</span>
              <input type="date" id="dfe-fecha-hasta" name="fechaHasta" value="2026-04-05" />
            </label>
            <label class="dfe-field">
              <span class="dfe-label">Resultados por página</span>
              <select id="dfe-rpp" name="rpp">
                <option value="5">5</option>
                <option value="10" selected>10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </label>
            <label class="dfe-field">
              <span class="dfe-label">Orden por fecha</span>
              <select id="dfe-order" name="order">
                <option value="desc" selected>Más recientes primero</option>
                <option value="asc">Más antiguas primero</option>
              </select>
            </label>
          </div>
          <div class="dfe-form-actions">
            <button type="submit" class="btn-primary" id="dfe-btn-consultar">Consultar</button>
            <button type="button" class="btn-secondary" id="dfe-btn-demo">Cargar caso demo</button>
          </div>
        </form>
      </div>
      </details>

      <div class="dfe-status-zone" aria-live="polite">
        <div class="dfe-loading is-hidden" id="dfe-loading">
          <span class="dfe-spinner" aria-hidden="true"></span>
          <span>Consultando AFIP…</span>
        </div>
        <div class="dfe-alert dfe-alert--error is-hidden" id="dfe-error" role="alert"></div>
      </div>

      <div class="dfe-card dfe-results-card is-hidden" id="dfe-results-wrap">
        <div class="dfe-results-head">
          <h2 class="dfe-results-title">Resultados</h2>
          <p class="dfe-results-meta" id="dfe-results-meta"></p>
          <p class="dfe-kpis-hint is-hidden" id="dfe-kpis-hint"></p>
          <div class="dfe-kpis is-hidden" id="dfe-kpis"></div>
          <div class="dfe-results-filters is-hidden" id="dfe-results-filters"></div>
          <div class="dfe-pager is-hidden" id="dfe-pager">
            <button type="button" class="btn-secondary dfe-btn-sm" id="dfe-prev">Anterior</button>
            <span class="dfe-pager-label" id="dfe-page-label">Página 1 de 1</span>
            <button type="button" class="btn-secondary dfe-btn-sm" id="dfe-next">Siguiente</button>
          </div>
        </div>
        <div class="dfe-table-scroll">
          <table class="dfe-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Fecha publicación / recibido</th>
                <th>Asunto</th>
                <th>Organismo</th>
                <th>Clasificación</th>
                <th>Estado ARCA</th>
                <th>Estado ATT</th>
                <th class="dfe-th-signals">Señales</th>
                <th class="dfe-th-action">Acción</th>
              </tr>
            </thead>
            <tbody id="dfe-table-body"></tbody>
          </table>
        </div>
        <div class="dfe-empty is-hidden" id="dfe-empty">
          <div class="dfe-empty-icon" aria-hidden="true">📭</div>
          <p class="dfe-empty-title">No hay comunicaciones en este rango</p>
          <p class="dfe-empty-hint">Probá ampliar las fechas o verificá el CUIT representado. Esto no es un error del sistema.</p>
          <p class="dfe-empty-hint dfe-empty-hint--sub is-hidden" id="dfe-empty-hint-homo">
            El servidor indica entorno de <strong>homologación</strong>: es normal que no haya comunicaciones para un CUIT aunque en <strong>producción</strong> sí existan notificaciones, porque son datos distintos.
          </p>
        </div>
      </div>

      <p class="dfe-footnote">
        La tabla principal usa la API DFE (lectura/archivo interno). La consulta avanzada consulta AFIP en vivo. El seguimiento colaborativo (comentarios/gestionada) sigue en Firestore desde el modal “Ver”.
      </p>
    </section>
  `;
}
