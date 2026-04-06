import { renderConsultasDfeView } from "./consultas-dfe.view.js";
import { explainDfeFetchFailure } from "../../config/dfe-api.js";
import { apiGetHealth, apiPostComunicaciones, apiPostComunicacionDetalle } from "./dfe.service.js";
import { appState } from "../../app/state.js";
import { DELEGACION_GUIDE } from "./delegacion-guide.js";

export { renderConsultasDfeView };

const DEMO = {
  cuitRepresentada: "20279722796",
  fechaDesde: "2025-04-12",
  fechaHasta: "2026-04-05",
  pagina: 1,
  resultadosPorPagina: 10,
};

function escHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&gt;")
    .replaceAll('"', "&quot;");
}

function onlyDigits(s) {
  return String(s ?? "").replace(/\D/g, "");
}

/** HTML input[type=date] ya manda YYYY-MM-DD; por si otro cliente manda DD/MM/AAAA. */
function normalizeDateForApi(s) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    return `${m[3]}-${mo}-${d}`;
  }
  return t;
}

function showEl(el, show) {
  if (!el) return;
  el.classList.toggle("is-hidden", !show);
}

function setError(msg) {
  const box = document.getElementById("dfe-error");
  if (!box) return;
  box.textContent = msg || "";
  showEl(box, Boolean(msg));
}

function setLoading(on) {
  const el = document.getElementById("dfe-loading");
  showEl(el, on);
  const form = document.getElementById("dfe-form");
  if (form) {
    form.querySelectorAll("button, input, select").forEach((n) => {
      n.disabled = on;
    });
  }
}

function userMessageFromResponse(res) {
  if (res.status === 400 || res.error === "parametros") {
    return res.message || "Revisá el CUIT y las fechas (formato YYYY-MM-DD).";
  }
  if (res.error === "wsaa") {
    return `Autenticación / certificado (WSAA): ${res.message || "Error al obtener ticket de acceso."}`;
  }
  if (res.error === "soap_fault") {
    const min = extractMinFechaDesde(res.message || "");
    if (min) {
      return `AFIP limita la consulta. La fecha mínima soportada para este caso es: ${min}.`;
    }
    return `Respuesta AFIP: ${res.message || "Fault SOAP"}`;
  }
  if (res.status >= 500 || res.error === "interno") {
    return res.message || "Error en el servidor DFE. Revisá logs del backend.";
  }
  if (!res.ok) {
    return res.message || `Error (${res.status || "red"}).`;
  }
  return res.message || "Error desconocido.";
}

function extractMinFechaDesde(message) {
  const s = String(message || "");
  if (!s) return null;
  // Ej: "Error 101: Fecha desde no soportada. Mínima fecha [2025-04-11]"
  const m = s.match(/\bM[íi]nima fecha\s*\[([0-9]{4}-[0-9]{2}-[0-9]{2})\]/i);
  if (m?.[1]) return m[1];
  return null;
}

function fmtDatePair(pub, notif) {
  const a = pub ?? "—";
  const b = notif ?? "—";
  if (a === b) return escHtml(a);
  return `${escHtml(a)} <span class="dfe-muted">/</span> ${escHtml(b)}`;
}

function fmtBoolAdj(v) {
  if (v === true || v === 1 || v === "1" || v === "S" || v === "s") return "Sí";
  if (v === false || v === 0 || v === "0" || v === "N" || v === "n") return "No";
  return "—";
}

