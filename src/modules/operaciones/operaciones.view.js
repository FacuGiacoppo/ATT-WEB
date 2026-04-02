import { appState } from "../../app/state.js";
import { renderModal } from "../../components/modal.js";
import {
  canCreateOperacion,
  canEditOperacion,
  canDeleteOperacion
} from "../../utils/permissions.js";
import { ARCA_CALENDARIO_URLS } from "../../data/arca-calendario.js";
import { OBLIGACIONES_CATALOG } from "../../data/obligaciones-catalog.js";
import { periodoToMonthInput } from "../../data/vencimientos-engine.js";
import {
  ULTIMO_PERIODO_CALENDARIO_OPERATIVO,
  ultimoMesPermitidoTareasYm,
  ultimaFechaPermitidaTareasIso
} from "../../data/calendario-fiscal-limits.js";
import {
  TIPOS_PERIODO,
  TIPOS_PROGRAMACION,
  esNombreTareaPlanIn,
  coincideTipoProgramacion
} from "../../data/operaciones-scheduling.js";

const ESTADOS = ["Pendiente", "Cumplido", "Cumplido Tardio", "Vencido"];
const ORGANISMOS = ["ARCA", "AFIP", "Provincial", "Municipal", "Otro"];

const DIAS_SEMANA_OPTS = [
  [1, "Lunes"],
  [2, "Martes"],
  [3, "Miércoles"],
  [4, "Jueves"],
  [5, "Viernes"],
  [6, "Sábado"],
  [7, "Domingo"]
];

