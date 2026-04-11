/**
 * Captura plan-in: rubro + tarea/obligación (tipo explícito solo para municipal → O).
 * Orden de aparición aquí no importa: el maestro ordena por rubro → nombre.
 */

import { TIPO_OBLIGACION, TIPO_TAREA } from "./obligaciones-catalog.js";

/** Sistemas ARCA/AFIP para filas desagregadas de carga/descarga */
const SISTEMAS_COMP = [
  "Comprobantes en Línea",
  "Facturador Plus",
  "Mis Comprobantes",
  "Portal IVA",
  "Regímenes de Información",
  "SIRADIG",
  "SIRE",
  "SUSS",
  "VEP",
  "Web Service",
];

const R = {
  AFIP: "A - AFIP",
  C: "C - Contabilidad",
  CM: "Cmensual - Contabilidad Mensual",
  HON: "Hon - Honorarios",
  L: "L - Laboral",
  MUNI: "O - Municipal",
  S: "S - Societario",
  GEN: "General",
  II: "I - Impositiva",
};

function afipCargaDescarga() {
  const out = [];
  for (const s of SISTEMAS_COMP) {
    out.push({ rubro: R.AFIP, nombre: `Carga de Facturas — ${s}` });
    out.push({ rubro: R.AFIP, nombre: `Descarga de Comprobantes — ${s}` });
  }
  return out;
}

