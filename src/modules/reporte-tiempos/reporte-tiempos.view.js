import { appState } from "../../app/state.js";

// ─── Dimensiones disponibles ─────────────────────────────────────────────────

const MESES_ES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

/** Formatea "YYYY-MM" → "abr-2025". */
function fmtYM(raw) {
  if (!raw || !raw.includes("-")) return raw ?? "—";
  const [y, m] = raw.split("-");
  return `${MESES_ES[(parseInt(m, 10) - 1)] ?? m}-${y}`;
}

export const DIMS = [
  { id: "cumplidoPor",     label: "Usuario" },
  { id: "clienteNombre",   label: "Cliente" },
  { id: "obligacion",      label: "Obligación" },
  { id: "estadoOperacion", label: "Estado" },
  { id: "periodo",         label: "Período" },
  { id: "_año",            label: "Año" },
  { id: "_mes",            label: "Mes cumpl.",   format: fmtYM },
  { id: "_añoReg",         label: "Año registro" },
  { id: "_mesReg",         label: "Mes registro", format: fmtYM },
];

/** Devuelve el label de una dimensión por su id. */
function dimLabel(id) {
  return DIMS.find(d => d.id === id)?.label ?? id;
}

/** Aplica el format de una dimensión a un valor. */
function dimFmt(id, val) {
  const dim = DIMS.find(d => d.id === id);
  return dim?.format ? dim.format(val) : (val ?? "—");
}

// ─── Enriquecimiento de registros ────────────────────────────────────────────

