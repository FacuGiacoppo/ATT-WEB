/** Opciones de programación para tareas (formulario + importación). */

export const TIPOS_PERIODO = [
  "Mes vto",
  "Mes vencido",
  "Mes adelantado",
  "Año vto",
  "Año vencido",
  "Año adelantado",
  "Semestre vencido"
];

export const TIPOS_PROGRAMACION = [
  "Día del año",
  "Días del mes",
  "Días de la semana",
  "Primer día hábil del mes",
  "Último día hábil del mes",
  "Un día fijo",
  "Varios días fijos"
];

const PROG_ETIQUETA_LEGACY = new Map([
  ["primer dia habil", "Primer día hábil del mes"],
  ["ultimo dia habil", "Último día hábil del mes"]
]);

/** Acepta etiquetas nuevas y las antiguas (planillas ya cargadas). */
export function coincideTipoProgramacion(valor) {
  const direct = coincideTipoPermitido(valor, TIPOS_PROGRAMACION);
  if (direct) return direct;
  const leg = PROG_ETIQUETA_LEGACY.get(normalizaEtiqueta(valor));
  return leg ?? null;
}

export function esNombreTareaPlanIn(obligacion) {
  return /^[ACILS] ?-/i.test(String(obligacion ?? "").trim());
}

/** Coincidencia flexible para validar columnas importadas (trim + sin acentos). */
export function normalizaEtiqueta(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function coincideTipoPermitido(valor, permitidos) {
  const n = normalizaEtiqueta(valor);
  return permitidos.find((p) => normalizaEtiqueta(p) === n) ?? null;
}
