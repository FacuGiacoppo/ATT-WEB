import { appState } from "../../app/state.js";

// ─── Dimensiones ──────────────────────────────────────────────────────────────

const MESES_ES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

function fmtYM(raw) {
  if (!raw || !raw.includes("-")) return raw ?? "—";
  const [y, m] = raw.split("-");
  const mi = parseInt(m, 10) - 1;
  return `${MESES_ES[mi] ?? m}-${y}`;
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

export function dimById(id)    { return DIMS.find(d => d.id === id); }
export function dimLabel(id)   { return dimById(id)?.label ?? id; }
export function dimFmt(id, val) {
  const d = dimById(id);
  return d?.format ? d.format(val) : (val ?? "—");
}

// ─── Enriquecimiento de registros ─────────────────────────────────────────────

export function enrichRecord(r) {
  const fecha = r.fechaCumplimiento ?? "";
  const año   = fecha.slice(0, 4) || null;
  const mes   = fecha.slice(0, 7) || null;
  const createdDate = r._createdAtMs ? new Date(r._createdAtMs) : null;
  const añoReg = createdDate ? String(createdDate.getFullYear()) : null;
  const mesReg = createdDate
    ? `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, "0")}`
    : null;
  return {
    ...r,
    _año:     año    ?? "Sin fecha",
    _mes:     mes    ?? "sin-mes",
    _añoReg:  añoReg ?? "Sin fecha",
    _mesReg:  mesReg ?? "sin-mes",
    _minutos: typeof r.tiempoInsumido === "number" ? r.tiempoInsumido : 0,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ─── Dimension pills con panel de filtro ──────────────────────────────────────

export function renderDimPill(id, label, st) {
  const inRow = (st.rowDims ?? []).includes(id);
  const inCol = (st.colDims ?? []).includes(id);
  const filterCount = (st.filters?.[id] ?? []).length;

  const zoneBadge = inRow
    ? `<span class="rt-dim-badge rt-dim-badge--row">FILAS</span>`
    : inCol
    ? `<span class="rt-dim-badge rt-dim-badge--col">COLS</span>`
    : "";

  const cntClass = filterCount > 0 ? "rt-dim-filter-count" : "rt-dim-filter-count is-hidden";

  return `
    <details class="rt-dim-pill" data-dim="${id}" id="rt-dim-${id}">
      <summary class="rt-dim-pill-summary" draggable="true">
        <span class="rt-dim-pill-grip">⠿</span>
        <span class="rt-dim-pill-label">${escHtml(label)}</span>
        <span class="${cntClass}" id="rt-fc-${id}">${filterCount > 0 ? filterCount : ""}</span>
        ${zoneBadge}
        <span class="rt-dim-pill-arrow">▾</span>
      </summary>
      <div class="rt-dim-pill-panel" id="rt-fp-${id}" draggable="false">
        <div class="op-mfilter-pop-head">
          <input type="search" class="op-mfilter-search"
                 placeholder="Buscar…" autocomplete="off"
                 data-rt-search="${id}" draggable="false" />
          <div class="op-mfilter-actions">
            <button type="button" class="op-mfilter-action"
                    data-rt-filter-all="${id}">Marcar todos</button>
            <button type="button" class="op-mfilter-action op-mfilter-action--secondary"
                    data-rt-filter-none="${id}">Ninguno</button>
          </div>
        </div>
        <div class="op-mfilter-opts" id="rt-fo-${id}"></div>
      </div>
    </details>`;
}

// ─── Drop zones con múltiples chips ───────────────────────────────────────────

function renderZoneChips(dimIds, zone) {
  if (dimIds.length === 0) {
    return `<span class="rt-drop-hint">Arrastrá dimensiones aquí</span>`;
  }
  return dimIds.map((id, i) => `
    ${i > 0 ? `<span class="rt-zone-sep">›</span>` : ""}
    <button type="button" class="rt-active-dim"
            data-rt-remove-zone="${zone}" data-rt-remove-dim="${id}">
      ${escHtml(dimLabel(id))}
      <span class="rt-active-dim-x">✕</span>
    </button>`).join("");
}

export function renderDropZones(st) {
  const row = st.rowDims ?? [];
  const col = st.colDims ?? [];
  return `
    <div class="rt-drop-zone${row.length ? " rt-drop-zone--filled" : ""}"
         data-zone="row" id="rt-drop-row">
      <span class="rt-drop-zone-label">FILAS</span>
      <div class="rt-zone-chips">${renderZoneChips(row, "row")}</div>
    </div>
    <div class="rt-drop-zone${col.length ? " rt-drop-zone--filled" : ""}"
         data-zone="col" id="rt-drop-col">
      <span class="rt-drop-zone-label">COLUMNAS</span>
      <div class="rt-zone-chips">${renderZoneChips(col, "col")}</div>
    </div>`;
}

// ─── Tabla pivot (multi-dim filas, rowspan, valores en minutos) ───────────────

export function renderPivot(items, st) {
  const rowDims = st.rowDims ?? [];
  const colDims = st.colDims ?? [];

  if (rowDims.length === 0 && colDims.length === 0) {
    const tot = items.reduce((s, r) => s + r._minutos, 0);
    return `<div class="rt-pivot-hint">
      Arrastrá al menos una dimensión a <strong>Filas</strong> o <strong>Columnas</strong>.
      ${tot ? `<br>Total disponible: <strong>${tot} min</strong>` : ""}
    </div>`;
  }

  // ── Claves de fila y columna ────────────────────────────────────────────
  const getCombo  = r => rowDims.map(d => r[d] ?? "Sin dato");
  const getColKey = r => colDims.length
    ? colDims.map(d => dimFmt(d, r[d] ?? "Sin dato")).join(" / ")
    : "__only__";

  // Combinaciones únicas de fila, ordenadas multi-nivel
  const comboSet = new Set();
  for (const r of items) comboSet.add(JSON.stringify(getCombo(r)));
  const rowCombos = [...comboSet]
    .map(k => JSON.parse(k))
    .sort((a, b) => {
      for (let d = 0; d < rowDims.length; d++) {
        const c = String(a[d]).localeCompare(String(b[d]), "es");
        if (c !== 0) return c;
      }
      return 0;
    });

  // Columnas únicas, ordenadas
  const colKeySet = new Set();
  for (const r of items) colKeySet.add(getColKey(r));
  const colKeys = colDims.length
    ? [...colKeySet].sort((a, b) => a.localeCompare(b, "es"))
    : [];

  // ── Mapa pivot ──────────────────────────────────────────────────────────
  const pivotMap  = new Map(); // rk → ck → sum
  const colTotals = new Map();
  let   grandTotal = 0;

  for (const r of items) {
    const rk  = JSON.stringify(getCombo(r));
    const ck  = getColKey(r);
    const min = r._minutos;
    if (!pivotMap.has(rk)) pivotMap.set(rk, new Map());
    const cell = pivotMap.get(rk);
    cell.set(ck, (cell.get(ck) ?? 0) + min);
    colTotals.set(ck, (colTotals.get(ck) ?? 0) + min);
    grandTotal += min;
  }

  // ── Rowspan helpers ─────────────────────────────────────────────────────
  function shouldRender(ri, d) {
    if (ri === 0) return true;
    for (let i = 0; i <= d; i++) {
      if (rowCombos[ri][i] !== rowCombos[ri - 1][i]) return true;
    }
    return false;
  }
  function rowspan(ri, d) {
    let n = 1;
    while (ri + n < rowCombos.length) {
      let same = true;
      for (let i = 0; i <= d; i++) {
        if (rowCombos[ri + n][i] !== rowCombos[ri][i]) { same = false; break; }
      }
      if (!same) break;
      n++;
    }
    return n;
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const onlyCols = rowCombos.length === 0; // solo columnas, sin filas
  const onlyRows = colKeys.length === 0;

  let html = `<div class="rt-pivot-scroll"><table class="rt-pivot-table">`;

  // Header
  html += `<thead><tr>`;
  for (const d of rowDims) {
    html += `<th class="rt-th-dim">${escHtml(dimLabel(d))}</th>`;
  }
  if (onlyRows) {
    html += `<th class="rt-th-total">Minutos</th>`;
  } else {
    for (const ck of colKeys) {
      html += `<th class="rt-th-col">${escHtml(ck)}</th>`;
    }
    html += `<th class="rt-th-total">Total</th>`;
  }
  html += `</tr></thead>`;

  // Body
  html += `<tbody>`;
  if (onlyCols) {
    // Sin filas: una sola fila con todos los totales por columna
    html += `<tr>`;
    for (const ck of colKeys) {
      const v = colTotals.get(ck) ?? 0;
      html += `<td class="rt-td-num${!v ? " rt-td-zero" : ""}">${v || "—"}</td>`;
    }
    html += `<td class="rt-td-total rt-td-grand">${grandTotal || "—"}</td>`;
    html += `</tr>`;
  } else {
    for (let i = 0; i < rowCombos.length; i++) {
      const combo  = rowCombos[i];
      const rk     = JSON.stringify(combo);
      const rowMap = pivotMap.get(rk) ?? new Map();
      html += `<tr>`;

      // Celdas de dimensiones de fila con rowspan
      for (let d = 0; d < rowDims.length; d++) {
        if (!shouldRender(i, d)) continue;
        const rs  = rowspan(i, d);
        const val = dimFmt(rowDims[d], combo[d]);
        const cls = d === 0 ? " rt-td-dim--root" : " rt-td-dim--child";
        html += `<td class="rt-td-dim${cls}"${rs > 1 ? ` rowspan="${rs}"` : ""}>${escHtml(val)}</td>`;
      }

      // Datos
      if (onlyRows) {
        const v = rowMap.get("__only__") ?? 0;
        html += `<td class="rt-td-num${!v ? " rt-td-zero" : ""}">${v || "—"}</td>`;
      } else {
        for (const ck of colKeys) {
          const v = rowMap.get(ck) ?? 0;
          html += `<td class="rt-td-num${!v ? " rt-td-zero" : ""}">${v || "—"}</td>`;
        }
        const rowTot = [...rowMap.values()].reduce((s, v) => s + v, 0);
        html += `<td class="rt-td-total">${rowTot || "—"}</td>`;
      }
      html += `</tr>`;
    }
  }
  html += `</tbody>`;

  // Pie de totales (solo con columnas)
  if (!onlyRows && colKeys.length > 0) {
    html += `<tfoot><tr>`;
    html += `<td class="rt-td-foot" colspan="${rowDims.length || 1}">Totales</td>`;
    for (const ck of colKeys) {
      const v = colTotals.get(ck) ?? 0;
      html += `<td class="rt-td-foot rt-td-num">${v || "—"}</td>`;
    }
    html += `<td class="rt-td-foot rt-td-grand">${grandTotal || "—"}</td>`;
    html += `</tr></tfoot>`;
  }

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
            Filtrá cada dimensión con el desplegable y luego arrastrá a
            <strong>Filas</strong> o <strong>Columnas</strong> para armar la tabla pivot.
            Podés poner varias dimensiones en cada eje.
          </p>
        </div>
      </div>

      <div id="rt-load-error" class="op-load-error" hidden role="alert"></div>

      <div class="rt-workspace">

        <div class="rt-dims-panel">
          <div class="rt-dims-title">DIMENSIONES</div>
          <p class="rt-dims-hint">Filtrá y arrastrá a Filas / Columnas</p>
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

        <div class="rt-main">
          <div class="rt-builder" id="rt-builder">
            ${renderDropZones(st)}
          </div>
          <div class="rt-pivot-wrap" id="rt-pivot-wrap">
            <div class="rt-pivot-hint">
              Arrastrá al menos una dimensión a <strong>Filas</strong> o <strong>Columnas</strong>.
            </div>
          </div>
        </div>

      </div>
    </section>`;
}
