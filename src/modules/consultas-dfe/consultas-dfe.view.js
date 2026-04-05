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
            Consultá comunicaciones de la Ventanilla Electrónica (e-Ventanilla) para un CUIT representado.
            Los certificados y el acceso a AFIP se resuelven solo en el servidor; acá solo ves resultados.
          </p>
        </div>
      </header>

      <div class="dfe-card dfe-form-card">
        <form class="dfe-form" id="dfe-form" autocomplete="off">
          <div class="dfe-form-grid">
            <label class="dfe-field">
              <span class="dfe-label">CUIT representado</span>
              <input type="text" id="dfe-cuit" name="cuit" inputmode="numeric" placeholder="11 dígitos" maxlength="14" />
            </label>
            <label class="dfe-field">
              <span class="dfe-label">Fecha desde</span>
              <input type="date" id="dfe-fecha-desde" name="fechaDesde" value="2026-01-01" />
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
          </div>
          <div class="dfe-form-actions">
            <button type="submit" class="btn-primary" id="dfe-btn-consultar">Consultar</button>
            <button type="button" class="btn-secondary" id="dfe-btn-demo">Cargar caso demo</button>
          </div>
        </form>
      </div>

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
                <th>Estado</th>
                <th>Adjuntos</th>
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
        </div>
      </div>

      <p class="dfe-footnote">
        Etapa 2 (pendiente): persistencia en Firestore, sincronización incremental, alertas y multi-representados.
      </p>
    </section>
  `;
}
