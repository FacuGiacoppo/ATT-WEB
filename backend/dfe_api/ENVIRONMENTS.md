# Entornos DFE API (homologación y producción)

La API en `backend/dfe_api` aplica automáticamente URLs de **WSAA** y **WSDL VEConsumer** según `ARCA_ENV` (o `DFE_ARCA_ENV`) **solo si** no definís `ARCA_WSAA_URL` y `ARCA_VE_WSDL` a mano. Así no se rompe una `.env` que ya fija URLs explícitas.

## Selector de entorno

| Variable | Valores reconocidos |
|----------|---------------------|
| `ARCA_ENV` o `DFE_ARCA_ENV` | **Homologación:** `homologacion`, `qa`, `homo`, `test`, `staging` |
| | **Producción:** `produccion`, `prod`, `production`, `live` |
| *(omitida)* | Equivale a **homologación** (mismo comportamiento que antes). |

## URLs por defecto (si no están en el entorno)

### Homologación

- `ARCA_WSAA_URL` → `https://wsaahomo.afip.gov.ar/ws/services/LoginCms`
- `ARCA_VE_WSDL` → `https://stable-middleware-tecno-ext.afip.gob.ar/ve-ws/services/veconsumer?wsdl`

### Producción

- `ARCA_WSAA_URL` → `https://wsaa.afip.gov.ar/ws/services/LoginCms`
- `ARCA_VE_WSDL` → `https://infraestructura.afip.gob.ar/ve-ws/services/veconsumer?wsdl`

Si en tu `.env` ya tenés estas claves definidas, **no se sobrescriben**. Para forzar producción con los defaults anteriores, podés poner solo:

```bash
ARCA_ENV=produccion
```

y borrar o comentar `ARCA_WSAA_URL` y `ARCA_VE_WSDL` si querés que los elija el runtime.

## Certificados y clave

Siempre necesitás (como mínimo):

| Variable | Descripción |
|----------|-------------|
| `ARCA_CERT_PATH` | PEM del certificado de firma |
| `ARCA_KEY_PATH` | PEM de la clave privada |
| `ARCA_CUIT_REPRESENTADA` | CUIT del representante (11 dígitos; usado también por el CLI del conector) |

### Opcional: cert distinto por entorno

Si querés tener **dos pares** de archivos (homo y prod) en la misma máquina:

| Homologación | Producción |
|--------------|------------|
| `ARCA_CERT_PATH_HOMOLOGACION` o `ARCA_CERT_PATH_HOMO` | `ARCA_CERT_PATH_PRODUCCION` |
| `ARCA_KEY_PATH_HOMOLOGACION` o `ARCA_KEY_PATH_HOMO` | `ARCA_KEY_PATH_PRODUCCION` |

Con `ARCA_ENV=homologacion` se aplican las rutas `*_HOMOLOGACION` / `*_HOMO` sobre `ARCA_CERT_PATH` / `ARCA_KEY_PATH` si están definidas. Con `ARCA_ENV=produccion`, lo mismo con `*_PRODUCCION`.

## Servicio WSAA (TRA)

| Variable | Default |
|----------|---------|
| `ARCA_WSAA_SERVICE` | `veconsumerws` |

## Checklist para pasar a producción

1. Obtener certificado y clave **productivos** autorizados en ARCA para VE / e-Ventanilla.
2. En `.env` (o variables del host):
   - `ARCA_ENV=produccion`
   - `ARCA_CERT_PATH` y `ARCA_KEY_PATH` apuntando al PEM productivo **o** `ARCA_CERT_PATH_PRODUCCION` / `ARCA_KEY_PATH_PRODUCCION`.
   - Confirmar que `ARCA_WSAA_URL` y `ARCA_VE_WSDL` sean los de producción **o** dejarlos sin definir para usar los defaults de arriba.
3. Reiniciar el proceso de `server.py`.
4. Verificar `GET /api/dfe/health`: debe mostrar `"environment": "produccion"` y las URLs esperadas.

## Health

`GET /api/dfe/health` incluye (sin rutas de certificados):

- `environment`: `homologacion` | `produccion`
- `arcaEnvRaw`: valor literal de `ARCA_ENV` / `DFE_ARCA_ENV` si existe
- `wsaaUrl`, `veWsdl`, `wsaaService`
- `configPresent`, `configMessage` si falta config
