import { OUTLOOK_AUTH } from "../../config/outlook.js";

function assertMsalAvailable() {
  if (!window.msal || !window.msal.PublicClientApplication) {
    throw new Error(
      "No se cargó MSAL. Verificá que index.html incluya @azure/msal-browser y recargá la página."
    );
  }
}

function assertConfigured() {
  if (!OUTLOOK_AUTH?.clientId) {
    throw new Error(
      "Falta configurar OUTLOOK_AUTH.clientId en src/config/outlook.js (Azure App Registration)."
    );
  }
}

let pca = null;

function getPca() {
  assertMsalAvailable();
  assertConfigured();
  if (pca) return pca;
  pca = new window.msal.PublicClientApplication({
    auth: {
      clientId: OUTLOOK_AUTH.clientId,
      authority: OUTLOOK_AUTH.authority,
      redirectUri: OUTLOOK_AUTH.redirectUri,
    },
    cache: {
      cacheLocation: "localStorage",
      storeAuthStateInCookie: false,
    },
  });
  return pca;
}

async function getAccessToken() {
  const app = getPca();
  const accounts = app.getAllAccounts();
  const account = accounts?.[0] ?? null;

  const req = {
    scopes: OUTLOOK_AUTH.scopes,
    account,
  };

  try {
    const res = await app.acquireTokenSilent(req);
    return res.accessToken;
  } catch (e) {
    const res = await app.acquireTokenPopup({
      scopes: OUTLOOK_AUTH.scopes,
      prompt: "select_account",
    });
    return res.accessToken;
  }
}

/**
 * Envía un correo desde la cuenta Microsoft del usuario (delegado).
 * @returns {Promise<void>}
 */
export async function sendMailGraph({ to, subject, bodyText }) {
  const token = await getAccessToken();
  const toRecipients = (to ?? [])
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));

  if (!toRecipients.length) {
    throw new Error("No hay destinatarios con email.");
  }

  const payload = {
    message: {
      subject: subject || "",
      body: {
        contentType: "Text",
        content: bodyText || "",
      },
      toRecipients,
    },
  };

  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 202) return;
  const text = await res.text().catch(() => "");
  throw new Error(`Graph sendMail falló (${res.status}). ${text || ""}`.trim());
}

