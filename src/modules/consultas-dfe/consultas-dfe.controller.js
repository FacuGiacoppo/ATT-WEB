import { renderConsultasDfeView } from "./consultas-dfe.view.js";
import { explainDfeFetchFailure } from "../../config/dfe-api.js";
import { apiPostComunicaciones, apiPostComunicacionDetalle } from "./dfe.service.js";

export { renderConsultasDfeView };

const DEMO = {
  cuitRepresentada: "20279722796",
  fechaDesde: "2026-01-01",
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
  return {
    cuitRepresentada: cuit,
    fechaDesde,
    fechaHasta,
    pagina: 1,
    resultadosPorPagina: Number.isFinite(rpp) ? rpp : 10,
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

async function runConsultar(extra) {
  setError("");
  const payload = { ...readFormPayload(), ...extra };
  payload.fechaDesde = normalizeDateForApi(payload.fechaDesde);
  payload.fechaHasta = normalizeDateForApi(payload.fechaHasta);
  console.log("[DFE] POST /api/dfe/comunicaciones", JSON.stringify(payload));
  lastListPayload = { cuitRepresentada: payload.cuitRepresentada };

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

  setLoading(true);
  try {
    const res = await apiPostComunicaciones(payload);
    if (!res.ok || !res.data) {
      setError(userMessageFromResponse(res));
      showEl(wrap, false);
      return;
    }

    const data = res.data;
    const list = data.comunicaciones || [];
    const total = data.totalItems ?? list.length;
    const page = data.pagina ?? payload.pagina;
    const totalPages = data.totalPaginas ?? 1;

    showEl(wrap, true);
    if (meta) {
      meta.textContent = `Página ${page} de ${totalPages} · ${total} comunicación(es) en total`;
    }

    const hasRows = list.length > 0;
    showEl(document.querySelector(".dfe-table-scroll"), hasRows);
    showEl(empty, !hasRows);
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
        .map(
          (a) =>
            `<li><strong>${escHtml(a.filename || "archivo")}</strong> · ${escHtml(a.md5 || "—")} · ${escHtml(
              String(a.contentSize ?? "—")
            )}${a.contentOmitted ? " · <span class=\"dfe-muted\">contenido omitido en API</span>" : ""}</li>`
        )
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
    const res = await apiPostComunicacionDetalle({
      cuitRepresentada: cuit,
      idComunicacion: idNum,
      incluirAdjuntos,
    });
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

export function initConsultasDfePage() {
  const root = document.getElementById("dfe-root");
  if (!root) return;

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
  });
}
