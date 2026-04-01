/**
 * Motor de cálculo de vencimientos.
 * Dado un calcRule del catálogo, un período y el CUIT del cliente,
 * devuelve la fecha de vencimiento ISO (YYYY-MM-DD) y una advertencia opcional.
 *
 * IMPORTANTE: Las fechas son referenciales basadas en los calendarios oficiales
 * vigentes. Siempre verificar en el sitio de ARCA/AFIP y organismos provinciales
 * porque pueden ajustarse por feriados o resoluciones.
 *
 * Obligaciones: el período cargado es el impositivo «vencido» respecto del vencimiento
 * (p. ej. IVA con período Mar-2026 vence en abril vía offsetMeses). Las tareas usan
 * selector explícito de tipo de período; las obligaciones no — ver tipoPeriodoImplicitoObligacion.
 */

import { isoVencimientoIvaMensualPorPeriodo } from "./arca-iva-mensual-calendario.js";

// ─── Tablas de días por terminación de CUIT (índice = último dígito, 0-9) ─────
// Nota: IVA mensual / Libro IVA con offset 1 mes usa primero arca-iva-mensual-calendario.js
// (días distintos por mes de período); esta fila es respaldo fuera de ese calendario.

const TABLAS = {
  // Respaldo IVA mensual (día fijo clásico por dígito) si no hay fila mensual cargada
  iva:                      [18, 18, 19, 19, 20, 20, 25, 25, 26, 26],

  // Autónomos (mes siguiente al período)
  autonomos:                [ 3,  3,  4,  4,  5,  5,  6,  6,  7,  7],

  // SICORE / Retenciones IVA (mes siguiente)
  sicore:                   [15, 15, 16, 16, 17, 17, 22, 22, 23, 23],

  // Cargas Sociales / F.931 (mes siguiente)
  cargas_sociales:          [10, 10, 11, 11, 12, 12, 13, 13, 16, 16],

  // Anticipos de Ganancias (mes siguiente)
  anticipos:                [13, 13, 14, 14, 15, 15, 16, 16, 17, 17],

  // Anticipos de Bienes Personales
  anticipos_bp:             [16, 16, 17, 17, 18, 18, 19, 19, 20, 20],

  // DDJJ Anual Ganancias Personas Físicas / Jurídicas (junio)
  ganancias_anual:          [13, 13, 14, 14, 15, 15, 16, 16, 17, 17],

  // DDJJ Anual Bienes Personales (junio)
  bienes_personales_anual:  [14, 14, 15, 15, 16, 16, 17, 17, 18, 18],

  // Convenio Multilateral Mensual
  cm_mensual:               [15, 15, 18, 18, 19, 19, 20, 20, 20, 20],

  // IIBB Local Salta (mayoritariamente día 16)
  iibb_salta:               [16, 16, 16, 16, 16, 16, 16, 16, 16, 16],
};

// ─── Nombres de meses ──────────────────────────────────────────────────────────

const MESES_CORTO = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MESES_LOWER = { ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,oct:10,nov:11,dic:12 };

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Construye una fecha ISO segura (ajusta si el día supera los días del mes).
 * @param {number} anio
 * @param {number} mes 1-12
 * @param {number} dia
 * @returns {string} "YYYY-MM-DD"
 */
function toISO(anio, mes, dia) {
  const dim  = new Date(anio, mes, 0).getDate(); // días en el mes
  const safe = Math.min(dia, dim);
  return `${anio}-${String(mes).padStart(2,"0")}-${String(safe).padStart(2,"0")}`;
}

/**
 * Suma N meses a un objeto { mes, anio }.
 */
function addMeses(base, n) {
  let mes  = base.mes  + n;
  let anio = base.anio;
  while (mes > 12) { mes -= 12; anio++; }
  while (mes <  1) { mes += 12; anio--; }
  return { mes, anio };
}

/**
 * Lista de períodos en formato "YYYY-MM" desde el mes inicial (inclusive), N meses.
 * @param {string} startYm  "2026-03" o "Mar-2026"
 */
export function enumerateMonthsYm(startYm, count) {
  const p = parsePeriodo(startYm);
  if (!p?.mes) return [];
  let { mes, anio } = p;
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(`${anio}-${String(mes).padStart(2, "0")}`);
    const n = addMeses({ mes, anio }, 1);
    mes = n.mes;
    anio = n.anio;
  }
  return out;
}

/**
 * Meses consecutivos en YYYY-MM desde startYm hasta endYmInclusive (inclusive).
 * Si el inicio es posterior al fin, devuelve [].
 */
