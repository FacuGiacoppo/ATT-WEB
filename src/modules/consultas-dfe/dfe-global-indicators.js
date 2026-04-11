import { appState } from "../../app/state.js";
import { canSeeModule } from "../../utils/permissions.js";

async function fetchResumenDedupedVersioned() {
  const b =
    typeof window !== "undefined" && window.__ATT_APP_BUILD__
      ? String(window.__ATT_APP_BUILD__)
      : "20260411-24";
  const { fetchResumenDeduped } = await import(`./dfe.service.js?v=${b}`);
  return fetchResumenDeduped();
}

function paintSidebarBadge(noLeidas) {
  const el = document.getElementById("sidebar-dfe-badge");
  if (!el) return;
  const n = Math.max(0, Number(noLeidas) || 0);
  if (n === 0) {
    el.classList.add("is-hidden");
    el.textContent = "";
    el.removeAttribute("aria-label");
    el.setAttribute("aria-hidden", "true");
    return;
  }
  el.classList.remove("is-hidden");
  el.textContent = n > 99 ? "99+" : String(n);
  el.setAttribute("aria-label", `${n} comunicaciones no leídas en DFE`);
  el.setAttribute("aria-hidden", "false");
}

function paintHomeBanner(noLeidas) {
  const wrap = document.getElementById("dfe-home-banner");
  const textEl = document.getElementById("dfe-home-banner-text");
  if (!wrap || !textEl) return;
  const n = Math.max(0, Number(noLeidas) || 0);
  if (n === 0) {
    wrap.classList.add("is-hidden");
    textEl.textContent = "";
    return;
  }
  wrap.classList.remove("is-hidden");
  textEl.textContent =
    n === 1
      ? "Tenés 1 comunicación sin leer en DFE."
      : `Tenés ${n} comunicaciones sin leer en DFE.`;
}

/**
 * Actualiza badge del sidebar y aviso en Inicio usando un objeto ya obtenido de /api/dfe/resumen.
 */
export function applyDfeGlobalFromResumen(res) {
  const user = appState.session.user;
  if (!canSeeModule(user, "dfe")) return;
  if (!res || !res.ok) return;
  paintSidebarBadge(res.noLeidas ?? 0);
  paintHomeBanner(res.noLeidas ?? 0);
}

/**
 * GET liviano: solo resumen (no tabla). Actualiza sidebar; si estás en Inicio, el aviso discreto.
 */
export async function refreshDfeGlobalIndicators() {
  const user = appState.session.user;
  if (!canSeeModule(user, "dfe")) {
    paintSidebarBadge(0);
    paintHomeBanner(0);
    return;
  }
  try {
    const res = await fetchResumenDedupedVersioned();
    if (!res.ok) {
      paintSidebarBadge(0);
      paintHomeBanner(0);
      return;
    }
    applyDfeGlobalFromResumen(res);
  } catch {
    paintSidebarBadge(0);
    paintHomeBanner(0);
  }
}
