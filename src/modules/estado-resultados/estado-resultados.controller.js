const LIST_COLS = {
  INGRESOS: ["FECHA", "CUIT", "CLIENTE", "RUBRO", "SUB-RUBRO", "IMPUTACIÓN", "COMPROBANTE", "NETO", "IVA", "TOTAL"],
  EGRESOS: ["FECHA", "CONCEPTO", "RUBRO", "SUB-RUBRO", "IMPUTACIÓN", "NETO", "IVA", "TOTAL"],
};

const LIST_STATE = {
  INGRESOS: { rows: [], filtered: [] },
  EGRESOS: { rows: [], filtered: [] },
};

const COLUMN_FILTERS = {
  INGRESOS: {},
  EGRESOS: {},
};

let months = [];
const expanded = {};
let percentVisible = true;
/** Base numérica del EERR (sin filtro de rubros); se actualiza al cambiar períodos. */
let lastEerrBase = null;

const EERR_IDB_NAME = "att-web-eerr";
const EERR_IDB_STORE = "files";
const EERR_CACHE_KEY = "workbook";

function openEerrIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(EERR_IDB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(EERR_IDB_STORE)) {
        db.createObjectStore(EERR_IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function saveEerrWorkbookBytes(buf) {
  if (!buf || !buf.byteLength) return;
  try {
    const db = await openEerrIdb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(EERR_IDB_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(EERR_IDB_STORE).put(buf, EERR_CACHE_KEY);
    });
    db.close();
  } catch (e) {
    console.warn("EERR: no se pudo guardar en el navegador", e);
  }
}

async function loadEerrWorkbookBytes() {
  try {
    const db = await openEerrIdb();
    const buf = await new Promise((resolve, reject) => {
      const tx = db.transaction(EERR_IDB_STORE, "readonly");
      tx.onerror = () => reject(tx.error);
      const r = tx.objectStore(EERR_IDB_STORE).get(EERR_CACHE_KEY);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return buf && buf.byteLength ? buf : null;
  } catch (e) {
    console.warn("EERR: no se pudo leer la copia local", e);
    return null;
  }
}

function waitForXlsx(maxMs = 20000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (window.XLSX) {
        resolve(true);
        return;
      }
      if (Date.now() - t0 > maxMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

function setEerrPersistSubtitle(cached) {
  const el = document.getElementById("eerr-page-subtitle");
  if (!el) return;
  el.textContent = cached
    ? "Último Excel guardado en este navegador (se carga solo al entrar). Subí otro archivo para reemplazarlo."
    : "Cargá el Excel y visualizá el EERR, ingresos y egresos.";
}

export function initEstadoResultadosPage() {
  wireTabs();
  wireXlsxInput();
  wireListControls();
  wireEerrControls();
  wirePeriodFilterControls();
  wireRubroFilterControls();
  renderPeriodFilterChips([]);

  // Start with an empty EERR until the user loads an Excel or we restore from IndexedDB.
  renderEerr({ months: [], sections: [] });
  renderListHead("INGRESOS");
  renderListHead("EGRESOS");
  renderListBody("INGRESOS", []);
  renderListBody("EGRESOS", []);

  void (async () => {
    const xlsxReady = await waitForXlsx();
    if (!xlsxReady) return;
    const bytes = await loadEerrWorkbookBytes();
    if (!bytes) return;
    try {
      const wb = window.XLSX.read(bytes, { type: "array", cellDates: true });
      loadFromWorkbook(wb);
      setEerrPersistSubtitle(true);
    } catch (e) {
      console.warn("EERR: copia local inválida o corrupta", e);
    }
  })();
}

function wireTabs() {
  const btns = document.querySelectorAll("[data-eerr-tab]");
  btns.forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.eerrTab));
  });
}

function switchTab(tabId) {
  document.querySelectorAll(".eerr-tab-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.eerrTab === tabId));
  document.querySelectorAll(".eerr-panel").forEach((p) => p.classList.toggle("is-active", p.dataset.eerrPanel === tabId));
}

function wireXlsxInput() {
  const input = document.getElementById("eerr-xlsx-input");
  if (!input) return;
  input.addEventListener("change", async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    if (!window.XLSX) {
      alert("No se pudo cargar SheetJS (XLSX). Revisá la conexión o el import en index.html.");
      return;
    }
    const buf = await file.arrayBuffer();
    const copyForStore = buf.slice(0);
    let wb;
    try {
      wb = window.XLSX.read(buf, { type: "array", cellDates: true });
    } catch (err) {
      console.error(err);
      alert("No se pudo leer el archivo. Verificá que sea un Excel válido.");
      return;
    }
    loadFromWorkbook(wb);
    await saveEerrWorkbookBytes(copyForStore);
    setEerrPersistSubtitle(true);
  });
}

function wireListControls() {
  const ingSearch = document.getElementById("eerr-ingresos-search");
  const egrSearch = document.getElementById("eerr-egresos-search");
  ingSearch?.addEventListener("input", () => applyListFilter("INGRESOS"));
  egrSearch?.addEventListener("input", () => applyListFilter("EGRESOS"));

  document.getElementById("eerr-ingresos-clear")?.addEventListener("click", () => clearFilters("INGRESOS"));
  document.getElementById("eerr-egresos-clear")?.addEventListener("click", () => clearFilters("EGRESOS"));
}

function wireEerrControls() {
  document.getElementById("eerr-expand-all")?.addEventListener("click", expandAll);
  document.getElementById("eerr-collapse-all")?.addEventListener("click", collapseAll);
  document.getElementById("eerr-toggle-pct")?.addEventListener("click", togglePercentColumns);
}

function collectAvailableMonths(ingRows, egrRows) {
  const monthSet = new Set();
  [ingRows, egrRows].forEach((rows) => {
    rows.forEach((r) => {
      const mk = monthKeyFromCell(r.FECHA);
      if (mk) monthSet.add(mk);
    });
  });
  return Array.from(monthSet).sort();
}

function getSelectedMonthsFromDom() {
  const inputs = document.querySelectorAll("#eerr-period-filters input[data-month]:checked");
  return Array.from(inputs)
    .map((i) => i.dataset.month)
    .sort();
}

function renderPeriodFilterChips(allMonths) {
  const wrap = document.getElementById("eerr-period-filters");
  const bar = document.getElementById("eerr-period-bar");
  if (!wrap) return;
  if (!allMonths.length) {
    wrap.innerHTML = "<span class=\"eerr-period-empty\">Cargá un Excel para ver los períodos disponibles.</span>";
    if (bar) bar.hidden = true;
    return;
  }
  if (bar) bar.hidden = false;
  wrap.innerHTML = allMonths
    .map(
      (m) =>
        `<label class="eerr-period-chip"><input type="checkbox" data-month="${m}" checked /><span>${fmtMonth(m)}</span></label>`
    )
    .join("");
}

function applyPeriodFilterFromDom() {
  const all = collectAvailableMonths(LIST_STATE.INGRESOS.rows, LIST_STATE.EGRESOS.rows);
  if (!all.length) return;
  let selected = getSelectedMonthsFromDom();
  if (selected.length === 0) {
    window.alert("Seleccioná al menos un período.");
    document.querySelectorAll("#eerr-period-filters input[data-month]").forEach((cb) => {
      cb.checked = true;
    });
    selected = all.slice();
  }
  lastEerrBase = computeEerrBase(LIST_STATE.INGRESOS.rows, LIST_STATE.EGRESOS.rows, selected);
  if (!lastEerrBase) {
    renderRubroFilterChips(null);
    renderEerr({ months: [], sections: [] });
    return;
  }
  renderRubroFilterChips(lastEerrBase);
  applyRubroFilterFromDom();
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rubroAttrEncode(label) {
  return encodeURIComponent(String(label));
}

function rubroAttrDecode(encoded) {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function getAllRubroLabelsFromBase(base) {
  if (!base) return [];
  const out = ["INGRESOS ORDINARIOS", "EGRESOS ORDINARIOS", "INGRESOS EXTRAORDINARIOS", "IMPUESTOS"];
  base.otherEgrSections.forEach((s) => out.push(s.label));
  return out;
}

function renderRubroFilterChips(base) {
  const wrap = document.getElementById("eerr-rubro-filters");
  const bar = document.getElementById("eerr-rubro-bar");
  if (!wrap) return;
  if (!base) {
    wrap.innerHTML = "";
    if (bar) bar.hidden = true;
    return;
  }
  if (bar) bar.hidden = false;
  const labels = getAllRubroLabelsFromBase(base);
  wrap.innerHTML = labels
    .map(
      (lab) =>
        `<label class="eerr-rubro-chip"><input type="checkbox" data-rubro="${rubroAttrEncode(lab)}" checked /><span>${escHtml(lab)}</span></label>`
    )
    .join("");
}

function getSelectedRubrosFromDom() {
  return Array.from(document.querySelectorAll("#eerr-rubro-filters input[data-rubro]:checked")).map((i) =>
    rubroAttrDecode(i.dataset.rubro || "")
  );
}

function applyRubroFilterFromDom() {
  if (!lastEerrBase) return;
  let sel = getSelectedRubrosFromDom();
  const all = getAllRubroLabelsFromBase(lastEerrBase);
  if (sel.length === 0) {
    window.alert("Seleccioná al menos un rubro.");
    document.querySelectorAll("#eerr-rubro-filters input[data-rubro]").forEach((cb) => {
      cb.checked = true;
    });
    sel = all.slice();
  }
  const sections = buildSectionsFromBase(lastEerrBase, new Set(sel));
  renderEerr({ months: lastEerrBase.monthList, sections });
}

function wireRubroFilterControls() {
  document.getElementById("eerr-rubros-all")?.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll("#eerr-rubro-filters input[data-rubro]").forEach((cb) => {
      cb.checked = true;
    });
    applyRubroFilterFromDom();
  });
  document.getElementById("eerr-rubros-none")?.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll("#eerr-rubro-filters input[data-rubro]").forEach((cb) => {
      cb.checked = false;
    });
  });
  document.getElementById("eerr-rubro-filters")?.addEventListener("change", (e) => {
    if (e.target?.matches?.('input[type="checkbox"][data-rubro]')) {
      applyRubroFilterFromDom();
    }
  });
}

