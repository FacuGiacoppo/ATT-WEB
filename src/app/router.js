import { renderLoginView } from "../modules/auth/login.view.js";
import { renderAppLayout } from "./layout.js";
import { renderRequerimientosView } from "../modules/requerimientos/req.view.js";
import { renderUsersView } from "../modules/users/users.view.js";
import { renderClientesView } from "../modules/clientes/clientes.view.js";
import { appState } from "./state.js";
import { loadRequirements } from "../modules/requerimientos/req.controller.js";
import { loadUsers } from "../modules/users/users.controller.js";
import { loadClientes } from "../modules/clientes/clientes.controller.js";
import {
  renderOperacionesView,
  paintOperacionesFilters
} from "../modules/operaciones/operaciones.view.js";
import { loadOperaciones, paintOperacionesTable } from "../modules/operaciones/operaciones.controller.js";
import {
  loadBandejaCumplimientos,
  paintBandejaTable
} from "../modules/bandeja-cumplimientos/bandeja-cumplimientos.controller.js";
import { renderBandejaCumplimientosView } from "../modules/bandeja-cumplimientos/bandeja-cumplimientos.view.js";
import { renderEstadoResultadosView } from "../modules/estado-resultados/estado-resultados.view.js";
import { initEstadoResultadosPage } from "../modules/estado-resultados/estado-resultados.controller.js";
import {
  renderConsultasDfeView,
  initConsultasDfePage,
  stopDfeInboxAutoRefresh,
} from "../modules/consultas-dfe/consultas-dfe.controller.js";
import { refreshDfeGlobalIndicators } from "../modules/consultas-dfe/dfe-global-indicators.js";
import {
  canAccessCentralOperaciones,
  canAccessEstadoResultados,
  canSeeModule,
  canUploadEerr
} from "../utils/permissions.js";
import {
  renderCentralOperacionesView,
  paintCentralOperacionesFilters
} from "../modules/central-operaciones/central-operaciones.view.js";
import {
  initCentralOperacionesPage,
  paintCentralOperacionesTable
} from "../modules/central-operaciones/central-operaciones.controller.js";
import { renderInicioView } from "../modules/inicio/inicio.view.js";
import { renderReporteTiemposView } from "../modules/reporte-tiempos/reporte-tiempos.view.js";
import {
  loadReporteTiempos,
  initReporteTiemposPage
} from "../modules/reporte-tiempos/reporte-tiempos.controller.js";

export async function navigate(route) {
  appState.ui.activeRoute = route;
  await renderRoute();
}

/** Tras login; vive acá (no en bootstrap) para evitar import circular con auth.controller. */
export async function setAuthenticatedUser(user) {
  appState.session.user = user;
  appState.session.isAuthenticated = true;
  await navigate("inicio");
}

export async function renderRoute() {
  const app = document.getElementById("app");
  if (!app) return;

  if (!appState.session.isAuthenticated) {
    app.innerHTML = renderLoginView();
    return;
  }

  if (appState.ui.activeRoute === "login") {
    appState.ui.activeRoute = "inicio";
  }

  try {
    stopDfeInboxAutoRefresh();
    app.innerHTML = renderAppLayout();

    const content = document.getElementById("main-content");
    if (!content) {
      throw new Error("No se encontró #main-content en el layout.");
    }

    switch (appState.ui.activeRoute) {
    case "inicio":
      if (!canSeeModule(appState.session.user, "inicio")) {
        content.innerHTML = `
          <section class="page-section">
            <div class="page-empty">No tenés permiso para acceder a Inicio.</div>
          </section>`;
        break;
      }
      content.innerHTML = renderInicioView();
      break;

    case "clientes":
      await loadClientes();
      content.innerHTML = renderClientesView();
      break;

    case "requerimientos":
      await Promise.all([
        loadRequirements(),
        appState.clientes.items.length === 0 ? loadClientes() : Promise.resolve()
      ]);
      content.innerHTML = renderRequerimientosView();
      break;

    case "operaciones":
      await Promise.all([
        loadOperaciones(),
        appState.clientes.items.length === 0 ? loadClientes() : Promise.resolve()
      ]);
      content.innerHTML = renderOperacionesView();
      paintOperacionesFilters(appState.operaciones.items ?? []);
      paintOperacionesTable();
      break;

    case "bandeja-cumplimientos":
      if (!canSeeModule(appState.session.user, "operaciones")) {
        content.innerHTML = `
          <section class="page-section">
            <div class="page-empty">No tenés permiso para acceder a la bandeja de salida.</div>
          </section>`;
        break;
      }
      await loadBandejaCumplimientos();
      content.innerHTML = renderBandejaCumplimientosView();
      paintBandejaTable();
      break;

    case "central-operaciones":
      if (!canAccessCentralOperaciones(appState.session.user)) {
        content.innerHTML = `
          <section class="page-section">
            <div class="page-empty">No tenés permiso para acceder a la Central de operaciones.</div>
          </section>`;
        break;
      }
      await initCentralOperacionesPage();
      content.innerHTML = renderCentralOperacionesView();
      paintCentralOperacionesFilters(appState.operaciones.items ?? []);
      paintCentralOperacionesTable();
      break;

    case "reporte-tiempos":
      if (!canSeeModule(appState.session.user, "tiempos")) {
        content.innerHTML = `
          <section class="page-section">
            <div class="page-empty">No tenés permiso para acceder al Reporte de tiempos.</div>
          </section>`;
        break;
      }
      await loadReporteTiempos();
      content.innerHTML = renderReporteTiemposView();
      initReporteTiemposPage();
      break;

    case "users":
      content.innerHTML = renderUsersView();
      await loadUsers();
      break;

    case "estado-resultados":
      if (!canAccessEstadoResultados(appState.session.user)) {
        content.innerHTML = `
          <section class="page-section">
            <div class="page-empty">No tenés permiso para acceder a Estado Resultados.</div>
          </section>`;
        break;
      }
      content.innerHTML = renderEstadoResultadosView(canUploadEerr(appState.session.user));
      initEstadoResultadosPage(appState.session.user);
      break;

    case "consultas-dfe":
      if (!canSeeModule(appState.session.user, "dfe")) {
        content.innerHTML = `
          <section class="page-section">
            <div class="page-empty">No tenés permiso para acceder a Consultas DFE.</div>
          </section>`;
        break;
      }
      content.innerHTML = renderConsultasDfeView();
      await initConsultasDfePage();
      break;

    default:
      content.innerHTML = `
        <section class="page-section">
          <div class="page-empty">
            Seleccioná una sección del menú.
          </div>
        </section>
      `;
    }

    if (canSeeModule(appState.session.user, "dfe")) {
      refreshDfeGlobalIndicators().catch(() => {});
    }
  } catch (err) {
    console.error("renderRoute (sesión iniciada):", err);
    const section = document.createElement("section");
    section.className = "page-section boot-fatal";
    section.innerHTML =
      "<h1 class=\"boot-fatal-title\">Error al cargar esta sección</h1>" +
      "<p class=\"boot-fatal-hint\">Revisá la consola. Errores de red o de Firebase suelen dejar la pantalla en blanco sin este mensaje.</p>";
    const pre = document.createElement("pre");
    pre.className = "boot-fatal-pre";
    pre.textContent = err?.stack || err?.message || String(err);
    section.appendChild(pre);
    app.innerHTML = "";
    app.appendChild(section);
  }
}
