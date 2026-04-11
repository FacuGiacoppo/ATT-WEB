/**
 * Genera `data/obligaciones-plan-master.xlsx` desde el mismo código que usa la app.
 * Uso: npm run export:oplan
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const mod = await import(pathToFileURL(path.join(root, "src/data/obligaciones-plan-master.js")).href);
const {
  getPlanMasterCatalog,
  planRubroSortKey,
  jurisdiccionLabel,
  calcRuleResumen,
} = mod;

const items = getPlanMasterCatalog();

const maestro = items.map((item, idx) => ({
  orden: idx + 1,
  id: item.id ?? "",
  tipo: item.tipo ?? "",
  rubro: item.rubro ?? "",
  rubro_orden: planRubroSortKey(item),
  nombre: item.nombre ?? "",
  organismo: item.organismo ?? "",
  jurisdiccion: item.jurisdiccion ?? "",
  jurisdiccion_etiqueta: jurisdiccionLabel(item.jurisdiccion),
  recurrencia: item.recurrencia ?? "",
  calcRule_json: JSON.stringify(item.calcRule ?? {}),
  regla_resumen: calcRuleResumen(item),
}));

const instr = [
  ["Obligaciones plan-in — export para edición"],
  [""],
  ["Este archivo se genera con: npm run export:oplan"],
  ["Maestro curado: src/data/obligaciones-plan-master-curated.js (import: npm run import:maestro -- path/al.xlsx)."],
  ["En la web: Obligaciones plan-in → «Descargar maestro en Excel»."],
  ["La app usa el JS curado; el Excel sirve para editar y volver a importar."],
  [""],
  ["Columnas:"],
  ["- id: clave estable; si cambiás una fila, mantené id único."],
  ["- tipo: obligacion | tarea"],
  ["- rubro: texto de rubro (p. ej. Agentes Recaudacion ARBA). Vacío = se ordena por organismo / prefijo tarea."],
  ["- rubro_orden: valor calculado (referencia); el orden en pantalla es rubro→nombre."],
  ["- jurisdiccion: nacional | provincial | municipal | no_aplica"],
  ["- calcRule_json: reglas en JSON; no editar a mano salvo que sepas la estructura."],
];

const wb = XLSX.utils.book_new();
const ws1 = XLSX.utils.json_to_sheet(maestro);
const ws2 = XLSX.utils.aoa_to_sheet(instr);
XLSX.utils.book_append_sheet(wb, ws1, "Maestro");
XLSX.utils.book_append_sheet(wb, ws2, "Instrucciones");

const outDir = path.join(root, "data");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "obligaciones-plan-master.xlsx");
XLSX.writeFile(wb, outPath);
console.log("Escrito:", outPath, `(${maestro.length} filas)`);
