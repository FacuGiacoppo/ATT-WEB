import { loginWithEmail } from "./auth.service.js";
import { setAuthenticatedUser } from "../../app/bootstrap.js";

function getFriendlyError(code) {
  const messages = {
    USER_PROFILE_NOT_FOUND: "El usuario existe en Auth pero no tiene perfil en Firestore.",
    USER_INACTIVE: "Tu usuario está inactivo. Contactá al administrador.",
    auth_invalid_credential: "Email o contraseña incorrectos.",
    auth_user_not_found: "Usuario no encontrado.",
    auth_wrong_password: "Contraseña incorrecta.",
    auth_invalid_email: "El email no es válido.",
    default: "No se pudo iniciar sesión."
  };

  return messages[code] ?? messages.default;
}

export function bindAuthEvents() {
  document.addEventListener("click", (event) => {
    const btn = event.target.closest("#login-toggle-pw");
    if (!btn) return;
    const input = document.getElementById("login-password");
    const icon = document.getElementById("login-eye-icon");
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
    if (icon) {
      icon.innerHTML = show
        ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
           <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
           <line x1="1" y1="1" x2="23" y2="23"/>`
        : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
           <circle cx="12" cy="12" r="3"/>`;
    }
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("#login-form");
    if (!form) return;

    event.preventDefault();

    const email = document.getElementById("login-email")?.value?.trim();
    const password = document.getElementById("login-password")?.value ?? "";
    const errorBox = document.getElementById("login-error");
    const submitBtn = form.querySelector("button[type='submit']");

    if (errorBox) errorBox.textContent = "";
    if (submitBtn) submitBtn.disabled = true;

    try {
      const user = await loginWithEmail(email, password);
      await setAuthenticatedUser(user);
    } catch (error) {
      const errorCode = (error?.code || error?.message || "default")
        .replaceAll("/", "_")
        .replaceAll("-", "_");

      if (errorBox) {
        errorBox.textContent = getFriendlyError(errorCode);
      }

      console.error(error);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
