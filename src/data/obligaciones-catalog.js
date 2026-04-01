/**
 * Catálogo maestro de obligaciones impositivas y tareas del estudio.
 * Las OBLIGACIONES (tipo: 'obligacion') tienen reglas de cálculo automático
 * de vencimientos basadas en los calendarios oficiales (ARCA/AFIP, provinciales).
 * Las TAREAS (tipo: 'tarea') se configuran con programación personalizada.
 *
 * calcRule.type:
 *   'cuit_arca'  → día según terminación de CUIT, tabla indexada por último dígito
 *   'fixed_day'  → día fijo del mes, con offset de meses
 *   'annual'     → fecha fija anual (mes + día)
 *   'semestral'  → dos veces por año (array de meses + día fijo)
 *   'manual'     → sin cálculo automático, fecha manual obligatoria
 */

export const TIPO_OBLIGACION = "obligacion";
export const TIPO_TAREA      = "tarea";

export const OBLIGACIONES_CATALOG = [

  // ══════════════════════════════════════════════════════════════
  //  ARCA / AFIP — IVA
  // ══════════════════════════════════════════════════════════════
  {
    id: "iva-mensual",
    nombre: "Iva Mensual",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    /** Alta masiva mes a mes hasta ULTIMO_PERIODO_CALENDARIO_OPERATIVO; cada vencimiento con calcularVencimiento (tabla/calendario). */
    recurrencia: "mensual",
    calcRule: { type: "cuit_arca", tabla: "iva", offsetMeses: 1 }
  },
  {
    id: "iva-pago-diferido",
    nombre: "Iva Pago Diferido",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "iva", offsetMeses: 3 }
  },
  {
    id: "libro-iva-digital",
    nombre: "Libro Iva Digital",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "iva", offsetMeses: 1 }
  },
  {
    id: "libro-iva-digital-exentos",
    nombre: "Libro Iva Digital Exentos",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "fixed_day", dia: 15, offsetMeses: 1 }
  },

  // ══════════════════════════════════════════════════════════════
  //  ARCA / AFIP — Autónomos y Monotributo
  // ══════════════════════════════════════════════════════════════
  {
    id: "autonomos",
    nombre: "Autonomos",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "autonomos", offsetMeses: 1 }
  },
  {
    id: "autonomos-categoria-director",
    nombre: "Autonomos Categoria Director",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "autonomos", offsetMeses: 1 }
  },
  {
    id: "recategorizacion-autonomos",
    nombre: "Recategorizacion Autonomos",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    // Recategorización anual: septiembre 30 (aprox, verificar resolución anual)
    calcRule: { type: "annual", mes: 9, dia: 30 }
  },
  {
    id: "cuota-monotributo",
    nombre: "Cuota Monotributo",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "fixed_day", dia: 20, offsetMeses: 0 }
  },
  {
    id: "recategorizacion-semestral-monotributo",
    nombre: "Recategorizacion Semestral Monotributo",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    // Enero y julio, día 20 (semestral)
    calcRule: { type: "semestral", meses: [1, 7], dia: 20 }
  },

  // ══════════════════════════════════════════════════════════════
  //  ARCA / AFIP — Ganancias y Bienes Personales
  // ══════════════════════════════════════════════════════════════
  {
    id: "ddjj-gcias-pers-fisicas",
    nombre: "DDJJ Gcias. Pers. Fisicas",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    // DDJJ anual: vence en junio del año siguiente, día según CUIT
    calcRule: { type: "cuit_arca", tabla: "ganancias_anual", esAnual: true, mesAnual: 6 }
  },
  {
    id: "antic-gcias-pers-fisicas",
    nombre: "Antic Gcias Pers. Fisicas",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "anticipos", offsetMeses: 1 }
  },
  {
    id: "antic-gcias-pers-jur",
    nombre: "Antic Gcias Pers. Jur",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "anticipos", offsetMeses: 1 }
  },
  {
    id: "gcias-pers-jur",
    nombre: "Gcias Pers. Jur",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "ganancias_anual", esAnual: true, mesAnual: 6 }
  },
  {
    id: "bienes-personales",
    nombre: "Bienes Personales",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    // Vence en junio, día según CUIT
    calcRule: { type: "cuit_arca", tabla: "bienes_personales_anual", esAnual: true, mesAnual: 6 }
  },
  {
    id: "bs-pers-acc-partic",
    nombre: "Bs Pers Acc y Partic",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "bienes_personales_anual", esAnual: true, mesAnual: 6 }
  },
  {
    id: "antic-bs-personales",
    nombre: "Antic Bs Personales",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "anticipos_bp", offsetMeses: 1 }
  },
  {
    id: "impuesto-cedular-pers-fisicas",
    nombre: "Impuesto Cedular Pers. Fisicas",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "ganancias_anual", esAnual: true, mesAnual: 6 }
  },
  {
    id: "participac-societarias-rentas-pasivas",
    nombre: "Participac. Societarias y Rentas Pasivas",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "ganancias_anual", esAnual: true, mesAnual: 6 }
  },

  // ══════════════════════════════════════════════════════════════
  //  ARCA / AFIP — SICORE y Retenciones
  // ══════════════════════════════════════════════════════════════
  {
    id: "mensual-sicore",
    nombre: "Mensual Sicore",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "sicore", offsetMeses: 1 }
  },
  {
    id: "pago-cuenta-sicore",
    nombre: "Pago a cuenta sicore",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "sicore", offsetMeses: 1 }
  },
  {
    id: "sire-ret-iva-mensual",
    nombre: "Sire Retenciones Iva Mensual",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "sicore", offsetMeses: 1 }
  },
  {
    id: "sire-ret-iva-quincenal",
    nombre: "Sire Retenciones Iva Quincenal",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    // Quincenal: vence días 15 y último del mes
    calcRule: { type: "fixed_day", dia: 15, offsetMeses: 0, nota: "quincenal" }
  },
  {
    id: "sire-ret-segsocial-mensual",
    nombre: "Sire Retenciones Seg Social Mensual",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "cargas_sociales", offsetMeses: 1 }
  },
  {
    id: "sire-ret-segsocial-quincenal",
    nombre: "Sire Retenciones Seg Social Quincenal",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "fixed_day", dia: 15, offsetMeses: 0, nota: "quincenal" }
  },

  // ══════════════════════════════════════════════════════════════
  //  ARCA / AFIP — Cargas Sociales y Sueldos
  // ══════════════════════════════════════════════════════════════
  {
    id: "libro-sueldos-cargas-sociales",
    nombre: "Libro Sueldos Digital - Cargas Sociales",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "cargas_sociales", offsetMeses: 1 }
  },
  {
    id: "serv-domestico-aportes",
    nombre: "Serv domestico Aportes Obligatorios",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "fixed_day", dia: 10, offsetMeses: 1 }
  },

  // ══════════════════════════════════════════════════════════════
  //  ARCA / AFIP — Otros
  // ══════════════════════════════════════════════════════════════
  {
    id: "pub-balances-arca",
    nombre: "PUB-Balances ARCA",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    // Depende del cierre del ejercicio fiscal → manual
    calcRule: { type: "manual" }
  },
  {
    id: "categorizacion-pymes",
    nombre: "Categorizacion Pymes",
    organismo: "ARCA",
    tipo: TIPO_OBLIGACION,
    // Semestral: marzo y septiembre, aprox día 26
    calcRule: { type: "semestral", meses: [3, 9], dia: 26 }
  },

  // ══════════════════════════════════════════════════════════════
  //  PROVINCIAL — Convenio Multilateral
  // ══════════════════════════════════════════════════════════════
  {
    id: "iibb-conv-multilateral-mensual",
    nombre: "IIBB Conv Multilateral Mensual",
    organismo: "Provincial",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "cm_mensual", offsetMeses: 1 }
  },
  {
    id: "iibb-conv-multilateral-anual",
    nombre: "IIBB Conv Multilateral Anual",
    organismo: "Provincial",
    tipo: TIPO_OBLIGACION,
    // Vence el 30 de junio
    calcRule: { type: "annual", mes: 6, dia: 30 }
  },

  // ══════════════════════════════════════════════════════════════
  //  PROVINCIAL — Salta
  // ══════════════════════════════════════════════════════════════
  {
    id: "iibb-local-salta-mensual",
    nombre: "IIBB Local Salta Mensual",
    organismo: "Provincial",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "iibb_salta", offsetMeses: 1 }
  },
  {
    id: "agentes-ret-perc-iibb-salta-mensual",
    nombre: "Agentes Ret-Perc iibb Salta Mensual",
    organismo: "Provincial",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "iibb_salta", offsetMeses: 1 }
  },
  {
    id: "agentes-ret-perc-iibb-salta-inciso-a-mensual",
    nombre: "Agentes Ret-Perc iibb Salta Inciso A Mensual",
    organismo: "Provincial",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "cuit_arca", tabla: "iibb_salta", offsetMeses: 1 }
  },

  // ══════════════════════════════════════════════════════════════
  //  PROVINCIAL — Tucumán, Catamarca, Jujuy, Buenos Aires
  // ══════════════════════════════════════════════════════════════
  {
    id: "iibb-local-tucuman-siapre-anual",
    nombre: "IIBB Local Tucuman Siapre Anual",
    organismo: "Provincial",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "annual", mes: 3, dia: 31 }
  },
  {
    id: "agentes-ret-perc-iibb-catamarca",
    nombre: "Agentes Ret-Perc iibb Catamarca",
    organismo: "Provincial",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "fixed_day", dia: 15, offsetMeses: 1 }
  },
  {
    id: "agentes-retencion-iibb-jujuy-mensual",
    nombre: "Agentes Retencion iibb Jujuy mensual",
    organismo: "Provincial",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "fixed_day", dia: 15, offsetMeses: 1 }
  },
  {
    id: "percepciones-iibb-bs-as-reg-gral",
    nombre: "Percepciones iibb Bs As Reg Gral",
    organismo: "Provincial",
    tipo: TIPO_OBLIGACION,
    calcRule: { type: "fixed_day", dia: 10, offsetMeses: 1 }
  },

];

/**
 * Lookup rápido por nombre (case-insensitive)
 * @param {string} nombre
 * @returns {object|null}
 */
export function findObligacionByNombre(nombre) {
  const q = (nombre || "").trim().toLowerCase();
  return OBLIGACIONES_CATALOG.find(o => o.nombre.toLowerCase() === q) ?? null;
}

export function obligacionGeneraMesesFuturos(catalogItem) {
  return catalogItem?.recurrencia === "mensual";
}
