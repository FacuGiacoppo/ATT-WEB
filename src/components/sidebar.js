import { appState } from "../app/state.js";
import { canSeeModule, canAccessCentralOperaciones, canAccessEstadoResultados } from "../utils/permissions.js";

export function renderSidebar() {
  const user = appState.session.user;

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
        ${canSeeModule(user, "dashboard") ? `
          <div class="sidebar-nav-item">
            <span class="sidebar-soon">Próximamente</span>
            <button class="sidebar-link sidebar-link--soon" data-route="dashboard" disabled>Dashboard</button>
          </div>` : ""}
        ${canSeeModule(user, "clientes") ? `<button class="sidebar-link" data-route="clientes">Clientes</button>` : ""}
        ${canSeeModule(user, "operaciones") ? `<button class="sidebar-link" data-route="operaciones">Obligaciones</button>` : ""}
        ${canSeeModule(user, "operaciones") ? `<button class="sidebar-link" data-route="bandeja-cumplimientos">Bandeja de salida</button>` : ""}
        ${canAccessCentralOperaciones(user) ? `<button class="sidebar-link" data-route="central-operaciones">Central de operaciones</button>` : ""}
        ${canSeeModule(user, "requerimientos") ? `<button class="sidebar-link" data-route="requerimientos">Requerimientos</button>` : ""}
        ${canAccessEstadoResultados(user) ? `<button class="sidebar-link" data-route="estado-resultados">Estado Resultados</button>` : ""}
        ${canSeeModule(user, "tiempos") ? `<button class="sidebar-link" data-route="reporte-tiempos">Reporte de tiempos</button>` : ""}
        ${canSeeModule(user, "users") ? `<button class="sidebar-link" data-route="users">Usuarios</button>` : ""}
      </nav>
    </aside>
  `;
}
