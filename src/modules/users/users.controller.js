import { appState } from "../../app/state.js";
import { canManageUsers } from "../../utils/permissions.js";
import { fetchUsers, setRoleForUser, setActiveForUser } from "./users.service.js";
import { openInfoModal } from "../../components/modal.js";

let usersCache = [];
let usersEventsBound = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatLastLogin(value) {
  if (!value) return "—";

  if (typeof value?.toDate === "function") {
    return value.toDate().toLocaleString("es-AR");
  }

  return "—";
}

function renderRoleOption(value, current) {
  return `<option value="${value}" ${value === current ? "selected" : ""}>${value}</option>`;
}

function renderUserRow(user, canManage) {
  return `
    <tr>
      <td>
        <div class="users-name-cell">
          <strong>${escapeHtml(user.name)}</strong>
        </div>
      </td>
      <td>${escapeHtml(user.email)}</td>
      <td>
        ${
          canManage
            ? `
              <select class="users-role-select" data-user-role-id="${user.id}">
                ${renderRoleOption("superadmin", user.role)}
                ${renderRoleOption("admin", user.role)}
                ${renderRoleOption("colaborador", user.role)}
                ${renderRoleOption("lectura", user.role)}
              </select>
            `
            : `
              <span class="users-role-pill">${escapeHtml(user.role)}</span>
            `
        }
      </td>
      <td>
        <span class="users-status ${user.active ? "is-active" : "is-inactive"}">
          ${user.active ? "Activo" : "Inactivo"}
        </span>
      </td>
      <td>${formatLastLogin(user.lastLoginAt)}</td>
      <td>
        ${
          canManage
            ? `
              <div class="users-actions">
                <button type="button" class="btn-secondary btn-sm" data-user-save-role="${user.id}">
                  Guardar rol
                </button>

                <button
                  type="button"
                  class="btn-secondary btn-sm"
                  data-user-toggle-active="${user.id}"
                  data-user-next-active="${user.active ? "false" : "true"}"
                >
                  ${user.active ? "Desactivar" : "Activar"}
                </button>
              </div>
            `
            : `
              <span class="users-readonly-text">Solo lectura</span>
            `
        }
      </td>
    </tr>
  `;
}

function renderUsersTable(users, canManage) {
  if (!users.length) {
    return `
      <div class="page-empty">
        No hay usuarios para mostrar.
      </div>
    `;
  }

  return `
    <div class="users-table-wrap">
      <table class="users-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Email</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Último acceso</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${users.map((user) => renderUserRow(user, canManage)).join("")}
        </tbody>
      </table>
    </div>
    ${
      !canManage
        ? `
          <div class="users-info-note">
            Estás viendo esta sección en modo consulta. Solo el superadmin puede editar roles o activar/desactivar usuarios.
          </div>
        `
        : ""
    }
  `;
}

function paintUsers(users) {
  const container = document.getElementById("users-list");
  if (!container) return;

  const canManage = canManageUsers(appState.session.user);
  container.innerHTML = renderUsersTable(users, canManage);
}

function filterUsers(searchTerm) {
  const term = (searchTerm ?? "").trim().toLowerCase();

  if (!term) {
    paintUsers(usersCache);
    return;
  }

  const filtered = usersCache.filter((user) => {
    const haystack = [user.name, user.email, user.role]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(term);
  });

  paintUsers(filtered);
}

export async function loadUsers() {
  const container = document.getElementById("users-list");
  if (!container) return;

  try {
    usersCache = await fetchUsers();
    paintUsers(usersCache);
  } catch (error) {
    console.error(error);
    container.innerHTML = `<div class="page-empty">No se pudieron cargar los usuarios.</div>`;
  }
}

export function bindUsersEvents() {
  if (usersEventsBound) return;
  usersEventsBound = true;

  document.addEventListener("click", async (event) => {
    const canManage = canManageUsers(appState.session.user);

    const saveRoleBtn = event.target.closest("[data-user-save-role]");
    if (saveRoleBtn) {
      if (!canManage) return;

      const uid = saveRoleBtn.dataset.userSaveRole;
      const select = document.querySelector(`[data-user-role-id="${uid}"]`);
      const role = select?.value;

      try {
        await setRoleForUser(uid, role);
        await loadUsers();
        await openInfoModal("Rol actualizado correctamente.");
      } catch (error) {
        console.error(error);
        await openInfoModal("No se pudo actualizar el rol. Intentá de nuevo.");
      }
      return;
    }

    const toggleBtn = event.target.closest("[data-user-toggle-active]");
    if (toggleBtn) {
      if (!canManage) return;

      const uid = toggleBtn.dataset.userToggleActive;
      const nextActive = toggleBtn.dataset.userNextActive === "true";

      try {
        await setActiveForUser(uid, nextActive);
        await loadUsers();
      } catch (error) {
        console.error(error);
        await openInfoModal("No se pudo actualizar el estado del usuario. Intentá de nuevo.");
      }
    }
  });

  document.addEventListener("input", (event) => {
    const searchInput = event.target.closest("#users-search");
    if (searchInput) {
      filterUsers(searchInput.value);
    }
  });
}
