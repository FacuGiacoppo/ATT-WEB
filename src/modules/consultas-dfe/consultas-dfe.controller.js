import { renderConsultasDfeView } from "./consultas-dfe.view.js";
import { explainDfeFetchFailure } from "../../config/dfe-api.js";
import {
  apiGetHealth,
  apiPostComunicaciones,
  apiPostComunicacionDetalle,
  apiPostSyncAll,
  fetchComunicaciones,
  fetchComunicacionByDocId,
  fetchResumenDeduped,
  postEstadoInterno,
  postAsignarResponsable,
  postObservacionInterna,
  marcarLeida,
  marcarNoLeida,
  archivar,
  desarchivar,
  descartarAlerta,
} from "./dfe.service.js";
import { applyDfeGlobalFromResumen, refreshDfeGlobalIndicators } from "./dfe-global-indicators.js";
import { appState } from "../../app/state.js";
import { DELEGACION_GUIDE } from "./delegacion-guide.js";
import {
  getTrackingBatch,
  getTracking,
  markViewedInApp,
  addComment,
  setManaged,
  logAttachmentDownload,
} from "./dfe-tracking.service.js";
import {
  CollabWriteConflictError,
  timestampToMillis,
} from "../../services/collaboration/collaboration.service.js";

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

import { db } from "../../config/firebase.js";
import { auth } from "../../config/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

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

