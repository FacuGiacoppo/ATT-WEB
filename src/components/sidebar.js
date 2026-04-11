import { appState } from "../app/state.js";
import { canSeeModule, canAccessCentralOperaciones, canAccessEstadoResultados } from "../utils/permissions.js";

function appBuildForDisplay() {
  if (typeof window !== "undefined" && window.__ATT_APP_BUILD__) {
    return String(window.__ATT_APP_BUILD__);
  }
  return "";
}

export function renderSidebar() {
  const user = appState.session.user;
  const build = appBuildForDisplay();
  const versionFooter =
    build !== ""
      ? `<div class="sidebar-version" title="Build desplegada. Si no coincide con la última publicada, probá recargar sin caché o ventana privada.">Versión ${build}</div>`
      : "";

  return `
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="sidebar-logo">ATT</div>
        <div>
          <div class="sidebar-title">ESTUDIO-ATT</div>
          <div class="sidebar-subtitle">Asesores de Empresas</div>
        </div>
      </div>

      <nav class="sidebar-nav">
        ${canSeeModule(user, "inicio") ? `<button class="sidebar-link" data-route="inicio">Inicio</button>` : ""}
        ${canSeeModule(user, "users") ? `<button class="sidebar-link" data-route="users">Usuarios</button>` : ""}
        ${canSeeModule(user, "clientes") ? `<button class="sidebar-link" data-route="clientes">Clientes</button>` : ""}
        ${canSeeModule(user, "dfe") ? `
          <button type="button" class="sidebar-link sidebar-link--dfe" data-route="consultas-dfe">
            <span class="sidebar-link-text">Consultas DFE</span>
            <span class="sidebar-badge sidebar-badge--dfe is-hidden" id="sidebar-dfe-badge" aria-hidden="true"></span>
          </button>` : ""}
        ${canSeeModule(user, "operaciones") ? `<button class="sidebar-link" data-route="operaciones">Obligaciones</button>` : ""}
        ${canSeeModule(user, "operaciones") ? `
          <div class="sidebar-nav-item">
            <span class="sidebar-label-beta">Nueva versión</span>
            <button type="button" class="sidebar-link sidebar-link--oplan" data-route="obligaciones-plan">Obligaciones plan-in</button>
          </div>` : ""}
        ${canSeeModule(user, "operaciones") ? `<button class="sidebar-link" data-route="bandeja-cumplimientos">Bandeja de salida</button>` : ""}
        ${canSeeModule(user, "dashboard") ? `
          <div class="sidebar-nav-item">
            <span class="sidebar-soon">Próximamente</span>
            <button class="sidebar-link sidebar-link--soon" data-route="dashboard" disabled>Dashboard</button>
          </div>` : ""}
        ${canSeeModule(user, "tiempos") ? `<button class="sidebar-link" data-route="reporte-tiempos">Reporte de tiempos</button>` : ""}
        ${canAccessCentralOperaciones(user) ? `<button class="sidebar-link" data-route="central-operaciones">Central de operaciones</button>` : ""}
        ${canSeeModule(user, "requerimientos") ? `<button class="sidebar-link" data-route="requerimientos">Requerimientos</button>` : ""}
        ${canAccessEstadoResultados(user) ? `<button class="sidebar-link" data-route="estado-resultados">Estado Resultados</button>` : ""}
      </nav>
      ${versionFooter}
    </aside>
  `;
}
