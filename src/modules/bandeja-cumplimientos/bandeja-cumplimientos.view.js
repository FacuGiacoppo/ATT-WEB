import { appState } from "../../app/state.js";

const ESTADOS = ["Pendiente", "Cumplido", "Cumplido Tardio", "Vencido"];
const SIN_ESTADO = "Sin dato";
const MESES_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_FULL = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre"
];
const DIAS_FULL = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function weekRange(ref) {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function vistaPeriodLabel(mode, refDate) {
  if (mode === "todos") return "Todos los registros";
  const ref = refDate ? new Date(refDate + "T00:00:00") : new Date();
  if (mode === "dia") {
    return `${capitalize(DIAS_FULL[ref.getDay()])}, ${ref.getDate()} ${MESES_ES[ref.getMonth()]} ${ref.getFullYear()}`;
  }
  if (mode === "mes") {
    return `${capitalize(MESES_FULL[ref.getMonth()])} ${ref.getFullYear()}`;
  }
  if (mode === "semana") {
    const { start, end } = weekRange(ref);
    const startLabel = `${start.getDate()} ${MESES_ES[start.getMonth()]}`;
    const endLabel = `${end.getDate()} ${MESES_ES[end.getMonth()]} ${end.getFullYear()}`;
    return `${startLabel} – ${endLabel}`;
  }
  return "";
}

function parseISODate(s) {
  const p = String(s || "").slice(0, 10).split("-");
  if (p.length !== 3) return null;
  const y = Number(p[0]);
  const m = Number(p[1]);
  const d = Number(p[2]);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function isInVistaRange(fechaIso, mode, ref) {
  if (!fechaIso) return false;
  const d = parseISODate(fechaIso);
  if (!d) return false;
  if (mode === "dia") {
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
  }
  if (mode === "mes") {
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
  }
  if (mode === "semana") {
    const { start, end } = weekRange(ref);
    return d >= start && d <= end;
  }
  return true;
}

function formatDisplayDate(iso) {
  if (!iso) return "—";
  const p = String(iso).slice(0, 10).split("-");
  if (p.length !== 3) return escapeHtml(iso);
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function encCheckboxValue(v) {
  return encodeURIComponent(String(v));
}

function renderMultiFilter(id, label) {
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

export function renderVistaBarBandeja() {
  const st = appState.bandejaCumplimientos;
  const label = vistaPeriodLabel(st.vistaMode, st.vistaRefDate);
  const navDisabled = st.vistaMode === "todos" ? " disabled" : "";
  const tabs = [
    ["todos", "Todos"],
    ["mes", "Mes"],
    ["semana", "Semana"],
    ["dia", "Día"]
  ];
  return `
    <div class="op-vista-bar" id="bc-vista-bar">
      <span class="op-vista-lbl">VISTA</span>
      <div class="op-vista-tabs">
        ${tabs.map(([v, l]) => `<button type="button" class="op-vista-tab${st.vistaMode === v ? " is-active" : ""}" data-bc-vista="${v}">${l}</button>`).join("")}
      </div>
      <button type="button" class="op-vista-nav" data-bc-vista-nav="-1"${navDisabled}>‹</button>
      <span class="op-vista-period" id="bc-vista-period">${escapeHtml(label)}</span>
      <button type="button" class="op-vista-nav" data-bc-vista-nav="1"${navDisabled}>›</button>
    </div>
  `;
}

export function updateBandejaVistaBarDisplay() {
  const st = appState.bandejaCumplimientos;
  const label = vistaPeriodLabel(st.vistaMode, st.vistaRefDate);
  const navDisabled = st.vistaMode === "todos";
  const bar = document.getElementById("bc-vista-bar");
  if (!bar) return;
  bar.querySelectorAll("[data-bc-vista]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.bcVista === st.vistaMode);
  });
  const periodEl = document.getElementById("bc-vista-period");
  if (periodEl) periodEl.textContent = label;
  bar.querySelectorAll("[data-bc-vista-nav]").forEach((btn) => {
    btn.disabled = navDisabled;
  });
}

function estadoRowClass(estado) {
  const key = String(estado || "");
  if (key === "Cumplido") return "op-td--ok";
  if (key === "Cumplido Tardio") return "op-td--late";
  if (key === "Vencido") return "op-td--bad";
  if (key === "Pendiente") return "op-td--pend";
  return "";
}

export function renderBandejaCumplimientosView() {
  const st = appState.bandejaCumplimientos;
  return `
    <section class="op-page">
      <div class="op-hero">
        <div class="op-hero-left">
          <div class="req-eyebrow">Trazabilidad · envíos</div>
          <h1 class="req-title">Bandeja de salida</h1>
          <p class="req-subtitle">
            Registro de cumplimientos registrados en el sistema. Filtrá por cliente, obligación, mes de cumplimiento, estado y usuario
            para ubicar rápido un envío o un cierre.
          </p>
        </div>
        <div class="op-hero-right"></div>
      </div>

      <div id="bc-load-error" class="op-load-error" hidden role="alert"></div>

      <div class="op-toolbar">
        <div class="op-toolbar-top">
          <div class="op-filters-row" id="bc-filters-row">
            ${renderMultiFilter("bc-filter-cliente", "Cliente")}
            ${renderMultiFilter("bc-filter-obligacion", "Obligación / Tarea")}
            ${renderMultiFilter("bc-filter-mes-cumpl", "Mes cumpl.")}
            ${renderMultiFilter("bc-filter-estado", "Estado")}
            ${renderMultiFilter("bc-filter-usuario", "Usuario")}
          </div>
          ${renderVistaBarBandeja()}
        </div>
        <input
          id="bc-search"
          class="req-search op-search"
          type="search"
          placeholder="Buscar en asunto, cuerpo, comentario, período…"
          value="${escapeHtml(st.search ?? "")}"
        />
      </div>

      <div class="op-table-card">
        <table class="op-table">
          <thead>
            <tr>
              <th>Registro</th>
              <th>Cumplimiento</th>
              <th>Cliente</th>
              <th>Obligación / Tarea</th>
              <th>Período</th>
              <th>Usuario</th>
              <th>Estado</th>
              <th>Envío</th>
              <th>Asunto</th>
            </tr>
          </thead>
          <tbody id="bc-tbody"></tbody>
        </table>
        <div id="bc-empty" class="op-empty" hidden>Sin registros para los filtros actuales.</div>
      </div>
    </section>
  `;
}

function buildMultiFilterOpts(id, values, selected, labelFn) {
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

function syncBandejaFilterDetailsActive() {
  const st = appState.bandejaCumplimientos;
  const pairs = [
    ["bc-filter-cliente", st.clienteFilter],
    ["bc-filter-obligacion", st.obligacionFilter],
    ["bc-filter-mes-cumpl", st.mesCumplFilter],
    ["bc-filter-estado", st.estadoFilter],
    ["bc-filter-usuario", st.usuarioFilter]
  ];
  for (const [id, sel] of pairs) {
    const details = document.querySelector(`details.op-mfilter[data-filter-id="${id}"]`);
    if (details) details.classList.toggle("is-active", (sel ?? []).length > 0);
  }
}

export function paintBandejaFilters(items) {
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "es"));
  const st = appState.bandejaCumplimientos;

  buildMultiFilterOpts("bc-filter-cliente", uniq(items.map((r) => r.clienteNombre)), st.clienteFilter ?? []);

  buildMultiFilterOpts("bc-filter-obligacion", uniq(items.map((r) => r.obligacion)), st.obligacionFilter ?? []);

  const meses = uniq(items.map((r) => r.fechaCumplimiento?.slice(0, 7)).filter(Boolean)).sort();
  buildMultiFilterOpts("bc-filter-mes-cumpl", meses, st.mesCumplFilter ?? [], (ym) => {
    const [y, m] = ym.split("-");
    return `${MESES_ES[Number(m) - 1]}-${y}`;
  });

  const estadosOpts = [...ESTADOS, SIN_ESTADO];
  buildMultiFilterOpts("bc-filter-estado", estadosOpts, st.estadoFilter ?? []);

  buildMultiFilterOpts("bc-filter-usuario", uniq(items.map((r) => r.cumplidoPor)), st.usuarioFilter ?? []);

  syncBandejaFilterDetailsActive();
  document.querySelectorAll("#bc-filters-row .op-mfilter-search").forEach((el) => {
    el.value = "";
  });
}

function estadoBandejaLabel(r) {
  const e = r.estadoOperacion;
  if (e == null || String(e).trim() === "") return SIN_ESTADO;
  return String(e);
}

export function filterAndSortBandeja(items, state) {
  const q = (state.search ?? "").trim().toLowerCase();
  const vistaMode = state.vistaMode ?? "todos";
  const vistaRef =
    vistaMode !== "todos"
      ? state.vistaRefDate
        ? new Date(state.vistaRefDate + "T00:00:00")
        : (() => {
            const t = new Date();
            t.setHours(0, 0, 0, 0);
            return t;
          })()
      : null;

  let rows = items.filter((r) => {
    if (vistaRef && !isInVistaRange(r.fechaCumplimiento, vistaMode, vistaRef)) return false;
    if (state.estadoFilter?.length > 0) {
      const lab = estadoBandejaLabel(r);
      if (!state.estadoFilter.includes(lab)) return false;
    }
    if (state.clienteFilter?.length > 0 && !state.clienteFilter.includes(r.clienteNombre)) return false;
    if (state.obligacionFilter?.length > 0 && !state.obligacionFilter.includes(r.obligacion)) return false;
    if (state.mesCumplFilter?.length > 0) {
      const ym = r.fechaCumplimiento?.slice(0, 7);
      if (!ym || !state.mesCumplFilter.includes(ym)) return false;
    }
    if (state.usuarioFilter?.length > 0 && !state.usuarioFilter.includes(r.cumplidoPor)) return false;
    if (!q) return true;
    const hay = [
      r.clienteNombre,
      r.obligacion,
      r.periodo,
      r.asunto,
      r.cuerpo,
      r.comentarioInterno,
      r.cumplidoPor,
      estadoBandejaLabel(r)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  const key = state.sortKey ?? "createdAt";
  const dir = state.sortDir === "asc" ? 1 : -1;

  rows = [...rows].sort((a, b) => {
    if (key === "createdAt") {
      const ta = a._createdAtMs ?? 0;
      const tb = b._createdAtMs ?? 0;
      return (ta - tb) * dir;
    }
    const va = a[key] ?? "";
    const vb = b[key] ?? "";
    if (key === "fechaCumplimiento") {
      const da = parseISODate(va)?.getTime() ?? 0;
      const db = parseISODate(vb)?.getTime() ?? 0;
      return (da - db) * dir;
    }
    return String(va).localeCompare(String(vb), "es") * dir;
  });

  return rows;
}

function truncate(s, n) {
  const t = String(s ?? "").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + "…";
}

export function renderBandejaRow(r) {
  const envio = r.requiereEnvio ? "Sí" : "No";
  const est = estadoBandejaLabel(r);
  const destN = Array.isArray(r.destinatarios) ? r.destinatarios.length : 0;
  const asunto = truncate(r.asunto, 48);
  return `
    <tr class="op-row">
      <td class="op-td-sm">${escapeHtml(r._createdAtLabel || "—")}</td>
      <td class="op-td-sm">${formatDisplayDate(r.fechaCumplimiento)}</td>
      <td class="op-td-sm">${escapeHtml(r.clienteNombre || "—")}</td>
      <td>${escapeHtml(r.obligacion || "—")}</td>
      <td class="op-td-sm">${escapeHtml(r.periodo || "—")}</td>
      <td class="op-td-sm">${escapeHtml(r.cumplidoPor || "—")}</td>
      <td class="op-td-sm ${estadoRowClass(est === SIN_ESTADO ? null : est)}">${escapeHtml(est)}</td>
      <td class="op-td-sm">${escapeHtml(envio)}${destN ? ` (${destN})` : ""}</td>
      <td class="op-td-sm" title="${escapeHtml(r.asunto || "")}">${escapeHtml(asunto || "—")}</td>
    </tr>
  `;
}
</think>
Corrigiendo `paintBandejaFilters`: unificando la construcción de opciones del filtro de meses.

<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
StrReplace