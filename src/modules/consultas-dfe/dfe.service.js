import { getDfeApiBase } from "../../config/dfe-api.js";
import { auth } from "../../config/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

function dfeAuthLog(...args) {
  if (typeof window !== "undefined" && window.__ATT_DEBUG_DFE_AUTH__) {
    console.log("[DFE AUTH]", ...args);
  }
}

if (typeof window !== "undefined") {
  // Helper temporal de debugging para poder extraer token sin UI.
  // Uso en consola: await window.__ATT_DFE_GET_ID_TOKEN__()
  window.__ATT_DFE_GET_ID_TOKEN__ = async () => {
    const u = auth.currentUser;
    if (!u) return null;
    return await u.getIdToken();
  };
}

async function waitForAuthReady({ timeoutMs = 8000 } = {}) {
  if (auth.currentUser) return auth.currentUser;
  dfeAuthLog("auth.currentUser is null; waiting for onAuthStateChanged…");
  return await new Promise((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error("AUTH_NOT_READY_TIMEOUT"));
    }, timeoutMs);
    const unsub = onAuthStateChanged(auth, (u) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      try {
        unsub();
      } catch {}
      resolve(u);
    });
  });
}

async function authHeaders() {
  const u = auth.currentUser || (await waitForAuthReady().catch(() => null));
  if (!u) {
    dfeAuthLog("no firebase user; cannot attach token");
    return { __dfeAuthMissing: "1" };
  }
  const token = await u.getIdToken();
  dfeAuthLog("token ready", { uid: u.uid, email: u.email, tokenLen: String(token || "").length });
  return { Authorization: `Bearer ${token}` };
}

async function parseJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function authedFetch(url, init = {}) {
  const h = await authHeaders();
  if (h.__dfeAuthMissing) {
    const e = new Error("DFE_AUTH_NOT_READY");
    e.code = "DFE_AUTH_NOT_READY";
    throw e;
  }
  const headers = { ...(init.headers || {}), ...h };
  dfeAuthLog("fetch", { url, method: init.method || "GET" });
  const res = await fetch(url, { ...init, headers });
  dfeAuthLog("response", { url, status: res.status });
  return res;
}

export async function assertDfeAuthReady() {
  const u = await waitForAuthReady();
  if (!u) throw new Error("NO_USER");
  await u.getIdToken();
  return true;
}

/**
 * @returns {Promise<{ ok: boolean, status: number, data?: *, error?: string, message?: string, detail?: * }>}
 */
export async function apiGetEstados(cuitRepresentada) {
  const base = getDfeApiBase();
  const q = new URLSearchParams({ cuitRepresentada: String(cuitRepresentada || "").trim() });
  const res = await authedFetch(`${base}/api/dfe/estados?${q}`);
  const body = await parseJson(res);
  return { ok: res.ok && body.ok !== false, status: res.status, ...body };
}

export async function apiPostComunicaciones(payload) {
  const base = getDfeApiBase();
  const res = await authedFetch(`${base}/api/dfe/comunicaciones`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseJson(res);
  return { ok: res.ok && body.ok !== false, status: res.status, ...body };
}

export async function apiPostComunicacionDetalle(payload) {
  const base = getDfeApiBase();
  const res = await authedFetch(`${base}/api/dfe/comunicacion-detalle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseJson(res);
  return { ok: res.ok && body.ok !== false, status: res.status, ...body };
}

export async function apiGetHealth() {
  const base = getDfeApiBase();
  // Health público mínimo: no requiere auth
  const res = await fetch(`${base}/api/dfe/health`);
  const body = await parseJson(res);
  return { ok: res.ok && body.ok !== false, status: res.status, ...body };
}

export async function apiGetHealthAuth() {
  const base = getDfeApiBase();
  const res = await authedFetch(`${base}/api/dfe/health/auth`);
  const body = await parseJson(res);
  return { ok: res.ok && body.ok !== false, status: res.status, ...body };
}

export async function apiPostSyncAll() {
  const base = getDfeApiBase();
  const res = await authedFetch(`${base}/api/dfe/sync`, { method: "POST" });
  const body = await parseJson(res);
  return { ok: res.ok && body.ok !== false, status: res.status, ...body };
}

export async function apiPostSyncClient(payload) {
  const base = getDfeApiBase();
  const res = await authedFetch(`${base}/api/dfe/sync-client`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await parseJson(res);
  return { ok: res.ok && body.ok !== false, status: res.status, ...body };
}
