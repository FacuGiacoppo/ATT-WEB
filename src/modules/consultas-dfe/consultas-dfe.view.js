/**
 * Vista estática Consultas DFE (tabla y estados se pintan desde el controller).
 */
export function renderConsultasDfeView() {
  return `
    <section class="page-section dfe-page" id="dfe-root">
      <header class="page-header">
        <div>
          <h1 class="page-title">Consultas DFE</h1>
          <p class="page-subtitle">
            Bandeja central del estudio: comunicaciones DFE de todos los clientes habilitados, persistidas en Firestore.
            El seguimiento interno (vista, gestión, notas) también queda compartido para el equipo.
          </p>
        </div>
      </header>

      <details class="dfe-guide is-hidden" id="dfe-superadmin-guide">
        <summary class="dfe-guide-summary">
          <span class="dfe-guide-title">Guía interna (solo superadmin)</span>
          <span class="dfe-guide-sub">Instructivo de delegación</span>
        </summary>
        <div class="dfe-guide-body" id="dfe-superadmin-guide-body"></div>
      </details>

      <div class="dfe-card dfe-inbox-card">
        <div class="dfe-inbox-head">
          <div>
            <h2 class="dfe-results-title">Bandeja</h2>
            <p class="dfe-results-meta" id="dfe-inbox-meta"></p>
          </div>
          <div class="dfe-inbox-actions">
            <button type="button" class="btn-secondary dfe-btn-sm" id="dfe-inbox-refresh">Recargar</button>
            <button type="button" class="btn-primary dfe-btn-sm is-hidden" id="dfe-inbox-sync">Sincronizar ahora</button>
          </div>
        </div>

        <div class="dfe-inbox-filters" id="dfe-inbox-filters">
          <label class="dfe-inline-filter">
            <span class="dfe-inline-label">Cliente</span>
            <select id="dfe-filter-cliente">
              <option value="" selected>Todos</option>
            </select>
          </label>
          <label class="dfe-inline-filter">
            <span class="dfe-inline-label">Estado ATT</span>
            <select id="dfe-att-state">
              <option value="all" selected>Todas</option>
              <option value="new">Nuevas</option>
              <option value="viewed">Vistas</option>
              <option value="managed">Gestionadas</option>
            </select>
          </label>
          <label class="dfe-inline-filter">
            <input type="checkbox" id="dfe-filter-adj" />
            <span>Con adjuntos</span>
          </label>
          <label class="dfe-inline-filter">
            <input type="checkbox" id="dfe-filter-note" />
            <span>Con nota</span>
          </label>
          <label class="dfe-inline-filter dfe-inline-filter--grow">
            <span class="dfe-inline-label">Buscar</span>
            <input type="search" id="dfe-filter-q" placeholder="Asunto, organismo, cliente…" />
          </label>
        </div>

        <div class="dfe-table-scroll">
          <table class="dfe-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Asunto</th>
                <th>Organismo</th>
                <th>Clasificación</th>
                <th>Estado ARCA</th>
                <th>Seguimiento ATT-WEB</th>
                <th class="dfe-th-signals">Señales</th>
                <th class="dfe-th-action">Acción</th>
              </tr>
            </thead>
            <tbody id="dfe-inbox-body"></tbody>
          </table>
        </div>

        <div class="dfe-empty is-hidden" id="dfe-inbox-empty">
          <div class="dfe-empty-icon" aria-hidden="true">📭</div>
          <p class="dfe-empty-title">Sin comunicaciones en la bandeja</p>
          <p class="dfe-empty-hint">Habilitá clientes en <code>dfe_clients</code> y ejecutá “Sincronizar ahora”.</p>
        </div>
      </div>

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
                <th>Seguimiento ATT-WEB</th>
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
        El seguimiento interno (vista, gestión, notas) se guarda en equipo vía Firestore. Pendiente a futuro: sincronización automática, alertas globales y vistas multi-representado.
      </p>
    </section>
  `;
}
