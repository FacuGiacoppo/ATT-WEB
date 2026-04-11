/**
 * Base URL de la API DFE (Flask en backend/dfe_api).
 *
 * Orden:
 * 1) `window.__ATT_DFE_API_BASE__` si está definida (local o URL directa a Cloud Run).
 * 2) En navegador http/https: `location.origin` (ej. https://att-web-2809.web.app) para que los fetch
 *    sean explícitos; las rutas siguen siendo `${base}/api/dfe/...`.
 *
 * Firebase Hosting: `firebase.json` reescribe `/api/**` al servicio Cloud Run `att-dfe-api`
 * (no hace falta hardcodear el *.run.app salvo que quieras saltar el proxy).
 */
export function getDfeApiBase() {
  if (typeof window !== "undefined" && window.__ATT_DFE_API_BASE__) {
    return String(window.__ATT_DFE_API_BASE__).replace(/\/$/, "");
  }
  if (
    typeof window !== "undefined" &&
    typeof location !== "undefined" &&
    (location.protocol === "http:" || location.protocol === "https:")
  ) {
    return location.origin.replace(/\/$/, "");
  }
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
