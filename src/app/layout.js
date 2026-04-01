import { renderTopbar } from "../components/topbar.js";
import { renderSidebar } from "../components/sidebar.js";

export function renderAppLayout() {
  return `
    <div class="app-shell">
      ${renderSidebar()}
      <div class="app-main">
        ${renderTopbar()}
        <main id="main-content" class="app-content"></main>
      </div>
    </div>
  `;
}
