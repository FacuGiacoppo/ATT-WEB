import { explainDfeFetchFailure } from "../../config/dfe-api.js";
import { applyDfeGlobalFromResumen, refreshDfeGlobalIndicators } from "./dfe-global-indicators.js";
import { appState } from "../../app/state.js";
import { DELEGACION_GUIDE } from "./delegacion-guide.js";
import {
  getTracking,
  markViewedInApp,
  addComment,
  logAttachmentDownload,
} from "./dfe-tracking.service.js";
import { timestampToMillis } from "../../services/collaboration/collaboration.service.js";

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

/** Vista + API con ?v= build (única instancia de dfe.service vía import explícito). */
const __ATT_DFE_BUILD__ =
  typeof window !== "undefined" && window.__ATT_APP_BUILD__
    ? String(window.__ATT_APP_BUILD__)
    : "20260411-24";

const [_mView, _mSvc] = await Promise.all([
  import(`./consultas-dfe.view.js?v=${__ATT_DFE_BUILD__}`),
  import(`./dfe.service.js?v=${__ATT_DFE_BUILD__}`),
]);

export const renderConsultasDfeView = _mView.renderConsultasDfeView;

const {
  apiGetHealth,
  apiPostComunicacionDetalle,
  fetchComunicaciones,
  fetchComunicacionByDocId,
  fetchResumenDeduped,
  descartarAlerta,
  marcarLeida,
} = _mSvc;

/** Logs diagnóstico panel DFE (siempre). Filtrar: [DFE FINAL] */
function dfeFinal(msg, detail) {
  if (detail !== undefined) console.log("[DFE FINAL]", msg, detail);
  else console.log("[DFE FINAL]", msg);
}

function escHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Origen: `nombreCliente` en Firestore (sync / ficha). Unificamos cómo se ve en pantalla. */
function displayNombreCliente(raw, fallbackCuit) {
  const s = String(raw ?? "").trim();
  if (s) return s.toLocaleUpperCase("es-AR");
  const c = String(fallbackCuit ?? "").trim();
  return c || "—";
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

/** Estado de persistencia en el modal (comentarios), sin usar el banner rojo global. */
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

/** homologacion | produccion | null si /health no respondió */
let dfeServerEnvironment = null;
let trackingById = {}; // { [idComunicacion]: trackingDoc|null }
let currentAttFilter = "all";
let filterWithNote = false;
let filterWithAdjuntos = false;
let inboxRows = [];
let inboxFiltered = [];
let inboxClientMap = new Map(); // cuit -> nombre
let inboxSelectedClient = "";
let inboxQ = "";
/** Logs extra opcionales. Desactivar: `window.__ATT_DEBUG_DFE_PANEL__ = false` */
function dfePanelDiag(phase, data) {
  if (typeof window !== "undefined" && window.__ATT_DEBUG_DFE_PANEL__ === false) return;
  if (data !== undefined) console.log("[DFE panel]", phase, data);
  else console.log("[DFE panel]", phase);
}

function formatDfeApiResultForLog(label, res) {
  if (!res || typeof res !== "object") return { label, res };
  const { ok, status, message, error, detail } = res;
  return {
    label,
    ok,
    status,
    message: message || error || undefined,
    error: error || undefined,
    detail: detail != null ? detail : undefined,
  };
}

/** Relee `dfe_comunicaciones` mientras el usuario permanece en esta pantalla (el sync ARCA lo alimenta en servidor). */
const DFE_INBOX_POLL_MS = 60 * 1000;
let dfeInboxPollTimer = null;
let dfeInboxVisibilityHandler = null;

let dfeApiPanelRows = [];
let dfeApiResumen = null;
let dfeApiFilterCuit = "";
/** Página actual del panel API (bandeja DFE). */
let dfeApiListPage = 1;
const DFE_API_PAGE_SIZE = 25;
let dfeApiSoloNuevas = false;
/** Filtro en cliente: nombre, CUIT, asunto */
let dfeApiSearchQ = "";

/** Una sola carga en vuelo: resumen + tabla comparten el mismo `Promise.all` si hay recargas superpuestas. */
let dfeApiPanelLoadPromise = null;

let dfeApiSelectedDocId = null;
/** @type {Record<string, unknown> | null} */
let dfeApiDetailItem = null;
let dfeApiDetailEscapeHandler = null;

let dfeDetailFeedbackTimer = null;

/** Respuesta de `comunicacion-detalle` para el modal de bandeja (cuerpo + adjuntos). */
let dfeBandejaDetalleAfip = null;

/** docId (Firestore) vistos por el usuario en esta sesión (para pintar sin esperar a ARCA). */
let dfeApiViewedDocIds = new Set();

function dfeBase64ToBytes(b64) {
  const bin = atob(String(b64 || ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function dfeDecodeTextAttachment(base64Content, filename) {
  const bytes = dfeBase64ToBytes(base64Content);
  const candidates = [
    { enc: "utf-8", label: "UTF-8" },
    { enc: "windows-1252", label: "Windows-1252" },
    { enc: "iso-8859-1", label: "ISO-8859-1" },
  ];
  const scoreText = (text) => {
    if (text == null) return Number.POSITIVE_INFINITY;
    const s = String(text);
    const repl = (s.match(/\uFFFD/g) || []).length;
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
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      const sc = scoreText(text);
      if (sc < best.score) best = { text, enc: c.enc, label: c.label, score: sc };
    } catch {
      /* skip */
    }
  }
  return { text: best.text ?? "", encodingUsed: best.label };
}

function bandejaDownloadAdjunto(a, ctx) {
  const b64 = a?.contentBase64;
  const name = a?.filename || "adjunto";
  if (!b64 || a?.contentOmitted) {
    setError("No hay contenido para descargar (omitido en la respuesta de ARCA).");
    return;
  }
  const isTxt = /\.txt$/i.test(name);
  let blob;
  if (isTxt) {
    const decoded = dfeDecodeTextAttachment(b64, name);
    const enc = new TextEncoder();
    blob = new Blob([enc.encode(decoded.text)], { type: "text/plain;charset=utf-8" });
  } else {
    blob = new Blob([dfeBase64ToBytes(b64)], { type: "application/octet-stream" });
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
      cuitRepresentada: ctx.cuit,
      idComunicacion: ctx.idComunicacion,
      filename: name,
      user: appState.session.user,
    });
  } catch {
    /* noop */
  }
}

function bandejaToggleTxtPreview(overlay, a, idx) {
  const box = overlay.querySelector(`#dfe-bandeja-adj-prev-${idx}`);
  if (!box) return;
  if (!box.classList.contains("is-hidden")) {
    box.classList.add("is-hidden");
    box.innerHTML = "";
    return;
  }
  const b64 = a?.contentBase64;
  if (!b64) {
    setError("No se pudo mostrar vista previa.");
    return;
  }
  try {
    const decoded = dfeDecodeTextAttachment(b64, a?.filename || "adjunto.txt");
    const text = decoded.text;
    const clipped = text.length > 12000 ? `${text.slice(0, 12000)}\n\n…(recortado)` : text;
    box.innerHTML =
      `<div class="dfe-muted" style="margin:0 0 10px;font-size:12px">Encoding: ${escHtml(decoded.encodingUsed)}</div>` +
      `<pre class="dfe-msg-pre">${escHtml(clipped)}</pre>`;
    box.classList.remove("is-hidden");
  } catch (err) {
    console.error(err);
    setError("No se pudo mostrar vista previa del .txt.");
  }
}

function mergeDfeApiPanelRow(item) {
  if (!item?.id) return;
  const i = dfeApiPanelRows.findIndex((r) => r.id === item.id);
  if (i >= 0) dfeApiPanelRows[i] = { ...dfeApiPanelRows[i], ...item };
}

/** Filtra en cliente por búsqueda de texto (nombre, CUIT, asunto). */
function getFilteredApiRows() {
  const raw = dfeApiPanelRows || [];
  const q = (dfeApiSearchQ || "").trim().toLowerCase();
  if (!q) return raw;
  return raw.filter((r) => {
    const hay = [r.nombreCliente, r.cuitRepresentada, r.asunto].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function unbindApiDetailEscape() {
  if (!dfeApiDetailEscapeHandler) return;
  document.removeEventListener("keydown", dfeApiDetailEscapeHandler);
  dfeApiDetailEscapeHandler = null;
}

function closeApiDetailPanel() {
  dfeApiSelectedDocId = null;
  dfeApiDetailItem = null;
  dfeBandejaDetalleAfip = null;
  if (dfeDetailFeedbackTimer) {
    clearTimeout(dfeDetailFeedbackTimer);
    dfeDetailFeedbackTimer = null;
  }
  const mount = document.getElementById("dfe-bandeja-modal-mount");
  if (mount) mount.innerHTML = "";
  document.body.classList.remove("dfe-modal-open");
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

function buildBandejaReadersCommentsSection(trk) {
  const readers = Array.isArray(trk?.readers) ? trk.readers : [];
  const readersHtml = readers.length
    ? `<ul class="dfe-readers">${readers
        .map((r) => {
          const who = escHtml(r?.name || r?.uid || "—");
          const when = escHtml(formatFirestoreTsHuman(r?.firstReadAt));
          return `<li><strong>${who}</strong> <span class="dfe-muted">· ${when}</span></li>`;
        })
        .join("")}</ul>`
    : `<p class="dfe-muted">Aún sin lecturas registradas en la app.</p>`;
  const comments = Array.isArray(trk?.comments) ? [...trk.comments] : [];
  comments.sort((a, b) => (timestampToMillis(a?.createdAt) ?? 0) - (timestampToMillis(b?.createdAt) ?? 0));
  const commentsHtml = comments.length
    ? `<ul class="dfe-comments" id="dfe-bandeja-comments-list">${comments
        .map((c) => {
          const who = escHtml(c?.createdByName || c?.createdByUid || "—");
          const when = escHtml(formatFirestoreTsHuman(c?.createdAt));
          const txt = escHtml(c?.text || "");
          return `<li class="dfe-comment"><div class="dfe-comment-meta"><strong>${who}</strong> <span class="dfe-muted">· ${when}</span></div><div class="dfe-comment-text">${txt}</div></li>`;
        })
        .join("")}</ul>`
    : `<p class="dfe-muted" id="dfe-bandeja-comments-list">Sin comentarios aún.</p>`;
  return `
    <div class="dfe-bandeja-seg">
      <div class="dfe-readers-block">
        <div class="dfe-section-h">Leída por</div>
        ${readersHtml}
      </div>
      <div class="dfe-comments-block">
        <div class="dfe-section-h">Comentarios</div>
        ${commentsHtml}
        <div class="dfe-comment-form">
          <textarea class="dfe-note" id="dfe-bandeja-comment-text" rows="3" placeholder="Comentario para el equipo…"></textarea>
          <div class="dfe-row-actions">
            <button type="button" class="btn-primary dfe-btn-sm" data-dfe-bandeja-add-comment>Publicar</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildBandejaModalMarkup(it, trk, detalleAfip, detalleErr) {
  const cliente = escHtml(displayNombreCliente(it.nombreCliente, it.cuitRepresentada));
  const cuit = escHtml(String(it.cuitRepresentada || ""));
  const asunto = escHtml(String(it.asunto || "Sin asunto"));
  const bodyRaw = String(
    (detalleAfip && (detalleAfip.cuerpo || detalleAfip.mensaje)) ||
      it.cuerpo ||
      it.mensaje ||
      it.textoCuerpo ||
      ""
  ).trim();
  let contenidoBlock;
  if (bodyRaw) {
    contenidoBlock = `<pre class="dfe-msg-pre dfe-bandeja-msg">${escHtml(bodyRaw)}</pre>`;
  } else if (detalleErr) {
    contenidoBlock = `<p class="dfe-muted">${escHtml(detalleErr)}</p>`;
  } else {
    contenidoBlock = `<p class="dfe-muted">No hay texto en el mensaje.</p>`;
  }

  const adj = detalleAfip && Array.isArray(detalleAfip.adjuntos) ? detalleAfip.adjuntos : [];
  let adjuntosBlock;
  if (adj.length) {
    adjuntosBlock = `<ul class="dfe-adj-list dfe-bandeja-adj-list">${adj
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
              ${has ? `<button type="button" class="btn-secondary dfe-btn-sm" data-dfe-bandeja-dl="${idx}">Descargar</button>` : ""}
              ${has && isTxt ? `<button type="button" class="btn-secondary dfe-btn-sm" data-dfe-bandeja-preview="${idx}">Vista previa</button>` : ""}
            </div>
            <div class="dfe-adj-preview is-hidden" id="dfe-bandeja-adj-prev-${idx}"></div>
          </li>`;
      })
      .join("")}</ul>`;
  } else if (detalleAfip) {
    adjuntosBlock = `<p class="dfe-muted">Sin adjuntos en esta comunicación.</p>`;
  } else if (detalleErr) {
    adjuntosBlock = `<p class="dfe-muted">${escHtml(detalleErr)}</p>`;
  } else {
    adjuntosBlock = `<p class="dfe-muted">Sin adjuntos.</p>`;
  }
  const seg = buildBandejaReadersCommentsSection(trk);
  return `
    <div class="modal-overlay dfe-bandeja-modal" id="dfe-bandeja-modal" role="dialog" aria-modal="true" aria-labelledby="dfe-bandeja-title">
      <div class="modal-card dfe-bandeja-modal-card" role="document">
        <div class="modal-header">
          <h2 class="modal-title dfe-bandeja-modal-title" id="dfe-bandeja-title">${asunto}</h2>
          <button type="button" class="modal-close" data-dfe-bandeja-close aria-label="Cerrar">✕</button>
        </div>
        <div class="dfe-bandeja-modal-meta" aria-label="Cliente">
          <div class="dfe-bandeja-modal-client-name">${cliente}</div>
          <div class="dfe-bandeja-modal-client-cuit"><span class="dfe-mono">${cuit}</span></div>
        </div>
        <p id="dfe-bandeja-modal-feedback" class="dfe-bandeja-modal-feedback is-hidden" role="status"></p>
        <div class="modal-body dfe-bandeja-modal-body">
          <section class="dfe-bandeja-sec" aria-labelledby="dfe-bandeja-h1">
            <h3 class="dfe-bandeja-h" id="dfe-bandeja-h1">Contenido</h3>
            ${contenidoBlock}
          </section>
          <section class="dfe-bandeja-sec" aria-labelledby="dfe-bandeja-h2">
            <h3 class="dfe-bandeja-h" id="dfe-bandeja-h2">Adjuntos</h3>
            ${adjuntosBlock}
          </section>
          <section class="dfe-bandeja-sec" aria-labelledby="dfe-bandeja-h3">
            <h3 class="dfe-bandeja-h" id="dfe-bandeja-h3">Seguimiento ATT-WEB</h3>
            ${seg}
          </section>
        </div>
        <div class="modal-footer dfe-bandeja-modal-footer">
          <button type="button" class="btn-primary" data-dfe-bandeja-close>Cerrar</button>
        </div>
      </div>
    </div>
  `;
}

function setDetailActionsDisabled(disabled) {
  const pub = document.querySelector("#dfe-bandeja-modal [data-dfe-bandeja-add-comment]");
  if (pub) pub.disabled = Boolean(disabled);
}

function showDetailFeedback(msg, { autoClearMs = 0, tone = "neutral" } = {}) {
  const el = document.getElementById("dfe-bandeja-modal-feedback");
  if (!el) return;
  if (dfeDetailFeedbackTimer) {
    clearTimeout(dfeDetailFeedbackTimer);
    dfeDetailFeedbackTimer = null;
  }
  el.textContent = msg || "";
  el.classList.toggle("is-hidden", !msg);
  el.classList.remove("dfe-bandeja-modal-feedback--ok", "dfe-bandeja-modal-feedback--busy");
  if (msg && tone === "ok") el.classList.add("dfe-bandeja-modal-feedback--ok");
  if (msg && tone === "busy") el.classList.add("dfe-bandeja-modal-feedback--busy");
  if (msg && autoClearMs > 0) {
    dfeDetailFeedbackTimer = setTimeout(() => {
      el.textContent = "";
      el.classList.add("is-hidden");
      el.classList.remove("dfe-bandeja-modal-feedback--ok", "dfe-bandeja-modal-feedback--busy");
      dfeDetailFeedbackTimer = null;
    }, autoClearMs);
  }
}

function clearDetailFeedback() {
  showDetailFeedback("", {});
}

function remountBandejaModal(it, trk) {
  const mount = document.getElementById("dfe-bandeja-modal-mount");
  if (!mount || !it) return;
  mount.innerHTML = buildBandejaModalMarkup(it, trk, dfeBandejaDetalleAfip, null);
  const ov = mount.querySelector("#dfe-bandeja-modal");
  if (ov) attachBandejaModalListeners(ov, it, dfeBandejaDetalleAfip);
}

function attachBandejaModalListeners(overlay, it, detalleAfip) {
  const cuit = onlyDigits(it.cuitRepresentada);
  const idNum = Number(it.idComunicacion);
  const adjList = detalleAfip && Array.isArray(detalleAfip.adjuntos) ? detalleAfip.adjuntos : [];
  const dlCtx = { cuit, idComunicacion: idNum };

  overlay.querySelectorAll("[data-dfe-bandeja-close]").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.preventDefault();
      closeApiDetailPanel();
    });
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeApiDetailPanel();
      return;
    }
    const dl = e.target.closest("[data-dfe-bandeja-dl]");
    if (dl) {
      e.preventDefault();
      const idx = parseInt(dl.getAttribute("data-dfe-bandeja-dl"), 10);
      if (Number.isFinite(idx) && adjList[idx]) bandejaDownloadAdjunto(adjList[idx], dlCtx);
      return;
    }
    const pv = e.target.closest("[data-dfe-bandeja-preview]");
    if (pv) {
      e.preventDefault();
      const idx = parseInt(pv.getAttribute("data-dfe-bandeja-preview"), 10);
      if (Number.isFinite(idx) && adjList[idx]) bandejaToggleTxtPreview(overlay, adjList[idx], idx);
    }
  });

  const addBtn = overlay.querySelector("[data-dfe-bandeja-add-comment]");
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      const ta = overlay.querySelector("#dfe-bandeja-comment-text");
      const text = ta?.value ?? "";
      if (!String(text).trim()) return;
      addBtn.disabled = true;
      showDetailFeedback("Publicando…", { tone: "busy" });
      try {
        await addComment({ cuitRepresentada: cuit, idComunicacion: idNum, text, user: appState.session.user });
        const fresh = await getTracking(cuit, idNum);
        if (ta) ta.value = "";
        if (dfeApiDetailItem) remountBandejaModal(dfeApiDetailItem, fresh);
        showDetailFeedback("Listo", { autoClearMs: 2000, tone: "ok" });
      } catch (err) {
        console.error(err);
        showDetailFeedback(dfeFirestoreErrorMessage(err, "No se pudo publicar el comentario."));
      } finally {
        addBtn.disabled = false;
      }
    });
  }
}

