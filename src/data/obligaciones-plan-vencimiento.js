/**
 * Vencimiento de referencia para obligaciones plan-in (motor ARCA / tablas ATT).
 * Usa el período impositivo **mes anterior** al actual como referencia para obligaciones mensuales.
 * Las tablas **cuit_arca** aplican el día según la **terminación del CUIT** (como ARCA).
 */
import { TIPO_OBLIGACION } from "./obligaciones-catalog.js";
import { ultimoDigitoCuit } from "./arca-calendario.js";
import { calcularVencimiento, monthInputToPeriodo } from "./vencimientos-engine.js";

const SIN_DETERMINAR = "Sin determinar";

/** Período tipo "Mar-2026" para motor de vencimientos. */
export function periodoImpositivoReferenciaMensual() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return monthInputToPeriodo(ym);
}

/**
 * @param {{ tipo?: string, calcRule?: object }} item
 * @param {string} cuitRaw
 * @returns {{ texto: string, hint: string }}
 */
export function vencimientoReferenciaPlanIn(item, cuitRaw) {
  if (!item) {
    return { texto: SIN_DETERMINAR, hint: "" };
  }
  if (item.tipo !== TIPO_OBLIGACION) {
    return { texto: SIN_DETERMINAR, hint: "Las tareas se programan aparte (sin vencimiento fiscal automático aquí)." };
  }
  const rule = item.calcRule;
  if (!rule || rule.type === "manual") {
    return {
      texto: SIN_DETERMINAR,
      hint: "Sin cálculo automático en ATT (provincial, municipal u otro calendario).",
    };
  }
  const cuit = String(cuitRaw ?? "").replace(/\D/g, "");
  const periodo = periodoImpositivoReferenciaMensual();
  const res = calcularVencimiento(rule, periodo, cuit);
  if (!res.iso) {
    return { texto: SIN_DETERMINAR, hint: res.advertencia || "No se pudo calcular el vencimiento con los datos actuales." };
  }
  const [y, m, d] = res.iso.split("-");
  let hint = res.advertencia || "";
  if (rule.type === "cuit_arca" && cuit.length === 11) {
    const dig = ultimoDigitoCuit(cuit);
    const arcaHint = `Día según terminación de CUIT (${dig}) y tabla «${rule.tabla ?? "ARCA"}» en ATT (referencia; verificar en ARCA).`;
    hint = hint ? `${hint} ${arcaHint}` : arcaHint;
  } else if (rule.type === "cuit_arca") {
    const arcaHint =
      "Sin CUIT de 11 dígitos en la ficha del cliente: se usa el día mínimo de la tabla. Cargá el CUIT para el bloque correcto (ARCA por terminación).";
    hint = hint ? `${hint} ${arcaHint}` : arcaHint;
  }
  return {
    texto: `${d}/${m}/${y}`,
    hint: hint || "Referencia según tablas/calendario cargado en ATT. Verificar en ARCA/organismo.",
  };
}