function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeUserKey(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function canCumplimentarTarea(item, user) {
  if (!item) return false;
  const resp = normalizeUserKey(item.responsable);
  const name = normalizeUserKey(user?.name);
  const email = normalizeUserKey(user?.email);
  return Boolean(resp && (resp === name || resp === email));
}

function isTareaLabel(obligacion) {
  return esNombreTareaPlanIn(obligacion);
}

export function renderOperacionesView() {
  const user = appState.session.user;

  return `
    <section class="op-page">
      <div class="op-hero">
        <div class="op-hero-left">
          <div class="req-eyebrow">Planificación · cumplimiento</div>
          <h1 class="req-title">Obligaciones y tareas</h1>
          <p class="req-subtitle">
            Panel de seguimiento por cliente, responsable y vencimiento. Integración referencial con calendarios
            <strong>ARCA</strong> (enlaces oficiales y sugerencia de día según CUIT).
          </p>
        </div>
        <div class="op-hero-right">
          ${
            canCreateOperacion(user)
              ? `<div class="op-new-btns">
                  <button type="button" id="btn-new-op" class="btn-primary">+ Obligación</button>
                  <button type="button" id="btn-new-tarea" class="btn-secondary">+ Tarea</button>
                </div>`
              : ""
          }
        </div>
      </div>

      <div id="op-load-error" class="op-load-error" hidden role="alert"></div>

      <div class="op-arca-strip">
        <span class="op-arca-strip-label">Calendario ARCA / AFIP</span>
        <div class="op-arca-links">
          ${ARCA_CALENDARIO_URLS.map(
            (l) =>
              `<a class="op-arca-link" href="${escapeHtml(l.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)}</a>`
          ).join("")}
        </div>
      </div>

      <div class="op-toolbar">
        <div class="op-filters-row">
          <select id="op-filter-cliente" class="op-select" aria-label="Filtrar por cliente">
            <option value="">Cliente</option>
          </select>
          <select id="op-filter-obligacion" class="op-select" aria-label="Filtrar por obligación">
            <option value="">Obligación / Tarea</option>
          </select>
          <select id="op-filter-mes-vto" class="op-select" aria-label="Filtrar por mes de vencimiento">
            <option value="">Mes Vto.</option>
          </select>
          <select id="op-filter-estado" class="op-select" aria-label="Filtrar por estado">
            <option value="todos" ${appState.operaciones.estadoFilter === "todos" ? "selected" : ""}>Estado</option>
            ${ESTADOS.map(
              (e) =>
                `<option value="${escapeHtml(e)}" ${appState.operaciones.estadoFilter === e ? "selected" : ""}>${escapeHtml(e)}</option>`
            ).join("")}
          </select>
          <select id="op-filter-usuario" class="op-select" aria-label="Filtrar por usuario">
            <option value="">Usuario</option>
          </select>
        </div>
        <input
          id="op-search"
          class="req-search op-search"
          type="search"
          placeholder="Buscar..."
          value="${escapeHtml(appState.operaciones.search ?? "")}"
        />
      </div>

      <div id="op-kpis" class="op-kpis"></div>

      <div class="op-table-card">
        <table class="op-table">
          <thead>
            <tr>
              <th><button type="button" class="op-th-sort" data-op-sort="responsable">Usuario <span class="op-sort-ico">↕</span></button></th>
              <th><button type="button" class="op-th-sort" data-op-sort="clienteNombre">Cliente <span class="op-sort-ico">↕</span></button></th>
              <th><button type="button" class="op-th-sort" data-op-sort="obligacion">Obligación / Tarea <span class="op-sort-ico">↕</span></button></th>
              <th><button type="button" class="op-th-sort" data-op-sort="periodo">Período <span class="op-sort-ico">↕</span></button></th>
              <th><button type="button" class="op-th-sort" data-op-sort="vencimiento">Vencimiento <span class="op-sort-ico">↕</span></button></th>
              <th><button type="button" class="op-th-sort" data-op-sort="estado">Estado <span class="op-sort-ico">↕</span></button></th>
              <th class="op-th-actions"></th>
            </tr>
          </thead>
          <tbody id="op-tbody"></tbody>
        </table>
        <div id="op-empty" class="op-empty" hidden>Sin registros para los filtros actuales.</div>
      </div>

      ${renderOperacionModals()}
    </section>
  `;
}

function renderOperacionModals() {
  const modal = appState.ui.modal;
  if (modal === "new-operacion") {
    return renderOperacionFormModal({ title: "Nueva obligación", item: null, tipo: "obligacion" });
  }
  if (modal === "new-tarea") {
    return renderOperacionFormModal({ title: "Nueva tarea", item: null, tipo: "tarea" });
  }
  if (modal === "edit-operacion") {
    const item = appState.ui.modalPayload;
    const tipo = item?.tipo ?? "obligacion";
    const title = tipo === "tarea" ? "Editar tarea" : "Editar obligación";
    return renderOperacionFormModal({
      title,
      item,
      tipo
    });
  }
  if (modal === "cumplimentar") {
    const item = appState.ui.modalPayload;
    return renderCumplimentarModal(item);
  }
  if (modal === "delete-operacion") {
    const item = appState.ui.modalPayload;
    return renderModal({
      title: "Eliminar registro",
      body: `<p class="op-delete-msg">¿Eliminar <strong>${escapeHtml(item?.obligacion)}</strong> (${escapeHtml(item?.clienteNombre)})?</p>`,
      footer: `
        <button type="button" class="btn-secondary" data-action="close-modal">Cancelar</button>
        <button type="button" class="btn-primary" data-action="confirm-delete-operacion" data-id="${escapeHtml(item?.id)}">Eliminar</button>
      `
    });
  }
  return "";
}

function renderCumplimentarModal(item) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const contactos = appState.operaciones?.cumplimentarContactos ?? [];
  const sugeridoAsunto = item?.obligacion
    ? `${item.obligacion}${item?.periodo ? ` - Período ${item.periodo}` : ""}`
    : "Documentación / Aviso";
  const cuerpoBase =
    item?.clienteNombre
      ? `Hola ${item.clienteNombre},\n\nAdjuntamos la documentación correspondiente.\n\nSaludos.`
      : "Hola,\n\nAdjuntamos la documentación correspondiente.\n\nSaludos.";

  const opts = contactos
    .filter((c) => c && c.activo !== false)
    .map((c) => {
      const checked = c.principal ? " checked" : "";
      const disabled = c.email ? "" : " disabled";
      return `<label class="op-cump-contact">
        <input type="checkbox" name="op-cump-dest" value="${escapeHtml(c.id)}"${checked}${disabled} />
        <span class="op-cump-contact-label">${escapeHtml(c.nombre || "Sin nombre")}</span>
      </label>`;
    })
    .join("");

  return renderModal({
    title: "Cumplimentar",
    body: `
      <form id="op-cump-form" class="op-form">
        <input type="hidden" id="op-cump-id" value="${escapeHtml(item?.id ?? "")}" />
        <div class="op-cump-head">
          <div class="op-cump-kv"><span class="op-cump-k">Cliente</span><span class="op-cump-v">${escapeHtml(item?.clienteNombre ?? "—")}</span></div>
          <div class="op-cump-kv"><span class="op-cump-k">${item?.tipo === "tarea" ? "Tarea" : "Obligación"}</span><span class="op-cump-v">${escapeHtml(item?.obligacion ?? "—")}</span></div>
          <div class="op-cump-kv"><span class="op-cump-k">Período</span><span class="op-cump-v">${escapeHtml(item?.periodo ?? "—")}</span></div>
          <div class="op-cump-kv"><span class="op-cump-k">Vencimiento</span><span class="op-cump-v">${escapeHtml(item?.vencimiento ?? "—")}</span></div>
        </div>

        <div class="op-field-row">
          <label class="op-field">
            <span>Fecha de cumplimiento *</span>
            <input id="op-cump-fecha" type="date" required value="${escapeHtml(item?.fechaCumplimiento ?? todayIso)}" />
          </label>
          <label class="op-field">
            <span>Comentario interno</span>
            <input id="op-cump-coment" type="text" value="${escapeHtml(item?.comentarioInterno ?? "")}" placeholder="Opcional (solo interno)" />
          </label>
        </div>

        <label class="op-cump-check">
          <input type="checkbox" id="op-cump-enviar" />
          <span>Registrar envío al cliente (destinatarios, asunto y cuerpo)</span>
        </label>

        <div id="op-cump-envio" class="op-cump-envio op-prog-sub--hidden">
          <div class="op-cump-subtitle">Destinatarios</div>
          <div class="op-cump-dests">${opts || `<div class="op-empty">No hay contactos activos con email para este cliente.</div>`}</div>

          <label class="op-field">
            <span>Asunto</span>
            <input id="op-cump-asunto" type="text" value="${escapeHtml(sugeridoAsunto)}" />
          </label>

          <label class="op-field">
            <span>Mensaje</span>
            <textarea id="op-cump-cuerpo" rows="6">${escapeHtml(cuerpoBase)}</textarea>
          </label>

          <p class="op-field-hint">
            Podés usar «Abrir Outlook / correo» para armar el mensaje antes de confirmar. Al confirmar, se guarda el cumplimiento y se vuelve a abrir el correo con los mismos datos para que adjuntes y envíes.
          </p>
          <div class="op-cump-mail-actions">
            <button type="button" class="btn-secondary" data-action="open-outlook-compose">Abrir Outlook / correo</button>
          </div>
        </div>
      </form>
    `,
    footer: `
      <button type="button" class="btn-secondary" data-action="close-modal">Cancelar</button>
      <button type="button" class="btn-primary" data-action="confirm-cumplimentar">Confirmar</button>
    `
  });
}

function renderClienteOptions(selectedId) {
  const clientes = appState.clientes?.items ?? [];
  return [
    `<option value="">Seleccioná un cliente…</option>`,
    ...clientes.map((c) => {
      const sel = c.id === selectedId ? " selected" : "";
      return `<option value="${escapeHtml(c.id)}" data-nombre="${escapeHtml(c.nombre)}"${sel}>${escapeHtml(c.nombre)}</option>`;
    })
  ].join("");
}

function renderObligacionesDatalist() {
  return `
    <datalist id="op-obligaciones-list">
      ${OBLIGACIONES_CATALOG.map((o) => `<option value="${escapeHtml(o.nombre)}"></option>`).join("")}
    </datalist>
  `;
}

function renderTareaSchedulingPanel(item) {
  const tipoPeriodo = item?.tipoPeriodo ?? TIPOS_PERIODO[0];
  const tipoRaw = item?.tipoProgramacion ?? TIPOS_PROGRAMACION[0];
  const tipoProgramacion = coincideTipoProgramacion(tipoRaw) ?? tipoRaw;
  const det = item?.programacionDetalle ?? {};
  const setSem = new Set(det.diasSemana ?? []);
  const setDom = new Set(det.diasMes ?? []);
  const fechasVarias = Array.isArray(det.fechasFijas) ? det.fechasFijas : [];
  const diaAnualInput =
    det.diaAnual && /^\d{2}-\d{2}$/.test(det.diaAnual) ? `2000-${det.diaAnual}` : "";

  const chkSem = DIAS_SEMANA_OPTS.map(
    ([v, lbl]) =>
      `<label class="op-prog-chip"><input type="checkbox" name="op-dow" value="${v}"${
        setSem.has(v) ? " checked" : ""
      }/> ${escapeHtml(lbl)}</label>`
  ).join("");

  const chkDom = Array.from({ length: 31 }, (_, i) => {
    const d = i + 1;
    return `<label class="op-prog-chip op-prog-chip--num"><input type="checkbox" name="op-dom" value="${d}"${
      setDom.has(d) ? " checked" : ""
    }/> ${d}</label>`;
  }).join("");

  const listVarias = fechasVarias
    .map(
      (iso) =>
        `<li class="op-prog-varias-item"><span class="op-prog-varias-iso">${escapeHtml(iso)}</span><button type="button" class="op-prog-varias-remove" data-iso="${escapeHtml(iso)}" aria-label="Quitar">×</button></li>`
    )
    .join("");

  return `
    <div class="op-tarea-panel">
      <div class="op-tarea-panel-title">⚙️ Programación</div>
      <div class="op-field-row">
        <label class="op-field">
          <span>Tipos de Período</span>
          <select id="op-tipo-periodo">
            ${TIPOS_PERIODO.map((t) => `<option value="${escapeHtml(t)}"${t === tipoPeriodo ? " selected" : ""}>${escapeHtml(t)}</option>`).join("")}
          </select>
        </label>
        <label class="op-field">
          <span>Tipos de Programación</span>
          <select id="op-tipo-programacion">
            ${TIPOS_PROGRAMACION.map(
              (t) =>
                `<option value="${escapeHtml(t)}"${t === tipoProgramacion ? " selected" : ""}>${escapeHtml(t)}</option>`
            ).join("")}
          </select>
        </label>
      </div>

      <div class="op-prog-sub op-prog-sub--hidden" data-op-prog-for="Días de la semana">
        <span class="op-prog-sub-label">Programar para días de la semana</span>
        <div class="op-prog-chip-grid">${chkSem}</div>
      </div>

      <div class="op-prog-sub op-prog-sub--hidden" data-op-prog-for="Días del mes">
        <span class="op-prog-sub-label">Programar para los días del mes</span>
        <div class="op-prog-chip-grid op-prog-chip-grid--dom">${chkDom}</div>
      </div>

      <div class="op-prog-sub op-prog-sub--hidden" data-op-prog-for="Día del año">
        <div class="op-prog-inline">
          <label class="op-field op-field--grow">
            <span>Programar para el día</span>
            <input type="date" id="op-prog-dia-anual" value="${escapeHtml(diaAnualInput)}" />
          </label>
          <p class="op-prog-inline-hint">El vencimiento se repetirá año a año.</p>
        </div>
      </div>

      <div class="op-prog-sub op-prog-sub--hidden" data-op-prog-for="Un día fijo">
        <label class="op-field">
          <span>Día del mes</span>
          <input type="number" id="op-prog-dia-fijo" min="1" max="31" value="${det.diaFijoMes ? escapeHtml(String(det.diaFijoMes)) : ""}" placeholder="1–31" />
        </label>
      </div>

      <div class="op-prog-sub op-prog-sub--hidden" data-op-prog-for="Varios días fijos">
        <span class="op-prog-sub-label">Programar para días fijos</span>
        <div class="op-prog-varias-row">
          <input type="date" id="op-prog-varias-picker" />
          <button type="button" class="btn-secondary" id="op-prog-varias-add">Agregar fecha</button>
        </div>
        <ul class="op-prog-varias-list" id="op-prog-varias-list">${listVarias}</ul>
      </div>
    </div>
  `;
}

function renderOperacionFormModal({ title, item, tipo }) {
  const user = appState.session.user;
  const defaultResp = item?.responsable ?? user?.name ?? user?.email ?? "";
  const organismo   = item?.organismo ?? "ARCA";

  const tipoFinal =
    tipo ?? item?.tipo ?? (esNombreTareaPlanIn(item?.obligacion) ? "tarea" : "obligacion");
  const esTarea = tipoFinal === "tarea";

  // Convertir período almacenado ("Mar-2026") al formato de input type=month ("2026-03")
  const periodoMonthVal = item?.periodo ? periodoToMonthInput(item.periodo) : "";
  const maxMesPeriodo = esTarea ? ultimoMesPermitidoTareasYm() : ULTIMO_PERIODO_CALENDARIO_OPERATIVO;
  const maxVencTarea = ultimaFechaPermitidaTareasIso();

  return renderModal({
    title,
    body: `
      <form id="op-form" class="op-form">
        <input type="hidden" id="op-id" value="${escapeHtml(item?.id ?? "")}" />
        <input type="hidden" id="op-tipo" value="${escapeHtml(tipoFinal)}" />

        ${!esTarea ? renderObligacionesDatalist() : ""}

        <label class="op-field">
          <span>Cliente</span>
          <select id="op-cliente-id" required>${renderClienteOptions(item?.clienteId)}</select>
        </label>

        <label class="op-field">
          <span>${esTarea ? "Tarea" : "Obligación"}</span>
          <input
            id="op-obligacion"
            type="text"
            ${!esTarea ? 'list="op-obligaciones-list"' : ""}
            required
            autocomplete="off"
            placeholder="${esTarea ? "Nombre de la tarea..." : "Buscá en el catálogo o escribí una obligación..."}"
            value="${escapeHtml(item?.obligacion ?? "")}"
          />
          ${!esTarea ? '<span class="op-field-hint">Con obligaciones del catálogo el vencimiento se calcula por CUIT/tablas. El período es siempre el <strong>vencido</strong> (p. ej. IVA de marzo vence en abril): no hay selector «tipo de período» como en tareas; al guardar queda registrado según la obligación.</span>' : ""}
        </label>

        <div class="op-field-row">
          <label class="op-field">
            <span>Organismo</span>
            <select id="op-organismo">${ORGANISMOS.map(
              (o) =>
                `<option value="${escapeHtml(o)}" ${o === organismo ? "selected" : ""}>${escapeHtml(o)}</option>`
            ).join("")}</select>
          </label>
          <label class="op-field">
            <span>Período${esTarea ? " *" : ""}</span>
            <input id="op-periodo" type="month" max="${escapeHtml(maxMesPeriodo)}" value="${escapeHtml(periodoMonthVal)}"${esTarea ? " required" : ""} />
            <span class="op-field-hint">${
              esTarea
                ? `Hasta <strong>${escapeHtml(maxMesPeriodo)}</strong> (≈4 años desde el mes actual).`
                : `Hasta <strong>${escapeHtml(ULTIMO_PERIODO_CALENDARIO_OPERATIVO)}</strong> (último mes del calendario fiscal cargado).`
            }</span>
          </label>
        </div>

        ${esTarea ? renderTareaSchedulingPanel(item) : ""}

        <div class="op-field-row">
          <label class="op-field">
            <span>Vencimiento${esTarea ? " *" : ""}</span>
            <input id="op-vencimiento" type="date" value="${escapeHtml(item?.vencimiento ?? "")}"${esTarea ? ` max="${escapeHtml(maxVencTarea)}" required` : ""} />
            <span id="op-calc-hint" class="op-calc-hint"></span>
          </label>
          ${
            item?.id
              ? `<label class="op-field">
            <span>Estado</span>
            <select id="op-estado">${ESTADOS.map(
              (e) =>
                `<option value="${escapeHtml(e)}" ${e === (item?.estado ?? "Pendiente") ? "selected" : ""}>${escapeHtml(e)}</option>`
            ).join("")}</select>
          </label>`
              : `<div class="op-field op-field--estado-hint">
            <span>Estado</span>
            <p class="op-estado-hint">Al crear el registro: <strong>Pendiente</strong> si el vencimiento es hoy o posterior; <strong>Vencido</strong> si la fecha ya pasó. No es editable en el alta.</p>
          </div>`
          }
        </div>

        <label class="op-field">
          <span>Responsable</span>
          <input id="op-responsable" type="text" value="${escapeHtml(defaultResp)}" />
        </label>

        <label class="op-field">
          <span>Notas</span>
          <textarea id="op-notas" rows="3" placeholder="Presentación, link a ARCA, excepciones…">${escapeHtml(item?.notas ?? "")}</textarea>
        </label>
      </form>
    `,
    footer: `
      <button type="button" class="btn-secondary" data-action="close-modal">Cancelar</button>
      <button type="button" class="btn-primary" data-action="save-operacion">Guardar</button>
    `
  });
}

export function renderOperacionRow(item, user) {
  const tarea = item.tipo === "tarea" || isTareaLabel(item.obligacion);
  const puedeCumplimentar = canCumplimentarTarea(item, user);
  const cumplido = item.estado === "Cumplido" || item.estado === "Cumplido Tardio";
  const venc = item.vencimiento ? formatDisplayDate(item.vencimiento) : "—";

  return `
    <tr class="op-row">
      <td class="op-td-sm">${escapeHtml(item.responsable || "—")}</td>
      <td class="op-td-sm">${escapeHtml(item.clienteNombre || "—")}</td>
      <td class="${tarea ? "op-td--tarea" : "op-td--oblig"}">
        ${escapeHtml(item.obligacion || "—")}
      </td>
      <td class="op-td-sm">${escapeHtml(item.periodo || "—")}</td>
      <td class="op-td-sm op-venc-cell">${venc}</td>
      <td class="${estadoTdClass(item.estado)} op-td-sm">${escapeHtml(item.estado || "—")}</td>
      <td class="op-actions">
        ${!cumplido && puedeCumplimentar
          ? `<button type="button" class="btn-primary btn-sm" data-action="cumplimentar" data-id="${escapeHtml(item.id)}">Cumplimentar</button>`
          : ""}
      </td>
    </tr>
  `;
}

function estadoTdClass(estado) {
  if (estado === "Pendiente") return "op-td--pend";
  if (estado === "Vencido") return "op-td--bad";
  if (estado === "Cumplido") return "op-td--ok";
  if (estado === "Cumplido Tardio") return "op-td--late";
  return "";
}

function renderEstadoPill(estado) {
  const key = String(estado || "");
  let cls = "op-est op-est--pend";
  if (key === "Cumplido") cls = "op-est op-est--ok";
  else if (key === "Cumplido Tardio") cls = "op-est op-est--late";
  else if (key === "Vencido") cls = "op-est op-est--bad";
  return `<span class="${cls}">${escapeHtml(estado || "—")}</span>`;
}

function formatDisplayDate(iso) {
  if (!iso) return "—";
  const p = String(iso).slice(0, 10).split("-");
  if (p.length !== 3) return escapeHtml(iso);
  return `${p[2]}/${p[1]}/${p[0]}`;
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

function urgencyClass(item) {
  if (!item.vencimiento || item.estado === "Cumplido" || item.estado === "Cumplido Tardio") return "";
  if (item.estado === "Vencido") return "op-row--overdue";
  const d = parseISODate(item.vencimiento);
  if (!d) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (d - today) / 86400000;
  if (diff < 0) return "op-row--overdue";
  if (diff <= 7) return "op-row--soon";
  return "";
}

export function computeOperacionKpis(items) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let pendientes = 0;
  let prox7 = 0;
  let vencidas = 0;
  let cerradas = 0;

  for (const r of items) {
    const st = r.estado;
    if (st === "Cumplido" || st === "Cumplido Tardio") {
      cerradas++;
      continue;
    }
    if (st !== "Pendiente" && st !== "Vencido") continue;

    pendientes++;
    const d = parseISODate(r.vencimiento);
    if (!d) continue;
    const diff = (d - today) / 86400000;
    if (diff < 0) vencidas++;
    else if (diff <= 7) prox7++;
  }

  return { pendientes, prox7, vencidas, cerradas, total: items.length };
}

export function paintOperacionesFilters(items) {
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "es"));

  const clientes = uniq(items.map((r) => r.clienteNombre));
  const obligaciones = uniq(items.map((r) => r.obligacion));
  const meses = uniq(items.map((r) => r.vencimiento?.slice(0, 7)).filter(Boolean)).sort();
  const usuarios = uniq(items.map((r) => r.responsable));

  const st = appState.operaciones;

  const fill = (id, opts, current, allLabel) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<option value="">${allLabel}</option>` +
      opts.map((v) => `<option value="${escapeHtml(v)}"${v === current ? " selected" : ""}>${escapeHtml(v)}</option>`).join("");
  };

  fill("op-filter-cliente", clientes, st.clienteFilter, "Cliente");
  fill("op-filter-obligacion", obligaciones, st.obligacionFilter, "Obligación / Tarea");

  const mesEl = document.getElementById("op-filter-mes-vto");
  if (mesEl) {
    const MESES_ES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    mesEl.innerHTML = `<option value="">Mes Vto.</option>` +
      meses.map((ym) => {
        const [y, m] = ym.split("-");
        const lbl = `${MESES_ES[Number(m) - 1]}-${y}`;
        return `<option value="${escapeHtml(ym)}"${ym === st.mesVtoFilter ? " selected" : ""}>${escapeHtml(lbl)}</option>`;
      }).join("");
  }

  fill("op-filter-usuario", usuarios, st.usuarioFilter, "Usuario");
}

