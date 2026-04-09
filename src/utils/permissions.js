export function getCurrentRole(user) {
  return user?.role ?? "lectura";
}

export function canDeleteRequirement(user) {
  const role = getCurrentRole(user);
  return role === "superadmin" || role === "admin";
}

export function canCreateRequirement(user) {
  const role = getCurrentRole(user);
  return role === "superadmin" || role === "admin" || role === "colaborador";
}

export function canEditRequirement(user) {
  const role = getCurrentRole(user);
  return role === "superadmin" || role === "admin" || role === "colaborador";
}

export function canSeeModule(user, moduleName) {
  const role = getCurrentRole(user);

  const access = {
    superadmin: ["dashboard", "clientes", "operaciones", "requerimientos", "reporteria", "tiempos", "users", "dfe"],
    admin: ["dashboard", "clientes", "operaciones", "requerimientos", "reporteria", "tiempos", "users", "dfe"],
    colaborador: ["dashboard", "requerimientos", "operaciones", "users", "dfe"],
    lectura: ["dashboard", "users"],
  };

  return access[role]?.includes(moduleName) ?? false;
}

export function canCreateCliente(user) {
  const role = getCurrentRole(user);
  return role === "superadmin" || role === "admin" || role === "colaborador";
}

export function canEditCliente(user) {
  const role = getCurrentRole(user);
  return role === "superadmin" || role === "admin" || role === "colaborador";
}

export function canImportClientes(user) {
  return getCurrentRole(user) === "superadmin";
}

export function canImportOperaciones(user) {
  return getCurrentRole(user) === "superadmin";
}

/** Importación masiva, plantillas con listas, borrado/edición por lotes. */
export function canAccessCentralOperaciones(user) {
  return getCurrentRole(user) === "superadmin";
}

export function canAccessEstadoResultados(user) {
  const role = getCurrentRole(user);
  return role === "admin" || role === "superadmin";
}

export function canUploadEerr(user) {
  return getCurrentRole(user) === "superadmin";
}

export function canCreateOperacion(user) {
  const role = getCurrentRole(user);
  return role === "superadmin" || role === "admin" || role === "colaborador";
}

export function canEditOperacion(user) {
  const role = getCurrentRole(user);
  return role === "superadmin" || role === "admin" || role === "colaborador";
}

export function canDeleteOperacion(user) {
  const role = getCurrentRole(user);
  return role === "superadmin" || role === "admin";
}

export function canManageUsers(user) {
  return getCurrentRole(user) === "superadmin";
}

export function canViewUsers(user) {
  return ["superadmin", "admin", "colaborador", "lectura"].includes(getCurrentRole(user));
}
