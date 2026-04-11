/**
 * Controller del módulo Obligaciones plan-in (paralelo).
 * Carrito + columnas del equipo con drag-and-drop; varios responsables por ítem.
 */
import { appState, setState } from "../../app/state.js";
import { updateClientePlanIn } from "../clientes/clientes.service.js";
import { fetchUsers } from "../users/users.service.js";
import { getPlanMasterCatalog } from "../../data/obligaciones-plan-master.js";
import { vencimientoReferenciaPlanIn } from "../../data/obligaciones-plan-vencimiento.js";
import { TIPO_OBLIGACION } from "../../data/obligaciones-catalog.js";

function escAttr(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const DND_MIME = "application/x-att-oplan";

/** Usuarios activos (misma fuente que la sección Usuarios). */
let _usuariosPlanIn = [];

function catalogById() {
  const cat = getPlanMasterCatalog();
  return new Map(cat.map((i) => [i.id, i]));
}

/** @param {unknown} raw @returns {Record<string, string[]>} */
function normalizePlanInResponsables(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) {
      const arr = [...new Set(v.map((x) => String(x).trim()).filter(Boolean))];
      if (arr.length) out[k] = arr;
    } else if (typeof v === "string" && v.trim()) {
      out[k] = [v.trim()];
    }
  }
  return out;
}

function userKey(u) {
  const label = (u.name && String(u.name).trim()) || u.email || u.id;
  return (u.email && String(u.email).trim()) || label;
}

function labelForEmail(email) {
  const u = _usuariosPlanIn.find((x) => userKey(x) === email);
  if (u) return (u.name && String(u.name).trim()) || u.email || email;
  return email;
}

function getCheckedIdsFromDom() {
  return Array.from(document.querySelectorAll(".oplan-cb:checked"))
    .map((cb) => cb.getAttribute("data-oplan-id"))
    .filter(Boolean);
}

/** Tarjeta arrastrable: en carrito fromUser ""; en columna = email del responsable de esa tarjeta. */
function cardHtml(item, cuit, fromUser) {
  const isO = item.tipo === TIPO_OBLIGACION;
  const badge = isO ? "O" : "T";
  const badgeClass = isO ? "oplan-badge--o" : "oplan-badge--t";
  const { texto, hint } = vencimientoReferenciaPlanIn(item, cuit);
  const iid = escAttr(item.id);
  const fu = escAttr(fromUser ?? "");
  return `<div class="oplan-item-card" draggable="true" data-oplan-item-id="${iid}" data-oplan-from-user="${fu}" title="${escAttr(
    hint || texto
  )}">
    <span class="oplan-badge ${badgeClass}">${badge}</span>
    <span class="oplan-item-card-name">${escHtml(item.nombre)}</span>
    <span class="oplan-item-card-venc">${escHtml(texto)}</span>
  </div>`;
}

