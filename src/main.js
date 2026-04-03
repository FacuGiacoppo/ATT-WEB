/**
 * Misma lógica que el <base> del index: prefijo del sitio (ej. /ATT-WEB/).
 * En GitHub Pages import.meta.url a veces no coincide; location sí.
 */
function sitePathPrefix() {
  const parts = location.pathname.split("/").filter(Boolean);
  if (parts.length && /\.html?$/i.test(parts[parts.length - 1])) parts.pop();
  return parts.length ? `/${parts.join("/")}/` : "/";
}

function bootstrapModuleUrl() {
  const base = `${location.origin}${sitePathPrefix()}`;
  return new URL("src/app/bootstrap.js", base).href;
}

function showModuleLoadError(err) {
  console.error(err);
  const root = document.getElementById("app");
  if (!root) return;
  const section = document.createElement("section");
  section.className = "page-section boot-fatal";
  section.innerHTML =
    "<h1 class=\"boot-fatal-title\">No se pudieron cargar los módulos</h1>" +
    "<p class=\"boot-fatal-hint\">Local: <code>npm run start</code> y <strong>http://localhost:3000</strong> (no <code>file://</code>). " +
    "GitHub Pages: la carpeta <code>src/</code> tiene que estar en la rama que publica Pages. " +
    "Si ves <code>Unexpected token '&lt;'</code>, en F12 → Red verificá que <code>bootstrap.js</code> sea JS (200), no HTML.</p>";
  const pre = document.createElement("pre");
  pre.className = "boot-fatal-pre";
  const tried = bootstrapModuleUrl();
  pre.textContent = [err?.message || String(err), "", "URL intentada:", tried].join("\n");
  section.appendChild(pre);
  root.innerHTML = "";
  root.appendChild(section);
}

import(bootstrapModuleUrl())
  .then(({ bootstrapApp }) => {
    bootstrapApp();
  })
  .catch(showModuleLoadError);