export function enumerateMonthsYmInclusiveRange(startYm, endYmInclusive) {
  const pStart = parsePeriodo(startYm);
  const pEnd = parsePeriodo(endYmInclusive);
  if (!pStart?.mes || !pEnd?.mes) return [];
  const endKey = pEnd.anio * 12 + pEnd.mes;
  let anio = pStart.anio;
  let mes = pStart.mes;
  const out = [];
  for (;;) {
    const curKey = anio * 12 + mes;
    if (curKey > endKey) break;
    out.push(`${anio}-${String(mes).padStart(2, "0")}`);
    if (curKey === endKey) break;
    const n = addMeses({ mes, anio }, 1);
    anio = n.anio;
    mes = n.mes;
  }
  return out;
}

/**
 * Obtiene el último dígito numérico del CUIT.
 * @returns {number} 0-9, o -1 si no hay CUIT válido
 */
function ultimoDigito(cuit) {
  const digits = String(cuit ?? "").replace(/\D/g, "");
  return digits.length ? parseInt(digits.slice(-1), 10) : -1;
}

// ─── Parseo de período ─────────────────────────────────────────────────────────

/**
 * Convierte un string de período a { mes: number|null, anio: number }.
 * Formatos aceptados:
 *   "Mar-2026"  → { mes: 3, anio: 2026 }
 *   "2026-03"   → { mes: 3, anio: 2026 }  (valor de <input type="month">)
 *   "2025"      → { mes: null, anio: 2025 } (período anual)
 */
export function parsePeriodo(str) {
  if (!str) return null;
  const s = str.trim();

  // "Mar-2026" (texto con nombre de mes)
  const mMatch = s.match(/^([a-záéíóúü]{3})-(\d{4})$/i);
  if (mMatch) {
    const mes = MESES_LOWER[mMatch[1].toLowerCase()];
    return mes ? { mes, anio: parseInt(mMatch[2], 10) } : null;
  }

  // "2026-03" (formato ISO de input type=month)
  const isoMatch = s.match(/^(\d{4})-(\d{2})$/);
  if (isoMatch) {
    const mes = parseInt(isoMatch[2], 10);
    return (mes >= 1 && mes <= 12) ? { mes, anio: parseInt(isoMatch[1], 10) } : null;
  }

  // "2025" (anual)
  const yMatch = s.match(/^(\d{4})$/);
  if (yMatch) return { mes: null, anio: parseInt(yMatch[1], 10) };

  return null;
}

/**
 * Convierte "Mar-2026" → "2026-03" (para usar en <input type="month">).
 */
export function periodoToMonthInput(periodo) {
  const m = (periodo || "").trim().match(/^([a-záéíóúü]{3})-(\d{4})$/i);
  if (!m) return "";
  const mes = MESES_LOWER[m[1].toLowerCase()];
  return mes ? `${m[2]}-${String(mes).padStart(2,"0")}` : "";
}

/**
 * Convierte "2026-03" → "Mar-2026" (para almacenar en Firestore).
 */
export function monthInputToPeriodo(value) {
  if (!value) return "";
  const [y, m] = value.split("-").map(Number);
  return (y && m && m >= 1 && m <= 12) ? `${MESES_CORTO[m - 1]}-${y}` : value;
}

// ─── Motor principal ───────────────────────────────────────────────────────────

/**
 * Calcula el vencimiento para una obligación del catálogo.
 *
 * @param {object} calcRule  - regla de cálculo del catálogo
 * @param {string} periodoStr - string del período (ej: "Mar-2026", "2026-03", "2025")
 * @param {string} cuit       - CUIT del cliente
 * @returns {{ iso: string|null, advertencia: string|null }}
 */
