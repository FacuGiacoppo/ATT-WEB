import { renderLoginView } from "../modules/auth/login.view.js";
import { renderAppLayout } from "./layout.js";
import { renderRequerimientosView } from "../modules/requerimientos/req.view.js";
import { renderUsersView } from "../modules/users/users.view.js";
import { appState } from "./state.js";
import { loadRequirements } from "../modules/requerimientos/req.controller.js";
import { loadUsers } from "../modules/users/users.controller.js";
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
import { attVersionedModuleUrl } from "./att-module-url.js";
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
import { renderReporteTiemposView } from "../modules/reporte-tiempos/reporte-tiempos.view.js";
import {
  loadReporteTiempos,
  initReporteTiemposPage
} from "../modules/reporte-tiempos/reporte-tiempos.controller.js";

/** import() cache del controller DFE (misma URL ?v=build → misma instancia). */
let dfeControllerModulePromise = null;

async function stopDfeInboxAutoRefreshSafe() {
  if (!dfeControllerModulePromise) return;
  try {
    const mod = await dfeControllerModulePromise;
    mod.stopDfeInboxAutoRefresh();
  } catch (_) {
    /* noop */
  }
}

async function importConsultasDfeController() {
  const href = attVersionedModuleUrl("../modules/consultas-dfe/consultas-dfe.controller.js", import.meta.url);
  if (!dfeControllerModulePromise) {
    dfeControllerModulePromise = import(href);
  }
  return dfeControllerModulePromise;
}

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
    await stopDfeInboxAutoRefreshSafe();
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
      {
        const inicioMod = await import(
          attVersionedModuleUrl("../modules/inicio/inicio.view.js", import.meta.url)
        );
        content.innerHTML = inicioMod.renderInicioView();
      }
      break;

    case "clientes":
      // Import versionado para evitar caché vieja (Safari puede retener módulos en memoria).
      {
        const [viewMod, ctrlMod] = await Promise.all([
          import(attVersionedModuleUrl("../modules/clientes/clientes.view.js", import.meta.url)),
          import(attVersionedModuleUrl("../modules/clientes/clientes.controller.js", import.meta.url)),
        ]);
        await ctrlMod.loadClientes();
        content.innerHTML = viewMod.renderClientesView();
      }
      break;

    case "requerimientos":
      await Promise.all([
        loadRequirements(),
        appState.clientes.items.length === 0
          ? import(attVersionedModuleUrl("../modules/clientes/clientes.controller.js", import.meta.url)).then((m) =>
              m.loadClientes()
            )
          : Promise.resolve()
      ]);
      content.innerHTML = renderRequerimientosView();
      break;

    case "operaciones":
      await Promise.all([
        loadOperaciones(),
        appState.clientes.items.length === 0
          ? import(attVersionedModuleUrl("../modules/clientes/clientes.controller.js", import.meta.url)).then((m) =>
              m.loadClientes()
            )
          : Promise.resolve()
      ]);
      content.innerHTML = renderOperacionesView();
      paintOperacionesFilters(appState.operaciones.items ?? []);
      paintOperacionesTable();
      break;

    case "obligaciones-plan":
      if (!canSeeModule(appState.session.user, "operaciones")) {
        content.innerHTML = `
          <section class="page-section">
            <div class="page-empty">No tenés permiso para acceder a Obligaciones plan-in.</div>
          </section>`;
        break;
      }
      {
        if (appState.clientes.items.length === 0) {
          const clientesMod = await import(attVersionedModuleUrl("../modules/clientes/clientes.controller.js", import.meta.url));
          await clientesMod.loadClientes();
        }
        const [viewMod, ctrlMod] = await Promise.all([
          import(attVersionedModuleUrl("../modules/obligaciones-plan/obligaciones-plan.view.js", import.meta.url)),
          import(attVersionedModuleUrl("../modules/obligaciones-plan/obligaciones-plan.controller.js", import.meta.url)),
        ]);
        content.innerHTML = viewMod.renderObligacionesPlanView(appState.clientes.items ?? []);
        ctrlMod.initObligacionesPlanPage();
      }
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
      {
        const dfeMod = await importConsultasDfeController();
        content.innerHTML = dfeMod.renderConsultasDfeView();
        await dfeMod.initConsultasDfePage();
      }
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
      try {
        const gHref = attVersionedModuleUrl(
          "../modules/consultas-dfe/dfe-global-indicators.js",
          import.meta.url
        );
        const m = await import(gHref);
        await m.refreshDfeGlobalIndicators();
      } catch (e) {
        console.warn("[DFE] refreshDfeGlobalIndicators:", e);
      }
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
