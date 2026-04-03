import { renderRoute, navigate } from "./router.js";
import { bindAuthEvents } from "../modules/auth/auth.controller.js";
import { bindReqEvents } from "../modules/requerimientos/req.controller.js";
import { bindUsersEvents } from "../modules/users/users.controller.js";
import { bindClientesEvents } from "../modules/clientes/clientes.controller.js";
import { bindOperacionesEvents } from "../modules/operaciones/operaciones.controller.js";
import { bindCentralOperacionesEvents } from "../modules/central-operaciones/central-operaciones.controller.js";
import { bindBandejaCumplimientosEvents } from "../modules/bandeja-cumplimientos/bandeja-cumplimientos.controller.js";
import { appState, resetSession } from "./state.js";
import { logout } from "../modules/auth/auth.service.js";

export function bootstrapApp() {
  renderRoute().catch((err) => {
    console.error("renderRoute:", err);
    const root = document.getElementById("app");
    if (!root) return;
    const section = document.createElement("section");
    section.className = "page-section boot-fatal";
    section.innerHTML =
      "<h1 class=\"boot-fatal-title\">Error al dibujar la aplicación</h1>" +
      "<p class=\"boot-fatal-hint\">Revisá la consola. Si aparece <code>permission-denied</code>, revisá reglas de Firestore o volvé a iniciar sesión.</p>";
    const pre = document.createElement("pre");
    pre.className = "boot-fatal-pre";
    pre.textContent = err?.stack || err?.message || String(err);
    section.appendChild(pre);
    root.innerHTML = "";
    root.appendChild(section);
  });
  bindGlobalEvents();
}

function bindGlobalEvents() {
  document.addEventListener("click", async (event) => {
    const sidebarLink = event.target.closest("[data-route]");
    if (sidebarLink) {
      const route = sidebarLink.dataset.route;
      await navigate(route);
      return;
    }

    const logoutBtn = event.target.closest("[data-action='logout']");
    if (logoutBtn) {
      await handleLogout();
    }
  });

  bindAuthEvents();
  bindReqEvents();
  bindUsersEvents();
  bindClientesEvents();
  bindOperacionesEvents();
  bindCentralOperacionesEvents();
  bindBandejaCumplimientosEvents();
}

export async function setAuthenticatedUser(user) {
  appState.session.user = user;
  appState.session.isAuthenticated = true;
  await navigate("requerimientos");
}

export async function handleLogout() {
  await logout();
  resetSession();
  await renderRoute();
}
