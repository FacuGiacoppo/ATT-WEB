/**
 * Evita import estático router ↔ controllers (pantalla en blanco por dependencia circular).
 */
export function refreshRoute() {
  return import("./router.js").then((m) => m.renderRoute());
}
