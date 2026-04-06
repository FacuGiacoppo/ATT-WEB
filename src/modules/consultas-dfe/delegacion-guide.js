export const DELEGACION_GUIDE = {
  title: "Paso a paso para habilitar un nuevo CUIT en DFE",
  sections: [
    {
      id: "req",
      title: "A. Requisitos previos",
      items: [
        "Tener certificado productivo vigente.",
        "Tener computador fiscal ya creado (por ejemplo: “attweb-prod”).",
        "Tener el backend DFE funcionando en producción (API local o desplegada).",
        "Tener acceso con clave fiscal al cliente o acompañamiento del cliente para delegar el servicio.",
      ],
    },
    {
      id: "cliente",
      title: "B. Delegación del lado del cliente",
      ordered: true,
      items: [
        "Entrar con clave fiscal del cliente.",
        "Ir a “Administrador de Relaciones de Clave Fiscal”.",
        "Operar en nombre de la sociedad/cliente (si aplica).",
        "Elegir “Nueva Relación”.",
        "Buscar el servicio de DFE / Consulta y lectura de Comunicaciones.",
        "En “CUIT/CUIL/CDI del Usuario” ingresar 20279722796.",
        "Confirmar la autorización.",
      ],
    },
    {
      id: "representante",
      title: "C. Aceptación del lado del representante",
      ordered: true,
      items: [
        "Entrar con clave fiscal de 20279722796.",
        "Ir a “Administrador de Relaciones de Clave Fiscal”.",
        "Aceptar la delegación pendiente del cliente.",
        "Volver a “Nueva Relación”.",
        "Elegir como representado al cliente.",
        "Elegir el servicio DFE.",
        "Elegir el computador fiscal “attweb-prod”.",
        "Confirmar.",
      ],
    },
    {
      id: "importante",
      title: "D. Importante",
      items: [
        "ARCA puede demorar algunos minutos en propagar la autorización.",
        "Después de delegar, conviene reiniciar el backend y regenerar el TA (WSAA).",
        "Si el cliente no responde al instante, esperar unos minutos y volver a probar.",
        "Si aparece “relación existente”, revisar antes de duplicar/crear otra relación.",
      ],
      callout: {
        kind: "warn",
        title: "Tip operativo",
        text:
          "Si ves errores de autorización o resultados inconsistentes, probá reiniciar la API DFE para forzar un TA nuevo.",
      },
    },
    {
      id: "prueba",
      title: "E. Prueba técnica posterior",
      code: [
        "curl -s http://127.0.0.1:5050/api/dfe/health",
        "",
        "curl -s -X POST http://127.0.0.1:5050/api/dfe/comunicaciones \\",
        "  -H \"Content-Type: application/json\" \\",
        "  -d '{\"cuitRepresentada\":\"<CUIT_CLIENTE>\",\"fechaDesde\":\"2025-04-12\",\"fechaHasta\":\"2026-04-05\",\"pagina\":1,\"resultadosPorPagina\":10}'",
      ],
    },
    {
      id: "notas",
      title: "F. Notas operativas",
      items: [
        "El certificado no se genera por cada cliente: se reutiliza el mismo certificado productivo.",
        "Se reutiliza el mismo computador fiscal; lo que cambia es la delegación/autorización del servicio por CUIT.",
      ],
    },
  ],
  checklist: [
    "Delegación cliente hecha",
    "Aceptación hecha",
    "Computador fiscal vinculado",
    "Backend reiniciado",
    "Prueba curl OK",
  ],
};

