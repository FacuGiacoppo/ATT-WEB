/**
 * IVA mensual y Libro IVA Digital (presentación mes siguiente al período):
 * cinco fechas por mes de período (bloques de terminación de CUIT 0-1, 2-3, 4-5, 6-7, 8-9
 * según el último dígito del CUIT de 11 posiciones).
 *
 * Clave: YYYY-MM del período impositivo (mes devengado), igual que en la app (Mar-2026 → 2026-03).
 * Valor: [ ISO vto bloque 0-1, bloque 2-3, bloque 4-5, bloque 6-7, bloque 8-9 ].
 *
 * Fuente: calendario de referencia 2025-2026 alineado a publicaciones tipo ARCA/estudios
 * (las fechas reales pueden correrse por feriados — siempre validar en SETI / Argentina.gob.ar).
 *
 * Al publicarse nuevos años: ampliar este objeto y, si hace falta, ULTIMO_PERIODO_CALENDARIO_OPERATIVO.
 */
export const IVA_MENSUAL_VENC_POR_PERIODO_IMPOSITIVO = {
  "2025-11": ["2025-12-18", "2025-12-19", "2025-12-22", "2025-12-23", "2025-12-24"],
  "2025-12": ["2026-01-19", "2026-01-20", "2026-01-21", "2026-01-22", "2026-01-23"],
  "2026-01": ["2026-02-18", "2026-02-19", "2026-02-20", "2026-02-23", "2026-02-24"],
  "2026-02": ["2026-03-18", "2026-03-19", "2026-03-20", "2026-03-23", "2026-03-25"],
  "2026-03": ["2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23", "2026-04-24"],
  "2026-04": ["2026-05-18", "2026-05-19", "2026-05-20", "2026-05-21", "2026-05-22"],
  "2026-05": ["2026-06-18", "2026-06-19", "2026-06-22", "2026-06-23", "2026-06-24"],
  "2026-06": ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"],
  "2026-07": ["2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-24"],
  "2026-08": ["2026-09-18", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"],
  "2026-09": ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"],
  "2026-10": ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24"],
  "2026-11": ["2026-12-18", "2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24"]
};

/**
 * @param {string} periodoImpositivoYm - "2026-05"
 * @param {number} ultimoDigitoCuit - 0-9 del CUIT completo; si &lt; 0, se usa el bloque 0-1
 * @returns {string|null} YYYY-MM-DD
 */
export function isoVencimientoIvaMensualPorPeriodo(periodoImpositivoYm, ultimoDigitoCuit) {
  const row = IVA_MENSUAL_VENC_POR_PERIODO_IMPOSITIVO[periodoImpositivoYm];
  if (!row?.length) return null;
  const col = ultimoDigitoCuit < 0 ? 0 : Math.min(4, Math.floor(ultimoDigitoCuit / 2));
  return row[col] || null;
}
