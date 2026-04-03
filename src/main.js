function showModuleLoadError(err) {
  console.error(err);
  const root = document.getElementById("app");
  if (!root) return;
  const section = document.createElement("section");
  section.className = "page-section boot-fatal";
  section.innerHTML =
    "<h1 class=\"boot-fatal-title\">No se pudieron cargar los módulos</h1>" +
    "<p class=\"boot-fatal-hint\">Local: <code>npm run start</code> y <strong>http://localhost:3000</strong> (no <code>file://</code>). " +
    "GitHub Pages: activá Pages en la rama correcta y abrí la URL del repo (<code>…github.io/nombre-repo/</code>). " +
    "Si el error dice <code>Unexpected token '&lt;'</code>, suele ser una ruta mal resuelta: recargá con la barra final o revisá la consola (F12) qué URL de .js falla.</p>";
  const pre = document.createElement("pre");
  pre.className = "boot-fatal-pre";
  pre.textContent = err?.stack || err?.message || String(err);
  section.appendChild(pre);
  root.innerHTML = "";
  root.appendChild(section);
}

// Resolver respecto a este archivo (funciona en GitHub Pages /nombre-repo/ aunque el <base> falle).
const bootstrapUrl = new URL("./app/bootstrap.js", import.meta.url).href;
import(bootstrapUrl)
  .then(({ bootstrapApp }) => {
    bootstrapApp();
  })
  .catch(showModuleLoadError);