/** Agrega campos derivados (_año, _mes, _añoReg, _mesReg, _minutos) a un registro. */
export function enrichRecord(r) {
  const fecha = r.fechaCumplimiento ?? "";
  const año   = fecha.slice(0, 4) || null;
  const mes   = fecha.slice(0, 7) || null;           // "YYYY-MM"

  const createdDate = r._createdAtMs ? new Date(r._createdAtMs) : null;
  const añoReg = createdDate ? String(createdDate.getFullYear()) : null;
  const mesReg = createdDate
    ? `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, "0")}`
    : null;

  return {
    ...r,
    _año:    año    ?? "Sin fecha",
    _mes:    mes    ?? "sin-mes",
    _añoReg: añoReg ?? "Sin fecha",
    _mesReg: mesReg ?? "sin-mes",
    _minutos: typeof r.tiempoInsumido === "number" ? r.tiempoInsumido : 0,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatMin(n) {
  if (!n || n <= 0) return "—";
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// ─── Sub-renders ─────────────────────────────────────────────────────────────

function renderDimPill(id, label, st) {
  const isRow = st.rowDim === id;
  const isCol = st.colDim === id;
  const inUse = isRow || isCol;
  const badge = inUse
    ? `<span class="rt-dim-pill-badge">${isRow ? "FILAS" : "COLS"}</span>`
    : "";
  return `
    <div class="rt-dim-pill${inUse ? " rt-dim-pill--in-use" : ""}"
         draggable="${!inUse}"
         data-dim="${id}"
         id="rt-dim-${id}">
      <span class="rt-dim-pill-label">${escapeHtml(label)}</span>
      ${badge}
    </div>`;
}

function renderDropZone(zone, dimId, st) {
  const label = zone === "row" ? "FILAS" : "COLUMNAS";
  const filled = Boolean(dimId);
  const inner = filled
    ? `<button type="button" class="rt-active-dim" data-rt-remove="${zone}">
         ${escapeHtml(dimLabel(dimId))}
         <span class="rt-active-dim-x">✕</span>
       </button>`
    : `<span class="rt-drop-hint">Arrastrá una dimensión aquí</span>`;
  return `
    <div class="rt-drop-zone${filled ? " rt-drop-zone--filled" : ""}"
         data-zone="${zone}"
         id="rt-drop-${zone}">
      <span class="rt-drop-zone-label">${label}</span>
      ${inner}
    </div>`;
}

// ─── Pivot table ─────────────────────────────────────────────────────────────

export function renderPivot(items, st) {
  const { rowDim, colDim } = st;

  if (!rowDim && !colDim) {
    const total = items.reduce((s, r) => s + r._minutos, 0);
    return `<div class="rt-pivot-hint">
      Arrastrá al menos una dimensión a <strong>Filas</strong> o <strong>Columnas</strong> para ver el reporte.
      ${total ? `<br>Total disponible: <strong>${formatMin(total)}</strong>` : ""}
    </div>`;
  }

  // Valores únicos de filas y columnas
  const sortLocale = (a, b) => String(a).localeCompare(String(b), "es");
  const rowVals = rowDim
    ? [...new Set(items.map(r => r[rowDim] ?? "Sin dato"))].sort(sortLocale)
    : null;
  const colVals = colDim
    ? [...new Set(items.map(r => r[colDim] ?? "Sin dato"))].sort(sortLocale)
    : null;

  // Mapa pivot: rowKey -> colKey -> sum
  const map = new Map();
  const colTotals = new Map();
  let grandTotal = 0;

  for (const r of items) {
    const rk = rowDim ? (r[rowDim] ?? "Sin dato") : "__only__";
    const ck = colDim ? (r[colDim] ?? "Sin dato") : "__only__";
    const min = r._minutos;

    if (!map.has(rk)) map.set(rk, new Map());
    map.get(rk).set(ck, (map.get(rk).get(ck) ?? 0) + min);
    colTotals.set(ck, (colTotals.get(ck) ?? 0) + min);
    grandTotal += min;
  }

  // ── Caso: solo columnas (sin filas) ──────────────────────────────────────
  if (!rowDim) {
    let html = `<div class="rt-pivot-scroll"><table class="rt-pivot-table">`;
    html += `<thead><tr>`;
    for (const cv of colVals) {
      html += `<th class="rt-th-col">${escapeHtml(dimFmt(colDim, cv))}</th>`;
    }
    html += `<th class="rt-th-total">Totales</th></tr></thead>`;
    html += `<tbody><tr>`;
    for (const cv of colVals) {
      const v = colTotals.get(cv) ?? 0;
      html += `<td class="rt-td-num${!v ? " rt-td-zero" : ""}">${formatMin(v)}</td>`;
    }
    html += `<td class="rt-td-total rt-td-grand">${formatMin(grandTotal)}</td>`;
    html += `</tr></tbody></table></div>`;
    return html;
  }

  // ── Caso: solo filas ──────────────────────────────────────────────────────
  if (!colDim) {
    let html = `<div class="rt-pivot-scroll"><table class="rt-pivot-table">`;
    html += `<thead><tr><th class="rt-th-dim">${escapeHtml(dimLabel(rowDim))}</th><th class="rt-th-total">Tiempo total</th></tr></thead>`;
    html += `<tbody>`;
    for (const rv of rowVals) {
      const v = map.get(rv)?.get("__only__") ?? 0;
      html += `<tr>
        <td class="rt-td-dim">${escapeHtml(dimFmt(rowDim, rv))}</td>
        <td class="rt-td-num${!v ? " rt-td-zero" : ""}">${formatMin(v)}</td>
      </tr>`;
    }
    html += `</tbody>`;
    html += `<tfoot><tr>
      <td class="rt-td-foot">Totales</td>
      <td class="rt-td-foot rt-td-grand">${formatMin(grandTotal)}</td>
    </tr></tfoot>`;
    html += `</table></div>`;
    return html;
  }

  // ── Caso: filas + columnas (pivot completo) ───────────────────────────────
  let html = `<div class="rt-pivot-scroll"><table class="rt-pivot-table">`;
  html += `<thead><tr>`;
  html += `<th class="rt-th-dim">${escapeHtml(dimLabel(rowDim))}</th>`;
  for (const cv of colVals) {
    html += `<th class="rt-th-col">${escapeHtml(dimFmt(colDim, cv))}</th>`;
  }
  html += `<th class="rt-th-total">Totales</th></tr></thead>`;

  html += `<tbody>`;
  for (const rv of rowVals) {
    const rowMap = map.get(rv) ?? new Map();
    const rowTotal = [...rowMap.values()].reduce((s, v) => s + v, 0);
    html += `<tr>`;
    html += `<td class="rt-td-dim">${escapeHtml(dimFmt(rowDim, rv))}</td>`;
    for (const cv of colVals) {
      const v = rowMap.get(cv) ?? 0;
      html += `<td class="rt-td-num${!v ? " rt-td-zero" : ""}">${formatMin(v)}</td>`;
    }
    html += `<td class="rt-td-total">${formatMin(rowTotal)}</td>`;
    html += `</tr>`;
  }
  html += `</tbody>`;

  html += `<tfoot><tr>`;
  html += `<td class="rt-td-foot">Totales</td>`;
  for (const cv of colVals) {
    const v = colTotals.get(cv) ?? 0;
    html += `<td class="rt-td-foot rt-td-num">${formatMin(v)}</td>`;
  }
  html += `<td class="rt-td-foot rt-td-grand">${formatMin(grandTotal)}</td>`;
  html += `</tr></tfoot>`;

  html += `</table></div>`;
  return html;
}

// ─── Vista principal ──────────────────────────────────────────────────────────

export function renderReporteTiemposView() {
  const st = appState.reporteTiempos;
  return `
    <section class="rt-page">
      <div class="op-hero">
        <div class="op-hero-left">
          <div class="req-eyebrow">Productividad · tiempo</div>
          <h1 class="req-title">Reporte de tiempos</h1>
          <p class="req-subtitle">
            Analizá el tiempo insumido en cada obligación.
            Arrastrá las dimensiones a <strong>Filas</strong> y <strong>Columnas</strong> para pivotear los datos.
          </p>
        </div>
      </div>

      <div id="rt-load-error" class="op-load-error" hidden role="alert"></div>

      <div class="rt-workspace">

        <!-- Panel izquierdo: chips de dimensiones -->
        <div class="rt-dims-panel">
          <div class="rt-dims-title">DIMENSIONES</div>
          <p class="rt-dims-hint">Arrastrá a Filas o Columnas</p>
          <div class="rt-dims-list" id="rt-dims-list">
            ${DIMS.map(d => renderDimPill(d.id, d.label, st)).join("")}
          </div>
          <div class="rt-dims-sep"></div>
          <div class="rt-dims-value-box">
            <span class="rt-dims-value-icon">∑</span>
            <div>
              <div class="rt-dims-value-label">VALOR</div>
              <div class="rt-dims-value-name">Suma de minutos</div>
            </div>
          </div>
        </div>

        <!-- Área principal: builder + tabla -->
        <div class="rt-main">

          <!-- Builder: zonas de drop -->
          <div class="rt-builder" id="rt-builder">
            ${renderDropZone("row", st.rowDim, st)}
            ${renderDropZone("col", st.colDim, st)}
          </div>

          <!-- Tabla pivot -->
          <div class="rt-pivot-wrap" id="rt-pivot-wrap">
            <div class="rt-pivot-hint">
              Arrastrá al menos una dimensión a <strong>Filas</strong> o <strong>Columnas</strong> para ver el reporte.
            </div>
          </div>

        </div>
      </div>
    </section>
  `;
}

// Exportamos helpers para que el controller pueda re-renderizar parcialmente
export { renderDimPill, renderDropZone };
