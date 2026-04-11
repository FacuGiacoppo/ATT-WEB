/**
 * Cache-bust consistente para import() dinámico (misma build que main/bootstrap).
 */
export function attAppBuild() {
  if (typeof window !== "undefined" && window.__ATT_APP_BUILD__) {
    return String(window.__ATT_APP_BUILD__);
  }
  return "20260411-24";
}

/**
 * URL absoluta con ?v=BUILD para import(). `relativePath` relativo a `importMetaUrl`.
 * @param {string} relativePath ej. "../modules/consultas-dfe/consultas-dfe.controller.js"
 * @param {string} importMetaUrl import.meta.url del módulo llamador
 */
export function attVersionedModuleUrl(relativePath, importMetaUrl) {
  const v = attAppBuild();
  const rel = relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
  return new URL(`${rel}?v=${encodeURIComponent(v)}`, importMetaUrl).href;
}
