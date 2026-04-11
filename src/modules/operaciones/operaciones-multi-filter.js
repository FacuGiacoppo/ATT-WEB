/**
 * Multi-filtros compartidos (Obligaciones + Central de operaciones).
 * Archivo dedicado para que el import tenga URL distinta y no quede atrapado en caché vieja.
 */

function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function encCheckboxValue(v) {
  return encodeURIComponent(String(v));
}

export function renderMultiFilter(id, label) {
  return `
    <details class="op-mfilter" data-filter-id="${id}">
      <summary class="op-mfilter-btn">
        <span class="op-mfilter-label">${escapeHtml(label)}</span>
        <span class="op-mfilter-count is-hidden" id="${id}-count"></span>
        <span class="op-mfilter-arrow">▾</span>
      </summary>
      <div class="op-mfilter-panel" id="${id}-panel" tabindex="-1">
        <div class="op-mfilter-pop-head">
          <input type="search" class="op-mfilter-search" placeholder="Buscar…" autocomplete="off" data-mfilter-search="${id}" />
          <div class="op-mfilter-actions">
            <button type="button" class="op-mfilter-action" data-mfilter-clear="${id}">Mostrar todos</button>
            <button type="button" class="op-mfilter-action op-mfilter-action--secondary" data-mfilter-visible="${id}">Marcar visibles</button>
          </div>
        </div>
        <div class="op-mfilter-opts" id="${id}-opts"></div>
      </div>
    </details>
  `;
}

export function buildMultiFilterOpts(id, values, selected, labelFn) {
  const optsEl = document.getElementById(`${id}-opts`);
  const countEl = document.getElementById(`${id}-count`);
  if (!optsEl) return;
  const selSet = new Set(selected.map((s) => String(s)));
  optsEl.innerHTML = values
    .map((v) => {
      const lbl = labelFn ? labelFn(v) : v;
      const checked = selSet.has(String(v)) ? " checked" : "";
      const enc = encCheckboxValue(v);
      return `<label class="op-mfilter-opt">
      <input type="checkbox" name="${id}" value="${enc}"${checked} />
      <span>${escapeHtml(lbl)}</span>
    </label>`;
    })
    .join("");
  if (countEl) {
    const hasActive = selected.length > 0;
    countEl.classList.toggle("is-hidden", !hasActive);
    countEl.textContent = hasActive ? String(selected.length) : "";
  }
}