async function openApiDetailForDoc(docId) {
  if (!docId) return;
  if (dfeDetailFeedbackTimer) {
    clearTimeout(dfeDetailFeedbackTimer);
    dfeDetailFeedbackTimer = null;
  }
  dfeApiSelectedDocId = docId;
  // Desde el punto de vista de ATT, al entrar al detalle ya cuenta como "leído por este usuario".
  dfeApiViewedDocIds.add(docId);
  dfeApiDetailItem = null;
  dfeBandejaDetalleAfip = null;
  const mount = document.getElementById("dfe-bandeja-modal-mount");
  if (mount) {
    mount.innerHTML = `<div class="modal-overlay dfe-bandeja-modal dfe-bandeja-modal--loading" id="dfe-bandeja-modal" role="dialog" aria-modal="true" aria-busy="true">
      <div class="modal-card dfe-bandeja-modal-card"><div class="modal-body"><p class="dfe-muted">Cargando mensaje y adjuntos…</p></div></div>
    </div>`;
  }
  document.body.classList.add("dfe-modal-open");
  bindApiDetailEscape();
  paintApiTable();
  try {
    const res = await fetchComunicacionByDocId(docId);
    if (!res.ok || !res.item) {
      if (mount) mount.innerHTML = "";
      document.body.classList.remove("dfe-modal-open");
      dfeApiSelectedDocId = null;
      setApiPanelStatus(res.message || "No se pudo cargar el detalle.");
      return;
    }
    dfeApiDetailItem = res.item;
    const it = res.item;
    const cuit = onlyDigits(it.cuitRepresentada);
    const idNum = Number(it.idComunicacion);

    // KPI "no leídas" y filtro solo-no-leídas usan `leidaInterna` en `dfe_comunicaciones` (API marcar-leida).
    try {
      const ml = await marcarLeida(docId);
      if (!ml.ok) console.warn("[DFE] marcar-leida bandeja:", ml.status, ml.message || ml.error);
    } catch (e) {
      console.warn("[DFE] marcar-leida bandeja:", e);
    }
    if (document.getElementById("dfe-api-table-body")) {
      loadApiPanel().catch((e) => console.warn("[DFE] refresh panel tras marcar-leida:", e));
    }

    // Tracking colaborativo (dfe_tracking): distinto del flag interno de bandeja.
    if (cuit.length === 11 && Number.isFinite(idNum) && idNum >= 1) {
      markViewedInApp({ cuitRepresentada: cuit, idComunicacion: idNum, user: appState.session.user }).catch((e) =>
        console.warn("[DFE] markViewedInApp bandeja (early):", e)
      );
    }

    let detalleAfip = null;
    let detalleErr = null;
    if (cuit.length === 11 && Number.isFinite(idNum) && idNum >= 1) {
      try {
        const detRes = await apiPostComunicacionDetalle({
          cuitRepresentada: cuit,
          idComunicacion: idNum,
          incluirAdjuntos: true,
        });
        if (detRes.ok && detRes.data) {
          detalleAfip = detRes.data;
          dfeBandejaDetalleAfip = detRes.data;
          const panelDocId = `${cuit}__${idNum}`;
          descartarAlerta(panelDocId)
            .then(() => {
              if (document.getElementById("dfe-api-table-body")) return loadApiPanel();
            })
            .catch(() => {});
        } else {
          detalleErr = userMessageFromResponse(detRes);
        }
      } catch (e) {
        console.warn("[DFE] comunicacion-detalle bandeja:", e);
        detalleErr = explainDfeFetchFailure();
      }
    } else {
      detalleErr = "Faltan datos para cargar el mensaje desde ARCA (CUIT o ID).";
    }
    let trk = null;
    try {
      trk = await getTracking(cuit, it.idComunicacion);
    } catch (e) {
      console.warn("[DFE] getTracking bandeja:", e);
    }
    if (mount) {
      mount.innerHTML = buildBandejaModalMarkup(it, trk, detalleAfip, detalleErr);
      const ov = mount.querySelector("#dfe-bandeja-modal");
      if (ov) attachBandejaModalListeners(ov, it, detalleAfip);
    }
  } catch (err) {
    console.error(err);
    dfeFinal("openApiDetailForDoc catch", err?.message || err);
    if (mount) mount.innerHTML = "";
    document.body.classList.remove("dfe-modal-open");
    dfeApiSelectedDocId = null;
    dfeBandejaDetalleAfip = null;
    if (err?.message === "DFE_AUTH_NOT_READY") {
      setApiPanelStatus("No hay sesión Firebase disponible");
      setError("No hay sesión Firebase disponible");
    } else {
      setApiPanelStatus(explainDfeFetchFailure());
    }
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
    <div class="dfe-api-chip dfe-api-chip--unread"><span class="dfe-api-chip-val">${escHtml(String(r.noLeidas ?? "—"))}</span><span class="dfe-api-chip-lbl">No leídas</span></div>
    <div class="dfe-api-chip dfe-api-chip--total"><span class="dfe-api-chip-val">${escHtml(String(r.totalComunicaciones ?? "—"))}</span><span class="dfe-api-chip-lbl">Total en bandeja</span></div>
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
        const label = escHtml(displayNombreCliente(p.nombreCliente, p.cuit));
        return `<option value="${c}"${prev === p.cuit ? " selected" : ""}>${label}</option>`;
      })
      .join("");
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

