/**
 * Módulo paralelo a Obligaciones (legacy): flujo tipo plan-in.
 * Cliente, selección y responsables persisten en Firestore (planIn*).
 */
import {
  getPlanMasterCatalog,
  jurisdiccionLabel,
  calcRuleResumen,
  planRubroSortKey,
} from "../../data/obligaciones-plan-master.js";
import { TIPO_OBLIGACION } from "../../data/obligaciones-catalog.js";

function escAttr(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * @param {Array<{ id: string, nombre?: string }>} clientes
 */
function buildMasterTableRowsHtml() {
  const items = getPlanMasterCatalog();
  return items
    .map((item) => {
      const isO = item.tipo === TIPO_OBLIGACION;
      const tipoAttr = isO ? "obligacion" : "tarea";
      const jur = String(item.jurisdiccion ?? "");
      const badgeClass = isO ? "oplan-badge--o" : "oplan-badge--t";
      const badge = isO ? "O" : "T";
      const rubroCell = escHtml(planRubroSortKey(item));
      const iid = escAttr(item.id);
      return `
        <tr class="oplan-master-row" data-oplan-id="${iid}" data-oplan-tipo="${tipoAttr}" data-oplan-jur="${escAttr(jur)}">
          <td class="oplan-td-check">
            <input type="checkbox" class="oplan-cb" data-oplan-id="${iid}" disabled title="Elegí un cliente arriba" aria-label="Asignar al cliente" />
          </td>
          <td><span class="oplan-badge ${badgeClass}">${badge}</span></td>
          <td class="oplan-master-rubro">${rubroCell}</td>
          <td class="oplan-master-name">${escHtml(item.nombre)}</td>
          <td>${escHtml(item.organismo || "—")}</td>
          <td>${escHtml(jurisdiccionLabel(item.jurisdiccion))}</td>
          <td class="oplan-td-venc"><span class="oplan-venc-ref" data-oplan-id="${iid}">—</span></td>
          <td class="oplan-td-muted">${escHtml(calcRuleResumen(item))}</td>
        </tr>`;
    })
    .join("");
}

export function renderObligacionesPlanView(clientes = []) {
  const masterCount = getPlanMasterCatalog().length;
  const sorted = [...clientes].sort((a, b) =>
    String(a.nombre ?? "").localeCompare(String(b.nombre ?? ""), "es", { sensitivity: "base" })
  );
  const options = sorted
    .map(
      (c) =>
        `<option value="${escAttr(c.id)}">${escHtml((c.nombre ?? "").trim() || c.id)}</option>`
    )
    .join("");

  return `
    <section class="oplan-page page-section">
      <div class="req-hero oplan-hero">
        <div class="req-hero-left">
          <div class="req-eyebrow">Planificación · nueva versión</div>
          <h1 class="req-title">Obligaciones plan-in</h1>
          <p class="req-subtitle">
            Flujo tipo plan-in: elegís <strong>cliente</strong>, después marcás en el catálogo qué <strong>obligaciones (O)</strong> y
            <strong>tareas (T)</strong> aplican, y luego <strong>responsables</strong>. Todo se genera <strong>solo hacia adelante</strong>
            desde el mes de alta del cliente (sin períodos pasados). Convive con el módulo <strong>Obligaciones</strong> actual para comparar.
          </p>
        </div>
      </div>

      <div class="oplan-compare">
        <span class="oplan-compare-pill">Paralelo al módulo actual</span>
        <p class="oplan-compare-text">
          No reemplaza ni modifica datos de la grilla histórica. Cuando avancemos, usaremos colecciones y reglas nuevas.
        </p>
      </div>

      <div class="oplan-ot">
        <span class="oplan-ot-badge">O</span>
        <span class="oplan-ot-text"><strong>Obligaciones:</strong> sincronizadas con calendarios de vencimiento (ARCA / reglas ATT). Lo <strong>municipal</strong> también cuenta como <strong>O</strong> (no hay letra aparte): en la tabla la jurisdicción es Municipal y los vencimientos saldrán del <strong>calendario municipal</strong> (lo vemos en la siguiente iteración).</span>
        <span class="oplan-ot-badge oplan-ot-badge--t">T</span>
        <span class="oplan-ot-text"><strong>Tareas:</strong> vencimientos vía el proceso de programación que ya usamos en obligaciones/tareas (no el mismo calendario fiscal automático).</span>
      </div>

      <div class="oplan-steps">
        <h2 class="oplan-h2">Secuencia (como plan-in)</h2>
        <ol class="oplan-step-list">
          <li class="oplan-step oplan-step--active">
            <span class="oplan-step-n">1</span>
            <div class="oplan-step-body">
              <strong>Cliente en el estudio</strong>
              <p>Elegí el cliente para el cual vas a tildar obligaciones y tareas. Mismo universo que <strong>Clientes</strong>. Alta en abril → el calendario arranca desde abril.</p>
              <div class="oplan-client-row">
                <label class="oplan-client-label" for="oplan-select-cliente">Cliente</label>
                <select id="oplan-select-cliente" class="oplan-select-cliente" autocomplete="off">
                  <option value="">— Elegí un cliente —</option>
                  ${options}
                </select>
              </div>
              <p class="oplan-cliente-status is-hidden" id="oplan-cliente-status" role="status" aria-live="polite"></p>
            </div>
          </li>
          <li class="oplan-step">
            <span class="oplan-step-n">2</span>
            <div>
              <strong>Asociación al cliente (catálogo maestro)</strong>
              <p>Listado tipo plan-in (IVA, Ganancias, IIBB Salta, tareas estándar, etc.). Cada ítem es <strong>O</strong> u <strong>T</strong>. Marcás los que aplican; el resto sin tilde.</p>
            </div>
          </li>
          <li class="oplan-step">
            <span class="oplan-step-n">3</span>
            <div>
              <strong>Equipo (varios por ítem)</strong>
              <p>Lo tildado cae en el <strong>carrito</strong>; arrastrás cada obligación o tarea a una o más personas. Un mismo ítem puede estar en varias columnas. Al carrito: sacás a alguien de ese ítem.</p>
            </div>
          </li>
        </ol>
      </div>

      <div class="oplan-panel-section" id="oplan-panel">
        <div class="oplan-panel-head">
          <h2 class="oplan-h2">Distribución al equipo</h2>
          <p class="oplan-panel-intro">
            <strong>Carrito:</strong> ítems sin responsable (o asignaciones que ya no coinciden con <strong>Usuarios</strong>). <strong>Columnas:</strong> una por persona activa en Usuarios. Arrastrá tarjetas entre columnas para sumar responsables; soltá en el carrito para quitar a esa persona del ítem.
            <strong>Venc. ref.</strong> en cada tarjeta (ARCA por terminación de CUIT cuando aplica). Guardado <strong>automático</strong>.
          </p>
          <p id="oplan-save-status" class="oplan-save-status" role="status" aria-live="polite"></p>
        </div>
        <div class="oplan-dispatch" id="oplan-dispatch">
          <div class="oplan-dispatch-row">
            <div class="oplan-cart oplan-drop-zone" data-oplan-drop="cart" id="oplan-cart-zone">
              <div class="oplan-cart-head">
                <h3 class="oplan-cart-title">Carrito</h3>
                <p class="oplan-cart-hint">Sin responsable asignado en el equipo. Arrastrá hacia una columna.</p>
              </div>
              <div id="oplan-cart-list" class="oplan-card-list"></div>
            </div>
            <div class="oplan-team-board">
              <h3 class="oplan-team-title">Equipo</h3>
              <p class="oplan-team-hint">Usuarios activos (misma lista que la sección Usuarios).</p>
              <div id="oplan-team-cols" class="oplan-team-cols"></div>
            </div>
          </div>
        </div>
        <div class="oplan-summary-block">
          <h3 class="oplan-h3">Resumen por ítem</h3>
          <p class="oplan-summary-intro">Vista tipo tabla: todos los tildados con responsables acumulados.</p>
          <div class="oplan-panel-scroll oplan-panel-scroll--summary">
            <table class="oplan-panel-table">
              <thead>
                <tr>
                  <th class="oplan-th-type"></th>
                  <th>Nombre</th>
                  <th class="oplan-th-venc">Venc. ref.</th>
                  <th>Responsables</th>
                </tr>
              </thead>
              <tbody id="oplan-summary-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="oplan-master" id="oplan-master">
        <div class="oplan-master-head">
          <h2 class="oplan-h2">Catálogo maestro (O y T)</h2>
            <p class="oplan-master-intro">
            Orden <strong>alfabético por rubro</strong> y luego por nombre. <strong>${masterCount}</strong> ítems curados (import desde Excel al repo). Elegí <strong>cliente</strong> y tildá filas: se guarda en la ficha del cliente. <strong>Venc. ref.:</strong> si no hay fecha concreta, «Sin determinar»; ARCA con CUIT usa reglas ATT (p. ej. IVA por terminación de CUIT; período de referencia mes anterior).
          </p>
          <p class="oplan-master-xlsx">
            <a id="oplan-maestro-xlsx" class="oplan-maestro-xlsx-link" href="data/obligaciones-plan-master.xlsx" download="obligaciones-plan-master.xlsx">Descargar maestro en Excel</a>
            <span class="oplan-maestro-xlsx-hint">(.xlsx — hojas Maestro e Instrucciones)</span>
          </p>
        </div>
        <div class="oplan-master-filters" role="toolbar" aria-label="Filtrar catálogo">
          <button type="button" class="oplan-filter is-active" data-oplan-filter="all">Todos</button>
          <button type="button" class="oplan-filter" data-oplan-filter="obligacion">Solo O</button>
          <button type="button" class="oplan-filter" data-oplan-filter="tarea">Solo T</button>
          <span class="oplan-filter-sep" aria-hidden="true"></span>
          <button type="button" class="oplan-filter" data-oplan-filter="nacional">Nacional</button>
          <button type="button" class="oplan-filter" data-oplan-filter="provincial">Provincial</button>
          <button type="button" class="oplan-filter" data-oplan-filter="municipal">Municipal</button>
        </div>
        <div class="oplan-master-scroll">
          <table class="oplan-master-table">
            <thead>
              <tr>
                <th class="oplan-th-check" title="Asignar al cliente">✓</th>
                <th class="oplan-th-type"></th>
                <th class="oplan-th-rubro">Rubro</th>
                <th>Nombre</th>
                <th>Ámbito / organismo</th>
                <th>Jurisdicción</th>
                <th class="oplan-th-venc">Venc. ref.</th>
                <th>Regla / nota</th>
              </tr>
            </thead>
            <tbody id="oplan-master-tbody">
              ${buildMasterTableRowsHtml()}
            </tbody>
          </table>
        </div>
      </div>

      <div class="oplan-grid">
        <div class="oplan-card">
          <h3 class="oplan-h3">Calendarios de vencimiento</h3>
          <ul class="oplan-ul">
            <li><strong>O · Nacional (ARCA/AFIP):</strong> reglas y calendarios ya referenciados en ATT.</li>
            <li><strong>O · Provincial (p. ej. DGR Salta):</strong> fuentes externas o carga asistida — por fases.</li>
            <li><strong>O con jurisdicción municipal:</strong> mismo tipo O; vencimientos según calendario municipal por municipio (fuentes o carga manual).</li>
            <li><strong>T:</strong> programación y vencimientos con la lógica ya prevista (no forzar el calendario fiscal de O).</li>
          </ul>
        </div>
        <div class="oplan-card">
          <h3 class="oplan-h3">Próximos pasos técnicos</h3>
          <ul class="oplan-ul">
            <li>Catálogo maestro O/T editable (superadmin).</li>
            <li>Modelo Firestore: cliente ↔ ítems O/T ↔ responsable + ventana temporal.</li>
            <li>Generación de instancias hacia adelante (O con vencimientos; T con programación).</li>
            <li>Panel operativo y vínculo con Central de operaciones cuando estabilicemos datos.</li>
          </ul>
        </div>
      </div>

      <div class="oplan-placeholder oplan-placeholder--done">
        <div class="oplan-placeholder-icon" aria-hidden="true">✓</div>
        <p class="oplan-placeholder-title">Selección por cliente</p>
        <p class="oplan-placeholder-hint">
          La tilde y los responsables (lista por ítem) se guardan en Firestore (<code class="oplan-code">planInSeleccionIds</code>, <code class="oplan-code">planInResponsables</code>). Las <strong>tareas</strong> o ítems sin fecha muestran «Sin determinar»; las <strong>obligaciones</strong> ARCA calculan vencimiento de referencia según CUIT cuando aplica.
        </p>
      </div>
    </section>
  `;
}
