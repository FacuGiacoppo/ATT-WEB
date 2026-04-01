export function renderEstadoResultadosView(canUpload = false) {
  return `
    <section class="page-section">
      <header class="page-header">
        <div>
          <h1 class="page-title">Estado de Resultados ATT</h1>
          <p class="page-subtitle" id="eerr-page-subtitle">Cargando datos...</p>
        </div>
        ${canUpload ? `
        <div class="eerr-toolbar">
          <label class="eerr-file">
            <span class="eerr-file-label">Actualizar Excel</span>
            <input type="file" id="eerr-xlsx-input" accept=".xlsx,.xls" />
          </label>
        </div>` : ""}
      </header>

      <div class="eerr-period-bar" id="eerr-period-bar" hidden>
        <div class="eerr-period-bar-head">
          <span class="eerr-period-bar-title">Períodos (EERR)</span>
          <div class="eerr-period-bar-actions">
            <button type="button" class="eerr-btn eerr-btn--sm" id="eerr-periods-all">Todos</button>
            <button type="button" class="eerr-btn eerr-btn--sm" id="eerr-periods-none">Ninguno</button>
          </div>
        </div>
        <p class="eerr-period-hint">Marcá uno, varios o todos. La tabla se actualiza al cambiar la selección.</p>
        <div class="eerr-period-filters" id="eerr-period-filters"></div>
      </div>

      <div class="eerr-rubro-bar" id="eerr-rubro-bar" hidden>
        <div class="eerr-period-bar-head">
          <span class="eerr-period-bar-title">Rubros (EERR)</span>
          <div class="eerr-period-bar-actions">
            <button type="button" class="eerr-btn eerr-btn--sm" id="eerr-rubros-all">Todos</button>
            <button type="button" class="eerr-btn eerr-btn--sm" id="eerr-rubros-none">Ninguno</button>
          </div>
        </div>
        <p class="eerr-period-hint">Mostrá u ocultá bloques de ingresos/egresos. Los subtotales y la columna TOTAL se recalculan con lo visible.</p>
        <div class="eerr-period-filters" id="eerr-rubro-filters"></div>
      </div>

      <div class="eerr-tabs">
        <button class="eerr-tab-btn is-active" data-eerr-tab="eerr" type="button">EERR</button>
        <button class="eerr-tab-btn" data-eerr-tab="ingresos" type="button">Ingresos (lista)</button>
        <button class="eerr-tab-btn" data-eerr-tab="egresos" type="button">Egresos (lista)</button>
      </div>

      <div class="eerr-panel is-active" data-eerr-panel="eerr">
        <div class="eerr-controls">
          <button class="eerr-btn" id="eerr-expand-all" type="button">+ Expandir todo</button>
          <button class="eerr-btn" id="eerr-collapse-all" type="button">− Colapsar todo</button>
          <button class="eerr-btn" id="eerr-toggle-pct" type="button">Ocultar %</button>
        </div>

        <div class="eerr-table-wrap">
          <table class="eerr-table">
            <thead id="eerr-table-head"></thead>
            <tbody id="eerr-table-body"></tbody>
          </table>
        </div>
        <div class="eerr-hint" id="eerr-hint" hidden></div>
      </div>

      <div class="eerr-panel" data-eerr-panel="ingresos">
        <div class="eerr-list-controls">
          <input class="eerr-search" type="search" id="eerr-ingresos-search" placeholder="Buscar (cliente, rubro, comprobante, etc.)" />
          <button class="eerr-btn" id="eerr-ingresos-clear" type="button">Limpiar filtros</button>
          <span class="eerr-pill" id="eerr-ingresos-count">0 filas</span>
        </div>
        <div class="eerr-table-wrap">
          <table class="eerr-list-table" id="eerr-ingresos-table">
            <thead id="eerr-ingresos-head"></thead>
            <tbody id="eerr-ingresos-body"></tbody>
          </table>
        </div>
      </div>

      <div class="eerr-panel" data-eerr-panel="egresos">
        <div class="eerr-list-controls">
          <input class="eerr-search" type="search" id="eerr-egresos-search" placeholder="Buscar (concepto, rubro, imputación, etc.)" />
          <button class="eerr-btn" id="eerr-egresos-clear" type="button">Limpiar filtros</button>
          <span class="eerr-pill" id="eerr-egresos-count">0 filas</span>
        </div>
        <div class="eerr-table-wrap">
          <table class="eerr-list-table" id="eerr-egresos-table">
            <thead id="eerr-egresos-head"></thead>
            <tbody id="eerr-egresos-body"></tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