function wirePeriodFilterControls() {
  document.getElementById("eerr-periods-all")?.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll("#eerr-period-filters input[data-month]").forEach((cb) => {
      cb.checked = true;
    });
    applyPeriodFilterFromDom();
  });
  document.getElementById("eerr-periods-none")?.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll("#eerr-period-filters input[data-month]").forEach((cb) => {
      cb.checked = false;
    });
  });
  document.getElementById("eerr-period-filters")?.addEventListener("change", (e) => {
    if (e.target?.matches?.('input[type="checkbox"][data-month]')) {
      applyPeriodFilterFromDom();
    }
  });
}

function foldStr(v) {
  return (v ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Normaliza espacios y barras para comparar títulos con el Excel. */
function normLabel(s) {
  return foldStr((s ?? "").toString().replace(/\u00a0/g, " ").replace(/\s+/g, " ").replace(/\s*\/\s*/g, " / ").trim());
}

/**
 * Filas acumuladas: la columna TOTAL debe ser el saldo del último mes,
 * no la suma de todos los meses (evita inflar el total).
 */
function isAccumulatedRowLabel(label) {
  const n = normLabel(label);
  const known = new Set([
    "ganancia / perdida acumulada ordinaria",
    "ganancia / perdida acumulada extraordinaria",
    "ganancia / perdida acumulada total",
    "ganancias / perdida acumulada ordinaria",
    "ganancias / perdida acumulada extraordinaria",
    "ganancias / perdida acumulada total",
  ]);
  if (known.has(n)) return true;
  return n.includes("acumulad") && (n.includes("ordinaria") || n.includes("extraordinaria") || n.includes("total"));
}

function fmtMonth(m) {
  const [y, mo] = m.split("-");
  const names = { 1: "ene", 2: "feb", 3: "mar", 4: "abr", 5: "may", 6: "jun", 7: "jul", 8: "ago", 9: "sep", 10: "oct", 11: "nov", 12: "dic" };
  return names[parseInt(mo, 10)] + "-" + y.slice(2);
}

function fmt(v) {
  if (v === null || v === undefined) return "-";
  const abs = Math.abs(v);
  const str = abs.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = v < 0 ? "−" : ""; // U+2212 (minus) for consistent typography/alignment
  const cls = v < 0 ? "eerr-num eerr-num--neg" : "eerr-num";
  return `<span class="${cls}">${sign}${str}</span>`;
}

function fmtPct(curr, prev) {
  if (prev === null || prev === undefined) return "-";
  if (prev === 0) return "-";
  const pct = (curr - prev) / Math.abs(prev);
  const sign = pct > 0 ? "+" : "";
  const str = (pct * 100).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${sign}${str}%`;
}

function fmtDate(v) {
  if (!v) return "-";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("es-AR");
}

function fmtNum(v) {
  if (v === null || v === undefined || v === "") return "-";
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getTotal(values) {
  return months.reduce((s, m) => s + (values[m] || 0), 0);
}

function colCount() {
  return 1 + months.length + Math.max(0, months.length - 1) + 1;
}

function buildHead() {
  const th = document.getElementById("eerr-table-head");
  if (!th) return;
  let html = "<tr><th>RUBRO</th>";
  months.forEach((m, idx) => {
    html += `<th>${fmtMonth(m)}</th>`;
    if (idx > 0) html += `<th class="pct-col">% vs ${fmtMonth(months[idx - 1])}</th>`;
  });
  html += "<th>TOTAL</th></tr>";
  th.innerHTML = html;
}

function buildRows(sections, parentId, depth) {
  const body = document.getElementById("eerr-table-body");
  if (!body) return;
  sections.forEach((sec, i) => {
    if (!sec || !sec.label || sec.label === "null") return;
    const id = (parentId ? parentId + "_" : "") + i;
    const hasChildren = sec.children && sec.children.length > 0;

    if (sec.isTotal || sec.isResult) {
      const sepRow = document.createElement("tr");
      sepRow.className = "separator";
      sepRow.innerHTML = `<td colspan="${colCount()}"></td>`;
      body.appendChild(sepRow);
    }

    const tr = document.createElement("tr");
    tr.id = "row_" + id;
    tr.dataset.parent = parentId || "";
    tr.dataset.depth = depth;

    if (sec.isTotal) tr.classList.add("is-total");
    else if (sec.isResult) {
      tr.classList.add("is-result-row");
    } else {
      tr.classList.add("level-" + (sec.level ?? 0));
    }

    if (depth > 0) {
      tr.style.display = "none";
      tr.dataset.hidden = "1";
    }

    let toggleHtml = "";
    if (hasChildren) {
      expanded[id] = false;
      toggleHtml = `<span class="toggle-btn" data-toggle="${id}">+</span>`;
    } else {
      toggleHtml = `<span class="spacer"></span>`;
    }

    const labelCellClass = sec.isResult ? "eerr-label-cell" : "";
    const labelInner = sec.isResult
      ? `${toggleHtml}<span class="eerr-row-title">${sec.label}</span>`
      : hasChildren
        ? `${toggleHtml}<span class="eerr-branch-label">${sec.label}</span>`
        : `${toggleHtml}<span>${sec.label}</span>`;
    let tdHtml = `<td class="${labelCellClass}"><div class="lbl">${labelInner}</div></td>`;

    function valueCellClass(displayVal) {
      if (!sec.isResult) return "";
      if (displayVal > 0) return "eerr-val-cell eerr-val--pos";
      if (displayVal < 0) return "eerr-val-cell eerr-val--neg";
      return "eerr-val-cell eerr-val--zero";
    }

    /** Variación % vs mes anterior: verde/rojo según signo (mismos curr/prev ya “display”). */
    function pctCellClass(displayCurr, displayPrev) {
      if (displayPrev === null || displayPrev === undefined || displayPrev === 0) {
        return "eerr-val-cell eerr-val--zero";
      }
      const ratio = (displayCurr - displayPrev) / Math.abs(displayPrev);
      if (ratio > 0) return "eerr-val-cell eerr-val--pos";
      if (ratio < 0) return "eerr-val-cell eerr-val--neg";
      return "eerr-val-cell eerr-val--zero";
    }

    months.forEach((m, idx) => {
      const rawCurr = sec.values[m] || 0;
      const curr = sec.isExpense ? -rawCurr : rawCurr;
      const vc = valueCellClass(curr);
      tdHtml += vc ? `<td class="${vc}">${fmt(curr)}</td>` : `<td>${fmt(curr)}</td>`;
      if (idx > 0) {
        const rawPrev = sec.values[months[idx - 1]] || 0;
        const prev = sec.isExpense ? -rawPrev : rawPrev;
        const pctCls = sec.isResult ? `pct-col ${pctCellClass(curr, prev)}` : "pct-col";
        tdHtml += `<td class="${pctCls}">${fmtPct(curr, prev)}</td>`;
      }
    });

    const isAccumulatedRow = typeof sec.label === "string" && isAccumulatedRowLabel(sec.label);
    const rawTot = sec.isResult && isAccumulatedRow ? (sec.values[months[months.length - 1]] || 0) : getTotal(sec.values);
    const tot = sec.isExpense ? -rawTot : rawTot;
    const totClass = valueCellClass(tot);
    tdHtml += totClass ? `<td class="${totClass}">${fmt(tot)}</td>` : `<td>${fmt(tot)}</td>`;

    tr.innerHTML = tdHtml;
    body.appendChild(tr);

    if (hasChildren) buildRows(sec.children, id, depth + 1);
  });
}

function wireRowToggles() {
  document.querySelectorAll(".toggle-btn[data-toggle]").forEach((el) => {
    el.addEventListener("click", () => toggle(el.dataset.toggle));
  });
}

/** Alinea la clase is-expanded en cada fila con ramas según `expanded`. */
function syncBranchExpandedClasses() {
  document.querySelectorAll("#eerr-table-body .toggle-btn[data-toggle]").forEach((btn) => {
    const id = btn.dataset.toggle;
    const row = document.getElementById("row_" + id);
    if (row) row.classList.toggle("is-expanded", !!expanded[id]);
  });
}

function toggle(id) {
  expanded[id] = !expanded[id];
  const btn = document.querySelector(`.toggle-btn[data-toggle="${id}"]`);
  if (btn) btn.textContent = expanded[id] ? "−" : "+";

  document.querySelectorAll("[data-parent]").forEach((row) => {
    if (row.dataset.parent === id) {
      if (expanded[id]) {
        row.style.display = "";
        row.dataset.hidden = "0";
      } else {
        row.style.display = "none";
        row.dataset.hidden = "1";
        const childId = row.id.replace("row_", "");
        if (expanded[childId]) collapseNode(childId);
      }
    }
  });
  syncBranchExpandedClasses();
}

function collapseNode(id) {
  if (!expanded[id]) return;
  expanded[id] = false;
  const btn = document.querySelector(`.toggle-btn[data-toggle="${id}"]`);
  if (btn) btn.textContent = "+";
  document.querySelectorAll("[data-parent]").forEach((row) => {
    if (row.dataset.parent === id) {
      row.style.display = "none";
      row.dataset.hidden = "1";
      const childId = row.id.replace("row_", "");
      collapseNode(childId);
    }
  });
}

function expandAll() {
  Object.keys(expanded).forEach((id) => {
    expanded[id] = true;
    const btn = document.querySelector(`.toggle-btn[data-toggle="${id}"]`);
    if (btn) btn.textContent = "−";
  });
  document.querySelectorAll("[data-parent]").forEach((row) => {
    row.style.display = "";
    row.dataset.hidden = "0";
  });
  syncBranchExpandedClasses();
}

function collapseAll() {
  Object.keys(expanded).forEach((id) => {
    expanded[id] = false;
    const btn = document.querySelector(`.toggle-btn[data-toggle="${id}"]`);
    if (btn) btn.textContent = "+";
  });
  document.querySelectorAll("[data-parent]").forEach((row) => {
    if (Number(row.dataset.depth) > 0) {
      row.style.display = "none";
      row.dataset.hidden = "1";
    }
  });
  syncBranchExpandedClasses();
}

function setPercentColumnsVisible(visible) {
  percentVisible = visible;
  document.querySelectorAll(".pct-col").forEach((el) => {
    el.style.display = percentVisible ? "" : "none";
  });
  const btn = document.getElementById("eerr-toggle-pct");
  if (btn) btn.textContent = percentVisible ? "Ocultar %" : "Mostrar %";
}

function togglePercentColumns() {
  setPercentColumnsVisible(!percentVisible);
}

function renderEerr(data) {
  months = data.months.slice();
  const body = document.getElementById("eerr-table-body");
  if (body) body.innerHTML = "";
  Object.keys(expanded).forEach((k) => delete expanded[k]);
  buildHead();
  buildRows(data.sections, "", 0);
  wireRowToggles();
  setPercentColumnsVisible(percentVisible);
}

function clearFilters(kind) {
  const search = document.getElementById("eerr-" + kind.toLowerCase() + "-search");
  if (search) search.value = "";
  COLUMN_FILTERS[kind] = {};
  document.querySelectorAll(`#eerr-${kind.toLowerCase()}-table .col-filter`).forEach((i) => {
    i.value = "";
  });
  applyListFilter(kind);
}

