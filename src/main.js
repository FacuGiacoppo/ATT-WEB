/** Definido en index.html junto al <base> (origen + /repo/). */
function siteBaseForModules() {
  const b = typeof window !== "undefined" ? window.__ATT_SITE_BASE__ : null;
  if (b) return b;
  const parts = location.pathname.split("/").filter(Boolean);
  if (parts.length && /\.html?$/i.test(parts[parts.length - 1])) parts.pop();
  const href = parts.length ? `/${parts.join("/")}/` : "/";
  return `${location.origin}${href}`;
}

/** Misma versión que `main.js` e `index.html` (`window.__ATT_APP_BUILD__`). */
function appBuildVersion() {
  if (typeof window !== "undefined" && window.__ATT_APP_BUILD__) {
    return String(window.__ATT_APP_BUILD__);
  }
  return "20260411-24";
}

function bootstrapModuleUrl() {
  return new URL(`src/app/bootstrap.js?v=${appBuildVersion()}`, siteBaseForModules()).href;
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
    "Si ves <code>Unexpected token '&lt;'</code>, en F12 → Red buscá el primer <code>.js</code> con tipo <strong>documento HTML</strong> (suele ser 404); la URL de abajo es solo el punto de entrada <code>bootstrap.js</code>.</p>";
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