function paintDfeApiPager(total, totalPages, page, start, pageLen) {
  const el = document.getElementById("dfe-api-pager");
  const meta = document.getElementById("dfe-api-pager-meta");
  const prev = document.getElementById("dfe-api-pager-prev");
  const next = document.getElementById("dfe-api-pager-next");
  if (!el || !meta || !prev || !next) return;
  if (total === 0) {
    el.classList.add("is-hidden");
    return;
  }
  el.classList.remove("is-hidden");
  const from = start + 1;
  const to = start + pageLen;
  meta.textContent = `Página ${page} de ${totalPages} · ${from}–${to} de ${total}`;
  prev.disabled = page <= 1;
  next.disabled = page >= totalPages;
}

function paintApiEmptyMessage() {
  const titleEl = document.getElementById("dfe-api-empty-title");
  const hintEl = document.getElementById("dfe-api-empty-hint");
  const raw = dfeApiPanelRows || [];
  const filtered = getFilteredApiRows();
  const q = (dfeApiSearchQ || "").trim();
  if (!raw.length) {
    if (titleEl) titleEl.textContent = "No hay comunicaciones para mostrar";
    if (!hintEl) return;
    const hasFiltros = Boolean(dfeApiFilterCuit || dfeApiSoloNuevas);
    if (hasFiltros) {
      const parts = [];
      if (dfeApiFilterCuit) parts.push("cliente seleccionado");
      if (dfeApiSoloNuevas) parts.push("solo no leídas");
      hintEl.textContent = `No hay resultados con los filtros activos (${parts.join(", ")}). Probá ampliar criterios (por ejemplo, quitá “solo no leídas”).`;
    } else {
      hintEl.textContent =
        "Cuando el servidor sincronice con ARCA, las comunicaciones aparecerán solas en esta bandeja.";
    }
    return;
  }
  if (!filtered.length) {
    if (titleEl) titleEl.textContent = "No hay resultados con los filtros actuales";
    if (!hintEl) return;
    const parts = [];
    if (dfeApiFilterCuit) parts.push("cliente seleccionado");
    if (dfeApiSoloNuevas) parts.push("solo no leídas");
    if (q) parts.push("texto buscado");
    hintEl.textContent =
      parts.length > 0
        ? `No hay filas que coincidan (${parts.join(", ")}). Probá limpiar la búsqueda o elegir “Todos” en cliente.`
        : "No hay filas que coincidan. Probá limpiar la búsqueda o ampliar criterios.";
  }
}

