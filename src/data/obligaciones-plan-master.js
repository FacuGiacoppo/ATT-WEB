/**
 * Maestro plan-in: fuente **curada** en `obligaciones-plan-master-curated.js`
 * (generada con `npm run import:maestro` desde Excel).
 */

import { TIPO_OBLIGACION, TIPO_TAREA } from "./obligaciones-catalog.js";
import { CURATED_PLAN_MASTER } from "./obligaciones-plan-master-curated.js";

/** @typedef {'nacional' | 'provincial' | 'municipal' | 'no_aplica'} JurisdiccionPlan */

export const JURISDICCION = {
  NACIONAL: "nacional",
  PROVINCIAL: "provincial",
  MUNICIPAL: "municipal",
  NO_APLICA: "no_aplica",
};

/**
 * Forzar jurisdicción por id (cuando el nombre no alcanza).
 * @type {Record<string, JurisdiccionPlan>}
 */
export const JURISDICCION_BY_ID = {};

/**
 * Excluye rubro o nombre tipo **I - Tissh...** (plan-in).
 */
export function excluirPlanInFila(row) {
  const rub = String(row?.rubro ?? "").trim();
  const nom = String(row?.nombre ?? "").trim();
  if (/I\s*-\s*Tissh/i.test(rub)) return true;
  if (/^I\s*-\s*Tissh/i.test(nom)) return true;
  return false;
}

/** @deprecated usar `excluirPlanInFila` */
export function excluirTareaTissh(nombre) {
  return excluirPlanInFila({ rubro: "", nombre });
}

/**
 * @param {{ organismo?: string, tipo?: string, rubro?: string }} item
 * @returns {JurisdiccionPlan}
 */
export function inferJurisdiccion(item) {
  const id = item?.id;
  if (id && JURISDICCION_BY_ID[id]) return JURISDICCION_BY_ID[id];

  const rubro = String(item?.rubro ?? "").trim();
  if (/^Agentes Recaudacion/i.test(rubro)) return JURISDICCION.PROVINCIAL;
  if (/^DGR\s/i.test(rubro)) return JURISDICCION.PROVINCIAL;
  if (/^IIBB/i.test(rubro)) return JURISDICCION.PROVINCIAL;
  if (/^O\s*-\s*Municipal/i.test(rubro)) return JURISDICCION.MUNICIPAL;

  const org = String(item?.organismo ?? "").trim().toLowerCase();
  if (org === "municipal") return JURISDICCION.MUNICIPAL;
  if (org === "provincial") return JURISDICCION.PROVINCIAL;
  if (org === "iibb") return JURISDICCION.PROVINCIAL;
  if (org === "arca" || org === "afip") return JURISDICCION.NACIONAL;

  if (item?.tipo === TIPO_TAREA) return JURISDICCION.NO_APLICA;

  return JURISDICCION.NACIONAL;
}

/**
 * @param {object} raw
 * @returns {object & { jurisdiccion: JurisdiccionPlan }}
 */
function enrich(raw) {
  const jurisdiccion = raw.jurisdiccion ?? inferJurisdiccion(raw);
  return { ...raw, jurisdiccion };
}

/**
 * Clave de orden primario (rubro plan-in): alfabético `es`, luego `nombre`.
 */
export function planRubroSortKey(item) {
  const r = item?.rubro;
  if (r != null && String(r).trim() !== "") return String(r).trim();
  if (item?.tipo === TIPO_TAREA) {
    return String(item.organismo ?? "Tareas").trim() || "Tareas";
  }
  return String(item.organismo ?? "").trim() || "\uFFFF";
}

function cmpPlanMaster(a, b) {
  const ra = planRubroSortKey(a);
  const rb = planRubroSortKey(b);
  const c = ra.localeCompare(rb, "es", { sensitivity: "base" });
  if (c !== 0) return c;
  return String(a.nombre ?? "").localeCompare(String(b.nombre ?? ""), "es", { sensitivity: "base" });
}

/**
 * Lista única ordenada por rubro (alfabético) y luego por nombre, como plan-in.
 */
export function getPlanMasterCatalog() {
  const all = CURATED_PLAN_MASTER.map(enrich);
  all.sort(cmpPlanMaster);
  return all;
}

/** Compat: tareas del maestro curado. */
export function getTareasPlanMaster() {
  return getPlanMasterCatalog().filter((i) => i.tipo === TIPO_TAREA);
}

export function jurisdiccionLabel(j) {
  if (j === JURISDICCION.NACIONAL) return "Nacional";
  if (j === JURISDICCION.PROVINCIAL) return "Provincial";
  if (j === JURISDICCION.MUNICIPAL) return "Municipal";
  if (j === JURISDICCION.NO_APLICA) return "Programación";
  return "—";
}

export function calcRuleResumen(item) {
  const tipo = item?.tipo;
  const jur = item?.jurisdiccion;
  const r = item?.calcRule;

  if (tipo === TIPO_OBLIGACION && jur === JURISDICCION.MUNICIPAL) {
    return "O · Calendario municipal (definir)";
  }

  if (!r || r.type === "manual") {
    if (tipo === TIPO_TAREA) return "Programable";
    if (r?.nota) return String(r.nota);
    return "Manual / reglas";
  }
  if (r.type === "cuit_arca") return `ARCA · ${r.tabla ?? "tabla"}`;
  if (r.type === "fixed_day") return `Día ${r.dia ?? "?"}`;
  if (r.type === "annual") return `Anual · ${r.mes ?? "?"}/${r.dia ?? "?"}`;
  if (r.type === "semestral") return "Semestral";
  return r.type || "—";
}