function renderOplanBoard(clienteId) {
  const cartList = document.getElementById("oplan-cart-list");
  const teamCols = document.getElementById("oplan-team-cols");
  const summaryTbody = document.getElementById("oplan-summary-tbody");

  if (!cartList || !teamCols) return;

  const users = _usuariosPlanIn.filter((u) => u.active !== false);
  teamCols.innerHTML = users
    .map((u) => {
      const key = escAttr(userKey(u));
      const name = escHtml((u.name && String(u.name).trim()) || u.email || u.id);
      return `<div class="oplan-user-col oplan-drop-zone" data-oplan-user-email="${key}" tabindex="0">
        <div class="oplan-user-col-head">${name}</div>
        <div class="oplan-card-list oplan-user-col-cards"></div>
      </div>`;
    })
    .join("");

  if (!clienteId) {
    cartList.innerHTML = `<p class="oplan-board-empty">Elegí un cliente y tildá ítems en el catálogo.</p>`;
    if (summaryTbody) summaryTbody.innerHTML = "";
    return;
  }

  const cliente = (appState.clientes?.items ?? []).find((x) => x.id === clienteId);
  const ids = Array.isArray(cliente?.planInSeleccionIds) ? cliente.planInSeleccionIds : [];
  const resp = normalizePlanInResponsables(cliente?.planInResponsables);
  const cuit = cliente?.cuit ?? "";
  const byId = catalogById();

  if (ids.length === 0) {
    cartList.innerHTML = `<p class="oplan-board-empty">No hay ítems tildados. Marcá filas en el catálogo de abajo.</p>`;
    teamCols.querySelectorAll(".oplan-user-col-cards").forEach((el) => {
      el.innerHTML = "";
    });
    if (summaryTbody) summaryTbody.innerHTML = "";
    return;
  }

  const rows = [...ids]
    .map((id) => byId.get(id))
    .filter(Boolean)
    .sort((a, b) =>
      String(a.nombre ?? "").localeCompare(String(b.nombre ?? ""), "es", { sensitivity: "base" })
    );

  const cartHtmlParts = [];
  const byEmail = new Map(users.map((u) => [userKey(u), []]));
  const userEmails = new Set(users.map((u) => userKey(u)));

  for (const item of rows) {
    const assignees = resp[item.id] ?? [];
    if (assignees.length === 0) {
      cartHtmlParts.push(cardHtml(item, cuit, ""));
    } else {
      for (const email of assignees) {
        if (userEmails.has(email)) {
          byEmail.get(email)?.push(item);
        } else {
          cartHtmlParts.push(
            `<div class="oplan-orphan-wrap">${cardHtml(item, cuit, email)}<span class="oplan-orphan-email">${escHtml(
              email
            )}</span><span class="oplan-orphan-note">No está en Usuarios — arrastrá al carrito para quitar o damos de alta el usuario en <strong>Usuarios</strong>.</span></div>`
          );
        }
      }
    }
  }

  cartList.innerHTML = cartHtmlParts.length
    ? cartHtmlParts.join("")
    : `<p class="oplan-board-empty oplan-board-empty--muted">Todo lo tildado tiene al menos un responsable en el equipo. Podés arrastrar entre columnas para sumar a alguien, o al carrito para sacar a esa persona.</p>`;

  teamCols.querySelectorAll(".oplan-user-col").forEach((col) => {
    const keyAttr = col.getAttribute("data-oplan-user-email");
    const listEl = col.querySelector(".oplan-user-col-cards");
    if (!listEl || !keyAttr) return;
    const itemsHere = byEmail.get(keyAttr) ?? [];
    listEl.innerHTML = itemsHere.map((item) => cardHtml(item, cuit, keyAttr)).join("");
  });

  if (summaryTbody) {
    summaryTbody.innerHTML = rows
      .map((item) => {
        const isO = item.tipo === TIPO_OBLIGACION;
        const badge = isO ? "O" : "T";
        const badgeClass = isO ? "oplan-badge--o" : "oplan-badge--t";
        const { texto, hint } = vencimientoReferenciaPlanIn(item, cuit);
        const assignees = resp[item.id] ?? [];
        const respText =
          assignees.length === 0
            ? "—"
            : assignees.map((e) => labelForEmail(e)).join(", ");
        const iid = escAttr(item.id);
        return `<tr data-oplan-summary-id="${iid}">
        <td><span class="oplan-badge ${badgeClass}">${badge}</span></td>
        <td class="oplan-panel-name">${escHtml(item.nombre)}</td>
        <td class="oplan-panel-venc" title="${escAttr(hint)}">${escHtml(texto)}</td>
        <td class="oplan-panel-resp-list">${escHtml(respText)}</td>
      </tr>`;
      })
      .join("");
  }
}

let _saveTimer = null;

function setSaveStatus(ok, msg) {
  const el = document.getElementById("oplan-save-status");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("is-error", !ok);
  el.classList.toggle("is-ok", ok && !!msg);
}

function patchClienteResponsables(clienteId, updater) {
  const items = (appState.clientes?.items ?? []).map((c) => {
    if (c.id !== clienteId) return c;
    const prev = normalizePlanInResponsables(c.planInResponsables);
    const next = updater(prev);
    return { ...c, planInResponsables: next };
  });
  setState("clientes.items", items);
}

function scheduleSavePlanIn(clienteId) {
  if (!clienteId) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    const checked = getCheckedIdsFromDom();
    const cliente = (appState.clientes?.items ?? []).find((x) => x.id === clienteId);
    const map = normalizePlanInResponsables(cliente?.planInResponsables);
    await persistPlanIn(clienteId, checked, map);
  }, 450);
}

async function persistPlanIn(clienteId, checkedIds, fullMap) {
  const pruned = {};
  for (const id of checkedIds) {
    const arr = fullMap[id];
    if (Array.isArray(arr) && arr.length) pruned[id] = [...new Set(arr)];
  }
  try {
    await updateClientePlanIn(clienteId, { ids: checkedIds, responsables: pruned });
    const items = (appState.clientes?.items ?? []).map((c) =>
      c.id === clienteId ? { ...c, planInSeleccionIds: checkedIds, planInResponsables: pruned } : c
    );
    setState("clientes.items", items);
    const t = new Date();
    const h = String(t.getHours()).padStart(2, "0");
    const mi = String(t.getMinutes()).padStart(2, "0");
    const s = String(t.getSeconds()).padStart(2, "0");
    setSaveStatus(true, `Guardado en la ficha del cliente · ${h}:${mi}:${s}`);
    const status = document.getElementById("oplan-cliente-status");
    const sel = document.getElementById("oplan-select-cliente");
    if (status && sel && String(sel.value || "").trim() === clienteId) {
      const c = items.find((x) => x.id === clienteId);
      const label = (c?.nombre && String(c.nombre).trim()) || clienteId;
      status.textContent = `Cliente: ${label}. ${checkedIds.length} ítem(es) en el plan · guardado automático.`;
    }
    renderOplanBoard(clienteId);
  } catch (e) {
    console.error("[plan-in] No se pudo guardar:", e);
    setSaveStatus(false, "No se pudo guardar. Revisá conexión o permisos de Firestore.");
  }
}

