export const OUTLOOK_AUTH = {
  /**
   * Requerido.
   * Registrar una app en Azure Portal (Entra ID) y pegar acá el Application (client) ID.
   * Debe permitir cuentas Microsoft personales (consumers) o common, y permiso delegado Mail.Send.
   */
  clientId: "",

  /** Sugerido para cuentas @outlook.com */
  authority: "https://login.microsoftonline.com/consumers",

  /** Debe estar registrado como Redirect URI en la app de Microsoft */
  redirectUri: window.location.origin,

  /** Permisos mínimos para enviar mail con Graph (delegado) */
  scopes: ["Mail.Send", "offline_access", "openid", "profile", "email"],
};

