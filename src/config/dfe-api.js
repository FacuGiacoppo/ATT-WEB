/**
 * Base URL de la API DFE (Flask en backend/dfe_api).
 * Definir en index.html antes de main.js si no usás el default:
 *   window.__ATT_DFE_API_BASE__ = "http://127.0.0.1:5050";
 */
export function getDfeApiBase() {
  if (typeof window !== "undefined" && window.__ATT_DFE_API_BASE__) {
    return String(window.__ATT_DFE_API_BASE__).replace(/\/$/, "");
  }
  return "http://127.0.0.1:5050";
}