function parseDragPayload(dt) {
  try {
    const raw = dt.getData(DND_MIME) || dt.getData("text/plain");
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o.itemId !== "string") return null;
    return { itemId: o.itemId, fromUser: typeof o.fromUser === "string" ? o.fromUser : "" };
  } catch {
    return null;
  }
}

function bindOplanDragDrop() {
  const panel = document.getElementById("oplan-panel");
  if (!panel) return;

  let dragPayload = null;

  panel.addEventListener("dragstart", (ev) => {
    const card = ev.target.closest(".oplan-item-card");
    if (!card) return;
    const itemId = card.getAttribute("data-oplan-item-id");
    const fromUser = card.getAttribute("data-oplan-from-user") || "";
    if (!itemId) return;
    dragPayload = { itemId, fromUser };
    const payload = JSON.stringify({ itemId, fromUser });
    ev.dataTransfer?.setData(DND_MIME, payload);
    ev.dataTransfer?.setData("text/plain", payload);
    ev.dataTransfer.effectAllowed = "move";
    card.classList.add("is-dragging");
  });

  panel.addEventListener("dragend", (ev) => {
    const card = ev.target.closest?.(".oplan-item-card");
    if (card) card.classList.remove("is-dragging");
    panel.querySelectorAll(".oplan-drop-zone.is-drag-over").forEach((z) => z.classList.remove("is-drag-over"));
    dragPayload = null;
  });

  panel.addEventListener("dragover", (ev) => {
    const z = ev.target.closest(".oplan-drop-zone");
    if (!z) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
    z.classList.add("is-drag-over");
  });

  panel.addEventListener("dragleave", (ev) => {
    const z = ev.target.closest?.(".oplan-drop-zone");
    if (z && !z.contains(ev.relatedTarget)) z.classList.remove("is-drag-over");
  });

  panel.addEventListener("drop", (ev) => {
    const z = ev.target.closest(".oplan-drop-zone");
    if (!z) return;
    ev.preventDefault();
    z.classList.remove("is-drag-over");
    const parsed = parseDragPayload(ev.dataTransfer) || dragPayload;
    if (!parsed?.itemId) return;

    const sel = document.getElementById("oplan-select-cliente");
    const clienteId = sel ? String(sel.value || "").trim() : "";
    if (!clienteId) return;

    const dropCart = z.getAttribute("data-oplan-drop") === "cart";
    const targetEmail = z.getAttribute("data-oplan-user-email") || "";

    patchClienteResponsables(clienteId, (prev) => {
      const next = { ...prev };
      const cur = [...(next[parsed.itemId] ?? [])];

      if (dropCart) {
        if (parsed.fromUser) {
          const filtered = cur.filter((e) => e !== parsed.fromUser);
          if (filtered.length) next[parsed.itemId] = filtered;
          else delete next[parsed.itemId];
        }
        return next;
      }

      if (!targetEmail) return next;

      if (parsed.fromUser === targetEmail) return next;

      if (!cur.includes(targetEmail)) cur.push(targetEmail);
      next[parsed.itemId] = cur;

      return next;
    });

    renderOplanBoard(clienteId);
    scheduleSavePlanIn(clienteId);
  });
}

function bindMasterFilters() {
  const root = document.getElementById("oplan-master");
  if (!root) return;

  root.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-oplan-filter]");
    if (!btn) return;
    const f = btn.getAttribute("data-oplan-filter") || "all";

    root.querySelectorAll("[data-oplan-filter]").forEach((b) => {
      b.classList.toggle("is-active", b === btn);
    });

    root.querySelectorAll(".oplan-master-row").forEach((tr) => {
      const tipo = tr.getAttribute("data-oplan-tipo") || "";
      const jur = tr.getAttribute("data-oplan-jur") || "";
      let show = true;
      if (f === "obligacion") show = tipo === "obligacion";
      else if (f === "tarea") show = tipo === "tarea";
      else if (f === "nacional") show = jur === "nacional";
      else if (f === "provincial") show = jur === "provincial";
      else if (f === "municipal") show = jur === "municipal";
      tr.classList.toggle("is-hidden", !show);
    });
  });
}

