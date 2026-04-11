/**
 * Obligaciones tipo plan-in (Rubro + Impuesto) desde capturas.
 * Solo filas **sin tachar**. Orden al cargar: se deduplica por rubro+nombre.
 */

import { TIPO_OBLIGACION } from "./obligaciones-catalog.js";

const r = (rubro, nombre) => ({ rubro: String(rubro).trim(), nombre: String(nombre).trim() });

function dedupe(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const k = `${row.rubro}|${row.nombre}`.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}

/** Rubro IIBB unificado para filas cuyo rubro venía vacío en captura */
const IIBB = "IIBB";

const RAW = [
  // —— Agentes recaudación (captura 1 + 2, sin tachados) ——
  r("Agentes Recaudacion ARBA", "Percepciones iibb Bs As Reg Gral Quincenal"),
  r("Agentes Recaudacion ARBA", "Percepciones iibb Bs As Reg Gral"),
  r("Agentes Recaudacion ARBA", "Retenciones iibb Bs As Reg Gral"),
  r("Agentes Recaudacion ARBA", "Retenciones iibb Bs As Reg Gral Quincenal"),
  r("Agentes Recaudacion ARBA", "Retenciones Actividades Agropecuarias ARBA"),
  r("Agentes Recaudacion ARBA", "Retenciones Constructoras ARBA"),
  r("Agentes Recaudacion Catamarca", "Agentes Ret-Perc iibb Catamarca"),
  r("Agentes Recaudacion Chaco", "Agentes Ret-Perc iibb Chaco"),
  r("Agentes Recaudacion Cordoba", "Agentes Ret-Perc iibb Cordoba Mensual"),
  r("Agentes Recaudacion Cordoba", "Agentes Ret-Perc iibb Cordoba Quincenal"),
  r("Agentes Recaudacion Corrientes", "Agentes Percepcion iibb Corrientes"),
  r("Agentes Recaudacion Corrientes", "Agentes Retencion iibb Corrientes"),
  r("Agentes Recaudacion Entre Rios", "Agentes Percepcion iibb Entre Rios"),
  r("Agentes Recaudacion Entre Rios", "Agentes Retencion IIBB Entre Rios"),
  r("Agentes Recaudacion Formosa", "Agentes Ret-Perc iibb Formosa quincenal"),
  r("Agentes Recaudacion Formosa", "Agentes Ret-Perc iibb Formosa mensual"),
  r("Agentes Recaudacion Jujuy", "Agentes Retencion iibb Jujuy mensual"),
  r("Agentes Recaudacion Jujuy", "Agentes Percepcion iibb Jujuy mensual"),
  r("Agentes Recaudacion La Pampa", "Agentes Ret-Perc iibb La Pampa"),
  r("Agentes Recaudacion La Rioja", "Agentes Percepcion iibb La Rioja"),
  r("Agentes Recaudacion La Rioja", "Agentes Retencion iibb La Rioja"),
  r("Agentes Recaudacion Mendoza", "Agentes Ret-Perc iibb Mendoza"),
  r("Agentes Recaudacion Misiones", "Agentes Retencion iibb Misiones"),
  r("Agentes Recaudacion Misiones", "Agentes Percepcion iibb Misiones"),
  r("Agentes Recaudacion Neuquen", "Agentes Ret-Perc iibb Neuquen"),
  r("Agentes Recaudacion Rio Negro", "Agentes Ret-Perc iibb Rio Negro - SIRCAR"),
  r("Agentes Recaudacion Salta", "Agentes Ret-Perc iibb Salta Mensual"),
  r("Agentes Recaudacion Salta", "Agentes Ret-Perc iibb Salta Inciso A Mensual"),
  r("Agentes Recaudacion San Juan", "Agentes Percepcion iibb San Juan"),
  r("Agentes Recaudacion San Juan", "Agentes Retencion iibb San Juan"),
  r("Agentes Recaudacion San Luis", "Agentes Retencion iibb San Luis"),
  r("Agentes Recaudacion San Luis", "Agentes Percepcion iibb San Luis"),
  r("Agentes Recaudacion Santa Cruz", "Agentes Retencion iibb Santa Cruz mensual"),
  r("Agentes Recaudacion Santa Fe", "Agentes Ret-Perc iibb Santa Fe 1ra q"),
  r("Agentes Recaudacion Santa Fe", "Agentes Ret-Perc iibb Santa Fe 2da q"),
  r("Agentes Recaudacion Sgo del Estero", "Agentes Ret-Perc iibb Sgo del Estero"),
  r("Agentes Recaudacion Tucuman", "Agentes Retencion iibb Tucuman"),
  r("Agentes Recaudacion Tucuman", "Agentes Percepcion iibb Tucuman"),

  // —— Captura rubros A–D (sin tachados) ——
  r("Arciba", "Arciba - Agentes de recaudacion iibb C.A.B.A"),
  r("Autonomos", "Recategorizacion Autonomos"),
  r("Autonomos", "Autonomos"),
  r("Autonomos Categoria Director", "Autonomos Categoria Director"),
  r("Bienes Personales", "Pago a cuenta Bienes Personales"),
  r("Bs Pers Acc y Partic", "Bs Pers Acc y Partic - NO PYMES"),
  r("Bs Pers Acc y Partic", "Bs Pers Acc y Partic"),
  r("Bs Personales", "Bienes Personales"),
  r("Bs Personales Anticipo de pago ext", "Anticipo de Pago de Bienes Personales Exterior"),
  r("Bs Personales Anticipos", "Antic Bs Personales"),
  r("Cargas Sociales", "Cargas Sociales"),
  r("Cargas Sociales- Libro sueldos", "Libro Sueldos Digital - Cargas Sociales"),
  r("Categorizacion Pymes", "Categorizacion Pymes"),
  r("Combustibles Liquidos", "Impuesto a los combustibles Liquidos"),
  r("DGR Chubut", "Agentes Ret/Perc iibb Chubut Quincenal"),

  r("Empleadores", "Registro Empleadores C.A.B.A."),
  r("Estados Contables", "Presentacion de Balances IGJ"),
  r("Estados Contables", "Presentacion de Balances RPC"),
  r("Fideicomisos", "Regimen Anual Fideicomisos"),
  r("Fideicomisos", "Regimen Benef Finales Fideicomisos"),
  r("Ganancias", "Gcias Pers. Jur"),
  r("Ganancias", "Gcias y Bs Pers. Pers Fisicas Empleados Simplif"),
  r("Ganancias", "DDJJ Gcias. Pers. Fisicas"),
  r("Ganancias", "Impuesto Cedular Pers. Fisicas"),
  r("Ganancias", "Impuesto Cedular Pers Fisicas Simplificado"),
  r("Ganancias", "DDJJ Gcias. Pers. Fisicas Simplificado"),
  r("Ganancias", "Pago a cuenta Gcias. Pers. Fisicas"),
  r("Ganancias Anticipos", "Antic Gcias Pers. Fisicas"),
  r("Ganancias Anticipos", "Antic Gcias Pers. Jur"),

  // —— IIBB (todas las capturas, rubro IIBB salvo IIBB Anual ——
  r(IIBB, "IIBB Local La Rioja Anual"),
  r(IIBB, "IIBB Local Neuquen Simplificado"),
  r(IIBB, "IIBB Local Rio Negro Simplificado"),
  r(IIBB, "IIBB Local Tucuman Siapre Anual"),
  r(IIBB, "IIBB Local Entre Rios Regimen Simplificado"),
  r(IIBB, "IIBB Local Corrientes Mensual"),
  r(IIBB, "IIBB Local Corrientes RET Mensual"),
  r(IIBB, "IIBB Local Corrientes Anual"),
  r(IIBB, "IIBB Local Corrientes RET Anual"),
  r(IIBB, "IIBB Local Chaco Mensual"),
  r(IIBB, "IIBB Local Sgo del Estero Cat A Mensual"),
  r(IIBB, "IIBB Local Sgo del Estero Cat B Mensual"),
  r(IIBB, "IIBB Local Sgo del Estero Cat A Anual"),
  r(IIBB, "IIBB Local Sgo del Estero Cat B Anual"),
  r(IIBB, "IIBB Local La Rioja Mensual"),
  r(IIBB, "IIBB Local San Juan Mensual"),
  r(IIBB, "IIBB Local Simplificado San Juan"),
  r(IIBB, "IIBB Local Misiones - Pago a cuenta DJ Informativa"),
  r(IIBB, "IIBB Chubut Interjurisdiccional Mensual"),
  r(IIBB, "IIBB Local Salta Regimen Simplificado"),
  r(IIBB, "IIBB Local Misiones - Pago a cuenta"),
  r(IIBB, "IIBB Local Bs As Anual"),
  r(IIBB, "IIBB Local Bs As Mensual"),
  r(IIBB, "IIBB Local C.a.b.a Anual"),
  r(IIBB, "IIBB Local C.a.b.a Mensual"),
  r(IIBB, "Recategorizacion IIBB C.A.B.A Reg. Simpl."),
  r(IIBB, "Regimen Simplificado IIBB C.a.b.a."),
  r(IIBB, "IIBB Conv Multilateral Mensual"),
  r(IIBB, "IIBB Local T del Fuego Mensual"),
  r(IIBB, "IIBB Local T del Fuego Anual"),
  r(IIBB, "IIBB Local T del Fuego Reg. Simpl."),
  r(IIBB, "IIBB Local Rio Negro Mensual"),
  r(IIBB, "IIBB Local Rio Negro Anual"),
  r(IIBB, "IIBB Local Cordoba Mensual"),
  r(IIBB, "IIBB Local Cordoba Anual"),
  r(IIBB, "IIBB Local Mendoza Mensual"),
  r(IIBB, "IIBB Local Mendoza Anual"),
  r(IIBB, "IIBB Local Santa Fe Mensual"),
  r(IIBB, "IIBB Local Santa Fe Anual"),
  r(IIBB, "IIBB Local Cordoba Regimen Simplificado"),
  r(IIBB, "IIBB Local La Pampa Mensual"),
  r(IIBB, "IIBB Local La Pampa Anual"),
  r(IIBB, "IIBB Local Catamarca Mensual"),
  r(IIBB, "IIBB Local Catamarca Anual"),
  r(IIBB, "IIBB Local Entre Rios Mensual"),
  r(IIBB, "IIBB Local San Luis Mensual"),
  r(IIBB, "IIBB Local San Luis Anual"),
  r(IIBB, "IIBB C.M. Tucuman Siapre Mensual"),
  r(IIBB, "IIBB C.M. Tucuman Siapre Anual"),
  r(IIBB, "IIBB Local Salta Mensual"),
  r(IIBB, "IIBB Local Salta Anual"),
  r(IIBB, "IIBB Local Chubut Mensual"),
  r(IIBB, "IIBB Local Misiones Mensual"),
  r(IIBB, "IIBB Local Misiones Anual"),
  r(IIBB, "IIBB Local Neuquen Mensual"),
  r(IIBB, "IIBB Local Neuquen Anual"),
  r(IIBB, "IIBB Local Jujuy Mensual"),
  r(IIBB, "IIBB Local Jujuy Anual"),
  r(IIBB, "IIBB Local Tucuman Siapre Mensual"),
  r(IIBB, "IIBB Local Santa Fe Regimen Simplificado"),
  r(IIBB, "Recategorizacion IIBB Santa Fe Reg.Simpl."),
  r(IIBB, "IIBB Local Formosa Mensual"),
  r(IIBB, "IIBB Local Formosa Anual"),
  r(IIBB, "IIBB Local Santa Cruz Mensual"),
  r("IIBB Anual", "IIBB Conv Multilateral Anual"),

  // —— IVA / Monotributo / libro ——
  r("Iva", "Iva Mensual"),
  r("Iva", "Iva Opcion Anual"),
  r("Iva Libro Digital", "Libro Iva Digital Exentos"),
  r("Iva mensual pago postergado rg 5422-23", "Iva mensual pago postergado rg 5422-23"),
  r("Iva Pago Diferido", "Iva Pago Diferido"),
  r("Libro Iva Digital", "Libro Iva Digital"),
  r("Monotributo", "Recategorizacion Semestral Monotributo"),
  r("Monotributo", "Cuota Monotributo"),
  r("Monotributo Unificado Bs As", "Monotributo Unificado Bs As"),

  // —— P–S (capturas finales, sin tachados) ——
  r("Participac. Societarias", "Participac. Societ y Rentas Pasivas 51 a 500 benef"),
  r("Participac. Societarias", "Participac. Societ y Rentas Pasivas + de 500 benef"),
  r("Participac. Societarias", "Participac. Societarias y Rentas Pasivas"),
  r("Precio de Transferencia", "Precio de Transferencia Simplificado Form 2672"),
  r("PUB-Balances ARCA", "PUB-Balances ARCA"),

  r("Servicio Domestico", "Serv domestico Aportes Obligatorios"),
  r("Servicio Domestico", "Serv domestico Aportes Optativos"),
  r("Sicore", "Sicore Semestral"),
  r("Sicore", "Mensual Sicore"),
  r("Sicore", "Pago a cuenta sicore"),
  r("Siradig", "Siradig Anual"),
  r("Sircar", "Sircar 1ra quincena"),
  r("Sircar", "Sircar 2da quincena"),
  r("Sircar", "Sircar mensual"),
  r("Sire", "Sire Rete Seg Social Entes Estatales"),
  r("Sire", "Sire Retenciones - Construccion"),
  r("Sire", "Sire Retenciones - Investigacion y Seguridad"),
  r("Sire", "Sire Retenciones - Construccion 1ra Q"),
  r("Sire", "Sire Retenciones - Investigacion y Seguridad 1ra Q"),
  r("Sire", "Sire Retenciones Iva Mensual"),
  r("Sire", "Sire Retenciones Iva Quincenal"),
  r("Sire", "Sire Retenciones Seg Social Mensual"),
  r("Sire", "Sire Retenciones Seg Social Quincenal"),
  r("Sire", "Sire Benef Exterior Quincenal"),
  r("Sire", "Sire Benef Exterior Mensual"),
  r("Sirtac", "Sirtac 1ra quincena"),
  r("Sirtac", "Sirtac mensual"),
  r("SISA IP1", "SISA IP1"),
  r("SISA IP2", "SISA IP2"),
];

export const PLAN_IN_IMPUESTOS_FILAS = dedupe(RAW);

function slugPiImpuestoId(rubro, nombre) {
  const raw = `${rubro} ${nombre}`
    .toLowerCase()
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 96);
  return `pi-${raw || "sin-id"}`;
}

function organismoImpuesto(rubro) {
  const u = String(rubro ?? "").trim();
  if (/^Agentes Recaudacion/i.test(u)) return "Provincial";
  if (/^DGR\s/i.test(u)) return "Provincial";
  if (/^IIBB/i.test(u)) return "IIBB";
  return "ARCA";
}

/**
 * Obligaciones plan-in (Rubro + Impuesto) para el maestro O.
 */
export const OBLIGACIONES_PLAN_IN_IMPUESTOS = PLAN_IN_IMPUESTOS_FILAS.map((row) => ({
  id: slugPiImpuestoId(row.rubro, row.nombre),
  rubro: row.rubro,
  nombre: row.nombre,
  organismo: organismoImpuesto(row.rubro),
  tipo: TIPO_OBLIGACION,
  calcRule: { type: "manual" },
}));