function parseAfipDateToMs(s) {
  const t = String(s || "").trim();
  if (!t) return null;
  // Formato típico: "YYYY-MM-DD HH:MM:SS" o "YYYY-MM-DD"
  const d = new Date(t.replace(" ", "T"));
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function sortByFechaPublicacion(items, order) {
  const dir = order === "asc" ? 1 : -1;
  const arr = Array.isArray(items) ? [...items] : [];
  arr.sort((a, b) => {
    const am = parseAfipDateToMs(a?.fechaPublicacion) ?? 0;
    const bm = parseAfipDateToMs(b?.fechaPublicacion) ?? 0;
    if (am !== bm) return (am - bm) * dir;
    const ai = Number(a?.idComunicacion ?? 0);
    const bi = Number(b?.idComunicacion ?? 0);
    return (ai - bi) * dir;
  });
  return arr;
}

function paintTable(rows, cuitRepresentada) {
  const tb = document.getElementById("dfe-table-body");
  if (!tb) return;
  const cuitAttr = escHtml(onlyDigits(cuitRepresentada));
  tb.innerHTML = (rows || [])
    .map((r) => {
      const id = r.idComunicacion ?? "—";
      const idAttr = encodeURIComponent(String(id));
      return `
        <tr>
          <td class="dfe-td-num">${escHtml(id)}</td>
          <td>${fmtDatePair(r.fechaPublicacion, r.fechaNotificacion)}</td>
          <td class="dfe-td-subject">${escHtml(r.asunto)}</td>
          <td>${escHtml(r.organismo)}</td>
          <td>${escHtml(r.clasificacion)}</td>
          <td><span class="dfe-pill">${escHtml(r.estadoDescripcion || r.estado || "—")}</span></td>
          <td>${fmtBoolAdj(r.tieneAdjuntos)}</td>
          <td>
            <button type="button" class="btn-secondary dfe-btn-sm" data-dfe-detail="${idAttr}" data-dfe-cuit="${cuitAttr}">Ver detalle</button>
          </td>
        </tr>`;
    })
    .join("");
}

function readFormPayload() {
  const cuit = onlyDigits(document.getElementById("dfe-cuit")?.value);
  const fechaDesde = normalizeDateForApi(document.getElementById("dfe-fecha-desde")?.value);
  const fechaHasta = normalizeDateForApi(document.getElementById("dfe-fecha-hasta")?.value);
  const rpp = parseInt(document.getElementById("dfe-rpp")?.value || "10", 10);
  const order = String(document.getElementById("dfe-order")?.value || "desc");
  return {
    cuitRepresentada: cuit,
    fechaDesde,
    fechaHasta,
    pagina: 1,
    resultadosPorPagina: Number.isFinite(rpp) ? rpp : 10,
    order,
  };
}

function applyDemoToForm() {
  const c = document.getElementById("dfe-cuit");
  const fd = document.getElementById("dfe-fecha-desde");
  const fh = document.getElementById("dfe-fecha-hasta");
  const rpp = document.getElementById("dfe-rpp");
  if (c) c.value = DEMO.cuitRepresentada;
  if (fd) fd.value = DEMO.fechaDesde;
  if (fh) fh.value = DEMO.fechaHasta;
  if (rpp) rpp.value = String(DEMO.resultadosPorPagina);
}

let lastListPayload = null;
/** homologacion | produccion | null si /health no respondió */
let dfeServerEnvironment = null;
let currentPage = 1;
let lastTotalPages = 1;
let lastTotalItems = 0;
let lastRpp = 10;
let lastOrder = "desc";

function refreshDfeEmptyHomoHint() {
  const el = document.getElementById("dfe-empty-hint-homo");
  if (!el) return;
  el.classList.toggle("is-hidden", dfeServerEnvironment !== "homologacion");
}

async function runConsultar(extra) {
  setError("");
  const payload = { ...readFormPayload(), ...extra };
  payload.fechaDesde = normalizeDateForApi(payload.fechaDesde);
  payload.fechaHasta = normalizeDateForApi(payload.fechaHasta);
  console.log("[DFE] POST /api/dfe/comunicaciones", JSON.stringify(payload));
  lastListPayload = { cuitRepresentada: payload.cuitRepresentada };
  currentPage = parseInt(payload.pagina || 1, 10) || 1;
  lastRpp = parseInt(payload.resultadosPorPagina || 10, 10) || 10;
  lastOrder = payload.order === "asc" ? "asc" : "desc";

  if (payload.cuitRepresentada.length !== 11) {
    setError("El CUIT representado debe tener 11 dígitos.");
    return;
  }
  if (!payload.fechaDesde || !payload.fechaHasta) {
    setError("Indicá fecha desde y fecha hasta.");
    return;
  }

  const wrap = document.getElementById("dfe-results-wrap");
  const empty = document.getElementById("dfe-empty");
  const meta = document.getElementById("dfe-results-meta");
  const pager = document.getElementById("dfe-pager");
  const prevBtn = document.getElementById("dfe-prev");
  const nextBtn = document.getElementById("dfe-next");
  const pageLabel = document.getElementById("dfe-page-label");

  setLoading(true);
  try {
    // No enviamos "order" al backend: es client-side.
    const { order, ...apiPayload } = payload;
    const res = await apiPostComunicaciones(apiPayload);
    if (!res.ok || !res.data) {
      // UX: Error 101 de AFIP → sugerir/autocorregir fecha mínima.
      if (res.error === "soap_fault") {
        const min = extractMinFechaDesde(res.message || "");
        if (min) {
          const fdEl = document.getElementById("dfe-fecha-desde");
          const cur = payload.fechaDesde || "";
          if (/^\d{4}-\d{2}-\d{2}$/.test(min) && /^\d{4}-\d{2}-\d{2}$/.test(cur) && cur < min) {
            if (fdEl) fdEl.value = min; // autocompleta a la mínima soportada
            payload.fechaDesde = min;
          }
        }
      }
      setError(userMessageFromResponse(res));
      showEl(wrap, false);
      return;
    }

    const data = res.data;
    const listRaw = data.comunicaciones || [];
    const list = sortByFechaPublicacion(listRaw, lastOrder);
    const total = Number(data.totalItems ?? listRaw.length ?? 0) || 0;
    const page = Number(data.pagina ?? apiPayload.pagina ?? 1) || 1;
    const totalPages = Number(data.totalPaginas ?? 1) || 1;
    lastTotalPages = totalPages;
    lastTotalItems = total;

    showEl(wrap, true);
    if (meta) {
      const start = total > 0 ? (page - 1) * lastRpp + 1 : 0;
      const end = total > 0 ? start + list.length - 1 : 0;
      meta.textContent = `Mostrando ${start} a ${end} de ${total} comunicaciones`;
    }
    if (pager && prevBtn && nextBtn && pageLabel) {
      showEl(pager, totalPages > 1);
      pageLabel.textContent = `Página ${page} de ${totalPages}`;
      prevBtn.disabled = page <= 1;
      nextBtn.disabled = page >= totalPages;
    }

    const hasRows = list.length > 0;
    showEl(document.querySelector(".dfe-table-scroll"), hasRows);
    showEl(empty, !hasRows);
    if (!hasRows) refreshDfeEmptyHomoHint();
    if (hasRows) paintTable(list, payload.cuitRepresentada);
    else paintTable([], payload.cuitRepresentada);
  } catch (e) {
    console.error("dfe consultar:", e);
    setError(explainDfeFetchFailure());
    showEl(wrap, false);
  } finally {
    setLoading(false);
  }
}

function closeDetailModal() {
  document.getElementById("dfe-detail-overlay")?.remove();
}

function renderDetailModal(data, { incluirAdjuntos }) {
  const title = data.asunto || `Comunicación ${data.idComunicacion ?? ""}`;
  const bodyText = data.cuerpo || data.mensaje || "";
  const adj = Array.isArray(data.adjuntos) ? data.adjuntos : [];
  const adjBlock =
    adj.length === 0
      ? "<p class=\"dfe-muted\">Sin adjuntos en esta respuesta.</p>"
      : `<ul class="dfe-adj-list">${adj
        .map((a, idx) => {
          const name = a.filename || "archivo";
          const size = String(a.contentSize ?? "—");
          const has = Boolean(a.contentBase64) && !a.contentOmitted;
          const isTxt = /\.txt$/i.test(name);
          return `<li class="dfe-adj-item">
            <div class="dfe-adj-meta">
              <strong>${escHtml(name)}</strong>
              <span class="dfe-muted"> · ${escHtml(a.md5 || "—")} · ${escHtml(size)}</span>
              ${a.contentOmitted ? ' · <span class="dfe-muted">contenido omitido</span>' : ""}
            </div>
            <div class="dfe-adj-actions">
              ${
                has
                  ? `<button type="button" class="btn-secondary dfe-btn-sm" data-dfe-download="${idx}">Descargar</button>`
                  : ""
              }
              ${
                has && isTxt
                  ? `<button type="button" class="btn-secondary dfe-btn-sm" data-dfe-preview="${idx}">Vista previa</button>`
                  : ""
              }
            </div>
            <div class="dfe-adj-preview is-hidden" id="dfe-adj-prev-${idx}"></div>
          </li>`;
        })
        .join("")}</ul>`;

  const rawJson = JSON.stringify(data.raw ?? data, null, 2);

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "dfe-detail-overlay";
  overlay.innerHTML = `
    <div class="modal-card dfe-detail-card">
      <div class="modal-header">
        <h3 class="modal-title dfe-detail-title">${escHtml(title)}</h3>
        <button type="button" class="modal-close" data-dfe-close-detail aria-label="Cerrar">✕</button>
      </div>
      <div class="modal-body dfe-detail-body">
        <dl class="dfe-dl">
          <dt>ID</dt><dd>${escHtml(data.idComunicacion)}</dd>
          <dt>Organismo</dt><dd>${escHtml(data.organismo)}</dd>
          <dt>Clasificación</dt><dd>${escHtml(data.clasificacion)}</dd>
          <dt>Publicación</dt><dd>${escHtml(data.fechaPublicacion)}</dd>
          <dt>Notificación</dt><dd>${escHtml(data.fechaNotificacion)}</dd>
          <dt>Lectura</dt><dd>${escHtml(data.fechaLectura)}</dd>
          <dt>Estado</dt><dd>${escHtml(data.estadoDescripcion || data.estado)}</dd>
        </dl>
        <div class="dfe-detail-block">
          <h4 class="dfe-detail-h">Contenido</h4>
          <div class="dfe-detail-content">${
            bodyText
              ? `<pre class="dfe-msg-pre">${escHtml(bodyText)}</pre>`
              : "<p class=\"dfe-muted\">Sin texto de cuerpo en la respuesta.</p>"
          }</div>
        </div>
        <div class="dfe-detail-block">
          <h4 class="dfe-detail-h">Adjuntos ${incluirAdjuntos ? "(solicitados al servicio)" : ""}</h4>
          ${adjBlock}
        </div>
        <div class="dfe-detail-block">
          <h4 class="dfe-detail-h">Metadatos</h4>
          <pre class="dfe-pre-sm">${escHtml(JSON.stringify(data.metadatos || {}, null, 2))}</pre>
        </div>
        <details class="dfe-raw">
          <summary>Raw JSON (depuración)</summary>
          <pre class="dfe-pre-raw">${escHtml(rawJson)}</pre>
        </details>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-primary" data-dfe-close-detail>Cerrar</button>
      </div>
    </div>
  `;

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeDetailModal();
  });
  overlay.querySelectorAll("[data-dfe-close-detail]").forEach((b) => {
    b.addEventListener("click", () => closeDetailModal());
  });

  document.body.appendChild(overlay);

  function base64ToBytes(b64) {
    const bin = atob(String(b64 || ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function decodeTextAttachment(base64Content, filename) {
    const bytes = base64ToBytes(base64Content);

    const candidates = [
      { enc: "utf-8", label: "UTF-8" },
      { enc: "windows-1252", label: "Windows-1252" },
      { enc: "iso-8859-1", label: "ISO-8859-1" },
    ];

    const scoreText = (text) => {
      if (text == null) return Number.POSITIVE_INFINITY;
      const s = String(text);
      // Preferir menos caracteres de reemplazo (�).
      const repl = (s.match(/\uFFFD/g) || []).length;
      // Penalizar controles raros (sin contar CR/LF/TAB).
      let ctrl = 0;
      for (let i = 0; i < s.length; i += 1) {
        const c = s.charCodeAt(i);
        if (c === 9 || c === 10 || c === 13) continue;
        if (c < 32) ctrl += 1;
      }
      return repl * 1000 + ctrl;
    };

    let best = { text: null, enc: "utf-8", label: "UTF-8", score: Number.POSITIVE_INFINITY };
    for (const c of candidates) {
      try {
        const dec = new TextDecoder(c.enc, { fatal: false });
        let text = dec.decode(bytes);
        // Strip BOM si existiera
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        const sc = scoreText(text);
        if (sc < best.score) best = { text, enc: c.enc, label: c.label, score: sc };
      } catch (e) {
        // si el navegador no soporta el encoding, lo salteamos
      }
    }

    return {
      text: best.text ?? "",
      encodingUsed: best.label,
      bytes,
      filename: filename || "adjunto.txt",
    };
  }

  function downloadAttachment(a) {
    const name = a?.filename || "adjunto.bin";
    const b64 = a?.contentBase64;
    if (!b64) {
      setError("El adjunto no está disponible para descarga (contenido omitido en la API).");
      return;
    }
    const isTxt = /\.txt$/i.test(name);
    let blob;
    if (isTxt) {
      // Re-generar el archivo como UTF-8 para que se vea bien al abrirlo.
      const decoded = decodeTextAttachment(b64, name);
      const enc = new TextEncoder(); // UTF-8
      const utf8 = enc.encode(decoded.text);
      blob = new Blob([utf8], { type: "text/plain;charset=utf-8" });
    } else {
      const bytes = base64ToBytes(b64);
      blob = new Blob([bytes], { type: "application/octet-stream" });
    }
    const url = URL.createObjectURL(blob);
    const aTag = document.createElement("a");
    aTag.href = url;
    aTag.download = name;
    document.body.appendChild(aTag);
    aTag.click();
    aTag.remove();
    URL.revokeObjectURL(url);
  }

  function toggleTxtPreview(a, idx) {
    const box = overlay.querySelector(`#dfe-adj-prev-${idx}`);
    if (!box) return;
    const isOpen = !box.classList.contains("is-hidden");
    if (isOpen) {
      box.classList.add("is-hidden");
      box.innerHTML = "";
      return;
    }
    const b64 = a?.contentBase64;
    if (!b64) {
      setError("No se pudo mostrar vista previa (contenido omitido en la API).");
      return;
    }
    try {
      const decoded = decodeTextAttachment(b64, a?.filename || "adjunto.txt");
      const text = decoded.text;
      const clipped = text.length > 12000 ? text.slice(0, 12000) + "\n\n…(recortado)" : text;
      box.innerHTML =
        `<div class="dfe-muted" style="margin:0 0 10px;font-size:12px">Encoding detectado: ${escHtml(decoded.encodingUsed)}</div>` +
        `<pre class="dfe-msg-pre">${escHtml(clipped)}</pre>`;
      box.classList.remove("is-hidden");
    } catch (err) {
      console.error("preview txt:", err);
      setError("No se pudo mostrar vista previa del .txt.");
    }
  }

  overlay.addEventListener("click", (e) => {
    const dl = e.target.closest("[data-dfe-download]");
    if (dl) {
      const idx = parseInt(dl.getAttribute("data-dfe-download"), 10);
      if (Number.isFinite(idx) && adj[idx]) downloadAttachment(adj[idx]);
      return;
    }
    const pv = e.target.closest("[data-dfe-preview]");
    if (pv) {
      const idx = parseInt(pv.getAttribute("data-dfe-preview"), 10);
      if (Number.isFinite(idx) && adj[idx]) toggleTxtPreview(adj[idx], idx);
    }
  });
}

async function openDetail(idComunicacion, cuitFromRow) {
  const cuit =
    onlyDigits(cuitFromRow) ||
    lastListPayload?.cuitRepresentada ||
    onlyDigits(document.getElementById("dfe-cuit")?.value);
  if (!cuit || cuit.length !== 11) {
    setError("Falta un CUIT representado válido para ver el detalle.");
    return;
  }

  const idNum = parseInt(idComunicacion, 10);
  if (!Number.isFinite(idNum) || idNum < 1) {
    setError("ID de comunicación inválido.");
    return;
  }

  closeDetailModal();
  const overlayLoading = document.createElement("div");
  overlayLoading.className = "modal-overlay";
  overlayLoading.id = "dfe-detail-overlay";
  overlayLoading.innerHTML = `
    <div class="modal-card">
      <div class="modal-body">
        <div class="dfe-loading dfe-loading--inline">
          <span class="dfe-spinner"></span>
          <span>Cargando detalle…</span>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlayLoading);

  const incluirAdjuntos = true;
  try {
    console.log(
      "[DFE] POST /api/dfe/comunicacion-detalle",
      JSON.stringify({ cuitRepresentada: cuit, idComunicacion: idNum, incluirAdjuntos })
    );
    const res = await apiPostComunicacionDetalle({
      cuitRepresentada: cuit,
      idComunicacion: idNum,
      incluirAdjuntos,
    });
    console.log("[DFE] /api/dfe/comunicacion-detalle response", res);
    closeDetailModal();
    if (!res.ok || !res.data) {
      setError(userMessageFromResponse(res));
      return;
    }
    renderDetailModal(res.data, { incluirAdjuntos });
  } catch (e) {
    console.error("dfe detalle:", e);
    closeDetailModal();
    setError(explainDfeFetchFailure());
  }
}

function renderDelegacionGuideHtml() {
  const esc = escHtml;
  const guide = DELEGACION_GUIDE;

  const sectionHtml = (s) => {
    const list = (s.items || [])
      .map((it) => `<li class="dfe-guide-li">${esc(it)}</li>`)
      .join("");
    const listTag = s.ordered ? "ol" : "ul";
    const listBlock = list ? `<${listTag} class="dfe-guide-list">${list}</${listTag}>` : "";

    const callout = s.callout
      ? `<div class="dfe-guide-callout dfe-guide-callout--${esc(s.callout.kind || "info")}">
          <div class="dfe-guide-callout-title">${esc(s.callout.title || "Nota")}</div>
          <div class="dfe-guide-callout-text">${esc(s.callout.text || "")}</div>
        </div>`
      : "";

    const code = Array.isArray(s.code) && s.code.length
      ? `<pre class="dfe-guide-code">${esc(s.code.join("\n"))}</pre>`
      : "";

    return `
      <section class="dfe-guide-section">
        <h3 class="dfe-guide-h">${esc(s.title)}</h3>
        ${listBlock}
        ${callout}
        ${code}
      </section>
    `;
  };

  const checklist = (guide.checklist || [])
    .map((t) => {
      const id = `dfe-chk-${t.toLowerCase().replaceAll(" ", "-").replaceAll(".", "")}`;
      return `
        <label class="dfe-guide-check" for="${esc(id)}">
          <input type="checkbox" id="${esc(id)}" />
          <span>${esc(t)}</span>
        </label>
      `;
    })
    .join("");

  return `
    <div class="dfe-guide-inner">
      <h2 class="dfe-guide-main">${esc(guide.title)}</h2>
      ${(guide.sections || []).map(sectionHtml).join("")}
      <section class="dfe-guide-section">
        <h3 class="dfe-guide-h">Checklist</h3>
        <div class="dfe-guide-checklist">${checklist}</div>
      </section>
    </div>
  `;
}

export async function initConsultasDfePage() {
  const root = document.getElementById("dfe-root");
  if (!root) return;

  // Guía interna solo superadmin (no afecta permisos del módulo dfe).
  const isSuperadmin = appState.session.user?.role === "superadmin";
  const guide = document.getElementById("dfe-superadmin-guide");
  const guideBody = document.getElementById("dfe-superadmin-guide-body");
  if (guide && guideBody && isSuperadmin) {
    guideBody.innerHTML = renderDelegacionGuideHtml();
    guide.classList.remove("is-hidden");
  }

  try {
    const h = await apiGetHealth();
    if (h.ok && h.environment) {
      dfeServerEnvironment = h.environment;
    }
  } catch (e) {
    console.warn("[DFE] /api/dfe/health:", e);
  }
  refreshDfeEmptyHomoHint();

  root.addEventListener("submit", (e) => {
    const form = e.target;
    if (form?.id !== "dfe-form") return;
    e.preventDefault();
    runConsultar({ pagina: 1 });
  });

  root.addEventListener("click", (e) => {
    const demo = e.target.closest("#dfe-btn-demo");
    if (demo) {
      applyDemoToForm();
      runConsultar({ ...DEMO });
      return;
    }
    const det = e.target.closest("[data-dfe-detail]");
    if (det) {
      const id = decodeURIComponent(det.getAttribute("data-dfe-detail") || "");
      const cuitRow = det.getAttribute("data-dfe-cuit") || "";
      openDetail(id, cuitRow);
    }

    const prev = e.target.closest("#dfe-prev");
    if (prev) {
      const nextPage = Math.max(1, (currentPage || 1) - 1);
      runConsultar({ pagina: nextPage });
      return;
    }
    const next = e.target.closest("#dfe-next");
    if (next) {
      const nextPage = Math.min(lastTotalPages || 1, (currentPage || 1) + 1);
      runConsultar({ pagina: nextPage });
      return;
    }
  });

  // Reordenar en client-side (re-consulta para mantener coherencia paginada).
  root.addEventListener("change", (e) => {
    const sel = e.target?.closest?.("#dfe-order");
    if (sel) {
      runConsultar({ pagina: 1 });
    }
  });
}
