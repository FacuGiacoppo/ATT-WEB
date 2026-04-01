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
            <input id="login-password" type="password" required />
          </label>

          <button type="submit" class="btn-primary login-submit">Ingresar</button>
          <div id="login-error" class="login-error"></div>
        </form>
      </div>
    </div>
  `;
}
