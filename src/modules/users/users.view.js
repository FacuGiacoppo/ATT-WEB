import { appState } from "../../app/state.js";
import { canManageUsers, canViewUsers } from "../../utils/permissions.js";

export function renderUsersView() {
  const user = appState.session.user;
  const canManage = canManageUsers(user);

  if (!canViewUsers(user)) {
    return `
      <section class="page-section">
        <div class="page-empty">
          <h2>Sin acceso</h2>
          <p>No tenés permisos para ver este módulo.</p>
        </div>
      </section>
    `;
  }

  return `
    <section class="users-page">
      <div class="req-hero">
        <div class="req-hero-left">
          <div class="req-eyebrow">Administración</div>
          <h1 class="req-title">Usuarios</h1>
          <p class="req-subtitle">
            Consulta de accesos, roles, estado y último acceso de las cuentas del sistema.
            ${canManage ? "Podés administrar roles y activar o desactivar usuarios." : "Estás en modo solo lectura."}
          </p>
        </div>
      </div>

      <div class="users-toolbar">
        <div class="users-toolbar-left">
          <input
            id="users-search"
            class="req-search"
            type="text"
            placeholder="Buscar por nombre o email..."
          />
        </div>

        <div class="users-toolbar-right">
          <span class="users-mode-badge ${canManage ? "is-manage" : "is-readonly"}">
            ${canManage ? "Modo administrador" : "Solo lectura"}
          </span>
        </div>
      </div>

      <div id="users-list" class="users-list-wrap">
        Cargando usuarios...
      </div>
    </section>
  `;
}
