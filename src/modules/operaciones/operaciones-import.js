import { appState } from "../../app/state.js";
import { importOperacionesBatch, fetchOperaciones } from "./operaciones.service.js";
import {
  findObligacionByNombre,
  OBLIGACIONES_CATALOG
} from "../../data/obligaciones-catalog.js";
import {
  calcularVencimiento,
  monthInputToPeriodo,
  enumerateMonthsYmInclusiveRange,
  enumerateMonthsYm,
  tipoPeriodoImplicitoObligacion
} from "../../data/vencimientos-engine.js";
import {
  ULTIMO_PERIODO_CALENDARIO_OPERATIVO,
  validarPeriodoObligacionVsCalendario,
  validarTareaPeriodoYVencimiento
} from "../../data/calendario-fiscal-limits.js";
import {
  esNombreTareaPlanIn,
  coincideTipoPermitido,
  coincideTipoProgramacion,
  TIPOS_PERIODO,
  TIPOS_PROGRAMACION
} from "../../data/operaciones-scheduling.js";
import { estadoInicialSegunVencimiento } from "./operaciones-estado.js";

function makeProgressUi(prefix) {
  const p = (suffix) => `${prefix}-${suffix}`;
  return {
    show(text) {
      const wrap = document.getElementById(p("import-progress"));
      const msg = document.getElementById(p("import-progress-text"));
      const lbl = document.getElementById(p("import-label"));
      if (wrap) wrap.style.display = "flex";
      if (msg) msg.textContent = text;
      if (lbl) lbl.style.display = "none";
    },
    hide() {
      const wrap = document.getElementById(p("import-progress"));
      const lbl = document.getElementById(p("import-label"));
      if (wrap) wrap.style.display = "none";
      if (lbl) lbl.style.display = "";
    }
  };
}

/** Meses desde hoy hasta el tope del calendario fiscal cargado (plantilla Excel). */
function mesesOpcionPlantilla() {
  const d = new Date();
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  let yms = enumerateMonthsYmInclusiveRange(start, ULTIMO_PERIODO_CALENDARIO_OPERATIVO);
  if (!yms.length) {
    yms = enumerateMonthsYm(start, 12);
  }
  return yms.map((ym) => monthInputToPeriodo(ym));
}

const TAREAS_PREFIJOS_EJEMPLO = [
  "A - Anticipo",
  "C - Contabilidad",
  "I - Impuesto interno",
  "L - Liquidación sueldos",
  "S - Sellos"
];

