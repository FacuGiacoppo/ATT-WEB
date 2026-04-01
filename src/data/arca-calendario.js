/**
 * Integración referencial con calendarios de vencimiento ARCA / AFIP.
 * No hay API pública estable para consumir fechas: la fuente de verdad sigue siendo el sitio oficial.
 */

export const ARCA_CALENDARIO_URLS = [
  {
    label: "Vencimientos (AFIP)",
    href: "https://www.afip.gob.ar/vencimientos/",
  },
  {
    label: "Vencimientos (Argentina.gob.ar · ARCA)",
    href: "https://www.argentina.gob.ar/arca/vencimientos",
  },
  {
    label: "Vencimientos sintéticos (SETI)",
    href: "https://seti.afip.gob.ar/av/viewVencimientosSintetica.do",
  },
];

/**
 * Patrón histórico simplificado (un solo día por dígito). El sistema usa además
 * `arca-iva-mensual-calendario.js` para IVA/LID con vencimiento al mes siguiente,
 * donde el día correcto depende del mes del período.
 */
export function diaReferenciaIvaPorTerminacionCuit(ultimoDigito) {
  const d = Number(String(ultimoDigito).replace(/\D/g, "").slice(-1));
  if (Number.isNaN(d)) return null;
  if (d <= 1) return 18;
  if (d <= 3) return 19;
  if (d <= 5) return 20;
  if (d <= 7) return 25;
  return 26;
}

export function ultimoDigitoCuit(cuit) {
  const digits = String(cuit ?? "").replace(/\D/g, "");
  return digits ? digits.slice(-1) : "";
}

/** @param {number} year  @param {number} month 1-12  @param {number} day */
export function toISODate(year, month, day) {
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

/**
 * Arma una fecha ISO usando el día sugerido y el mes/año elegidos (mes de vencimiento declarado).
 */
export function sugerirVencimientoIvaReferencia({ cuit, year, month }) {
  const dig = ultimoDigitoCuit(cuit);
  const dia = diaReferenciaIvaPorTerminacionCuit(dig);
  if (dia == null || !year || !month) return null;
  const dim = new Date(year, month, 0).getDate();
  const safeDay = Math.min(dia, dim);
  return toISODate(year, month, safeDay);
}
