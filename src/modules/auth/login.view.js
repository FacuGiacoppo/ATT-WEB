export function renderLoginView() {
  return `
    <div class="login-screen">
      <div class="login-card">
        <div class="login-brand">ESTUDIO-ATT</div>
        <h1 class="login-title">Bienvenido</h1>
        <p class="login-subtitle">Ingresá con tu cuenta para continuar</p>

        <form id="login-form" class="login-form">
          <label class="login-label">
            <span>Email</span>
            <input id="login-email" type="email" required />
          </label>

          <label class="login-label">
            <span>Contraseña</span>
            <div class="login-password-wrap">
              <input id="login-password" type="password" required />
              <button type="button" id="login-toggle-pw" class="login-toggle-pw" aria-label="Mostrar contraseña">
                <svg id="login-eye-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
          </label>

          <button type="submit" class="btn-primary login-submit">Ingresar</button>
          <div id="login-error" class="login-error"></div>
        </form>
      </div>
    </div>
  `;
}
