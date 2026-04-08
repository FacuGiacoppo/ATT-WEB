import { getDfeApiBase } from "../../config/dfe-api.js";
import { auth } from "../../config/firebase.js";

async function authHeaders() {
  const u = auth.currentUser;
  if (!u) return {};
  const token = await u.getIdToken();
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
  const headers = { ...(init.headers || {}), ...h };
  return fetch(url, { ...init, headers });
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
