export function openInfoModal(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title">Listo</h3>
          <button class="modal-close" id="modal-info-close">✕</button>
        </div>
        <div class="modal-body">
          <p style="margin:0;font-size:15px;color:var(--ink);line-height:1.5">${message}</p>
        </div>
        <div class="modal-footer">
          <button class="btn-primary" id="modal-info-ok">Aceptar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); resolve(); };
    overlay.querySelector("#modal-info-ok").addEventListener("click", close);
    overlay.querySelector("#modal-info-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  });
}

export function renderModal({ title, body, footer = "" }) {
  return `
    <div class="modal-overlay" id="app-modal-overlay">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <button class="modal-close" data-action="close-modal">✕</button>
        </div>
        <div class="modal-body">
          ${body}
        </div>
        ${
          footer
            ? `
          <div class="modal-footer">
            ${footer}
          </div>
        `
            : ""
        }
      </div>
    </div>
  `;
}
