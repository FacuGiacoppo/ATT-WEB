function showModuleLoadError(err) {
  console.error(err);
  const root = document.getElementById("app");
  if (!root) return;
  const section = document.createElement("section");
  section.className = "page-section boot-fatal";
  section.innerHTML =
    "<h1 class=\"boot-fatal-title\">No se pudieron cargar los módulos</h1>" +
    "<p class=\"boot-fatal-hint\">Serví la carpeta con <code>npm run start</code> y abrí <strong>http://localhost:3000</strong> (no uses <code>file://</code>). En Safari: menú <strong>Desarrollo → Consola JavaScript</strong>.</p>";
  const pre = document.createElement("pre");
  pre.className = "boot-fatal-pre";
  pre.textContent = err?.stack || err?.message || String(err);
  section.appendChild(pre);
  root.innerHTML = "";
  root.appendChild(section);
}

import("./app/bootstrap.js")
  .then(({ bootstrapApp }) => {
    bootstrapApp();
  })
  .catch(showModuleLoadError);
