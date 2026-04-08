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
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

import { auth } from "../config/firebase.js";
import { loadAppUserFromFirebaseUser } from "../modules/auth/auth.service.js";

export function bootstrapApp() {
  // Bootstrap real: primero restaurar sesión Firebase Auth, luego renderizar.
  // Evita “pantallazos” y asegura memoria entre refresh.
  onAuthStateChanged(auth, async (firebaseUser) => {
    try {
      if (firebaseUser) {
        const u = await loadAppUserFromFirebaseUser(firebaseUser);
        appState.session.user = u;
        appState.session.isAuthenticated = true;
      } else {
        resetSession();
      }
      await renderRoute();
    } catch (err) {
      console.error("auth/bootstrap:", err);
      resetSession();
      await renderRoute();
    }
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

export async function handleLogout() {
  await logout();
  resetSession();
  await renderRoute();
}
