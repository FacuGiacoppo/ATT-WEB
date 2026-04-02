export const appState = {
  session: {
    user: null,
    isAuthenticated: false
  },
  ui: {
    activeRoute: "login",
    modal: null,
    modalPayload: null,
    loading: false
  },
  requerimientos: {
    items: [],
    stageFilter: "todos",
    search: ""
  },
  clientes: {
    items: [],
    selectedId: null,
    search: "",
    isNew: false,
    insightsFilters: {},       // { tipo_societario: ["SRL","SA"], ... }  – [] = todos
    insightsEtiquetaTipo: "",  // tag type selected in insights
    insightsEtiquetaValues: [] // tag values selected in insights
  },
  contactos: {
    items: [],          // contacts for the currently selected client
    clienteId: null,    // which client these contacts belong to
    isAddingNew: false, // true when the add-new form is open
    editId: null        // id of the contact being edited (null = not editing)
  },
  operaciones: {
    items: [],
    loadError: null,
    search: "",
    estadoFilter: "todos",
    organismoFilter: "todos",
    clienteFilter: "",
    obligacionFilter: "",
    mesVtoFilter: "",
    usuarioFilter: "",
    sortKey: "vencimiento",
    sortDir: "asc",
    cumplimentarContactos: []
  },
  /** Filtros de la Central de operaciones (solo superadmin). */
  centralOperaciones: {
    filterClienteId: "",
    filterTipo: "todos",
    filterText: "",
    filterVencMonth: "",
    filterObligacionContains: ""
  }
};

export function setState(path, value) {
  const keys = path.split(".");
  let target = appState;

  for (let i = 0; i < keys.length - 1; i += 1) {
    target = target[keys[i]];
  }

  target[keys[keys.length - 1]] = value;
}

export function resetSession() {
  appState.session.user = null;
  appState.session.isAuthenticated = false;
  appState.ui.activeRoute = "login";
}
