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
