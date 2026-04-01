/**
 * Límites operativos: hasta qué período damos vencimientos automáticos (tablas en vencimientos-engine)
 * y horizonte de tareas.
 *
 * Cuando AFIP/ARCA (u organismo provincial) publiquen el calendario del año siguiente,
 * actualizar ULTIMO_PERIODO_CALENDARIO_OPERATIVO, el objeto en arca-iva-mensual-calendario.js
 * (IVA mensual / Libro IVA offset 1) y las TABLAS de respaldo en vencimientos-engine.js si cambian.
 */

import { parsePeriodo } from "./vencimientos-engine.js";

/** Último mes impositivo (YYYY-MM) con calendario/tabla cargada en el sistema. Inclusive. */
export const ULTIMO_PERIODO_CALENDARIO_OPERATIVO = "2026-12";

/** Meses desde el mes actual que se permiten planificar tareas (48 ≈ 4 años). */
export const TAREAS_HORIZONTE_MESES = 48;

function parseYmStrict(ym) {
  const s = String(ym || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return { y, m: mo };
}

/** Normaliza período (2026-03 o Mar-2026) a YYYY-MM. */
export function periodoA_Ym(periodoStr) {
  const s = String(periodoStr || "").trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const p = parsePeriodo(s);
  if (!p?.mes) return null;
  return `${p.anio}-${String(p.mes).padStart(2, "0")}`;
}

/**
 * Compara dos cadenas YYYY-MM.
 * @returns {number} negativo si a<b, 0 igual, positivo si a>b; NaN si inválido
 */
export function compareYmStrings(ymA, ymB) {
  const a = parseYmStrict(ymA);
  const b = parseYmStrict(ymB);
  if (!a || !b) return NaN;
  return a.y * 12 + a.m - (b.y * 12 + b.m);
}

export function ultimoMesPermitidoTareasYm() {
  const d = new Date();
  let y = d.getFullYear();
  let mo = d.getMonth() + 1;
  for (let i = 0; i < TAREAS_HORIZONTE_MESES; i++) {
    mo++;
    if (mo > 12) {
      mo = 1;
      y++;
    }
  }
  return `${y}-${String(mo).padStart(2, "0")}`;
}

export function ultimaFechaPermitidaTareasIso() {
  const ym = ultimoMesPermitidoTareasYm();
  const p = parseYmStrict(ym);
  if (!p) return "2099-12-31";
  const last = new Date(p.y, p.m, 0).getDate();
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

export function validarPeriodoObligacionVsCalendario(periodoRaw) {
  const ym = periodoA_Ym(periodoRaw);
  if (!ym) return { ok: false, mensaje: "Período no válido." };
  const c = compareYmStrings(ym, ULTIMO_PERIODO_CALENDARIO_OPERATIVO);
  if (Number.isNaN(c) || c > 0) {
    return {
      ok: false,
      mensaje: `El calendario fiscal cargado llega hasta ${ULTIMO_PERIODO_CALENDARIO_OPERATIVO}. No se pueden dar de alta obligaciones con período posterior (cada vencimiento debe salir del calendario/tabla actual).`
    };
  }
  return { ok: true, ym };
}

export function validarTareaPeriodoYVencimiento(periodoRaw, vencimientoIso) {
  const ym = periodoA_Ym(periodoRaw);
  if (!ym) return "Período no válido.";
  const maxYm = ultimoMesPermitidoTareasYm();
  if (compareYmStrings(ym, maxYm) > 0) {
    return `Las tareas se pueden cargar hasta ${maxYm} (${TAREAS_HORIZONTE_MESES} meses desde el mes actual).`;
  }
  const v = String(vencimientoIso || "").slice(0, 10);
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const maxIso = ultimaFechaPermitidaTareasIso();
    if (v > maxIso) {
      return `El vencimiento no puede ser posterior a ${maxIso} (tope del horizonte de tareas).`;
    }
  }
  return null;
}
