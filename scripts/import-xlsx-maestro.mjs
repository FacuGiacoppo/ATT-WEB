/**
 * Genera `src/data/obligaciones-plan-master-curated.js` desde un Excel exportado del maestro.
 * Uso: node scripts/import-xlsx-maestro.mjs [ruta/al/obligaciones-plan-master.xlsx]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const xlsxPath =
  process.argv[2] || path.join(process.env.HOME || "", "Downloads/obligaciones-plan-master.xlsx");

if (!fs.existsSync(xlsxPath)) {
  console.error("No existe:", xlsxPath);
  process.exit(1);
}

const wb = XLSX.readFile(xlsxPath);
const sheet = wb.Sheets["Maestro"];
if (!sheet) {
  console.error('Falta hoja "Maestro"');
  process.exit(1);
}

const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

const items = rows
  .map((row) => {
    let calcRule = { type: "manual" };
    try {
      const j = row.calcRule_json;
      if (j != null && String(j).trim() !== "") calcRule = JSON.parse(String(j));
    } catch {
      calcRule = { type: "manual" };
    }
    const tipoRaw = String(row.tipo || "")
      .trim()
      .toLowerCase();
    const tipo = tipoRaw === "obligacion" ? "obligacion" : "tarea";
    const jur = String(row.jurisdiccion || "")
      .trim()
      .toLowerCase();
    const jurisdiccion = ["nacional", "provincial", "municipal", "no_aplica"].includes(jur)
      ? jur
      : undefined;
    const rec = String(row.recurrencia || "").trim();
    return {
      id: String(row.id || "").trim(),
      tipo,
      rubro: String(row.rubro || "").trim(),
      nombre: String(row.nombre || "").trim(),
      organismo: String(row.organismo || "").trim(),
      recurrencia: rec || undefined,
      calcRule,
      jurisdiccion,
    };
  })
  .filter((x) => x.id && x.nombre);

const outPath = path.join(root, "src/data/obligaciones-plan-master-curated.js");
const json = JSON.stringify(items, null, 2);
fs.writeFileSync(
  outPath,
  `/**\n * Maestro plan-in curado (generado con scripts/import-xlsx-maestro.mjs).\n * No editar a mano: volvé a importar desde Excel.\n */\nexport const CURATED_PLAN_MASTER = ${json};\n`,
  "utf8"
);
console.log("Escrito:", outPath, `(${items.length} ítems) desde`, xlsxPath);