function paintApiTable() {
  const tb = document.getElementById("dfe-api-table-body");
  const empty = document.getElementById("dfe-api-empty");
  const wrap = document.querySelector(".dfe-api-table-wrap");
  const pagerEl = document.getElementById("dfe-api-pager");
  if (!tb) return;
  const raw = dfeApiPanelRows || [];
  const allFiltered = getFilteredApiRows();
  if (!raw.length) {
    tb.innerHTML = "";
    if (pagerEl) pagerEl.classList.add("is-hidden");
    paintApiEmptyMessage();
    if (empty) empty.classList.remove("is-hidden");
    if (wrap) wrap.classList.add("is-hidden");
    return;
  }
  if (!allFiltered.length) {
    tb.innerHTML = "";
    if (pagerEl) pagerEl.classList.add("is-hidden");
    paintApiEmptyMessage();
    if (empty) empty.classList.remove("is-hidden");
    if (wrap) wrap.classList.add("is-hidden");
    return;
  }
  if (empty) empty.classList.add("is-hidden");
  if (wrap) wrap.classList.remove("is-hidden");

  const total = allFiltered.length;
  const totalPages = Math.max(1, Math.ceil(total / DFE_API_PAGE_SIZE));
  let page = dfeApiListPage;
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;
  dfeApiListPage = page;
  const start = (page - 1) * DFE_API_PAGE_SIZE;
  const rows = allFiltered.slice(start, start + DFE_API_PAGE_SIZE);
  paintDfeApiPager(total, totalPages, page, start, rows.length);

  tb.innerHTML = rows
    .map((r) => {
      const cliente = escHtml(displayNombreCliente(r.nombreCliente, r.cuitRepresentada));
      const cuit = escHtml(String(r.cuitRepresentada || ""));
      const fecha = escHtml(r.fechaPublicacion || "—");
      const asunto = escHtml(r.asunto || "—");
      const org = escHtml(r.organismo || r.sistemaPublicadorDescripcion || "—");
      const estado = escHtml(r.estadoAfipDescripcion || "—");
      const encId = encodeURIComponent(r.id || "");
      const alertaPend = Boolean(r.alertaVisualPendiente);
      const isSel = Boolean(dfeApiSelectedDocId && r.id === dfeApiSelectedDocId);
      const viewedInAtt = Boolean(dfeApiViewedDocIds?.has?.(r.id));
      const trClass = [
        "dfe-api-row",
        isSel ? "dfe-api-row--selected" : "",
        r.esNueva && !viewedInAtt ? "dfe-api-row--nueva" : "",
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
          <td>${estado}</td>
          <td>
            <button type="button" class="btn-secondary dfe-btn-sm" data-dfe-bandeja-doc="${encId}">Ver</button>
          </td>
        </tr>`;
    })
    .join("");
}

async function loadApiPanel() {
  dfeFinal("loadApiPanel start");
  dfeFinal(`currentUser exists ${Boolean(auth.currentUser)}`);

  if (dfeApiPanelLoadPromise) {
    dfeFinal("loadApiPanel: await inflight promise");
    return dfeApiPanelLoadPromise;
  }

  const run = async () => {
    setApiPanelStatus("");
    setError("");
    const meta = document.getElementById("dfe-api-meta");
    if (meta) meta.textContent = "Cargando…";
    try {
      const [resSum, resList] = await Promise.all([
        fetchResumenDeduped(),
        fetchComunicaciones({
          cuit: dfeApiFilterCuit || undefined,
          soloNuevas: dfeApiSoloNuevas,
          bandejaCompleta: true,
          limit: 500,
        }),
      ]);
      dfePanelDiag("loadApiPanel: fetch done", {
        resumen: formatDfeApiResultForLog("resumen", resSum),
        comunicaciones: formatDfeApiResultForLog("comunicaciones", resList),
      });
      const httpErrs = [];
      if (!resSum.ok) {
        const line = `Resumen: HTTP ${resSum.status ?? "?"} · ${resSum.message || resSum.error || "sin mensaje"}`;
        httpErrs.push(line);
        dfeApiResumen = null;
      } else {
        dfeApiResumen = resSum;
        applyDfeGlobalFromResumen(resSum);
      }
      if (!resList.ok) {
        const line = `Lista: HTTP ${resList.status ?? "?"} · ${resList.message || resList.error || "sin mensaje"}`;
        httpErrs.push(line);
        dfeApiPanelRows = [];
      } else {
        dfeApiPanelRows = Array.isArray(resList.items) ? resList.items : [];
      }
      if (httpErrs.length) {
        const joined = httpErrs.join(" | ");
        setApiPanelStatus(joined);
        setError(joined);
      } else {
        setError("");
      }
      paintApiBadges();
      paintApiClientSelect();
      paintApiTable();
      dfeFinal("render table items count", dfeApiPanelRows.length);
      const hint = document.getElementById("dfe-api-actions-hint");
      if (hint) {
        hint.textContent = resList.truncated
          ? "Listado truncado por límite de escaneo en servidor."
          : `${dfeApiPanelRows.length} en lista · sincronizado automáticamente`;
      }
      if (meta) meta.textContent = "Panel DFE";
    } catch (e) {
      const msg = String(e?.message || e || "");
      dfeFinal("loadApiPanel catch", msg);
      console.error("[DFE FINAL] loadApiPanel catch", e);
      if (msg === "DFE_AUTH_NOT_READY") {
        dfeFinal("DFE_AUTH_NOT_READY");
        const vis = "No hay sesión Firebase disponible";
        setApiPanelStatus(vis);
        setError(vis);
      } else {
        setApiPanelStatus(explainDfeFetchFailure());
        setError(explainDfeFetchFailure());
      }
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
  dfePanelDiag("bindApiPanelEvents: attached", { rootId: root.id });
  root.addEventListener("click", async (e) => {
    const verBandeja = e.target.closest("#dfe-api-table-body button[data-dfe-bandeja-doc]");
    if (verBandeja) {
      e.preventDefault();
      e.stopPropagation();
      const enc = verBandeja.getAttribute("data-dfe-bandeja-doc") || "";
      const docId = decodeURIComponent(enc);
      if (docId) await openApiDetailForDoc(docId);
      return;
    }
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
    if (!document.getElementById("dfe-root")) return;
    loadApiPanel().catch((err) => console.warn("[DFE] auto-refresh panel:", err));
  }, DFE_INBOX_POLL_MS);
  dfeInboxVisibilityHandler = () => {
    if (document.visibilityState !== "visible") return;
    if (!document.getElementById("dfe-root")) return;
    loadApiPanel().catch((err) => console.warn("[DFE] visibility refresh panel:", err));
  };
  document.addEventListener("visibilitychange", dfeInboxVisibilityHandler);
}

function setStatus(msg) {
  // Reutilizamos el banner existente (dfe-error) como zona de estado.
  setError(msg || "");
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
  const nOpened = states.filter((s) => s === "viewed" || s === "managed").length;
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
        <div class="dfe-kpi-value">${nOpened}</div>
        <div class="dfe-kpi-label">Abiertas en ATT</div>
      </div>
      <span class="dfe-kpi-chip dfe-kpi-chip--pending">Vista</span>
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
    const cliente = displayNombreCliente(r.nombreCliente, r.cuitRepresentada);
    const fecha = r.fechaPublicacion || r.fechaNotificacion || "—";
    return `
      <tr class="${attState === "new" ? "dfe-row--new" : ""}">
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
    if (c) cm.set(c, displayNombreCliente(v.nombreCliente, c));
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

function bindInboxEvents() {
  const sel = document.getElementById("dfe-api-filter-cliente");
  if (sel) {
    sel.addEventListener("change", async () => {
      dfeApiFilterCuit = String(sel.value || "").replace(/\D/g, "");
      dfeApiListPage = 1;
      await loadApiPanel();
    });
  }
  const chkNuevas = document.getElementById("dfe-api-solo-nuevas");
  if (chkNuevas) {
    chkNuevas.addEventListener("change", async () => {
      dfeApiSoloNuevas = Boolean(chkNuevas.checked);
      dfeApiListPage = 1;
      await loadApiPanel();
    });
  }
  const search = document.getElementById("dfe-api-search");
  if (search) {
    search.addEventListener("input", () => {
      dfeApiSearchQ = String(search.value || "");
      dfeApiListPage = 1;
      paintApiTable();
    });
  }
  document.getElementById("dfe-api-pager-prev")?.addEventListener("click", () => {
    if (dfeApiListPage > 1) {
      dfeApiListPage -= 1;
      paintApiTable();
    }
  });
  document.getElementById("dfe-api-pager-next")?.addEventListener("click", () => {
    dfeApiListPage += 1;
    paintApiTable();
  });
}
function buildAttBadgeModalHtml(attState) {
  if (attState === "managed" || attState === "viewed") {
    return `<span class="dfe-badge dfe-badge--viewed">Abierta en ATT-WEB</span>`;
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
    const nOpened = states.filter((s) => s === "viewed" || s === "managed").length;
    const nAdj = rows.filter((r) => rowHasAdjuntos(r)).length;
    const nNote = rows.filter((r) => hasInternalNote(trackingById[String(r.idComunicacion)])).length;
    kpis.innerHTML = `
      <span class="dfe-kpi dfe-kpi--new">${nNew} nuevas</span>
      <span class="dfe-kpi dfe-kpi--viewed">${nOpened} abiertas en ATT</span>
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

async function runConsultar(extra) {
  if (!auth.currentUser) {
    setStatus("No hay sesión Firebase disponible.");
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
            <span data-dfe-att-badge-wrap>${attBadge}</span>
            <span class="dfe-chip">${adj.length} adjunto${adj.length === 1 ? "" : "s"}</span>
            <span class="dfe-chip" id="dfe-detail-comment-chip">${comments.length} comentario${comments.length === 1 ? "" : "s"}</span>
          </div>
          <div class="dfe-detail-subline">
            <span class="dfe-muted">ID</span> <strong class="dfe-mono">${escHtml(data.idComunicacion)}</strong>
            <span class="dfe-muted">·</span>
            <span class="dfe-muted">Organismo</span> <strong>${escHtml(data.organismo || "—")}</strong>
            <span class="dfe-muted">·</span>
            <span class="dfe-muted">Publicación</span> <strong>${escHtml(data.fechaPublicacion || "—")}</strong>
            <span class="dfe-muted">·</span>
            <span class="dfe-muted">Notificación</span> <strong>${escHtml(data.fechaNotificacion || "—")}</strong>
          </div>
        </div>

        <div class="dfe-detail-block">
          <h4 class="dfe-detail-h">Contenido</h4>
          <div class="dfe-detail-content">${
            bodyText
              ? `<pre class="dfe-msg-pre">${escHtml(bodyText)}</pre>`
              : "<p class=\"dfe-muted\">Sin texto de cuerpo en la respuesta.</p>"
          }</div>
        </div>
        <div class="dfe-detail-block">
          <h4 class="dfe-detail-h">Adjuntos</h4>
          ${adjBlock}
        </div>

        <div class="dfe-detail-grid dfe-detail-grid--single">
          <div class="dfe-detail-panel dfe-detail-panel--att">
            <h4 class="dfe-detail-panel-title">Seguimiento ATT-WEB</h4>
            <p class="dfe-muted dfe-detail-att-intro">Quién abrió en la app y comentarios colaborativos. Visible para el equipo con acceso a DFE.</p>
            <p class="dfe-collab-status is-hidden" id="dfe-collab-status" role="status" aria-live="polite"></p>
            <div class="dfe-internal">
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
    try {
      const ml = await marcarLeida(panelDocId);
      if (!ml.ok) console.warn("[DFE] marcar-leida detalle:", ml.status, ml.message || ml.error);
    } catch (e) {
      console.warn("[DFE] marcar-leida detalle:", e);
    }
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
  dfeFinal("initConsultasDfePage start");
  const root = document.getElementById("dfe-root");
  if (!root) {
    dfeFinal("initConsultasDfePage abort: no #dfe-root");
    dfePanelDiag("initConsultasDfePage: abort (no #dfe-root)");
    return;
  }

  dfePanelDiag("initConsultasDfePage: start", {
    sessionEmail: appState.session.user?.email ?? null,
    authUid: auth.currentUser?.uid ?? null,
  });

  closeApiDetailPanel();

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
      dfeFinal("api health ok", { environment: h.environment, status: h.status });
    } else {
      dfeFinal("api health error", { ok: h.ok, status: h.status, message: h.message });
    }
  } catch (e) {
    dfeFinal("api health error (exception)", e);
    console.warn("[DFE] /api/dfe/health:", e);
  }
  refreshDfeEmptyHomoHint();

  // Bandeja + panel: carga sin gate previo; auth al momento del fetch (getFirebaseBearerTokenOrThrow).
  try {
    setStatus("");
    bindInboxEvents();
    bindApiPanelEvents(root);
    dfePanelDiag("initConsultasDfePage: listeners bound", {});
    dfeFinal("before loadApiPanel (after health)");
    await loadApiPanel();
    startDfeInboxAutoRefresh();
    dfePanelDiag("initConsultasDfePage: done");
  } catch (e) {
    dfeFinal("initConsultasDfePage catch (inbox block)", e);
    console.warn("[DFE] inbox:", e);
    setStatus("No se pudo cargar la bandeja DFE. Revisá consola.");
    setError(String(e?.message || e || "Error al inicializar DFE."));
  }
}