function setColumnFilter(kind, col, value) {
  COLUMN_FILTERS[kind][col] = foldStr((value || "").trim());
  applyListFilter(kind);
}

function renderListHead(kind) {
  const headEl = document.getElementById("eerr-" + kind.toLowerCase() + "-head");
  if (!headEl) return;
  const cols = LIST_COLS[kind];

  const headerRow =
    "<tr>" +
    cols
      .map((c) => {
        const cls = c === "NETO" || c === "IVA" || c === "TOTAL" ? "num" : "";
        return `<th class="${cls}">${c}</th>`;
      })
      .join("") +
    "</tr>";

  const filterRow =
    '<tr class="filter-row">' +
    cols
      .map((c) => {
        const placeholder = `Filtrar ${c.toLowerCase()}`;
        const cls = c === "NETO" || c === "IVA" || c === "TOTAL" ? "num" : "";
        const id = `eerr_${kind.toLowerCase()}_filter_${c.replace(/[^a-zA-Z0-9]/g, "_")}`;
        return `<th class="${cls}"><input id="${id}" class="col-filter" placeholder="${placeholder}" /></th>`;
      })
      .join("") +
    "</tr>";

  headEl.innerHTML = headerRow + filterRow;

  cols.forEach((c) => {
    const id = `eerr_${kind.toLowerCase()}_filter_${c.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => setColumnFilter(kind, c, el.value));
  });
}

function renderListBody(kind, rows) {
  const bodyEl = document.getElementById("eerr-" + kind.toLowerCase() + "-body");
  const countEl = document.getElementById("eerr-" + kind.toLowerCase() + "-count");
  if (!bodyEl || !countEl) return;
  const cols = LIST_COLS[kind];

  const html = rows
    .map((r) => {
      const cells = cols
        .map((c) => {
          const v = r[c];
          if (c === "FECHA") return `<td>${fmtDate(v)}</td>`;
          if (c === "NETO" || c === "IVA" || c === "TOTAL") return `<td class="num">${fmtNum(v)}</td>`;
          return `<td>${(v ?? "").toString()}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  bodyEl.innerHTML = html;
  countEl.textContent = `${rows.length.toLocaleString("es-AR")} filas`;
}

function applyListFilter(kind) {
  const q = foldStr((document.getElementById("eerr-" + kind.toLowerCase() + "-search")?.value || "").trim());
  const rows = LIST_STATE[kind].rows || [];
  const colFilters = COLUMN_FILTERS[kind] || {};
  const hasColFilters = Object.values(colFilters).some((v) => v);

  const filtered = rows.filter((r) => {
    if (q) {
      const okGlobal = Object.values(r).some((v) => foldStr(v).includes(q));
      if (!okGlobal) return false;
    }
    if (hasColFilters) {
      for (const [col, val] of Object.entries(colFilters)) {
        if (!val) continue;
        if (!foldStr(r[col]).includes(val)) return false;
      }
    }
    return true;
  });

  LIST_STATE[kind].filtered = filtered;
  renderListBody(kind, filtered);
}

function monthKeyFromCell(v) {
  if (v == null || v === "") return null;
  let d;
  if (v instanceof Date) d = v;
  else if (typeof v === "number") {
    const epoch = Date.UTC(1899, 11, 30);
    d = new Date(epoch + Math.round(v) * 86400000);
  } else d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function rubKeyRow(r) {
  const v = r.RUBRO;
  return (v ?? "").toString().trim() || "SIN RUBRO";
}

function subKeyRow(r) {
  const v = r["SUB-RUBRO"] ?? r["SUB RUBRO"];
  return (v ?? "").toString().trim() || "SIN SUB-RUBRO";
}

function imputKeyRow(r) {
  const v = r["IMPUTACIÓN"] ?? r.IMPUTACION;
  return (v ?? "").toString().trim() || "SIN IMPUTACIÓN";
}

function fillMonths(map, monthList) {
  const o = {};
  monthList.forEach((m) => {
    o[m] = map && map[m] ? map[m] : 0;
  });
  return o;
}

function sumMonthMaps(maps, monthList) {
  const tot = {};
  monthList.forEach((m) => {
    tot[m] = 0;
  });
  maps.forEach((map) => {
    monthList.forEach((m) => {
      tot[m] += map[m] || 0;
    });
  });
  return tot;
}

function nestAdd(nest, rub, sub, imput, month, amount) {
  if (!nest[rub]) nest[rub] = { subs: {} };
  if (!nest[rub].subs[sub]) nest[rub].subs[sub] = { imputs: {} };
  if (!nest[rub].subs[sub].imputs[imput]) nest[rub].subs[sub].imputs[imput] = {};
  const leaf = nest[rub].subs[sub].imputs[imput];
  leaf[month] = (leaf[month] || 0) + amount;
}

function nestToSections(nest, monthList) {
  const rubKeys = Object.keys(nest).sort((a, b) => a.localeCompare(b, "es"));
  return rubKeys.map((rub) => {
    const subNest = nest[rub].subs;
    const subKeys = Object.keys(subNest).sort((a, b) => a.localeCompare(b, "es"));
    const children = subKeys.map((sub) => {
      const imputs = subNest[sub].imputs;
      const impKeys = Object.keys(imputs).sort((a, b) => a.localeCompare(b, "es"));
      const leafSections = impKeys.map((im) => ({
        label: im,
        level: 3,
        values: fillMonths(imputs[im], monthList),
        children: [],
      }));
      const subVals = sumMonthMaps(impKeys.map((im) => imputs[im]), monthList);
      return { label: sub, level: 2, values: fillMonths(subVals, monthList), children: leafSections };
    });
    const rubVals = sumMonthMaps(children.map((c) => c.values), monthList);
    return { label: rub, level: 1, values: fillMonths(rubVals, monthList), children };
  });
}

function totalsNetoByMonth(rows, monthList) {
  const o = {};
  monthList.forEach((m) => {
    o[m] = 0;
  });
  const set = new Set(monthList);
  rows.forEach((r) => {
    const mk = monthKeyFromCell(r.FECHA);
    if (!mk || !set.has(mk)) return;
    o[mk] += Number(r.NETO) || 0;
  });
  return o;
}

/**
 * Arma la base del EERR desde el Excel (todos los rubros). Null si no hay meses.
 */
function computeEerrBase(ingRows, egrRows, selectedMonths = null) {
  const allMonths = collectAvailableMonths(ingRows, egrRows);
  if (allMonths.length === 0) return null;

  let monthList = allMonths;
  if (Array.isArray(selectedMonths) && selectedMonths.length > 0) {
    const sel = new Set(selectedMonths);
    monthList = allMonths.filter((m) => sel.has(m));
  }
  if (monthList.length === 0) {
    monthList = allMonths.slice();
  }

  const ingOrdRows = ingRows.filter((r) => foldStr(r.RUBRO) === foldStr("INGRESOS ORDINARIOS"));
  const ingExtRows = ingRows.filter((r) => foldStr(r.RUBRO) === foldStr("INGRESOS EXTRAORDINARIOS"));

  const egrOrdRows = egrRows.filter((r) => foldStr(r.RUBRO) === foldStr("EGRESOS ORDINARIOS"));
  const taxRows = egrRows.filter((r) => foldStr(r.RUBRO) === foldStr("IMPUESTOS"));
  const otherEgrRows = egrRows.filter((r) => {
    const rub = foldStr(r.RUBRO);
    return rub && rub !== foldStr("EGRESOS ORDINARIOS") && rub !== foldStr("IMPUESTOS");
  });

  const nestIngOrd = {};
  ingOrdRows.forEach((r) => {
    const mk = monthKeyFromCell(r.FECHA);
    if (!mk) return;
    nestAdd(nestIngOrd, rubKeyRow(r), subKeyRow(r), imputKeyRow(r), mk, Number(r.NETO) || 0);
  });
  const nestEgrOrd = {};
  egrOrdRows.forEach((r) => {
    const mk = monthKeyFromCell(r.FECHA);
    if (!mk) return;
    nestAdd(nestEgrOrd, rubKeyRow(r), subKeyRow(r), imputKeyRow(r), mk, Number(r.NETO) || 0);
  });
  const nestIngExt = {};
  ingExtRows.forEach((r) => {
    const mk = monthKeyFromCell(r.FECHA);
    if (!mk) return;
    nestAdd(nestIngExt, rubKeyRow(r), subKeyRow(r), imputKeyRow(r), mk, Number(r.NETO) || 0);
  });
  const nestTax = {};
  taxRows.forEach((r) => {
    const mk = monthKeyFromCell(r.FECHA);
    if (!mk) return;
    nestAdd(nestTax, rubKeyRow(r), subKeyRow(r), imputKeyRow(r), mk, Number(r.NETO) || 0);
  });
  const nestOtherEgrByRub = {};
  otherEgrRows.forEach((r) => {
    const mk = monthKeyFromCell(r.FECHA);
    if (!mk) return;
    const rub = rubKeyRow(r);
    if (!nestOtherEgrByRub[rub]) nestOtherEgrByRub[rub] = {};
    nestAdd(nestOtherEgrByRub[rub], rub, subKeyRow(r), imputKeyRow(r), mk, Number(r.NETO) || 0);
  });

  const ingOrdChildren = nestToSections(nestIngOrd, monthList);
  const egrOrdChildren = nestToSections(nestEgrOrd, monthList);
  const ingExtChildren = nestToSections(nestIngExt, monthList);
  const taxChildren = nestToSections(nestTax, monthList);
  const otherEgrSections = Object.keys(nestOtherEgrByRub)
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((rub) => {
      const secs = nestToSections(nestOtherEgrByRub[rub], monthList);
      return secs[0];
    });

  const ingresosOrdinarios = totalsNetoByMonth(ingOrdRows, monthList);
  const egresosOrdinarios = totalsNetoByMonth(egrOrdRows, monthList);
  const ingresosExtraordinarios = totalsNetoByMonth(ingExtRows, monthList);
  const impuestos = totalsNetoByMonth(taxRows, monthList);

  return {
    monthList,
    ingresosOrdinarios,
    egresosOrdinarios,
    ingresosExtraordinarios,
    impuestos,
    ingOrdChildren,
    egrOrdChildren,
    ingExtChildren,
    taxChildren,
    otherEgrSections: otherEgrSections.map((sec) => ({
      label: sec.label,
      values: sec.values,
      children: sec.children || [],
    })),
  };
}

function markExpenseRecursive(node) {
  if (!node || !node.children) return;
  node.children.forEach((c) => {
    c.isExpense = true;
    markExpenseRecursive(c);
  });
}

function markExpenseOnSections(sections) {
  const egrOrd = sections.find((s) => s.label === "EGRESOS ORDINARIOS");
  if (egrOrd) markExpenseRecursive(egrOrd);
  sections.forEach((s) => {
    if (s.isExpense) markExpenseRecursive(s);
  });
}

/**
 * Recalcula totales y filas resultado según qué rubros de datos están visibles.
 */
function buildSectionsFromBase(base, visible) {
  const { monthList } = base;
  const ingresosOrdinarios = {};
  const egresosOrdinarios = {};
  const ingresosExtraordinarios = {};
  const impuestos = {};
  const otrosEgresos = {};

  monthList.forEach((m) => {
    ingresosOrdinarios[m] = visible.has("INGRESOS ORDINARIOS") ? base.ingresosOrdinarios[m] || 0 : 0;
    egresosOrdinarios[m] = visible.has("EGRESOS ORDINARIOS") ? base.egresosOrdinarios[m] || 0 : 0;
    ingresosExtraordinarios[m] = visible.has("INGRESOS EXTRAORDINARIOS") ? base.ingresosExtraordinarios[m] || 0 : 0;
    impuestos[m] = visible.has("IMPUESTOS") ? base.impuestos[m] || 0 : 0;
    otrosEgresos[m] = 0;
  });

  base.otherEgrSections.forEach((sec) => {
    if (!visible.has(sec.label)) return;
    monthList.forEach((m) => {
      otrosEgresos[m] += sec.values[m] || 0;
    });
  });

  const gananciaOrdinaria = {};
  const gananciaAcumOrdinaria = {};
  const gananciaExtraordinaria = {};
  const gananciaAcumExtraordinaria = {};
  const utilidadAntesImpuestos = {};
  const gananciaTotal = {};
  const gananciaAcumTotal = {};

  let runOrd = 0;
  let runExt = 0;
  let cumImpuestos = 0;
  monthList.forEach((m) => {
    gananciaOrdinaria[m] = (ingresosOrdinarios[m] || 0) - (egresosOrdinarios[m] || 0);
    runOrd += gananciaOrdinaria[m] || 0;
    gananciaAcumOrdinaria[m] = runOrd;

    gananciaExtraordinaria[m] = (ingresosExtraordinarios[m] || 0) - (otrosEgresos[m] || 0);
    runExt += gananciaExtraordinaria[m] || 0;
    gananciaAcumExtraordinaria[m] = runExt;

    utilidadAntesImpuestos[m] = (gananciaOrdinaria[m] || 0) + (gananciaExtraordinaria[m] || 0);
    gananciaTotal[m] = (utilidadAntesImpuestos[m] || 0) - (impuestos[m] || 0);
    cumImpuestos += impuestos[m] || 0;
    gananciaAcumTotal[m] =
      (gananciaAcumOrdinaria[m] || 0) + (gananciaAcumExtraordinaria[m] || 0) - cumImpuestos;
  });

  const sections = [];
  if (visible.has("INGRESOS ORDINARIOS")) {
    sections.push({
      label: "INGRESOS ORDINARIOS",
      values: fillMonths(ingresosOrdinarios, monthList),
      level: 0,
      isTotal: true,
      children: base.ingOrdChildren,
    });
  }
  if (visible.has("EGRESOS ORDINARIOS")) {
    sections.push({
      label: "EGRESOS ORDINARIOS",
      values: fillMonths(egresosOrdinarios, monthList),
      level: 0,
      isTotal: true,
      isExpense: true,
      children: base.egrOrdChildren,
    });
  }
  sections.push(
    { label: "GANANCIA / PÉRDIDA ORDINARIA", values: fillMonths(gananciaOrdinaria, monthList), level: 0, isResult: true, children: [] },
    {
      label: "GANANCIA / PÉRDIDA ACUMULADA ORDINARIA",
      values: fillMonths(gananciaAcumOrdinaria, monthList),
      level: 0,
      isResult: true,
      children: [],
    }
  );
  if (visible.has("INGRESOS EXTRAORDINARIOS")) {
    sections.push({
      label: "INGRESOS EXTRAORDINARIOS",
      values: fillMonths(ingresosExtraordinarios, monthList),
      level: 0,
      isTotal: true,
      children: base.ingExtChildren,
    });
  }
  base.otherEgrSections.forEach((sec) => {
    if (!visible.has(sec.label)) return;
    sections.push({
      label: sec.label,
      values: sec.values,
      level: 0,
      isTotal: true,
      isExpense: true,
      children: sec.children || [],
    });
  });
  sections.push(
    { label: "GANANCIA / PÉRDIDA EXTRAORDINARIA", values: fillMonths(gananciaExtraordinaria, monthList), level: 0, isResult: true, children: [] },
    {
      label: "GANANCIA / PÉRDIDA ACUMULADA EXTRAORDINARIA",
      values: fillMonths(gananciaAcumExtraordinaria, monthList),
      level: 0,
      isResult: true,
      children: [],
    },
    {
      label: "UTILIDAD TOTAL ANTES DE IMPUESTOS",
      values: fillMonths(utilidadAntesImpuestos, monthList),
      level: 0,
      isResult: true,
      children: [],
    }
  );
  if (visible.has("IMPUESTOS")) {
    sections.push({
      label: "IMPUESTOS",
      values: fillMonths(impuestos, monthList),
      level: 0,
      isTotal: true,
      isExpense: true,
      children: base.taxChildren,
    });
  }
  sections.push(
    { label: "GANANCIA / PÉRDIDA TOTAL", values: fillMonths(gananciaTotal, monthList), level: 0, isResult: true, children: [] },
    {
      label: "GANANCIA / PÉRDIDA ACUMULADA TOTAL",
      values: fillMonths(gananciaAcumTotal, monthList),
      level: 0,
      isResult: true,
      children: [],
    }
  );

  markExpenseOnSections(sections);
  return sections;
}

function loadFromWorkbook(wb) {
  const getSheetRows = (name) => {
    const ws = wb.Sheets[name];
    if (!ws) return [];
    return window.XLSX.utils.sheet_to_json(ws, { defval: "" });
  };

  LIST_STATE.INGRESOS.rows = getSheetRows("INGRESOS");
  LIST_STATE.EGRESOS.rows = getSheetRows("EGRESOS");

  applyListFilter("INGRESOS");
  applyListFilter("EGRESOS");

  const all = collectAvailableMonths(LIST_STATE.INGRESOS.rows, LIST_STATE.EGRESOS.rows);
  renderPeriodFilterChips(all);
  if (!all.length) {
    lastEerrBase = null;
    renderRubroFilterChips(null);
    renderEerr({ months: [], sections: [] });
    return;
  }
  applyPeriodFilterFromDom();
}

