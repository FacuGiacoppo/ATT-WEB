import { appState } from "../app/state.js";

export function renderTopbar() {
  const user = appState.session.user;

  return `
    <header class="topbar">
      <div class="topbar-right">
        <div class="topbar-user">
          <span class="topbar-user-name">${user?.name ?? "Usuario"}</span>
          <span class="topbar-user-role">${user?.role ?? ""}</span>
        </div>

        <button class="btn-primary" data-action="logout">Salir</button>
      </div>
    </header>
  `;
}
