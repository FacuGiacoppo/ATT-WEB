# Cloud Scheduler → sync DFE (Cloud Run, OIDC)

Objetivo: ejecutar **cada 1 hora** un sync masivo contra ARCA y volcar en Firestore (`dfe_comunicaciones`), **sin token Firebase manual**.

## Cómo se autentica

1. Creás un **service account** dedicado (ej. `cloud-scheduler-dfe@PROJECT.iam.gserviceaccount.com`).
2. Le das **`roles/run.invoker`** sobre el servicio Cloud Run de la API DFE.
3. El job de **Cloud Scheduler** usa **HTTP POST** con **OIDC**: Google firma un JWT y Cloud Run lo valida.
4. En la API, el endpoint **`POST /api/dfe/sync/cron`** valida ese JWT con audience = **URL HTTPS del servicio Cloud Run** (la misma que pasás a `--oidc-token-audience`).

**Importante:** el Scheduler debe apuntar a la **URL de Cloud Run** (`https://….run.app`), no a Firebase Hosting, porque el **audience OIDC** debe coincidir con el servicio que recibe la petición.

## Variables de entorno (Cloud Run)

| Variable | Descripción |
|----------|-------------|
| `DFE_CRON_AUDIENCE` | **Obligatoria** para el cron. URL base del servicio, **sin path** final raro: ej. `https://att-dfe-api-xxxxx-sa.run.app` (misma que audience del job). |
| `DFE_CRON_SYNC_DAYS` | Días hacia atrás para consultar ARCA en el job (default **90**, máx. 365). |
| `DFE_CRON_SA_EMAIL` | Opcional. Si la definís, solo acepta OIDC cuyo `email` coincida (defensa en profundidad). Debe ser el mail del SA del Scheduler. |

El sync **manual** desde la app sigue usando `POST /api/dfe/sync` con Firebase ID token y respeta `DFE_SYNC_DAYS` / default de `sync_service`.

## Incrementalidad y `lastSyncAt`

- Cada comunicación se guarda en `dfe_comunicaciones` con id **`{CUIT}__{idComunicacion}`** y **`merge=True`**: no se duplican documentos; se actualizan campos en cada corrida.
- Por cliente, en **`dfe_clients/{cuit}`** se escribe (entre otros):
  - `lastSyncAt` (timestamp servidor)
  - `lastSyncOk`, `lastSyncError`
  - `lastSyncFechaDesde`, `lastSyncFechaHasta`, `lastSyncWindowDays`, `lastSyncUpserted`
  - `lastSyncSource`: `scheduler` | `manual`

## Ejemplo: crear job (cada hora)

Sustituí `PROJECT_ID`, `REGION`, `RUN_SERVICE`, `RUN_URL` y el nombre del servicio Cloud Run.

```bash
export PROJECT_ID=att-web-2809
export REGION=southamerica-east1
export RUN_SERVICE=att-dfe-api
# URL exacta del servicio (sin barra final):
export RUN_URL="https://att-dfe-api-xxxxxx-sa.run.app"
export CRON_SA="cloud-scheduler-dfe@${PROJECT_ID}.iam.gserviceaccount.com"

# 1) Service account (una vez)
gcloud iam service-accounts create cloud-scheduler-dfe \
  --project="${PROJECT_ID}" \
  --display-name="DFE hourly sync (Scheduler)"

# 2) Invoker sobre Cloud Run
gcloud run services add-iam-policy-binding "${RUN_SERVICE}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --member="serviceAccount:${CRON_SA}" \
  --role="roles/run.invoker"

# 3) Job cada hora (minuto 0)
gcloud scheduler jobs create http dfe-sync-hourly \
  --project="${PROJECT_ID}" \
  --location="${REGION}" \
  --schedule="0 * * * *" \
  --time-zone="America/Argentina/Buenos_Aires" \
  --uri="${RUN_URL}/api/dfe/sync/cron" \
  --http-method=POST \
  --oidc-service-account-email="${CRON_SA}" \
  --oidc-token-audience="${RUN_URL}"

# 4) En Cloud Run, configurá al menos:
#   DFE_CRON_AUDIENCE = ${RUN_URL}
#   DFE_CRON_SYNC_DAYS = 90
# Opcional: DFE_CRON_SA_EMAIL = ${CRON_SA}
```

Probar una corrida manual:

```bash
gcloud scheduler jobs run dfe-sync-hourly --project="${PROJECT_ID}" --location="${REGION}"
```

Revisá logs del servicio Cloud Run y documentos en `dfe_clients` / `dfe_comunicaciones`.
