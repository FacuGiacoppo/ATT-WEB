import { appState } from "../../app/state.js";
import { canSeeModule } from "../../utils/permissions.js";
import { fetchResumenDeduped } from "./dfe.service.js";

function paintSidebarBadge(noLeidas, nuevasUrgentes) {
  const el = document.getElementById("sidebar-dfe-badge");
  if (!el) return;
  const n = Math.max(0, Number(noLeidas) || 0);
  const u = Math.max(0, Number(nuevasUrgentes) || 0);
  if (n === 0) {
    el.classList.add("is-hidden");
    el.textContent = "";
    el.removeAttribute("aria-label");
    el.setAttribute("aria-hidden", "true");
    el.classList.remove("sidebar-badge--urgent");
    return;
  }
  el.classList.remove("is-hidden");
  el.textContent = n > 99 ? "99+" : String(n);
  el.setAttribute("aria-label", `${n} comunicaciones no leídas en DFE`);
  el.setAttribute("aria-hidden", "false");
  el.classList.toggle("sidebar-badge--urgent", u > 0);
}

function paintHomeBanner(noLeidas, nuevasUrgentes) {
  const wrap = document.getElementById("dfe-home-banner");
  const textEl = document.getElementById("dfe-home-banner-text");
  if (!wrap || !textEl) return;
  const n = Math.max(0, Number(noLeidas) || 0);
  const u = Math.max(0, Number(nuevasUrgentes) || 0);
  if (n === 0) {
    wrap.classList.add("is-hidden");
    textEl.textContent = "";
    return;
  }
  wrap.classList.remove("is-hidden");
  let t =
    n === 1
      ? "Tenés 1 comunicación nueva en DFE"
      : `Tenés ${n} comunicaciones nuevas en DFE`;
  if (u > 0) {
    t +=
      u === 1
        ? ". Y 1 requiere atención próxima"
        : `. Y ${u} requieren atención próxima`;
  }
  t += ".";
  textEl.textContent = t;
}

/**
 * Actualiza badge del sidebar y aviso en Inicio usando un objeto ya obtenido de /api/dfe/resumen.
 */
export function applyDfeGlobalFromResumen(res) {
  const user = appState.session.user;
  if (!canSeeModule(user, "dfe")) return;
  if (!res || !res.ok) return;
  paintSidebarBadge(res.noLeidas ?? 0, res.nuevasUrgentes ?? 0);
  paintHomeBanner(res.noLeidas ?? 0, res.nuevasUrgentes ?? 0);
}

/**
 * GET liviano: solo resumen (no tabla). Actualiza sidebar; si estás en Inicio, el aviso discreto.
 */
export async function refreshDfeGlobalIndicators() {
  const user = appState.session.user;
  if (!canSeeModule(user, "dfe")) {
    paintSidebarBadge(0, 0);
    paintHomeBanner(0, 0);
    return;
  }
  try {
    const res = await fetchResumenDeduped();
    if (!res.ok) {
      paintSidebarBadge(0, 0);
      paintHomeBanner(0, 0);
      return;
    }
    applyDfeGlobalFromResumen(res);
  } catch {
    paintSidebarBadge(0, 0);
    paintHomeBanner(0, 0);
  }
}
