/**
 * Base URL de la API DFE (Flask en backend/dfe_api).
 * Definir en index.html antes de main.js si no usás el default:
 *   window.__ATT_DFE_API_BASE__ = "http://127.0.0.1:5050";
 */
export function getDfeApiBase() {
  if (typeof window !== "undefined" && window.__ATT_DFE_API_BASE__) {
    return String(window.__ATT_DFE_API_BASE__).replace(/\/$/, "");
  }
  // Producción recomendada: mismo origen (Firebase Hosting) con proxy /api/** → Cloud Run.
  // Desarrollo local: si corrés la API en tu PC, definí window.__ATT_DFE_API_BASE__ en index.html
  // o levantá el frontend en http para evitar mixed-content.
  return "";
}

/** URL apunta a esta máquina (no sirve desde GitHub Pages u otro HTTPS remoto). */
function isLocalhostApiBase(base) {
  try {
    const u = new URL(base);
    const h = (u.hostname || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return false;
  }
}

/**
 * Texto de ayuda cuando fetch a la API falla (red, servidor apagado, o HTTPS→localhost bloqueado).
 */
export function explainDfeFetchFailure() {
  const base = getDfeApiBase();
  const effective = base || (typeof location !== "undefined" ? location.origin : "");
  if (typeof location !== "undefined" && location.protocol === "https:" && isLocalhostApiBase(base)) {
    return (
      "Esta web está en HTTPS (por ejemplo GitHub Pages). El navegador no permite llamar a la API en " +
      base +
      " (contenido mixto: HTTPS → HTTP en tu PC). Para usar Consultas DFE: publicá la API en una URL HTTPS " +
      "(Railway, Cloud Run, VM, etc.) y en index.html, antes de main.js, asigná " +
      "window.__ATT_DFE_API_BASE__ = \"https://tu-api…\"; O bien abrí ATT-WEB en local (mismo protocolo que la API) " +
      "y ejecutá en tu máquina: cd backend/dfe_api && python server.py"
    );
  }
  return (
    "No se pudo contactar a la API DFE en " +
    (base || `${effective} (mismo origen, /api/...)`) +
    ". ¿Está corriendo? En tu máquina: cd backend/dfe_api && python server.py " +
    "(puerto 5050 por defecto). Si usás otro host, definí window.__ATT_DFE_API_BASE__ en index.html."
  );
}