/** Captura pantalla plan-in + filas de estudio que siguen vigentes */
export const PLAN_IN_FILAS = [
  // —— A - AFIP ——
  { rubro: R.AFIP, nombre: "Acuse de recibo de DDJJ" },
  { rubro: R.AFIP, nombre: "Adhesión a CBU" },
  { rubro: R.AFIP, nombre: "Alta de Impuestos" },
  { rubro: R.AFIP, nombre: "Alta de Puntos de Venta" },
  { rubro: R.AFIP, nombre: "Baja de Impuestos" },
  { rubro: R.AFIP, nombre: "Carga de CBU" },
  { rubro: R.AFIP, nombre: "Carga de Datos en Sistema Registral" },
  ...afipCargaDescarga(),
  { rubro: R.AFIP, nombre: "Consulta de Deuda" },
  { rubro: R.AFIP, nombre: "Consulta de Notificaciones (e-ventanilla)" },
  { rubro: R.AFIP, nombre: "Generación de VEP" },
  { rubro: R.AFIP, nombre: "Presentación de DDJJ" },
  { rubro: R.AFIP, nombre: "Presentación de Regímenes de Información" },
  { rubro: R.AFIP, nombre: "Solicitud de Certificado de Exclusión" },
  { rubro: R.AFIP, nombre: "Solicitud de Certificado de No Retención" },
  { rubro: R.AFIP, nombre: "Solicitud de Certificado de Residencia" },
  { rubro: R.AFIP, nombre: "Solicitud de CUIT" },
  { rubro: R.AFIP, nombre: "Solicitud de Devolución de Percepciones" },
  { rubro: R.AFIP, nombre: "Solicitud de Exención de Impuestos" },
  { rubro: R.AFIP, nombre: "Solicitud de Plan de Pagos" },
  { rubro: R.AFIP, nombre: "Solicitud de Reimputación de Pagos" },
  { rubro: R.AFIP, nombre: "Solicitud de Turno" },
  { rubro: R.AFIP, nombre: "Trámite de Blanqueo de Clave Fiscal" },
  { rubro: R.AFIP, nombre: "Trámite de Cambio de Domicilio" },
  { rubro: R.AFIP, nombre: "Trámite de Cese de Actividades" },
  { rubro: R.AFIP, nombre: "Trámite de Inscripción a Impuestos" },
  { rubro: R.AFIP, nombre: "Trámite de Modificación de Datos" },
  { rubro: R.AFIP, nombre: "Trámite de Vinculación de Clave Fiscal" },
  { rubro: R.AFIP, nombre: "Verificación de Estado de Deuda" },
  { rubro: R.AFIP, nombre: "Verificación de Estado de Trámite" },
  { rubro: R.AFIP, nombre: "Verificación de Notificaciones (e-ventanilla)" },
  { rubro: R.AFIP, nombre: "Verificación de Presentación de DDJJ" },
  { rubro: R.AFIP, nombre: "Verificación de Saldo a Favor" },
  { rubro: R.AFIP, nombre: "Verificación de Vencimientos" },

  // —— General (sin rubro en plan-in) ——
  { rubro: R.GEN, nombre: "Aviso revisión documentación de subcontratistas" },
  { rubro: R.GEN, nombre: "Prueba soporte" },

  // —— C - Contabilidad ——
  { rubro: R.C, nombre: "Apertura de Ejercicio" },
  { rubro: R.C, nombre: "Arqueo de Caja" },
  { rubro: R.C, nombre: "Asiento de Apertura / Cierre / Refundición de Cuentas de Resultado" },
  { rubro: R.C, nombre: "Auditoría de Cuentas" },
  { rubro: R.C, nombre: "Balance de Sumas y Saldos" },
  { rubro: R.C, nombre: "Carga de Asientos Manuales" },
  { rubro: R.C, nombre: "Carga de Facturas de Compras" },
  { rubro: R.C, nombre: "Carga de Facturas de Ventas" },
  { rubro: R.C, nombre: "Cierre de Ejercicio" },
  { rubro: R.C, nombre: "Conciliación Bancaria" },
  { rubro: R.C, nombre: "Conciliación Cuentas a Cobrar" },
  { rubro: R.C, nombre: "Conciliación Cuentas a Pagar" },
  { rubro: R.C, nombre: "Confección de Balance General" },
  { rubro: R.C, nombre: "Confección de Estados Contables" },
  { rubro: R.C, nombre: "Control de Correlatividad de Facturación" },
  { rubro: R.C, nombre: "Control de Inventario" },
  { rubro: R.C, nombre: "Copiado de Libros" },
  { rubro: R.C, nombre: "Depuración de Cuentas" },
  { rubro: R.C, nombre: "Emisión de Libro Diario" },
  { rubro: R.C, nombre: "Emisión de Inventario y Balances" },
  { rubro: R.C, nombre: "Emisión de Mayor" },
  { rubro: R.C, nombre: "Generación de Archivos para Auditoría" },
  { rubro: R.C, nombre: "Liquidación de Impuestos" },
  { rubro: R.C, nombre: "Preparación de Documentación para Bancos" },
  { rubro: R.C, nombre: "Revalúo de Bienes de Uso" },
  { rubro: R.C, nombre: "Revisión de Gastos" },
  { rubro: R.C, nombre: "Seguimiento de Activos Fijos" },

  // —— Cmensual ——
  { rubro: R.CM, nombre: "Archivo de Documentación" },
  { rubro: R.CM, nombre: "Carga de Movimientos de Caja" },
  { rubro: R.CM, nombre: "Carga de Movimientos de Tarjeta de Crédito" },
  { rubro: R.CM, nombre: "Conciliación de Cuentas Corrientes" },
  { rubro: R.CM, nombre: "Control de Gastos Mensuales" },
  { rubro: R.CM, nombre: "Informe de Gestión Mensual" },
  { rubro: R.CM, nombre: "Revisión de Cuentas de Resultado" },

  // —— Hon ——
  { rubro: R.HON, nombre: "Liquidación de Honorarios Directores" },
  { rubro: R.HON, nombre: "Liquidación de Honorarios Profesionales" },
  { rubro: R.HON, nombre: "Pago de Honorarios" },
  { rubro: R.HON, nombre: "Retención de Ganancias sobre Honorarios" },

  // —— L - Laboral ——
  { rubro: R.L, nombre: "Alta / Baja de Empleado en Simplificación Registral" },
  { rubro: R.L, nombre: "Carga de Novedades para Liquidación" },
  { rubro: R.L, nombre: "Confección de Certificados de Trabajo (Art. 80)" },
  { rubro: R.L, nombre: "Confección de DDJJ de Conceptos No Remunerativos" },
  { rubro: R.L, nombre: "Confección de Libro de Sueldos Digital" },
  { rubro: R.L, nombre: "Confección de Recibos de Sueldo" },
  { rubro: R.L, nombre: "Generación de Archivo para Pago de Sueldos" },
  { rubro: R.L, nombre: "Generación de F. 931 (SUSS)" },
  { rubro: R.L, nombre: "Liquidación de Aguinaldo (SAC)" },
  { rubro: R.L, nombre: "Liquidación de Cargas Sociales" },
  { rubro: R.L, nombre: "Liquidación de Embargos Judiciales" },
  { rubro: R.L, nombre: "Liquidación de Indemnizaciones" },
  { rubro: R.L, nombre: "Liquidación de Retenciones de Ganancias 4ta Categoría" },
  { rubro: R.L, nombre: "Liquidación de Sindicatos" },
  { rubro: R.L, nombre: "Liquidación de Sueldos Mensuales" },
  { rubro: R.L, nombre: "Liquidación de Vacaciones" },
  { rubro: R.L, nombre: "Presentación de DDJJ de Sindicatos" },
  { rubro: R.L, nombre: "Trámite de Rúbrica de Libro de Sueldos" },

  // —— O - Municipal (antes M - Municipal): obligaciones ——
  { rubro: R.MUNI, nombre: "Derecho de Registro e Inspección (DReI) - DDJJ Anual", tipo: TIPO_OBLIGACION },
  { rubro: R.MUNI, nombre: "Derecho de Registro e Inspección (DReI) - DDJJ Mensual", tipo: TIPO_OBLIGACION },
  { rubro: R.MUNI, nombre: "Pago de Tasa General de Inmuebles (TGI)", tipo: TIPO_OBLIGACION },
  { rubro: R.MUNI, nombre: "Pago de Tasa de Publicidad y Propaganda", tipo: TIPO_OBLIGACION },
  { rubro: R.MUNI, nombre: "Renovación de Habilitación Municipal", tipo: TIPO_OBLIGACION },

  // —— S - Societario ——
  { rubro: R.S, nombre: "Actualización de Libro de Actas de Asamblea" },
  { rubro: R.S, nombre: "Actualización de Libro de Actas de Directorio" },
  { rubro: R.S, nombre: "Actualización de Depósito de Acciones" },
  { rubro: R.S, nombre: "Actualización de Registro de Accionistas" },
  { rubro: R.S, nombre: "Confección de Acta de Asamblea Ordinaria" },
  { rubro: R.S, nombre: "Confección de Acta de Directorio" },
  { rubro: R.S, nombre: "Convocatoria a Asamblea" },
  { rubro: R.S, nombre: "Presentación de Balances ante Organismo de Control (IGJ/DPPJ)" },
  { rubro: R.S, nombre: "Ratificación de Autoridades" },
  { rubro: R.S, nombre: "Trámite de Cambio de Sede Social" },
  { rubro: R.S, nombre: "Trámite de Modificación de Estatuto" },

  // —— I - Impositiva (estudio; excluir en maestro cualquier I - Tissh) ——
  { rubro: R.II, nombre: "I - Calendario Vencimientos Mes Siguiente" },
  { rubro: R.II, nombre: "I - Certificado de Cumplim Fiscal IIBB Catamarca" },
  { rubro: R.II, nombre: "I - Certiva revisión y aceptación de certificados" },
  { rubro: R.II, nombre: "I - Emisión F500" },
  { rubro: R.II, nombre: "I - Emisión F500 - Revisiones preliminares" },
  { rubro: R.II, nombre: "I - Envío de Posición estimada Imp Ganancias" },
  { rubro: R.II, nombre: "I - Envío de Posición estimada IVA" },
  { rubro: R.II, nombre: "I - Impuesto Inmob Cordoba" },
  { rubro: R.II, nombre: "I - Obtencion de Exención Anual DGR" },
  { rubro: R.II, nombre: "I - Pedido de Información" },
  { rubro: R.II, nombre: "I - Proyección IG 1" },
  { rubro: R.II, nombre: "I - Proyección IG 2" },
  { rubro: R.II, nombre: "I - Proyección IG 3" },
  { rubro: R.II, nombre: "I - Proyección Posición Impositiva" },
  { rubro: R.II, nombre: "I - Proyección Posición Impositiva mes siguiente" },
  { rubro: R.II, nombre: "I - Reporte AMT Base Imponible Salta" },
  { rubro: R.II, nombre: "I - Requerimientos ARCA" },
  { rubro: R.II, nombre: "I - Requerimientos DGR Salta" },
  { rubro: R.II, nombre: "I - Requerimientos Municipalidad Salta" },
  { rubro: R.II, nombre: "I - Requerimientos Otros Organismos - detallar" },
  { rubro: R.II, nombre: "I - Reunión Preliminar análisis DJ anuales" },
  { rubro: R.II, nombre: "I - Revisión Cta Cte Autónomos" },
  { rubro: R.II, nombre: "I - Revisión Cta Cte DGR SALTA 1" },
  { rubro: R.II, nombre: "I - Revisión Cta Cte DGR SALTA 2" },
  { rubro: R.II, nombre: "I - Revisión Sistema Cuentas Tributarias ARCA 1" },
  { rubro: R.II, nombre: "I - Revisión Sistema Cuentas Tributarias ARCA 2" },
  { rubro: R.II, nombre: "I - Solicitud de Exención Anual DGR" },
  { rubro: R.II, nombre: "I - TEM - DIM Tucuman 4-5" },
  { rubro: R.II, nombre: "I - Transf de Aportes Decreto 1866" },

  // —— Asientos / estudio (conviven con A - AFIP en rubro aparte) ——
  { rubro: "A - Contable", nombre: "A - Asiento Mensual IIBB" },
  { rubro: "A - Contable", nombre: "A - Asiento Mensual IVA" },
  { rubro: "A - Contable", nombre: "A - Asiento Mensual TISSH" },

  // —— C / Cmensual / Hon / L (líneas previas estudio que no duplican lo de arriba) ——
  { rubro: R.C, nombre: "C - Auditoria Estados Contables" },
  { rubro: R.C, nombre: "C - Certificacion de Ingresos" },
  { rubro: R.C, nombre: "C - Emision de factura" },
  { rubro: R.C, nombre: "C - Manifestacion de Bienes y Deudas" },
  { rubro: R.CM, nombre: "Cmensual - Carga y control Comprobantes de Compra" },
  { rubro: R.CM, nombre: "Cmensual - Carga y control Comprobantes de Ventas" },
  { rubro: R.HON, nombre: "Hon - Reuniones - Capacit - Asesoram A FACTURAR" },
  { rubro: R.HON, nombre: "Hon - Reuniones - Capacit - Asesoram INC ABONO" },
  { rubro: R.L, nombre: "L - Anticipo SAC" },
  { rubro: R.L, nombre: "L - Asiento Sueldo" },
  { rubro: R.L, nombre: "L - Recepción" },
  { rubro: R.L, nombre: "L - Sueldos" },
  { rubro: R.L, nombre: "L - Sueldos 1ra Quincena" },
  { rubro: R.S, nombre: "S - Acta de Asamblea" },
];