/** Estado de persistencia en el modal (nota / gestionada), sin usar el banner rojo global. */
function setInternalCollabStatus(overlay, message, kind = "") {
  const el = overlay?.querySelector?.("#dfe-collab-status");
  if (!el) return;
  el.textContent = message || "";
  el.classList.remove("dfe-collab-status--ok", "dfe-collab-status--warn", "dfe-collab-status--err");
  if (kind === "ok") el.classList.add("dfe-collab-status--ok");
  else if (kind === "warn") el.classList.add("dfe-collab-status--warn");
  else if (kind === "err") el.classList.add("dfe-collab-status--err");
  showEl(el, Boolean(message));
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

function formatCollabActivityAt(at) {
  if (at == null) return "—";
  if (typeof at.toDate === "function") {
    try {
      return at.toDate().toLocaleString();
    } catch {
      return "—";
    }
  }
  if (typeof at.seconds === "number") {
    return new Date(at.seconds * 1000).toLocaleString();
  }
  return String(at);
}

function paintDfeActivityInModal(overlay, trk) {
  const box = overlay.querySelector("#dfe-activity");
  if (!box) return;
  const log = Array.isArray(trk?.activityLog) ? [...trk.activityLog] : [];
  log.sort((a, b) => (timestampToMillis(b.at) ?? 0) - (timestampToMillis(a.at) ?? 0));
  if (!log.length) {
    box.innerHTML = "<p class=\"dfe-muted\">Sin actividad registrada aún.</p>";
    return;
  }
  box.innerHTML = `<ul class="dfe-activity-list">${log
    .map((e) => {
      const who = e.byName ?? e.by ?? "—";
      const role = e.byRole ? ` <span class="dfe-muted">(${escHtml(String(e.byRole))})</span>` : "";
      const t = escHtml(formatCollabActivityAt(e.at));
      const fnRaw = e.payload?.filename != null ? e.payload.filename : e.filename;
      const fn = fnRaw != null && fnRaw !== "" ? ` · ${escHtml(String(fnRaw))}` : "";
      return `<li><span class="dfe-activity-type">${escHtml(String(e.type || "evento"))}</span> · ${t} · <strong>${escHtml(String(who))}</strong>${role}${fn}</li>`;
    })
    .join("")}</ul>`;
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

function rowHasAdjuntos(r) {
  if (r?.tieneAdjuntos === true || r?.tieneAdjuntos === 1) return true;
  const raw = r?.raw;
  if (raw?.tieneAdjunto === true || raw?.tieneAdjunto === 1) return true;
  return false;
}

function hasInternalNote(trk) {
  if (Array.isArray(trk?.comments) && trk.comments.length > 0) return true;
  return Boolean(trk?.internalNote && String(trk.internalNote).trim().length);
}

function formatFirestoreTsHuman(ts) {
  if (ts == null) return "—";
  if (typeof ts.toDate === "function") {
    try {
      return ts.toDate().toLocaleString();
    } catch {
      return "—";
    }
  }
  if (typeof ts.seconds === "number") {
    return new Date(ts.seconds * 1000).toLocaleString();
  }
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
      const trk = trackingById[String(id)] || null;
      const attState = computeAttState(trk);
      const badgeHtml =
        attState === "new"
          ? `<span class="dfe-badge dfe-badge--new" title="Sin abrir en ATT-WEB">Nueva</span>`
          : attState === "managed"
          ? `<span class="dfe-badge dfe-badge--managed" title="Marcada en ATT-WEB">Gestionada</span>`
          : `<span class="dfe-badge dfe-badge--viewed" title="Abierta en ATT-WEB">Vista</span>`;
      const trClass =
        attState === "new" ? "dfe-row--new" : attState === "managed" ? "dfe-row--managed" : "";
      const idAttr = encodeURIComponent(String(id));
      const noteSig = hasInternalNote(trk)
        ? `<span class="dfe-signal dfe-signal--note" title="Hay nota interna">Nota</span>`
        : "";
      const adjSig = rowHasAdjuntos(r)
        ? `<span class="dfe-signal dfe-signal--adj" title="AFIP indica adjuntos">Adj.</span>`
        : "";
      const signalsHtml =
        noteSig || adjSig
          ? `<div class="dfe-signal-cell">${noteSig}${adjSig}</div>`
          : `<span class="dfe-muted">—</span>`;
      return `
        <tr class="${trClass}">
          <td class="dfe-td-num">${escHtml(id)}</td>
          <td>${fmtDatePair(r.fechaPublicacion, r.fechaNotificacion)}</td>
          <td class="dfe-td-subject">${escHtml(r.asunto)}</td>
          <td>${escHtml(r.organismo)}</td>
          <td>${escHtml(r.clasificacion)}</td>
          <td><span class="dfe-pill dfe-pill--afip" title="Estado en ARCA / AFIP">${escHtml(r.estadoDescripcion || r.estado || "—")}</span></td>
          <td class="dfe-td-att">${badgeHtml}</td>
          <td class="dfe-td-signals">${signalsHtml}</td>
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
let trackingById = {}; // { [idComunicacion]: trackingDoc|null }
let lastPageRows = [];
let lastCuit = "";
let currentAttFilter = "all";
let filterWithNote = false;
let filterWithAdjuntos = false;
let inboxRows = [];
let inboxFiltered = [];
let inboxClientMap = new Map(); // cuit -> nombre
let inboxSelectedClient = "";
let inboxQ = "";
let dfeAuthReady = false;

/** Relee `dfe_comunicaciones` mientras el usuario permanece en esta pantalla (el sync ARCA lo alimenta en servidor). */
const DFE_INBOX_POLL_MS = 60 * 1000;
let dfeInboxPollTimer = null;
let dfeInboxVisibilityHandler = null;

let dfeApiPanelRows = [];
let dfeApiResumen = null;
let dfeApiFilterCuit = "";
let dfeApiSoloNuevas = false;
let dfeApiSoloUrgentes = false;

/** Una sola carga en vuelo: resumen + tabla comparten el mismo `Promise.all` si hay recargas superpuestas. */
let dfeApiPanelLoadPromise = null;

let dfeApiSelectedDocId = null;
/** @type {Record<string, unknown> | null} */
let dfeApiDetailItem = null;
let dfeApiDetailEscapeHandler = null;

const DFE_OBS_MAX_LEN = 10000;
let dfeDetailFeedbackTimer = null;

function mergeDfeApiPanelRow(item) {
  if (!item?.id) return;
  const i = dfeApiPanelRows.findIndex((r) => r.id === item.id);
  if (i >= 0) dfeApiPanelRows[i] = { ...dfeApiPanelRows[i], ...item };
}

function unbindApiDetailEscape() {
  if (!dfeApiDetailEscapeHandler) return;
  document.removeEventListener("keydown", dfeApiDetailEscapeHandler);
  dfeApiDetailEscapeHandler = null;
}

function closeApiDetailPanel() {
  dfeApiSelectedDocId = null;
  dfeApiDetailItem = null;
  if (dfeDetailFeedbackTimer) {
    clearTimeout(dfeDetailFeedbackTimer);
    dfeDetailFeedbackTimer = null;
  }
  const fb = document.getElementById("dfe-api-detail-feedback");
  if (fb) {
    fb.textContent = "";
    fb.classList.add("is-hidden");
    fb.classList.remove("dfe-api-detail-feedback--ok", "dfe-api-detail-feedback--busy");
  }
  const ind = document.getElementById("dfe-api-detail-indicators");
  if (ind) ind.innerHTML = "";
  const aside = document.getElementById("dfe-api-detail");
  if (aside) {
    aside.classList.add("is-hidden");
    aside.setAttribute("aria-hidden", "true");
  }
  document.getElementById("dfe-api-layout")?.classList.remove("dfe-api-layout--open");
  const st = document.getElementById("dfe-api-detail-status");
  if (st) {
    st.textContent = "";
    st.classList.add("is-hidden");
  }
  const body = document.getElementById("dfe-api-detail-body");
  if (body) body.innerHTML = "";
  unbindApiDetailEscape();
  paintApiTable();
}

function bindApiDetailEscape() {
  if (dfeApiDetailEscapeHandler) return;
  dfeApiDetailEscapeHandler = (ev) => {
    if (ev.key === "Escape") closeApiDetailPanel();
  };
  document.addEventListener("keydown", dfeApiDetailEscapeHandler);
}

function dfeBoolEtiqueta(v) {
  if (v === true || v === "S" || v === "s" || v === 1) return "Sí";
  if (v === false || v === "N" || v === "n" || v === 0) return "No";
  return "—";
}

function dfeEstadoInternoEtiqueta(code) {
  const m = { pendiente: "Pendiente", en_revision: "En revisión", resuelta: "Resuelta" };
  return code ? m[String(code)] || String(code) : null;
}

function dfeEstadoInternoChipHtml(code) {
  if (!code) {
    return `<span class="dfe-api-estado-chip dfe-api-estado-chip--sindef">Sin definir</span>`;
  }
  const c = String(code);
  return `<span class="dfe-api-estado-chip dfe-api-estado-chip--${escHtml(c)}">${escHtml(dfeEstadoInternoEtiqueta(c) || c)}</span>`;
}

function dfeResponsableCeldaHtml(val) {
  const s = val != null && String(val).trim() ? String(val).trim() : "";
  return s ? escHtml(s) : `<span class="dfe-api-cell-sindef">Sin definir</span>`;
}

function paintApiDetailIndicators(it) {
  const host = document.getElementById("dfe-api-detail-indicators");
  if (!host || !it) {
    if (host) host.innerHTML = "";
    return;
  }
  const lectura = it.esNueva
    ? { cls: "dfe-api-pill--nueva", text: "Nueva" }
    : it.leidaInterna
      ? { cls: "dfe-api-pill--leida", text: "Leída" }
      : { cls: "dfe-api-pill--noleida", text: "No leída" };
  const bandeja = it.archivadaInterna
    ? { cls: "dfe-api-pill--arch", text: "Archivada" }
    : { cls: "dfe-api-pill--activa", text: "Activa" };
  const est = it.estadoInterno ? String(it.estadoInterno) : "";
  host.innerHTML = `
    <div class="dfe-api-detail-pills" role="group" aria-label="Estado resumido">
      <span class="dfe-api-pill ${lectura.cls}">${escHtml(lectura.text)}</span>
      <span class="dfe-api-pill ${bandeja.cls}">${escHtml(bandeja.text)}</span>
      <span class="dfe-api-detail-pills-lbl">Estado interno</span>
      ${dfeEstadoInternoChipHtml(est)}
    </div>
  `;
}

function setDetailActionsDisabled(disabled) {
  document.querySelectorAll("#dfe-api-detail [data-dfe-detail-act]").forEach((btn) => {
    btn.disabled = Boolean(disabled);
  });
}

function showDetailFeedback(msg, { autoClearMs = 0, tone = "neutral" } = {}) {
  const el = document.getElementById("dfe-api-detail-feedback");
  if (!el) return;
  if (dfeDetailFeedbackTimer) {
    clearTimeout(dfeDetailFeedbackTimer);
    dfeDetailFeedbackTimer = null;
  }
  el.textContent = msg || "";
  el.classList.toggle("is-hidden", !msg);
  el.classList.remove("dfe-api-detail-feedback--ok", "dfe-api-detail-feedback--busy");
  if (msg && tone === "ok") el.classList.add("dfe-api-detail-feedback--ok");
  if (msg && tone === "busy") el.classList.add("dfe-api-detail-feedback--busy");
  if (msg && autoClearMs > 0) {
    dfeDetailFeedbackTimer = setTimeout(() => {
      el.textContent = "";
      el.classList.add("is-hidden");
      el.classList.remove("dfe-api-detail-feedback--ok", "dfe-api-detail-feedback--busy");
      dfeDetailFeedbackTimer = null;
    }, autoClearMs);
  }
}

function clearDetailFeedback() {
  showDetailFeedback("", {});
}

function bindObservacionCharCounter() {
  const ta = document.getElementById("dfe-detail-obs");
  const ctr = document.getElementById("dfe-detail-obs-count");
  if (!ta || !ctr) return;
  const sync = () => {
    const n = ta.value.length;
    ctr.textContent = `${n} / ${DFE_OBS_MAX_LEN}`;
    ctr.classList.toggle("dfe-api-obs-count--near", n > DFE_OBS_MAX_LEN * 0.85);
  };
  ta.addEventListener("input", sync);
  sync();
}

function paintApiDetailPanel() {
  const host = document.getElementById("dfe-api-detail-body");
  if (!host || !dfeApiDetailItem) return;
  const it = dfeApiDetailItem;
  paintApiDetailIndicators(it);
  const cliente = escHtml(it.nombreCliente || it.cuitRepresentada || "—");
  const cuit = escHtml(String(it.cuitRepresentada || ""));
  const asunto = escHtml(String(it.asunto || "Sin asunto"));
  const org = escHtml(String(it.organismo || it.sistemaPublicadorDescripcion || "—"));
  const est = it.estadoInterno ? String(it.estadoInterno) : "";

  const dl = (k, v) =>
    `<div class="dfe-api-detail-dl"><dt class="dfe-api-detail-dt">${escHtml(k)}</dt><dd class="dfe-api-detail-dd">${v}</dd></div>`;

  host.innerHTML = `
    <div class="dfe-api-detail-lead">
      <h3 class="dfe-api-detail-subject">${asunto}</h3>
      <p class="dfe-muted dfe-api-detail-client">${cliente}<br /><span class="dfe-mono">${cuit}</span></p>
    </div>
    <div class="dfe-api-detail-readonly">
      ${dl("Organismo", org)}
      ${dl("Fecha publicación", escHtml(String(it.fechaPublicacion || "—")))}
      ${dl("Vencimiento", escHtml(it.fechaVencimiento ? String(it.fechaVencimiento) : "—"))}
      ${dl("Prioridad", escHtml(it.prioridad != null ? String(it.prioridad) : "—"))}
      ${dl("Adjuntos", escHtml(dfeBoolEtiqueta(it.tieneAdjuntos)))}
      ${dl("Estado AFIP", escHtml(String(it.estadoAfipDescripcion || "—")))}
      ${dl("Lectura", escHtml(it.esNueva ? "Nueva" : it.leidaInterna ? "Leída" : "No leída"))}
      ${dl("Bandeja", escHtml(it.archivadaInterna ? "Archivada" : "Activa"))}
      ${dl("Estado interno", est ? dfeEstadoInternoChipHtml(est) : dfeEstadoInternoChipHtml(""))}
      ${dl("Actualización de estado interno", escHtml(it.fechaEstadoInterno ? String(it.fechaEstadoInterno) : "—"))}
      ${dl("Estado interno por", escHtml(it.estadoInternoPor ? String(it.estadoInternoPor) : "—"))}
      ${dl("Responsable", it.responsableInterno ? escHtml(String(it.responsableInterno)) : `<span class="dfe-api-cell-sindef">Sin definir</span>`)}
      ${dl("Observación", it.observacionInterna ? `<span class="dfe-api-detail-pre">${escHtml(String(it.observacionInterna))}</span>` : `<span class="dfe-api-cell-sindef">Sin definir</span>`)}
    </div>
    <div class="dfe-api-detail-actions">
      <h4 class="dfe-api-detail-h">Gestión</h4>
      <label class="dfe-api-detail-field">
        <span class="dfe-api-detail-lbl">Estado interno</span>
        <select id="dfe-detail-estado" class="dfe-api-detail-input" aria-label="Estado interno">
          <option value="">— Elegir —</option>
          <option value="pendiente"${est === "pendiente" ? " selected" : ""}>Pendiente</option>
          <option value="en_revision"${est === "en_revision" ? " selected" : ""}>En revisión</option>
          <option value="resuelta"${est === "resuelta" ? " selected" : ""}>Resuelta</option>
        </select>
      </label>
      <button type="button" class="btn-primary dfe-btn-sm" data-dfe-detail-act="save-estado" aria-label="Guardar estado interno">Guardar</button>
      <label class="dfe-api-detail-field">
        <span class="dfe-api-detail-lbl">Responsable</span>
        <input type="text" id="dfe-detail-resp" class="dfe-api-detail-input" maxlength="500" autocomplete="off" aria-label="Responsable" />
      </label>
      <button type="button" class="btn-secondary dfe-btn-sm" data-dfe-detail-act="save-resp" aria-label="Guardar responsable">Guardar</button>
      <label class="dfe-api-detail-field">
        <span class="dfe-api-detail-lbl">Observación</span>
        <textarea id="dfe-detail-obs" class="dfe-api-detail-textarea" rows="8" maxlength="${DFE_OBS_MAX_LEN}" aria-label="Observación"></textarea>
        <span class="dfe-api-obs-count" id="dfe-detail-obs-count" aria-live="polite"></span>
      </label>
      <button type="button" class="btn-secondary dfe-btn-sm" data-dfe-detail-act="save-obs" aria-label="Guardar observación">Guardar</button>
      <div class="dfe-api-detail-btnrow">
        <button type="button" class="btn-secondary dfe-btn-sm" data-dfe-detail-act="marcar-leida">Marcar leída</button>
        <button type="button" class="btn-secondary dfe-btn-sm" data-dfe-detail-act="marcar-no-leida">Marcar no leída</button>
        <button type="button" class="btn-secondary dfe-btn-sm" data-dfe-detail-act="archivar">Archivar</button>
        <button type="button" class="btn-secondary dfe-btn-sm" data-dfe-detail-act="desarchivar">Desarchivar</button>
      </div>
    </div>
  `;

  const sel = document.getElementById("dfe-detail-estado");
  if (sel) sel.value = est || "";
  const ri = document.getElementById("dfe-detail-resp");
  if (ri) ri.value = it.responsableInterno != null ? String(it.responsableInterno) : "";
  const ob = document.getElementById("dfe-detail-obs");
  if (ob) ob.value = it.observacionInterna != null ? String(it.observacionInterna) : "";
  bindObservacionCharCounter();
}

async function openApiDetailForDoc(docId) {
  if (!docId || !dfeAuthReady) return;
  if (dfeDetailFeedbackTimer) {
    clearTimeout(dfeDetailFeedbackTimer);
    dfeDetailFeedbackTimer = null;
  }
  const fb0 = document.getElementById("dfe-api-detail-feedback");
  if (fb0) {
    fb0.textContent = "";
    fb0.classList.add("is-hidden");
    fb0.classList.remove("dfe-api-detail-feedback--ok", "dfe-api-detail-feedback--busy");
  }
  paintApiDetailIndicators(null);
  dfeApiSelectedDocId = docId;
  dfeApiDetailItem = null;
  const aside = document.getElementById("dfe-api-detail");
  const layout = document.getElementById("dfe-api-layout");
  if (aside) {
    aside.classList.remove("is-hidden");
    aside.setAttribute("aria-hidden", "false");
  }
  layout?.classList.add("dfe-api-layout--open");
  bindApiDetailEscape();
  paintApiTable();
  const body = document.getElementById("dfe-api-detail-body");
  const st = document.getElementById("dfe-api-detail-status");
  if (st) {
    st.classList.remove("is-hidden");
    st.textContent = "Cargando detalle…";
  }
  if (body) body.innerHTML = "";
  try {
    const res = await fetchComunicacionByDocId(docId);
    if (!res.ok || !res.item) {
      setApiPanelStatus(res.message || "No se pudo cargar el detalle.");
      if (st) {
        st.textContent = "";
        st.classList.add("is-hidden");
      }
      return;
    }
    dfeApiDetailItem = res.item;
    if (st) {
      st.classList.add("is-hidden");
      st.textContent = "";
    }
    paintApiDetailPanel();
  } catch (err) {
    console.error(err);
    setApiPanelStatus(explainDfeFetchFailure());
    if (st) st.classList.add("is-hidden");
  }
}

async function handleApiDetailAction(act) {
  const docId = dfeApiSelectedDocId;
  if (!docId) return;
  setApiPanelStatus("");

  const afterItem = async (item, { reloadList = false } = {}) => {
    if (reloadList) {
      closeApiDetailPanel();
      await loadApiPanel();
      return;
    }
    if (item) {
      dfeApiDetailItem = item;
      mergeDfeApiPanelRow(item);
      paintApiTable();
      paintApiDetailPanel();
    }
    await refreshDfeGlobalIndicators().catch(() => {});
  };

  const runDetailAction = async (loadingMsg, fn) => {
    showDetailFeedback("");
    setDetailActionsDisabled(true);
    showDetailFeedback(loadingMsg, { tone: "busy" });
    try {
      await fn();
    } catch (err) {
      console.error(err);
      setApiPanelStatus(explainDfeFetchFailure());
      showDetailFeedback("");
    } finally {
      setDetailActionsDisabled(false);
    }
  };

  try {
    if (act === "save-estado") {
      const sel = document.getElementById("dfe-detail-estado");
      const v = (sel?.value || "").trim();
      if (!v) {
        setApiPanelStatus("Elegí un estado interno.");
        return;
      }
      await runDetailAction("Guardando…", async () => {
        const res = await postEstadoInterno(docId, v);
        if (!res.ok) {
          showDetailFeedback("");
          setApiPanelStatus(res.message || "No se pudo guardar el estado interno.");
          return;
        }
        await afterItem(res.item, { reloadList: false });
        showDetailFeedback("Guardado", { autoClearMs: 2200, tone: "ok" });
      });
      return;
    }
    if (act === "save-resp") {
      const inp = document.getElementById("dfe-detail-resp");
      await runDetailAction("Guardando…", async () => {
        const res = await postAsignarResponsable(docId, inp?.value ?? "");
        if (!res.ok) {
          showDetailFeedback("");
          setApiPanelStatus(res.message || "No se pudo guardar el responsable.");
          return;
        }
        await afterItem(res.item);
        showDetailFeedback("Guardado", { autoClearMs: 2200, tone: "ok" });
      });
      return;
    }
    if (act === "save-obs") {
      const ta = document.getElementById("dfe-detail-obs");
      await runDetailAction("Guardando…", async () => {
        const res = await postObservacionInterna(docId, ta?.value ?? "");
        if (!res.ok) {
          showDetailFeedback("");
          setApiPanelStatus(res.message || "No se pudo guardar la observación.");
          return;
        }
        await afterItem(res.item);
        showDetailFeedback("Guardado", { autoClearMs: 2200, tone: "ok" });
      });
      return;
    }
    if (act === "marcar-leida") {
      await runDetailAction("Guardando…", async () => {
        const res = await marcarLeida(docId);
        if (!res.ok) {
          showDetailFeedback("");
          setApiPanelStatus(res.message || "No se pudo marcar como leída.");
          return;
        }
        await afterItem(res.item);
        showDetailFeedback("Listo", { autoClearMs: 1600, tone: "ok" });
      });
      return;
    }
    if (act === "marcar-no-leida") {
      await runDetailAction("Guardando…", async () => {
        const res = await marcarNoLeida(docId);
        if (!res.ok) {
          showDetailFeedback("");
          setApiPanelStatus(res.message || "No se pudo marcar como no leída.");
          return;
        }
        await afterItem(res.item);
        showDetailFeedback("Listo", { autoClearMs: 1600, tone: "ok" });
      });
      return;
    }
    if (act === "archivar") {
      await runDetailAction("Guardando…", async () => {
        const res = await archivar(docId);
        if (!res.ok) {
          showDetailFeedback("");
          setApiPanelStatus(res.message || "No se pudo archivar.");
          return;
        }
        await afterItem(res.item, { reloadList: true });
      });
      return;
    }
    if (act === "desarchivar") {
      await runDetailAction("Guardando…", async () => {
        const res = await desarchivar(docId);
        if (!res.ok) {
          showDetailFeedback("");
          setApiPanelStatus(res.message || "No se pudo desarchivar.");
          return;
        }
        await afterItem(res.item, { reloadList: true });
      });
      return;
    }
  } catch (err) {
    console.error(err);
    setApiPanelStatus(explainDfeFetchFailure());
  }
}

function setApiPanelStatus(msg) {
  const el = document.getElementById("dfe-api-status");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("is-hidden", !msg);
}

function paintApiBadges() {
  const host = document.getElementById("dfe-api-badges");
  if (!host || !dfeApiResumen) return;
  const r = dfeApiResumen;
  host.innerHTML = `
    <div class="dfe-api-chip dfe-api-chip--warn"><span class="dfe-api-chip-val">${escHtml(String(r.noLeidas ?? "—"))}</span><span class="dfe-api-chip-lbl">No leídas</span></div>
    <div class="dfe-api-chip dfe-api-chip--urgent"><span class="dfe-api-chip-val">${escHtml(String(r.nuevasUrgentes ?? "—"))}</span><span class="dfe-api-chip-lbl">Urgentes</span></div>
    <div class="dfe-api-chip"><span class="dfe-api-chip-val">${escHtml(String(r.totalComunicaciones ?? "—"))}</span><span class="dfe-api-chip-lbl">Total</span></div>
    <div class="dfe-api-chip dfe-api-chip--danger"><span class="dfe-api-chip-val">${escHtml(String(r.conVencimiento ?? "—"))}</span><span class="dfe-api-chip-lbl">Con vencimiento</span></div>
  `;
}

function paintApiClientSelect() {
  const sel = document.getElementById("dfe-api-filter-cliente");
  if (!sel) return;
  const prev = sel.value;
  const list = Array.isArray(dfeApiResumen?.porCliente) ? dfeApiResumen.porCliente : [];
  sel.innerHTML =
    `<option value="">Todos</option>` +
    list
      .map((p) => {
        const c = escHtml(String(p.cuit || ""));
        const label = escHtml(String(p.nombreCliente || p.cuit || ""));
        return `<option value="${c}"${prev === p.cuit ? " selected" : ""}>${label}</option>`;
      })
      .join("");
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

function paintApiEmptyMessage() {
  const titleEl = document.getElementById("dfe-api-empty-title");
  const hintEl = document.getElementById("dfe-api-empty-hint");
  if (titleEl) titleEl.textContent = "No hay comunicaciones para mostrar";
  if (!hintEl) return;
  const hasFiltros = Boolean(dfeApiFilterCuit || dfeApiSoloNuevas || dfeApiSoloUrgentes);
  if (hasFiltros) {
    const parts = [];
    if (dfeApiFilterCuit) parts.push("cliente seleccionado");
    if (dfeApiSoloNuevas) parts.push("solo nuevas");
    if (dfeApiSoloUrgentes) parts.push("solo urgentes");
    hintEl.textContent = `No hay resultados con los filtros activos (${parts.join(", ")}). Probá ampliar criterios o usar Recargar.`;
  } else {
    hintEl.textContent =
      "Sincronizá desde ARCA o probá más tarde. Las comunicaciones archivadas no aparecen en esta tabla.";
  }
}

function paintApiTable() {
  const tb = document.getElementById("dfe-api-table-body");
  const empty = document.getElementById("dfe-api-empty");
  const wrap = document.querySelector(".dfe-api-table-wrap");
  if (!tb) return;
  const rows = dfeApiPanelRows || [];
  if (!rows.length) {
    tb.innerHTML = "";
    paintApiEmptyMessage();
    if (empty) empty.classList.remove("is-hidden");
    if (wrap) wrap.classList.add("is-hidden");
    return;
  }
  if (empty) empty.classList.add("is-hidden");
  if (wrap) wrap.classList.remove("is-hidden");

  tb.innerHTML = rows
    .map((r) => {
      const cliente = escHtml(r.nombreCliente || r.cuitRepresentada || "—");
      const cuit = escHtml(String(r.cuitRepresentada || ""));
      const fecha = escHtml(r.fechaPublicacion || "—");
      const asunto = escHtml(r.asunto || "—");
      const org = escHtml(r.organismo || r.sistemaPublicadorDescripcion || "—");
      const fv = r.fechaVencimiento ? escHtml(String(r.fechaVencimiento)) : "—";
      const dias =
        typeof r.diasParaVencimiento === "number" ? ` <span class="dfe-muted">(${r.diasParaVencimiento} d.)</span>` : "";
      const estado = escHtml(r.estadoAfipDescripcion || "—");
      const estInt = r.estadoInterno ? String(r.estadoInterno) : "";
      const estChip = dfeEstadoInternoChipHtml(estInt);
      const respCell = dfeResponsableCeldaHtml(r.responsableInterno);
      const nueva = r.esNueva ? "Sí" : "No";
      const encId = encodeURIComponent(r.id || "");
      const idCom = encodeURIComponent(String(r.idComunicacion ?? ""));
      const cuitAttr = escHtml(String(r.cuitRepresentada || "").replace(/\D/g, ""));
      const alertaPend = Boolean(r.alertaVisualPendiente);
      const isSel = Boolean(dfeApiSelectedDocId && r.id === dfeApiSelectedDocId);
      const trClass = [
        "dfe-api-row",
        isSel ? "dfe-api-row--selected" : "",
        r.esNueva ? "dfe-api-row--nueva" : "",
        r.esUrgenteNueva ? "dfe-api-row--nueva-urgente" : "",
        alertaPend ? "dfe-api-row--alerta-pend" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const alertaHtml = alertaPend
        ? `<span class="dfe-api-alerta-pend" title="Alerta visual pendiente">!</span>`
        : "";
      return `
        <tr class="${trClass}" data-dfe-doc-id="${encId}" role="button" tabindex="0">
          <td>
            ${alertaHtml}
            <strong>${cliente}</strong><div class="dfe-muted">${cuit}</div>
          </td>
          <td>${fecha}</td>
          <td class="dfe-td-subject">${asunto}</td>
          <td>${org}</td>
          <td>${fv}${dias}</td>
          <td>${estado}</td>
          <td class="dfe-td-compact">${estChip}</td>
          <td class="dfe-td-compact dfe-td-resp">${respCell}</td>
          <td>${escHtml(nueva)}</td>
          <td>
            <button type="button" class="btn-secondary dfe-btn-sm" data-dfe-api-archivar="${encId}">Archivar</button>
            <button type="button" class="btn-secondary dfe-btn-sm" data-dfe-detail="${idCom}" data-dfe-cuit="${cuitAttr}" data-dfe-doc-id="${encId}">Ver</button>
          </td>
        </tr>`;
    })
    .join("");
}

async function loadApiPanel() {
  if (!dfeAuthReady) return;
  if (dfeApiPanelLoadPromise) return dfeApiPanelLoadPromise;

  const run = async () => {
    setApiPanelStatus("");
    const meta = document.getElementById("dfe-api-meta");
    if (meta) meta.textContent = "Cargando…";
    try {
      const [resSum, resList] = await Promise.all([
        fetchResumenDeduped(),
        fetchComunicaciones({
          cuit: dfeApiFilterCuit || undefined,
          soloNuevas: dfeApiSoloNuevas,
          soloUrgentes: dfeApiSoloUrgentes,
          limit: 150,
        }),
      ]);
      if (!resSum.ok) {
        setApiPanelStatus(resSum.message || "No se pudo cargar el resumen.");
        dfeApiResumen = null;
      } else {
        dfeApiResumen = resSum;
        applyDfeGlobalFromResumen(resSum);
      }
      if (!resList.ok) {
        setApiPanelStatus(resList.message || "No se pudo cargar la lista.");
        dfeApiPanelRows = [];
      } else {
        dfeApiPanelRows = Array.isArray(resList.items) ? resList.items : [];
      }
      paintApiBadges();
      paintApiClientSelect();
      paintApiTable();
      const hint = document.getElementById("dfe-api-actions-hint");
      if (hint) {
        hint.textContent = resList.truncated
          ? "Listado truncado por límite de escaneo en servidor."
          : `${dfeApiPanelRows.length} filas · resumen actualizado`;
      }
      if (meta) meta.textContent = "Panel DFE";
    } catch (e) {
      console.error("[DFE] panel API:", e);
      setApiPanelStatus(explainDfeFetchFailure());
      if (meta) meta.textContent = "Error";
    }
  };

  dfeApiPanelLoadPromise = run();
  try {
    await dfeApiPanelLoadPromise;
  } finally {
    dfeApiPanelLoadPromise = null;
  }
}

function bindApiPanelEvents(root) {
  root.addEventListener("click", async (e) => {
    const closeDet = e.target.closest("#dfe-api-detail-close");
    if (closeDet) {
      e.preventDefault();
      closeApiDetailPanel();
      return;
    }

    const actBtn = e.target.closest("[data-dfe-detail-act]");
    if (actBtn) {
      e.preventDefault();
      e.stopPropagation();
      const act = actBtn.getAttribute("data-dfe-detail-act") || "";
      await handleApiDetailAction(act);
      return;
    }

    const arch = e.target.closest("[data-dfe-api-archivar]");
    if (arch) {
      e.stopPropagation();
      const enc = arch.getAttribute("data-dfe-api-archivar") || "";
      const docId = decodeURIComponent(enc);
      if (!docId) return;
      arch.disabled = true;
      try {
        const res = await archivar(docId);
        if (!res.ok) {
          setApiPanelStatus(res.message || "No se pudo archivar.");
          return;
        }
        await loadApiPanel();
      } catch (err) {
        console.error(err);
        setApiPanelStatus(explainDfeFetchFailure());
      } finally {
        arch.disabled = false;
      }
      return;
    }

    const tr = e.target.closest("tr[data-dfe-doc-id]");
    if (!tr || e.target.closest("button")) return;
    const enc = tr.getAttribute("data-dfe-doc-id") || "";
    const docId = decodeURIComponent(enc);
    if (!docId) return;
    openApiDetailForDoc(docId);
  });
}

export function stopDfeInboxAutoRefresh() {
  if (dfeInboxPollTimer != null) {
    clearInterval(dfeInboxPollTimer);
    dfeInboxPollTimer = null;
  }
  if (typeof dfeInboxVisibilityHandler === "function") {
    document.removeEventListener("visibilitychange", dfeInboxVisibilityHandler);
    dfeInboxVisibilityHandler = null;
  }
  unbindApiDetailEscape();
}

function startDfeInboxAutoRefresh() {
  stopDfeInboxAutoRefresh();
  dfeInboxPollTimer = setInterval(() => {
    if (!document.getElementById("dfe-root") || !dfeAuthReady) return;
    loadApiPanel().catch((err) => console.warn("[DFE] auto-refresh panel:", err));
  }, DFE_INBOX_POLL_MS);
  dfeInboxVisibilityHandler = () => {
    if (document.visibilityState !== "visible") return;
    if (!document.getElementById("dfe-root") || !dfeAuthReady) return;
    loadApiPanel().catch((err) => console.warn("[DFE] visibility refresh panel:", err));
  };
  document.addEventListener("visibilitychange", dfeInboxVisibilityHandler);
}

function setStatus(msg) {
  // Reutilizamos el banner existente (dfe-error) como zona de estado.
  setError(msg || "");
}

function disableDfeActions(disabled) {
  const btnSync = document.getElementById("dfe-inbox-sync");
  const btnConsultar = document.getElementById("dfe-btn-consultar");
  if (btnSync) btnSync.disabled = Boolean(disabled);
  if (btnConsultar) btnConsultar.disabled = Boolean(disabled);
}

export function initDfeAuth({ timeoutMs = 8000 } = {}) {
  // Importante: onAuthStateChanged puede llamar 1 vez con null “transitorio” antes de restaurar sesión.
  // No resolvemos false hasta que:
  // - recibimos un user, o
  // - se cumple el timeout.
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      dfeAuthReady = false;
      resolve(false);
    }, timeoutMs);

    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) return;
        await user.getIdToken(); // fuerza token
        if (done) return;
        done = true;
        clearTimeout(t);
        try {
          unsub();
        } catch {}
        dfeAuthReady = true;
        resolve(true);
      } catch {
        // si falla token, seguimos esperando hasta timeout
      }
    });
  });
}

function refreshDfeEmptyHomoHint() {
  const el = document.getElementById("dfe-empty-hint-homo");
  if (!el) return;
  el.classList.toggle("is-hidden", dfeServerEnvironment !== "homologacion");
}

function computeAttState(trk) {
  if (trk?.managed) return "managed";
  if (trk?.viewedInApp) return "viewed";
  if (Array.isArray(trk?.readers) && trk.readers.length > 0) return "viewed";
  return "new";
}

function paintInboxMeta() {
  const el = document.getElementById("dfe-inbox-meta");
  if (!el) return;
  const total = inboxRows.length;
  const shown = inboxFiltered.length;
  const clients = new Set(inboxRows.map((r) => r.cuitRepresentada)).size;
  const base =
    shown === total
      ? `${total} comunicaciones · ${clients} clientes`
      : `${shown} visibles · ${total} totales · ${clients} clientes`;
  const scope = inboxSelectedClient
    ? " · Hasta 500 más recientes en Firestore para la CUIT elegida (orden: publicación ↓). Cuántas haya depende del sync desde ARCA."
    : " · Hasta 500 más recientes en Firestore (todas las CUIT mezcladas). Cuántas haya depende del sync desde ARCA (ventana de días en servidor).";
  el.textContent = base + scope;
}

function paintInboxKpis() {
  const el = document.getElementById("dfe-inbox-kpis");
  if (!el) return;
  const rows = Array.isArray(inboxRows) ? inboxRows : [];
  const states = rows.map((r) => computeAttState(trackingById[String(r.idComunicacion)]));
  const nNew = states.filter((s) => s === "new").length;
  const nPending = states.filter((s) => s === "viewed").length;
  const nManaged = states.filter((s) => s === "managed").length;
  const nAdj = rows.filter((r) => rowHasAdjuntos(r)).length;
  const nTotal = rows.length;

  el.innerHTML = `
    <div class="dfe-kpi-card">
      <div class="dfe-kpi-left">
        <div class="dfe-kpi-value">${nNew}</div>
        <div class="dfe-kpi-label">Nuevas</div>
      </div>
      <span class="dfe-kpi-chip dfe-kpi-chip--new">ATT</span>
    </div>
    <div class="dfe-kpi-card">
      <div class="dfe-kpi-left">
        <div class="dfe-kpi-value">${nPending}</div>
        <div class="dfe-kpi-label">Pendientes</div>
      </div>
      <span class="dfe-kpi-chip dfe-kpi-chip--pending">Vista</span>
    </div>
    <div class="dfe-kpi-card">
      <div class="dfe-kpi-left">
        <div class="dfe-kpi-value">${nManaged}</div>
        <div class="dfe-kpi-label">Gestionadas</div>
      </div>
      <span class="dfe-kpi-chip dfe-kpi-chip--managed">OK</span>
    </div>
    <div class="dfe-kpi-card">
      <div class="dfe-kpi-left">
        <div class="dfe-kpi-value">${nAdj}</div>
        <div class="dfe-kpi-label">Con adjuntos</div>
      </div>
      <span class="dfe-kpi-chip dfe-kpi-chip--adj">AFIP</span>
    </div>
    <div class="dfe-kpi-card">
      <div class="dfe-kpi-left">
        <div class="dfe-kpi-value">${nTotal}</div>
        <div class="dfe-kpi-label">Total</div>
      </div>
      <span class="dfe-kpi-chip dfe-kpi-chip--total">Bandeja</span>
    </div>
  `;
}

function buildArcaPillHtml(r) {
  const label = escHtml(r?.estadoAfipDescripcion || r?.estadoAfip || "—");
  const raw = String(r?.estadoAfipDescripcion || r?.estadoAfip || "").toLowerCase();
  // Heurística visual (sin cambiar lógica): verde para leído/cerrado, amarillo para observado, neutro si vacío.
  if (!raw) return `<span class="dfe-pill dfe-pill--arca-muted">—</span>`;
  if (raw.includes("le") && raw.includes("íd")) return `<span class="dfe-pill dfe-pill--arca-ok">${label}</span>`;
  if (raw.includes("leida")) return `<span class="dfe-pill dfe-pill--arca-ok">${label}</span>`;
  if (raw.includes("cerrad") || raw.includes("finaliz") || raw.includes("respond")) return `<span class="dfe-pill dfe-pill--arca-ok">${label}</span>`;
  if (raw.includes("observ") || raw.includes("pend") || raw.includes("requ")) return `<span class="dfe-pill dfe-pill--arca-warn">${label}</span>`;
  return `<span class="dfe-pill dfe-pill--afip">${label}</span>`;
}

function paintInboxClientsFilter() {
  const sel = document.getElementById("dfe-filter-cliente");
  if (!sel) return;
  const prev = sel.value;
  const entries = Array.from(inboxClientMap.entries()).sort((a, b) => String(a[1] || a[0]).localeCompare(String(b[1] || b[0])));
  sel.innerHTML = `<option value="" ${prev === "" ? "selected" : ""}>Todos</option>` + entries
    .map(([cuit, nombre]) => `<option value="${escHtml(cuit)}"${prev === cuit ? " selected" : ""}>${escHtml(nombre || cuit)}</option>`)
    .join("");
}

function paintInboxTable() {
  const tb = document.getElementById("dfe-inbox-body");
  const empty = document.getElementById("dfe-inbox-empty");
  if (!tb) return;
  const rows = inboxFiltered;

  if (!rows.length) {
    tb.innerHTML = "";
    if (empty) empty.classList.remove("is-hidden");
    paintInboxMeta();
    return;
  }
  if (empty) empty.classList.add("is-hidden");

  tb.innerHTML = rows.map((r) => {
    const id = r.idComunicacion;
    const trk = trackingById[String(id)] || null;
    const attState = computeAttState(trk);
    const badgeHtml =
      attState === "new"
        ? `<span class="dfe-badge dfe-badge--new" title="Sin abrir en ATT-WEB">Nueva</span>`
        : attState === "managed"
        ? `<span class="dfe-badge dfe-badge--managed" title="Marcada en ATT-WEB">Gestionada</span>`
        : `<span class="dfe-badge dfe-badge--viewed" title="Abierta en ATT-WEB">Vista</span>`;
    const noteSig = hasInternalNote(trk)
      ? `<span class="dfe-signal dfe-signal--note" title="Hay comentarios / nota interna">Com.</span>`
      : "";
    const adjSig = rowHasAdjuntos(r)
      ? `<span class="dfe-signal dfe-signal--adj" title="AFIP indica adjuntos">Adj.</span>`
      : "";
    const signalsHtml = noteSig || adjSig
      ? `<div class="dfe-signal-cell">${noteSig}${adjSig}</div>`
      : `<span class="dfe-muted">—</span>`;
    const cuitAttr = escHtml(onlyDigits(r.cuitRepresentada));
    const idAttr = encodeURIComponent(String(id));
    const cliente = r.nombreCliente || r.cuitRepresentada;
    const fecha = r.fechaPublicacion || r.fechaNotificacion || "—";
    return `
      <tr class="${attState === "new" ? "dfe-row--new" : attState === "managed" ? "dfe-row--managed" : ""}">
        <td><strong>${escHtml(cliente)}</strong><div class="dfe-muted">${escHtml(r.cuitRepresentada)}</div></td>
        <td>${escHtml(fecha)}</td>
        <td class="dfe-td-subject">${escHtml(r.asunto)}</td>
        <td>${escHtml(r.organismo)}</td>
        <td>${escHtml(r.clasificacion || "—")}</td>
        <td>${buildArcaPillHtml(r)}</td>
        <td class="dfe-td-att">${badgeHtml}</td>
        <td class="dfe-td-signals">${signalsHtml}</td>
        <td><button type="button" class="btn-secondary dfe-btn-sm" data-dfe-detail="${idAttr}" data-dfe-cuit="${cuitAttr}">Ver detalle</button></td>
      </tr>
    `;
  }).join("");

  paintInboxMeta();
}

function applyInboxFilters() {
  const ql = (inboxQ || "").trim().toLowerCase();
  inboxFiltered = (inboxRows || []).filter((r) => {
    if (inboxSelectedClient && String(r.cuitRepresentada) !== String(inboxSelectedClient)) return false;
    const trk = trackingById[String(r.idComunicacion)] || null;
    const state = computeAttState(trk);
    if (currentAttFilter && currentAttFilter !== "all" && state !== currentAttFilter) return false;
    if (filterWithNote && !hasInternalNote(trk)) return false;
    if (filterWithAdjuntos && !rowHasAdjuntos(r)) return false;
    if (ql) {
      const hay = [
        r.nombreCliente,
        r.cuitRepresentada,
        r.asunto,
        r.organismo,
        r.clasificacion,
        r.estadoAfipDescripcion,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(ql)) return false;
    }
    return true;
  });
}

async function loadInboxFromFirestore() {
  // Sin filtro de fechas: últimas N por fecha de publicación. “Todos” = mezcla global; con cliente = solo esa CUIT (hasta N).
  const cuitFilter = onlyDigits(inboxSelectedClient);
  const globalQ = query(collection(db, "dfe_comunicaciones"), orderBy("fechaPublicacionMs", "desc"), limit(500));
  const byClientQ =
    cuitFilter.length === 11
      ? query(
          collection(db, "dfe_comunicaciones"),
          where("cuitRepresentada", "==", cuitFilter),
          orderBy("fechaPublicacionMs", "desc"),
          limit(500)
        )
      : null;

  let rows = [];
  if (byClientQ) {
    try {
      const snap = await getDocs(byClientQ);
      snap.forEach((d) => {
        const v = d.data() || {};
        rows.push(v);
      });
    } catch (e) {
      console.warn("[DFE] query por CUIT falló (índice en construcción o tipo distinto). Fallback global + filtro.", e);
      const snap = await getDocs(globalQ);
      snap.forEach((d) => {
        const v = d.data() || {};
        if (onlyDigits(v.cuitRepresentada) === cuitFilter) rows.push(v);
      });
    }
  } else {
    const snap = await getDocs(globalQ);
    snap.forEach((d) => rows.push(d.data() || {}));
  }

  const cm = new Map();
  rows.forEach((v) => {
    const c = String(v.cuitRepresentada || "");
    if (c) cm.set(c, v.nombreCliente || c);
  });
  inboxRows = rows;
  inboxClientMap = cm;

  const ids = rows.map((r) => String(r.idComunicacion));
  // Tracking ATT-WEB (att_collaboration) por idComunicacion (mantiene compatibilidad)
  // Nota: getTrackingBatch requiere cuitRepresentada; para inbox multi-cuit lo hacemos por fila.
  const out = {};
  await Promise.all(
    rows.map(async (r) => {
      const id = String(r.idComunicacion);
      out[id] = await getTracking(r.cuitRepresentada, r.idComunicacion).catch(() => null);
    })
  );
  trackingById = out;
  applyInboxFilters();
  paintInboxClientsFilter();
  paintInboxKpis();
  paintInboxTable();
}

async function syncNow() {
  if (!dfeAuthReady) {
    setStatus("Esperá a que la sesión termine de inicializar.");
    return;
  }
  setStatus("");
  setLoading(true);
  try {
    const res = await apiPostSyncAll();
    if (!res.ok) {
      if (res.status === 401) setStatus("No autenticado.");
      else if (res.status === 403) setStatus("Tu usuario no tiene permiso para sincronizar.");
      else setStatus(res.message || "No se pudo sincronizar.");
      return;
    }
    await loadApiPanel();
  } catch (e) {
    console.error(e);
    setStatus(explainDfeFetchFailure());
  } finally {
    setLoading(false);
  }
}

function bindInboxEvents() {
  document.addEventListener("click", async (event) => {
    const btnRefresh = event.target.closest("#dfe-api-reload");
    if (btnRefresh) {
      await loadApiPanel();
      return;
    }
    const btnSync = event.target.closest("#dfe-inbox-sync");
    if (btnSync) {
      await syncNow();
      return;
    }
  });

  const sel = document.getElementById("dfe-api-filter-cliente");
  if (sel) {
    sel.addEventListener("change", async () => {
      dfeApiFilterCuit = String(sel.value || "").replace(/\D/g, "");
      await loadApiPanel();
    });
  }
  const chkNuevas = document.getElementById("dfe-api-solo-nuevas");
  if (chkNuevas) {
    chkNuevas.addEventListener("change", async () => {
      dfeApiSoloNuevas = Boolean(chkNuevas.checked);
      await loadApiPanel();
    });
  }
  const chkUrg = document.getElementById("dfe-api-solo-urgentes");
  if (chkUrg) {
    chkUrg.addEventListener("change", async () => {
      dfeApiSoloUrgentes = Boolean(chkUrg.checked);
      await loadApiPanel();
    });
  }
}
function buildAttBadgeModalHtml(attState) {
  if (attState === "managed") {
    return `<span class="dfe-badge dfe-badge--managed">Gestionada en ATT-WEB</span>`;
  }
  if (attState === "viewed") {
    return `<span class="dfe-badge dfe-badge--viewed">Vista en ATT-WEB</span>`;
  }
  return `<span class="dfe-badge dfe-badge--new">Nueva en ATT-WEB</span>`;
}

function paintKpisAndFilters() {
  const kpis = document.getElementById("dfe-kpis");
  const hint = document.getElementById("dfe-kpis-hint");
  const filters = document.getElementById("dfe-results-filters");
  const rows = lastPageRows || [];
  if (kpis) {
    const states = rows.map((r) => computeAttState(trackingById[String(r.idComunicacion)]));
    const nNew = states.filter((s) => s === "new").length;
    const nViewed = states.filter((s) => s === "viewed").length;
    const nManaged = states.filter((s) => s === "managed").length;
    const nAdj = rows.filter((r) => rowHasAdjuntos(r)).length;
    const nNote = rows.filter((r) => hasInternalNote(trackingById[String(r.idComunicacion)])).length;
    kpis.innerHTML = `
      <span class="dfe-kpi dfe-kpi--new">${nNew} nuevas</span>
      <span class="dfe-kpi dfe-kpi--viewed">${nViewed} vistas</span>
      <span class="dfe-kpi dfe-kpi--managed">${nManaged} gestionadas</span>
      <span class="dfe-kpi dfe-kpi--adj">${nAdj} con adjuntos</span>
      <span class="dfe-kpi dfe-kpi--note">${nNote} con nota</span>
      <span class="dfe-kpi dfe-kpi--page">${rows.length} en esta página</span>
      <span class="dfe-kpi dfe-kpi--total">Total consulta: ${lastTotalItems || rows.length}</span>
    `;
    showEl(kpis, rows.length > 0);
  }
  if (hint) {
    if (rows.length > 0) {
      const filtered = getFilteredRows(rows);
      const filterActive =
        filterWithNote || filterWithAdjuntos || (currentAttFilter && currentAttFilter !== "all");
      const base = `Resumen sobre los ${rows.length} ítems de esta página. Total consulta AFIP: ${lastTotalItems || rows.length} comunicaciones (todas las páginas).`;
      hint.textContent = filterActive
        ? `${base} Tras filtros ATT-WEB: se muestran ${filtered.length} filas.`
        : base;
    } else {
      hint.textContent = "";
    }
    showEl(hint, rows.length > 0);
  }
  if (filters) showEl(filters, rows.length > 0);
}

function getFilteredRows(rows) {
  let out = Array.isArray(rows) ? rows : [];
  if (currentAttFilter && currentAttFilter !== "all") {
    out = out.filter((r) => computeAttState(trackingById[String(r.idComunicacion)]) === currentAttFilter);
  }
  if (filterWithNote) {
    out = out.filter((r) => hasInternalNote(trackingById[String(r.idComunicacion)]));
  }
  if (filterWithAdjuntos) {
    out = out.filter((r) => rowHasAdjuntos(r));
  }
  return out;
}

function dfeFirestoreErrorMessage(err, fallback) {
  const code = String(err?.code || err?.name || "");
  const msg = String(err?.message || "");
  if (code.includes("permission-denied") || msg.includes("permission-denied")) {
    return (
      "No se pudo guardar en Firestore (permission-denied). Cerrá sesión y volvé a iniciar sesión. " +
      "Si persiste, revisá las reglas de Firestore para `dfe_tracking` y que tu usuario exista/esté activo."
    );
  }
  if (code.includes("unauthenticated") || msg.toLowerCase().includes("auth")) {
    return "No se pudo guardar en Firestore (sin autenticación). Volvé a iniciar sesión.";
  }
  return fallback || "No se pudo guardar el cambio interno (Firestore). Revisá consola para más detalle.";
}

async function runConsultar(extra) {
  if (!dfeAuthReady) {
    setStatus("Esperá a que la sesión termine de inicializar.");
    return;
  }
  setStatus("");
  const payload = { ...readFormPayload(), ...extra };
  payload.fechaDesde = normalizeDateForApi(payload.fechaDesde);
  payload.fechaHasta = normalizeDateForApi(payload.fechaHasta);
  console.log("[DFE] POST /api/dfe/comunicaciones", JSON.stringify(payload));
  lastListPayload = { cuitRepresentada: payload.cuitRepresentada };
  lastCuit = payload.cuitRepresentada;
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

    // Metadata Firestore (badges ATT) se fusiona con filas AFIP: la lista viene del API; el overlay es solo UI.
    // No se reordena ni mutan campos fiscales; si falla Firestore, la consulta DFE sigue válida.
    try {
      trackingById = await getTrackingBatch(payload.cuitRepresentada, list.map((x) => x.idComunicacion));
    } catch (trkErr) {
      console.warn("[DFE] tracking batch failed (non-blocking):", trkErr);
      trackingById = {};
    }
    lastPageRows = list;
    paintKpisAndFilters();

    const filtered = getFilteredRows(list);
    const hasRows = filtered.length > 0;
    showEl(document.querySelector(".dfe-table-scroll"), hasRows);
    showEl(empty, !hasRows);
    if (!hasRows) refreshDfeEmptyHomoHint();
    if (hasRows) paintTable(filtered, payload.cuitRepresentada);
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

function renderDetailModal(data, options = {}) {
  const {
    incluirAdjuntos = true,
    cuitRepresentada: detailCuitOpt,
    collabBaseline: rawBaseline,
  } = options;
  const collabBaseline = {
    internalNoteUpdatedAt: rawBaseline?.internalNoteUpdatedAt ?? null,
    managed: Boolean(rawBaseline?.managed),
  };
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
  const trk = trackingById[String(data.idComunicacion)] || null;
  const attState = computeAttState(trk);
  const attBadge = buildAttBadgeModalHtml(attState);
  const readers = Array.isArray(trk?.readers) ? trk.readers : [];
  const readersHtml = readers.length
    ? `<ul class="dfe-readers">${readers
        .map((r) => {
          const who = escHtml(r?.name || r?.uid || "—");
          const when = escHtml(formatFirestoreTsHuman(r?.firstReadAt));
          return `<li><strong>${who}</strong> <span class="dfe-muted">· ${when}</span></li>`;
        })
        .join("")}</ul>`
    : `<p class="dfe-muted">Aún sin lectores registrados.</p>`;
  const comments = Array.isArray(trk?.comments) ? [...trk.comments] : [];
  comments.sort((a, b) => (timestampToMillis(a?.createdAt) ?? 0) - (timestampToMillis(b?.createdAt) ?? 0));
  const commentsHtml = comments.length
    ? `<ul class="dfe-comments">${comments
        .map((c) => {
          const who = escHtml(c?.createdByName || c?.createdByUid || "—");
          const when = escHtml(formatFirestoreTsHuman(c?.createdAt));
          const txt = escHtml(c?.text || "");
          return `<li class="dfe-comment"><div class="dfe-comment-meta"><strong>${who}</strong> <span class="dfe-muted">· ${when}</span></div><div class="dfe-comment-text">${txt}</div></li>`;
        })
        .join("")}</ul>`
    : `<p class="dfe-muted">Sin comentarios aún.</p>`;
  const leidaArca =
    data.leida === true ||
    data.leida === 1 ||
    /leída/i.test(String(data.estadoDescripcion || data.estado || ""));
  const arcaReadPill = leidaArca
    ? `<span class="dfe-pill dfe-pill--arca-yes">Leída en ARCA</span>`
    : `<span class="dfe-pill dfe-pill--arca-no">Pendiente / no leída en ARCA</span>`;
  const managedLine = trk?.managed
    ? `<strong>Sí</strong> · ${escHtml(trk.managedBy || "—")} · ${escHtml(formatFirestoreTsHuman(trk.managedAt))}`
    : "<span class=\"dfe-muted\">No</span>";

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "dfe-detail-overlay";
  const resolvedDetailCuit = onlyDigits(detailCuitOpt ?? data.cuitRepresentada);
  if (resolvedDetailCuit.length === 11) {
    overlay.dataset.dfeCuitRepresentada = resolvedDetailCuit;
  }
  /** CUIT del detalle abierto (bandeja / fila); no usar solo `lastCuit` (queda de consulta avanzada). */
  function detailCollabCuit() {
    const d = onlyDigits(overlay.dataset.dfeCuitRepresentada);
    return d.length === 11 ? d : onlyDigits(lastCuit);
  }

  overlay.innerHTML = `
    <div class="modal-card dfe-detail-card">
      <div class="modal-header">
        <h3 class="modal-title dfe-detail-title">${escHtml(title)}</h3>
        <button type="button" class="modal-close" data-dfe-close-detail aria-label="Cerrar">✕</button>
      </div>
      <div class="modal-body dfe-detail-body">
        <div class="dfe-detail-top">
          <div class="dfe-detail-chips">
            ${arcaReadPill}
            <span class="dfe-pill dfe-pill--afip">${escHtml(data.estadoDescripcion || data.estado || "—")}</span>
            <span data-dfe-att-badge-wrap>${attBadge}</span>
            <span class="dfe-chip">${adj.length} adjunto${adj.length === 1 ? "" : "s"}</span>
            <span class="dfe-chip" id="dfe-detail-comment-chip">${comments.length} comentario${comments.length === 1 ? "" : "s"}</span>
          </div>
          <div class="dfe-detail-subline">
            <span class="dfe-muted">ID</span> <strong class="dfe-mono">${escHtml(data.idComunicacion)}</strong>
            <span class="dfe-muted">·</span>
            <span class="dfe-muted">Publicación</span> <strong>${escHtml(data.fechaPublicacion || "—")}</strong>
            <span class="dfe-muted">·</span>
            <span class="dfe-muted">Notificación</span> <strong>${escHtml(data.fechaNotificacion || "—")}</strong>
          </div>
        </div>

        <div class="dfe-detail-grid">
          <div class="dfe-detail-panel dfe-detail-panel--afip">
            <h4 class="dfe-detail-panel-title">Datos ARCA / AFIP</h4>
            <dl class="dfe-dl dfe-dl--panel">
              <dt>Organismo</dt><dd>${escHtml(data.organismo)}</dd>
              <dt>Clasificación</dt><dd>${escHtml(data.clasificacion)}</dd>
              <dt>Fecha lectura (ARCA)</dt><dd>${escHtml(data.fechaLectura)}</dd>
            </dl>
          </div>

          <div class="dfe-detail-panel dfe-detail-panel--att">
            <h4 class="dfe-detail-panel-title">Seguimiento ATT-WEB</h4>
            <div class="dfe-att-summary" data-dfe-att-summary>
              <ul class="dfe-att-facts">
                <li><span class="dfe-att-facts-k">Gestionada</span> <span class="dfe-att-facts-v" data-dfe-managed-line>${managedLine}</span></li>
              </ul>
            </div>
            <p class="dfe-collab-status is-hidden" id="dfe-collab-status" role="status" aria-live="polite"></p>
            <div class="dfe-internal">
              <div class="dfe-internal-row">
                <button type="button" class="btn-secondary dfe-btn-sm" data-dfe-toggle-managed>
                  ${trk?.managed ? "Marcar como no gestionada" : "Marcar como gestionada"}
                </button>
              </div>
              <div class="dfe-internal-row dfe-internal-row--grid">
                <div class="dfe-readers-block">
                  <div class="dfe-section-h">Leída por</div>
                  ${readersHtml}
                </div>
                <div class="dfe-comments-block">
                  <div class="dfe-section-h">Comentarios</div>
                  <div id="dfe-comments-list">${commentsHtml}</div>
                  <div class="dfe-comment-form">
                    <textarea class="dfe-note" id="dfe-comment-text" rows="3" placeholder="Agregar comentario…"></textarea>
                    <div class="dfe-row-actions">
                      <button type="button" class="btn-primary dfe-btn-sm" data-dfe-add-comment>Publicar</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="dfe-detail-block">
          <h4 class="dfe-detail-h">Contenido (AFIP)</h4>
          <div class="dfe-detail-content">${
            bodyText
              ? `<pre class="dfe-msg-pre">${escHtml(bodyText)}</pre>`
              : "<p class=\"dfe-muted\">Sin texto de cuerpo en la respuesta.</p>"
          }</div>
        </div>
        <div class="dfe-detail-block">
          <h4 class="dfe-detail-h">Adjuntos ${incluirAdjuntos ? "(AFIP)" : ""}</h4>
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
  overlay._dfeCollabBaseline = { ...collabBaseline };

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
    try {
      logAttachmentDownload({
        cuitRepresentada: detailCollabCuit(),
        idComunicacion: data.idComunicacion,
        filename: name,
        user: appState.session.user,
      });
    } catch {}
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

    const tog = e.target.closest("[data-dfe-toggle-managed]");
    if (tog) {
      (async () => {
        const btn = tog;
        const baseline = overlay._dfeCollabBaseline || collabBaseline;
        const nextManaged = !baseline.managed;
        btn.disabled = true;
        setInternalCollabStatus(overlay, "Guardando estado…", "");
        try {
          const id = data.idComunicacion;
          const collabCuit = detailCollabCuit();
          await setManaged({
            cuitRepresentada: collabCuit,
            idComunicacion: id,
            managed: nextManaged,
            user: appState.session.user,
            expectedManaged: baseline.managed,
          });
          const fresh = await getTracking(collabCuit, id);
          trackingById[String(id)] = fresh;
          paintKpisAndFilters();
          paintTable(getFilteredRows(lastPageRows), collabCuit);
          overlay._dfeCollabBaseline = {
            internalNoteUpdatedAt: fresh?.internalNoteUpdatedAt ?? null,
            managed: Boolean(fresh?.managed),
          };
          btn.textContent = overlay._dfeCollabBaseline.managed
            ? "Marcar como no gestionada"
            : "Marcar como gestionada";
          const trkF = fresh;
          const attStateF = computeAttState(trkF);
          const wrapBadges = overlay.querySelector("[data-dfe-att-badge-wrap]");
          if (wrapBadges) wrapBadges.innerHTML = buildAttBadgeModalHtml(attStateF);
          const mlineEl = overlay.querySelector("[data-dfe-managed-line]");
          if (mlineEl) {
            mlineEl.innerHTML = fresh?.managed
              ? `<strong>Sí</strong> · ${escHtml(fresh.managedBy || "—")} · ${escHtml(formatFirestoreTsHuman(fresh.managedAt))}`
              : "<span class=\"dfe-muted\">No</span>";
          }
          setInternalCollabStatus(overlay, "Estado guardado.", "ok");
          setTimeout(() => setInternalCollabStatus(overlay, ""), 2200);
        } catch (err) {
          console.error("toggle managed:", err);
          if (err instanceof CollabWriteConflictError && err.kind === "managed") {
            setInternalCollabStatus(overlay, "", "");
            setError(err.message);
            const reopenCuit = detailCollabCuit();
            closeDetailModal();
            openDetail(String(data.idComunicacion), reopenCuit);
          } else {
            setInternalCollabStatus(
              overlay,
              dfeFirestoreErrorMessage(err, "No se pudo actualizar el estado gestionado."),
              "err"
            );
          }
        } finally {
          btn.disabled = false;
        }
      })();
      return;
    }

    const add = e.target.closest("[data-dfe-add-comment]");
    if (add) {
      (async () => {
        const btn = add;
        const baseline = overlay._dfeCollabBaseline || collabBaseline;
        btn.disabled = true;
        setInternalCollabStatus(overlay, "Publicando comentario…", "");
        try {
          const id = data.idComunicacion;
          const text = overlay.querySelector("#dfe-comment-text")?.value ?? "";
          const collabCuit = detailCollabCuit();
          await addComment({
            cuitRepresentada: collabCuit,
            idComunicacion: id,
            text,
            user: appState.session.user,
          });
          const fresh = await getTracking(collabCuit, id);
          trackingById[String(id)] = fresh;
          overlay._dfeCollabBaseline = {
            internalNoteUpdatedAt: fresh?.internalNoteUpdatedAt ?? null,
            managed: Boolean(fresh?.managed),
          };
          paintKpisAndFilters();
          paintTable(getFilteredRows(lastPageRows), collabCuit);
          const cs = Array.isArray(fresh?.comments) ? [...fresh.comments] : [];
          cs.sort((a, b) => (timestampToMillis(a?.createdAt) ?? 0) - (timestampToMillis(b?.createdAt) ?? 0));
          const list = overlay.querySelector("#dfe-comments-list");
          if (list) {
            list.innerHTML = cs.length
              ? `<ul class="dfe-comments">${cs
                  .map((c) => {
                    const who = escHtml(c?.createdByName || c?.createdByUid || "—");
                    const when = escHtml(formatFirestoreTsHuman(c?.createdAt));
                    const txt = escHtml(c?.text || "");
                    return `<li class="dfe-comment"><div class="dfe-comment-meta"><strong>${who}</strong> <span class="dfe-muted">· ${when}</span></div><div class="dfe-comment-text">${txt}</div></li>`;
                  })
                  .join("")}</ul>`
              : `<p class="dfe-muted">Sin comentarios aún.</p>`;
          }
          const ta = overlay.querySelector("#dfe-comment-text");
          if (ta) ta.value = "";
          const chip = overlay.querySelector("#dfe-detail-comment-chip");
          if (chip) {
            const n = cs.length;
            chip.textContent = `${n} comentario${n === 1 ? "" : "s"}`;
          }
          setInternalCollabStatus(overlay, "Comentario publicado.", "ok");
          setTimeout(() => setInternalCollabStatus(overlay, ""), 2200);
        } catch (err) {
          console.error("add comment:", err);
          setInternalCollabStatus(
            overlay,
            dfeFirestoreErrorMessage(err, "No se pudo publicar el comentario."),
            "err"
          );
        } finally {
          btn.disabled = false;
        }
      })();
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

  lastCuit = cuit;

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
    const panelDocId = `${cuit}__${idNum}`;
    descartarAlerta(panelDocId)
      .then(() => {
        if (document.getElementById("dfe-api-table-body")) return loadApiPanel();
      })
      .catch(() => {});
    try {
      await markViewedInApp({ cuitRepresentada: cuit, idComunicacion: idNum, user: appState.session.user });
      trackingById[String(idNum)] = await getTracking(cuit, idNum);
    } catch (e) {
      console.warn("[DFE] tracking view failed:", e);
      // Optimista: si Firestore falla, igual marcamos "vista" en memoria para esta sesión.
      trackingById[String(idNum)] = {
        ...(trackingById[String(idNum)] || {}),
        viewedInApp: true,
      };
      setError(dfeFirestoreErrorMessage(e, "No se pudo persistir la marca de vista. Se marcó solo en esta sesión."));
    }
    paintKpisAndFilters();
    // Refrescar badges en la tabla sin re-consultar.
    paintTable(getFilteredRows(lastPageRows), cuit);
    const trkBaseline = trackingById[String(idNum)] || null;
    renderDetailModal(res.data, {
      incluirAdjuntos,
      cuitRepresentada: cuit,
      collabBaseline: {
        internalNoteUpdatedAt: trkBaseline?.internalNoteUpdatedAt ?? null,
        managed: Boolean(trkBaseline?.managed),
      },
    });
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

    const subsections = Array.isArray(s.subsections) && s.subsections.length
      ? `<div class="dfe-guide-subsections">${s.subsections
          .map((sub) => {
            const subList = (sub.items || []).map((it) => `<li class="dfe-guide-li">${esc(it)}</li>`).join("");
            const subTag = sub.ordered ? "ol" : "ul";
            return `
              <div class="dfe-guide-sub">
                <h4 class="dfe-guide-subh">${esc(sub.title)}</h4>
                <${subTag} class="dfe-guide-list">${subList}</${subTag}>
              </div>
            `;
          })
          .join("")}</div>`
      : "";

    return `
      <section class="dfe-guide-section">
        <h3 class="dfe-guide-h">${esc(s.title)}</h3>
        ${listBlock}
        ${callout}
        ${code}
        ${subsections}
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

  closeApiDetailPanel();

  // Bandeja primero: ocultar bloque legacy de “Resultados” (consulta avanzada) hasta que el usuario consulte.
  showEl(document.getElementById("dfe-results-wrap"), false);

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

  // Inbox (bandeja consolidada) — carga inicial.
  try {
    // Mostrar botón sync solo a admin/superadmin.
    const uRole = appState.session.user?.role || "lectura";
    const btnSync = document.getElementById("dfe-inbox-sync");
    if (btnSync) {
      btnSync.classList.toggle("is-hidden", !(uRole === "superadmin" || uRole === "admin"));
    }
    setStatus("Inicializando sesión…");
    disableDfeActions(true);
    await initDfeAuth();
    if (dfeAuthReady) {
      setStatus("");
      disableDfeActions(false);
    } else {
      setStatus("No autenticado.");
      disableDfeActions(true);
    }
    bindInboxEvents();
    bindApiPanelEvents(root);
    await loadApiPanel();
    if (dfeAuthReady) startDfeInboxAutoRefresh();
  } catch (e) {
    console.warn("[DFE] inbox:", e);
    setStatus("No se pudo cargar la bandeja DFE. Revisá consola.");
  }

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