export function calcularVencimiento(calcRule, periodoStr, cuit) {
  if (!calcRule || calcRule.type === "manual") {
    return {
      iso: null,
      advertencia: "Esta obligación requiere fecha de vencimiento manual."
    };
  }

  const periodo = parsePeriodo(periodoStr);
  if (!periodo && calcRule.type !== "annual" && calcRule.type !== "semestral") {
    return {
      iso: null,
      advertencia: "Período no reconocido. Ingresá el período para calcular."
    };
  }

  const dCuit    = ultimoDigito(cuit);
  const sinCuit  = dCuit < 0;

  switch (calcRule.type) {

    // ── Día según terminación de CUIT ──────────────────────────
    case "cuit_arca": {
      const tabla = TABLAS[calcRule.tabla];
      if (!tabla) return { iso: null, advertencia: "Tabla de vencimientos no encontrada." };

      const dia = sinCuit ? tabla[0] : tabla[dCuit];

      if (calcRule.esAnual) {
        // Obligación anual: el mes de vencimiento está fijo en calcRule.mesAnual
        // El año de vencimiento es el mismo año del período (o el siguiente si el mes ya pasó)
        const anioBase = periodo ? periodo.anio : new Date().getFullYear();
        const vencAnio = anioBase + 1; // las anuales vencen el año siguiente al período
        return {
          iso: toISO(vencAnio, calcRule.mesAnual, dia),
          advertencia: sinCuit
            ? "CUIT no cargado: se usó el día mínimo. Cargá el CUIT en la ficha del cliente para mayor precisión."
            : "Fecha referencial. Verificar en calendario oficial ARCA."
        };
      }

      // IVA mensual / Libro IVA (un mes después): calendario por período + bloque de CUIT
      if (
        calcRule.tabla === "iva" &&
        (calcRule.offsetMeses ?? 1) === 1 &&
        periodo?.mes
      ) {
        const periodoYm = `${periodo.anio}-${String(periodo.mes).padStart(2, "0")}`;
        const isoCal = isoVencimientoIvaMensualPorPeriodo(periodoYm, sinCuit ? -1 : dCuit);
        if (isoCal) {
          return {
            iso: isoCal,
            advertencia: sinCuit
              ? "Sin CUIT: se usó el vencimiento del bloque 0-1. Cargá el CUIT para el bloque correcto."
              : "Fecha según calendario IVA mensual cargado (referencia ARCA). Verificá feriados en el sitio oficial."
          };
        }
      }

      // Obligación mensual (otras tablas ARCA, IVA con offset ≠ 1, o sin fila mensual IVA)
      const base  = periodo ?? { mes: new Date().getMonth() + 1, anio: new Date().getFullYear() };
      const venc  = addMeses(base, calcRule.offsetMeses ?? 1);
      const advBase = sinCuit
        ? "CUIT no cargado: se usó el día mínimo de la tabla. Cargá el CUIT en la ficha del cliente."
        : null;
      const advFuera =
        calcRule.tabla === "iva" && (calcRule.offsetMeses ?? 1) === 1
          ? "Período sin fila en calendario IVA detallado: día estimado por tabla fija; confirmá en ARCA."
          : "";
      return {
        iso: toISO(venc.anio, venc.mes, dia),
        advertencia: [advBase, advFuera].filter(Boolean).join(" ") || null
      };
    }

    // ── Día fijo del mes ───────────────────────────────────────
    case "fixed_day": {
      const base = periodo ?? { mes: new Date().getMonth() + 1, anio: new Date().getFullYear() };
      const venc = addMeses(base, calcRule.offsetMeses ?? 0);
      const nota = calcRule.nota === "quincenal" ? " (primera quincena — obligación quincenal)" : "";
      return {
        iso: toISO(venc.anio, venc.mes, calcRule.dia),
        advertencia: nota ? `Fecha calculada${nota}.` : null
      };
    }

    // ── Fecha fija anual ───────────────────────────────────────
    case "annual": {
      const anioBase  = periodo ? periodo.anio : new Date().getFullYear();
      return {
        iso: toISO(anioBase, calcRule.mes, calcRule.dia),
        advertencia: null
      };
    }

    // ── Semestral (dos fechas por año) ─────────────────────────
    case "semestral": {
      const now    = new Date();
      const anio   = now.getFullYear();
      // Devolver la próxima fecha semestral a partir de hoy
      let nearest  = null;
      for (const mes of calcRule.meses) {
        const iso = toISO(anio, mes, calcRule.dia);
        const fut = toISO(anio + 1, mes, calcRule.dia); // también el año siguiente
        const candidate = iso >= now.toISOString().slice(0, 10) ? iso : fut;
        if (!nearest || candidate < nearest) nearest = candidate;
      }
      return {
        iso: nearest,
        advertencia: "Obligación semestral — se muestra la próxima fecha."
      };
    }

    default:
      return { iso: null, advertencia: "Tipo de regla no reconocido." };
  }
}

/**
 * Cómo se interpreta el período para obligaciones del catálogo (no hay selector en UI: es implícito).
 * Alineado al motor: p. ej. IVA período Mar-2026 → vencimiento en abril = "Mes vencido".
 */
export function tipoPeriodoImplicitoObligacion(calcRule) {
  if (!calcRule || calcRule.type === "manual") return null;
  switch (calcRule.type) {
    case "semestral":
      return "Semestre vencido";
    case "annual":
      return "Año vencido";
    case "cuit_arca":
      if (calcRule.esAnual) return "Año vencido";
      return "Mes vencido";
    case "fixed_day":
      return (calcRule.offsetMeses ?? 0) >= 1 ? "Mes vencido" : "Mes vto";
    default:
      return "Mes vencido";
  }
}
