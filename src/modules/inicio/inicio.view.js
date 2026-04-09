export function renderInicioView() {
  return `
    <section class="page-section inicio-page">
      <div class="req-eyebrow">Bienvenida</div>
      <h1 class="req-title">Inicio</h1>
      <div class="dfe-global-banner is-hidden" id="dfe-home-banner" role="status" aria-live="polite">
        <p class="dfe-global-banner-text" id="dfe-home-banner-text"></p>
        <button type="button" class="dfe-global-banner-cta" data-route="consultas-dfe">Ir a Consultas DFE</button>
      </div>
      <p class="req-subtitle inicio-placeholder">
        Esta sección está en preparación. Pronto verás aquí un resumen útil al ingresar.
      </p>
    </section>
  `;
}