function parseOpExcelDate(v) {
  if (!v) return "";
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().split("T")[0];
  }
  if (typeof v === "string" && v.includes("/")) {
    const parts = v.split("/");
    if (parts.length === 3) {
      const [d, m, y] = parts;
      return `${y.padStart(4, "20")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }
  return String(v);
}

function inferOrganismo(obligacion) {
  const s = (obligacion || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const arcaKw = ["iva", "ganancias", "bienes personales", "monotributo", "autonomos", "ddjj", "retenci", "percepci", "arca", "afip"];
  const provKw = ["iibb", "ingresos brutos", "rentas", "sellos", "inmobiliario", "dgrp", "agip", "arba", "dgr"];
  if (arcaKw.some(k => s.includes(k))) return "ARCA";
  if (provKw.some(k => s.includes(k))) return "Provincial";
  return "Otro";
}

function normForDocId(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

function normHeaderCell(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePeriodoForCalc(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}$/.test(s)) return monthInputToPeriodo(s) || s;
  return s;
}

function makeColumnIndex(headersRow) {
  const headers = (headersRow || []).map(normHeaderCell);
  return (...patterns) => {
    for (const pat of patterns) {
      const p = normHeaderCell(pat).replace(/\s*\([^)]*\)\s*/g, " ").trim();
      const i = headers.findIndex((h) => {
        if (!h) return false;
        return h === p || h.includes(p) || p.includes(h);
      });
      if (i >= 0) return i;
    }
    return -1;
  };
}

function buildRowsFromObligacionesSheet(raw, updatedBy) {
  const pending = [];
  const warnings = [];
  if (!raw?.length) return { pending, warnings };
  const idx = makeColumnIndex(raw[0]);
  const iC = idx("cliente");
  const iU = idx("usuario");
  const iO = idx("obligación", "obligacion");
  const iP = idx("período", "periodo");
  const iV = idx("vencimiento");
  const g = (row, col) => (col >= 0 ? String(row[col] ?? "").trim() : "");

  for (let r = 1; r < raw.length; r++) {
    const row = raw[r] || [];
    const clienteNombre = g(row, iC);
    const obligacion = g(row, iO);
    if (!clienteNombre && !obligacion) continue;
    if (!clienteNombre || !obligacion) {
      warnings.push(`Obligaciones fila ${r + 1}: faltan cliente u obligación.`);
      continue;
    }
    const clienteMatch = appState.clientes.items.find(
      (c) => (c.nombre || "").toLowerCase() === clienteNombre.toLowerCase()
    );
    const cuit = clienteMatch?.cuit ?? "";
    const periodoCell = g(row, iP);
    const periodoNorm = normalizePeriodoForCalc(periodoCell);
    let vencimiento = parseOpExcelDate(g(row, iV));
    if (!periodoNorm) {
      warnings.push(`Obligaciones fila ${r + 1} "${obligacion}": falta período.`);
      continue;
    }
    const limO = validarPeriodoObligacionVsCalendario(periodoNorm);
    if (!limO.ok) {
      warnings.push(`Obligaciones fila ${r + 1} "${obligacion}": ${limO.mensaje}`);
      continue;
    }
    if (!vencimiento) {
      const cat = findObligacionByNombre(obligacion);
      if (cat) {
        const res = calcularVencimiento(cat.calcRule, periodoNorm, cuit);
        if (res.iso) vencimiento = res.iso;
      }
    }
    if (!vencimiento) {
      warnings.push(`Obligaciones fila ${r + 1} "${obligacion}": sin vencimiento.`);
      continue;
    }
    const periodo =
      monthInputToPeriodo(periodoCell.match(/^\d{4}-\d{2}$/) ? periodoCell : "") || periodoNorm;
    const cat = findObligacionByNombre(obligacion);
    const payload = {
      tipo: "obligacion",
      responsable: g(row, iU),
      clienteNombre,
      clienteId: clienteMatch?.id ?? "",
      obligacion,
      periodo,
      vencimiento,
      estado: estadoInicialSegunVencimiento(vencimiento),
      organismo: cat?.organismo ?? inferOrganismo(obligacion),
      notas: "",
      tipoPeriodo: cat ? tipoPeriodoImplicitoObligacion(cat.calcRule) ?? "Mes vencido" : "Mes vencido",
      tipoProgramacion: null,
      updated_by: updatedBy
    };
    const docId =
      [normForDocId(clienteNombre), normForDocId(obligacion), normForDocId(periodo)].filter(Boolean).join("_") ||
      `op-${Date.now()}-${r}`;
    pending.push({ docId, payload });
  }
  return { pending, warnings };
}

function buildRowsFromTareasSheet(raw, updatedBy) {
  const pending = [];
  const warnings = [];
  if (!raw?.length) return { pending, warnings };
  const idx = makeColumnIndex(raw[0]);
  const iC = idx("cliente");
  const iU = idx("usuario");
  const iT = idx("tarea");
  const iP = idx("período", "periodo");
  const iTp = idx("tipo período", "tipo periodo");
  const iTpr = idx("tipo programación", "tipo programacion");
  const iV = idx("vencimiento");
  const g = (row, col) => (col >= 0 ? String(row[col] ?? "").trim() : "");

  for (let r = 1; r < raw.length; r++) {
    const row = raw[r] || [];
    const clienteNombre = g(row, iC);
    const obligacion = g(row, iT);
    if (!clienteNombre && !obligacion) continue;
    if (!clienteNombre || !obligacion) {
      warnings.push(`Tareas fila ${r + 1}: faltan cliente o tarea.`);
      continue;
    }
    const clienteMatch = appState.clientes.items.find(
      (c) => (c.nombre || "").toLowerCase() === clienteNombre.toLowerCase()
    );
    const periodoCell = g(row, iP);
    const periodoNorm = normalizePeriodoForCalc(periodoCell);
    const tipoPeriodo = coincideTipoPermitido(g(row, iTp), TIPOS_PERIODO);
    const tipoProgramacion = coincideTipoProgramacion(g(row, iTpr));
    const vencimiento = parseOpExcelDate(g(row, iV));
    if (!periodoNorm) {
      warnings.push(`Tareas fila ${r + 1} "${obligacion}": falta período.`);
      continue;
    }
    if (!tipoPeriodo || !tipoProgramacion) {
      warnings.push(`Tareas fila ${r + 1} "${obligacion}": tipo período o programación inválidos.`);
      continue;
    }
    if (!vencimiento) {
      warnings.push(`Tareas fila ${r + 1} "${obligacion}": falta vencimiento.`);
      continue;
    }
    const terr = validarTareaPeriodoYVencimiento(periodoNorm, vencimiento);
    if (terr) {
      warnings.push(`Tareas fila ${r + 1} "${obligacion}": ${terr}`);
      continue;
    }
    const periodo =
      monthInputToPeriodo(periodoCell.match(/^\d{4}-\d{2}$/) ? periodoCell : "") || periodoNorm;
    const payload = {
      tipo: "tarea",
      responsable: g(row, iU),
      clienteNombre,
      clienteId: clienteMatch?.id ?? "",
      obligacion,
      periodo,
      vencimiento,
      estado: estadoInicialSegunVencimiento(vencimiento),
      organismo: "Otro",
      notas: "",
      tipoPeriodo,
      tipoProgramacion,
      programacionDetalle: null,
      updated_by: updatedBy
    };
    const docId =
      [normForDocId(clienteNombre), normForDocId(obligacion), normForDocId(periodo)].filter(Boolean).join("_") ||
      `op-${Date.now()}-${r}`;
    pending.push({ docId, payload });
  }
  return { pending, warnings };
}

/** Plantilla simple sin validaciones (si no hay ExcelJS). */
export function downloadPlantillaOperacionesFallback() {
  const XLSX = window.XLSX;
  if (!XLSX) {
    alert("No está disponible la librería de Excel. Recargá la página con conexión.");
    return;
  }
  const obligHeaders = [
    "Cliente",
    "Usuario",
    "Obligación (nombre exacto del catálogo)",
    "Período (Mar-2026 o 2026-03)",
    "Estado (se calcula por vencimiento — columna opcional)"
  ];
  const obligEjemplo = [
    "Empresa Ejemplo SA",
    "María Pérez",
    "Iva Mensual",
    "Feb-2026",
    ""
  ];
  const tareaHeaders = [
    "Cliente",
    "Usuario",
    "Tarea",
    "Período (Mar-2026 o 2026-03)",
    "Tipo período",
    "Tipo programación",
    "Vencimiento (AAAA-MM-DD)",
    "Estado (se calcula por vencimiento — columna opcional)"
  ];
  const tareaEjemplo = [
    "Empresa Ejemplo SA",
    "María Pérez",
    "L - Liquidación sueldos",
    "Mar-2026",
    "Mes vto",
    "Último día hábil del mes",
    "2026-03-31",
    ""
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([obligHeaders, obligEjemplo]), "Obligaciones");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([tareaHeaders, tareaEjemplo]), "Tareas");
  XLSX.writeFile(wb, "plantilla_obligaciones_y_tareas_ATT.xlsx");
}

/**
 * Plantilla con listas desplegables (hoja Listas oculta).
 * ctx: { nombresClientes: string[], nombresUsuarios: string[] }
 */
export async function downloadPlantillaOperaciones(ctx) {
  const ExcelJS = window.ExcelJS;
  if (!ExcelJS) {
    downloadPlantillaOperacionesFallback();
    return;
  }
  const { nombresClientes = [], nombresUsuarios = [] } = ctx;
  const catalogoObl = OBLIGACIONES_CATALOG.map((o) => o.nombre);
  const meses = mesesOpcionPlantilla();
  const wb = new ExcelJS.Workbook();
  const listas = wb.addWorksheet("Listas", { state: "hidden" });

  let r = 1;
  for (const n of nombresClientes) listas.getCell(r++, 1).value = n || "";
  const nCli = Math.max(1, nombresClientes.length);
  r = 1;
  for (const n of nombresUsuarios) listas.getCell(r++, 2).value = n || "";
  const nUsr = Math.max(1, nombresUsuarios.length);
  r = 1;
  for (const n of catalogoObl) listas.getCell(r++, 3).value = n || "";
  const nCat = Math.max(1, catalogoObl.length);
  r = 1;
  for (const n of TIPOS_PERIODO) listas.getCell(r++, 4).value = n;
  const nTp = TIPOS_PERIODO.length;
  r = 1;
  for (const n of TIPOS_PROGRAMACION) listas.getCell(r++, 5).value = n;
  const nPr = TIPOS_PROGRAMACION.length;
  r = 1;
  for (const n of TAREAS_PREFIJOS_EJEMPLO) listas.getCell(r++, 6).value = n;
  const nTa = TAREAS_PREFIJOS_EJEMPLO.length;
  r = 1;
  for (const n of meses) listas.getCell(r++, 7).value = n;
  const nMe = meses.length;

  const hObl = [
    "Cliente",
    "Usuario",
    "Obligación (nombre exacto del catálogo)",
    "Período (Mar-2026 o 2026-03)",
    "Estado (se calcula por vencimiento — opcional)"
  ];
  const hTar = [
    "Cliente",
    "Usuario",
    "Tarea",
    "Período (Mar-2026 o 2026-03)",
    "Tipo período",
    "Tipo programación",
    "Vencimiento (AAAA-MM-DD)",
    "Estado (se calcula por vencimiento — opcional)"
  ];
  const sheetO = wb.addWorksheet("Obligaciones");
  sheetO.addRow(hObl);
  const sheetT = wb.addWorksheet("Tareas");
  sheetT.addRow(hTar);

  const lastData = 500;
  for (let row = 2; row <= lastData; row++) {
    sheetO.getCell(row, 1).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`=Listas!$A$1:$A$${nCli}`]
    };
    sheetO.getCell(row, 2).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`=Listas!$B$1:$B$${nUsr}`]
    };
    sheetO.getCell(row, 3).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`=Listas!$C$1:$C$${nCat}`]
    };
    sheetO.getCell(row, 4).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`=Listas!$G$1:$G$${nMe}`]
    };
  }
  for (let row = 2; row <= lastData; row++) {
    sheetT.getCell(row, 1).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`=Listas!$A$1:$A$${nCli}`]
    };
    sheetT.getCell(row, 2).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`=Listas!$B$1:$B$${nUsr}`]
    };
    sheetT.getCell(row, 3).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`=Listas!$F$1:$F$${nTa}`]
    };
    sheetT.getCell(row, 4).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`=Listas!$G$1:$G$${nMe}`]
    };
    sheetT.getCell(row, 5).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`=Listas!$D$1:$D$${nTp}`]
    };
    sheetT.getCell(row, 6).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`=Listas!$E$1:$E$${nPr}`]
    };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "plantilla_obligaciones_y_tareas_ATT.xlsx";
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function runOperacionesImport(file, options = {}) {
  const { onAfterImport = async () => {}, progressPrefix = "co" } = options;
  const ui = makeProgressUi(progressPrefix);
  ui.show("Leyendo archivo...");
  try {
    const XLSX = window.XLSX;
    if (!XLSX) {
      ui.hide();
      alert("No se pudo cargar el lector de Excel. Verificá tu conexión y recargá la página.");
      return;
    }

    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab);
    const names = wb.SheetNames || [];
    const updatedBy = appState.session.user?.name ?? "";

    const sheetKey = (s) => normHeaderCell(s).replace(/\s+/g, "");
    const oblName = names.find((n) => sheetKey(n) === "obligaciones");
    const tarName = names.find((n) => {
      const x = sheetKey(n);
      return x === "tareas" || x === "tarea";
    });

    let pending = [];
    const allWarnings = [];

    if (oblName) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[oblName], { header: 1, defval: "" });
      const r = buildRowsFromObligacionesSheet(raw, updatedBy);
      pending = pending.concat(r.pending);
      allWarnings.push(...r.warnings);
    }
    if (tarName) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[tarName], { header: 1, defval: "" });
      const r = buildRowsFromTareasSheet(raw, updatedBy);
      pending = pending.concat(r.pending);
      allWarnings.push(...r.warnings);
    }

    if (!oblName && !tarName) {
      const ws = wb.Sheets[names[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      if (!raw.length) {
        ui.hide();
        alert("El archivo está vacío.");
        return;
      }

      const norm = (s) =>
        String(s || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();
      let headerRow = -1;
      for (let i = 0; i < Math.min(raw.length, 15); i++) {
        const row = (raw[i] || []).map(norm);
        if (row.includes("usuario") && row.includes("cliente")) {
          headerRow = i;
          break;
        }
      }

      if (headerRow < 0) {
        ui.hide();
        alert(
          "No reconocí el formato.\n\n· Descargá la plantilla (hojas Obligaciones y Tareas), o\n· usá un export Plan-in con columnas Usuario y Cliente."
        );
        return;
      }

      const headers = (raw[headerRow] || []).map(norm);
      const idx = (...keys) => {
        for (const k of keys) {
          const j = headers.indexOf(norm(k));
          if (j >= 0) return j;
        }
        return -1;
      };

      const iU = idx("usuario");
      const iC = idx("cliente");
      const iO = idx("obligacion/tarea", "obligacion", "tarea");
      const iAnt = idx("anticipo");
      const iCu = idx("cuota");
      const iPe = idx("periodo", "período");
      const iV = idx("vencimiento");
      const iPr = idx("presentacion", "presentación");
      const iFR = idx("fecha registro");
      const iTp = idx("tipo período", "tipo periodo");
      const iTpr = idx("tipo programación", "tipo programacion");
      const g = (row, col) => (col >= 0 ? String(row[col] ?? "").trim() : "");

      for (let i = headerRow + 1; i < raw.length; i++) {
        const row = raw[i] || [];
        const clienteNombre = g(row, iC);
        const obligacion = g(row, iO);
        if (!clienteNombre || !obligacion) continue;

        const clienteMatch = appState.clientes.items.find(
          (c) => (c.nombre || "").toLowerCase() === clienteNombre.toLowerCase()
        );
        const cuit = clienteMatch?.cuit ?? "";
        let periodo = g(row, iPe);
        const periodoNorm = normalizePeriodoForCalc(periodo);
        let vencimiento = parseOpExcelDate(g(row, iV));
        const fecha_registro = parseOpExcelDate(g(row, iFR));
        const esTarea = esNombreTareaPlanIn(obligacion);
        let tipo = "obligacion";
        let tipoPeriodo = null;
        let tipoProgramacion = null;

        if (esTarea) {
          tipo = "tarea";
          tipoPeriodo = coincideTipoPermitido(g(row, iTp), TIPOS_PERIODO);
          tipoProgramacion = coincideTipoProgramacion(g(row, iTpr));
          if (!periodoNorm) {
            allWarnings.push(`Plan-in fila ${i + 1} tarea "${obligacion}": falta período.`);
            continue;
          }
          if (!tipoPeriodo || !tipoProgramacion) {
            allWarnings.push(
              `Plan-in fila ${i + 1} tarea "${obligacion}": columnas "Tipo período" y "Tipo programación" obligatorias.`
            );
            continue;
          }
          if (!vencimiento) {
            allWarnings.push(`Plan-in fila ${i + 1} tarea "${obligacion}": vencimiento obligatorio.`);
            continue;
          }
          const terrPi = validarTareaPeriodoYVencimiento(periodoNorm, vencimiento);
          if (terrPi) {
            allWarnings.push(`Plan-in fila ${i + 1} tarea "${obligacion}": ${terrPi}`);
            continue;
          }
          periodo =
            monthInputToPeriodo(periodo.match(/^\d{4}-\d{2}$/) ? periodo : "") || periodoNorm;
        } else {
          if (!periodoNorm) {
            allWarnings.push(`Plan-in fila ${i + 1} obligación "${obligacion}": falta período.`);
            continue;
          }
          const limPi = validarPeriodoObligacionVsCalendario(periodoNorm);
          if (!limPi.ok) {
            allWarnings.push(`Plan-in fila ${i + 1} obligación "${obligacion}": ${limPi.mensaje}`);
            continue;
          }
          if (!vencimiento) {
            const cat = findObligacionByNombre(obligacion);
            if (cat) {
              const res = calcularVencimiento(cat.calcRule, periodoNorm, cuit);
              if (res.iso) vencimiento = res.iso;
            }
          }
          if (!vencimiento) {
            allWarnings.push(
              `Plan-in fila ${i + 1} obligación "${obligacion}": sin vencimiento y no se pudo calcular (catálogo/período/CUIT).`
            );
            continue;
          }
          periodo =
            monthInputToPeriodo(periodo.match(/^\d{4}-\d{2}$/) ? periodo : "") || periodoNorm;
        }

        const cat = findObligacionByNombre(obligacion);
        const tipoPeriodoOut = esTarea
          ? tipoPeriodo
          : cat
            ? tipoPeriodoImplicitoObligacion(cat.calcRule) ?? "Mes vencido"
            : "Mes vencido";
        const payload = {
          tipo,
          responsable: g(row, iU),
          clienteNombre,
          clienteId: clienteMatch?.id ?? "",
          obligacion,
          anticipo: g(row, iAnt),
          cuota: g(row, iCu),
          periodo,
          vencimiento,
          estado: estadoInicialSegunVencimiento(vencimiento),
          presentacion: g(row, iPr),
          fecha_registro,
          organismo: cat?.organismo ?? inferOrganismo(obligacion),
          notas: "",
          tipoPeriodo: tipoPeriodoOut,
          tipoProgramacion,
          updated_by: updatedBy
        };

        const docId =
          [
            normForDocId(clienteNombre),
            normForDocId(obligacion),
            normForDocId(periodo) || normForDocId(vencimiento)
          ]
            .filter(Boolean)
            .join("_") || `op-${Date.now()}-${i}`;

        pending.push({ docId, payload });
      }
    }

    if (!pending.length) {
      ui.hide();
      const w = allWarnings.length ? `\n\nAvisos:\n${allWarnings.slice(0, 12).join("\n")}` : "";
      alert(`No se encontraron registros válidos.${w}`);
      return;
    }

    const BATCH_SIZE = 490;
    ui.show(`Subiendo ${pending.length} registros...`);
    for (let j = 0; j < pending.length; j += BATCH_SIZE) {
      const chunk = pending.slice(j, j + BATCH_SIZE);
      await importOperacionesBatch(chunk);
      if (pending.length > BATCH_SIZE) {
        const uploaded = Math.min(j + BATCH_SIZE, pending.length);
        ui.show(`Subiendo... ${Math.round((uploaded / pending.length) * 100)}%`);
      }
    }

    appState.operaciones.items = await fetchOperaciones();
    ui.hide();
    await onAfterImport();

    let msg = `✓ ${pending.length} registro(s) importados.`;
    if (allWarnings.length) {
      msg += `\n\nAvisos u omitidos (${allWarnings.length}):\n${allWarnings.slice(0, 15).join("\n")}`;
      if (allWarnings.length > 15) msg += "\n…";
    }
    alert(msg);
  } catch (err) {
    console.error("Error importando operaciones:", err);
    ui.hide();
    alert(`No se pudo importar el archivo.\n\nDetalle: ${err?.message ?? String(err)}`);
  }
}
