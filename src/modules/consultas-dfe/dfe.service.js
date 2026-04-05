import { getDfeApiBase } from "../../config/dfe-api.js";

async function parseJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/**
 * @returns {Promise<{ ok: boolean, status: number, data?: *, error?: string, message?: string, detail?: * }>}
 */
export async function apiGetEstados(cuitRepresentada) {
  const base = getDfeApiBase();
  const q = new URLSearchParams({ cuitRepresentada: String(cuitRepresentada || "").trim() });
  const res = await fetch(`${base}/api/dfe/estados?${q}`);
  const body = await parseJson(res);
  return { ok: res.ok && body.ok !== false, status: res.status, ...body };
}

export async function apiPostComunicaciones(payload) {
  const base = getDfeApiBase();
  const res = await fetch(`${base}/api/dfe/comunicaciones`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseJson(res);
  return { ok: res.ok && body.ok !== false, status: res.status, ...body };
}

export async function apiPostComunicacionDetalle(payload) {
  const base = getDfeApiBase();
  const res = await fetch(`${base}/api/dfe/comunicacion-detalle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseJson(res);
  return { ok: res.ok && body.ok !== false, status: res.status, ...body };
}

export async function apiGetHealth() {
  const base = getDfeApiBase();
  const res = await fetch(`${base}/api/dfe/health`);
  const body = await parseJson(res);
  return { ok: res.ok && body.ok !== false, status: res.status, ...body };
}
