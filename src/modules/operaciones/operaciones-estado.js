/** Estado inicial al crear/importar: Pendiente si vence hoy o después; Vencido si ya pasó. */

export function estadoInicialSegunVencimiento(vencimientoIso) {
  const s = String(vencimientoIso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "Pendiente";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = s.split("-").map(Number);
  const vd = new Date(y, m - 1, d);
  return vd < today ? "Vencido" : "Pendiente";
}