function bindMaestroXlsxLink() {
  const link = document.getElementById("oplan-maestro-xlsx");
  if (!link) return;
  const v =
    typeof window !== "undefined" && window.__ATT_APP_BUILD__
      ? String(window.__ATT_APP_BUILD__)
      : "";
  const path = `data/obligaciones-plan-master.xlsx${v ? `?v=${encodeURIComponent(v)}` : ""}`;
  try {
    const base = typeof window !== "undefined" && window.__ATT_SITE_BASE__ ? window.__ATT_SITE_BASE__ : "";
    link.href = base ? new URL(path, base).href : path;
  } catch {
    link.href = path;
  }
  link.setAttribute("download", "obligaciones-plan-master.xlsx");
}

function refreshOplanSelectionUI(clienteId) {
  const byId = catalogById();
  const cliente = (appState.clientes?.items ?? []).find((x) => x.id === clienteId);
  const cuit = cliente?.cuit ?? "";
  const ids = Array.isArray(cliente?.planInSeleccionIds) ? cliente.planInSeleccionIds : [];

  document.querySelectorAll(".oplan-cb").forEach((cb) => {
    const id = cb.getAttribute("data-oplan-id");
    if (!id) return;
    cb.disabled = !clienteId;
    cb.title = clienteId ? "Asignar a este cliente (se guarda solo)" : "Elegí un cliente arriba";
    cb.checked = Boolean(clienteId && ids.includes(id));
  });

  document.querySelectorAll(".oplan-venc-ref").forEach((el) => {
    const id = el.getAttribute("data-oplan-id");
    const item = id ? byId.get(id) : null;
    if (!clienteId || !item) {
      el.textContent = "—";
      el.removeAttribute("title");
      return;
    }
    const { texto, hint } = vencimientoReferenciaPlanIn(item, cuit);
    el.textContent = texto;
    if (hint) el.setAttribute("title", hint);
    else el.removeAttribute("title");
  });

  renderOplanBoard(clienteId);
}

async function persistPlanInCheckboxOnly(clienteId, checkedIds) {
  const clientePre = (appState.clientes?.items ?? []).find((x) => x.id === clienteId);
  const existing = normalizePlanInResponsables(clientePre?.planInResponsables);
  const pruned = {};
  for (const id of checkedIds) {
    if (existing[id]?.length) pruned[id] = [...existing[id]];
  }
  await persistPlanIn(clienteId, checkedIds, pruned);
}

function scheduleSavePlanInFromCheckboxes(clienteId) {
  if (!clienteId) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    const checked = getCheckedIdsFromDom();
    await persistPlanInCheckboxOnly(clienteId, checked);
  }, 450);
}

function bindPlanInSelection() {
  const root = document.getElementById("oplan-master");
  if (!root) return;

  root.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement) || !t.classList.contains("oplan-cb")) return;
    const sel = document.getElementById("oplan-select-cliente");
    const clienteId = sel ? String(sel.value || "").trim() : "";
    if (!clienteId) return;
    scheduleSavePlanInFromCheckboxes(clienteId);
  });
}

export function initObligacionesPlanPage() {
  bindMasterFilters();
  bindMaestroXlsxLink();
  bindPlanInSelection();
  bindOplanDragDrop();

  fetchUsers()
    .then((users) => {
      _usuariosPlanIn = users;
      const sel = document.getElementById("oplan-select-cliente");
      const clienteId = sel ? String(sel.value || "").trim() : "";
      renderOplanBoard(clienteId);
    })
    .catch((e) => console.error("[plan-in] No se cargaron usuarios:", e));

  const sel = document.getElementById("oplan-select-cliente");
  const status = document.getElementById("oplan-cliente-status");
  if (!sel || !status) return;

  const syncStatus = () => {
    const id = String(sel.value || "").trim();
    if (!id) {
      status.textContent = "";
      status.classList.add("is-hidden");
      setSaveStatus(true, "");
      refreshOplanSelectionUI("");
      return;
    }
    const c = (appState.clientes?.items ?? []).find((x) => x.id === id);
    const label = (c?.nombre && String(c.nombre).trim()) || id;
    const n = Array.isArray(c?.planInSeleccionIds) ? c.planInSeleccionIds.length : 0;
    status.textContent = `Cliente: ${label}. ${n} ítem(es) en el plan · arrastrá desde el carrito al equipo.`;
    status.classList.remove("is-hidden");
    refreshOplanSelectionUI(id);
  };

  sel.addEventListener("change", syncStatus);
  syncStatus();
}