export function filterAndSortOperaciones(items, state) {
  const q = (state.search ?? "").trim().toLowerCase();
  const ef = state.estadoFilter ?? "todos";

  let rows = items.filter((r) => {
    if (ef !== "todos" && r.estado !== ef) return false;
    if (state.clienteFilter && r.clienteNombre !== state.clienteFilter) return false;
    if (state.obligacionFilter && r.obligacion !== state.obligacionFilter) return false;
    if (state.mesVtoFilter && !(r.vencimiento ?? "").startsWith(state.mesVtoFilter)) return false;
    if (state.usuarioFilter && r.responsable !== state.usuarioFilter) return false;
    if (!q) return true;
    const hay = [r.responsable, r.clienteNombre, r.obligacion, r.periodo, r.estado]
      .filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  });

  const key = state.sortKey ?? "vencimiento";
  const dir = state.sortDir === "desc" ? -1 : 1;

  rows = [...rows].sort((a, b) => {
    const va = a[key] ?? "";
    const vb = b[key] ?? "";
    if (key === "vencimiento") {
      const da = parseISODate(va)?.getTime() ?? 0;
      const db = parseISODate(vb)?.getTime() ?? 0;
      return (da - db) * dir;
    }
    return String(va).localeCompare(String(vb), "es") * dir;
  });

  return rows;
}
