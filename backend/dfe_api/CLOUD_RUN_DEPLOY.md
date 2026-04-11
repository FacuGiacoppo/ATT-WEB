# DFE API en Cloud Run (mínimo, producción)

## Objetivo
Dejar **`backend/dfe_api`** online 24/7 por HTTPS, sin depender de ninguna PC, y consumible desde el frontend en Firebase Hosting vía proxy `/api/**`.

## Variables de entorno (Cloud Run)
- `ARCA_ENV`: `homologacion` o `produccion`
- `ARCA_WSAA_URL`: opcional (si no, usa default según env)
- `ARCA_VE_WSDL`: opcional (si no, usa default según env)
- `ARCA_WSAA_SERVICE`: default `veconsumerws`
- `ARCA_CUIT_REPRESENTADA`: CUIT (11 dígitos)
- `ARCA_CERT_PATH`: ruta a archivo PEM (montado como secreto)
- `ARCA_KEY_PATH`: ruta a archivo PEM (montado como secreto)
- `ARCA_TA_CACHE_PATH`: opcional (path en FS para cache TA; en Cloud Run es efímero pero ayuda)
- `DFE_CORS_ORIGINS`: lista separada por coma con orígenes permitidos. Ej:
  - `https://att-web-2809.web.app,https://att-web-2809.firebaseapp.com`

## Secret Manager (recomendado)
Crear secretos:
- `att_dfe_cert_pem` (contenido del `cert.pem`)
- `att_dfe_key_pem` (contenido del `key.pem`)

Montaje recomendado en Cloud Run:
- cert → `/secrets/arca/cert.pem`
- key  → `/secrets/arca/key.pem`

Y setear:
- `ARCA_CERT_PATH=/secrets/arca/cert.pem`
- `ARCA_KEY_PATH=/secrets/arca/key.pem`

## Deploy (ejemplo con gcloud)

1) Seleccionar proyecto y región:

```bash
gcloud config set project att-web-2809
# Debe coincidir con `firebase.json` → hosting.rewrites `/api/**` → Cloud Run (region).
gcloud config set run/region southamerica-east1
```

2) Build imagen (Cloud Build) usando el Dockerfile del repo.

La **región del servicio Cloud Run** debe ser **`southamerica-east1`** (igual que `firebase.json` → rewrite `/api/**`). La imagen puede vivir en Artifact Registry en **otra** región del mismo proyecto (p. ej. `us-central1`); lo importante es el `--region` del `gcloud run deploy`.

```bash
TAG="$(date +%Y%m%d-%H%M)"
# Ajustá AR_REGION a donde tengas el repo Docker `att` (Artifact Registry).
AR_REGION="us-central1"

gcloud builds submit \
  --tag "${AR_REGION}-docker.pkg.dev/att-web-2809/att/att-dfe-api:${TAG}" \
  --file backend/dfe_api/Dockerfile \
  .
```

Si es la primera vez, creá el repo de Artifact Registry (una vez), en la región que elijas arriba:

```bash
gcloud artifacts repositories create att \
  --repository-format=docker \
  --location="${AR_REGION}"
```

3) Deploy Cloud Run (desde la imagen; **siempre** `southamerica-east1` para coincidir con Firebase Hosting):

```bash
# Mismo tag que usaste en el build; AR_REGION el mismo que en el paso 2.
IMAGE="${AR_REGION}-docker.pkg.dev/att-web-2809/att/att-dfe-api:REEMPLAZAR_TAG"

gcloud run deploy att-dfe-api \
  --region southamerica-east1 \
  --image "$IMAGE" \
  --allow-unauthenticated \
  --set-env-vars ARCA_ENV=homologacion,ARCA_WSAA_SERVICE=veconsumerws,ARCA_CUIT_REPRESENTADA=20123456789,DFE_CORS_ORIGINS=https://att-web-2809.web.app,https://att-web-2809.firebaseapp.com,ARCA_CERT_PATH=/secrets/arca/cert.pem,ARCA_KEY_PATH=/secrets/arca/key.pem \
  --set-secrets /secrets/arca/cert.pem=att_dfe_cert_pem:latest,/secrets/arca/key.pem=att_dfe_key_pem:latest
```

4) Probar health:

Abrí en el navegador (o curl):
- `GET /api/dfe/health`

Debe devolver JSON con `ok=true` y `configPresent=true`.

## Firebase Hosting (proxy /api/**)
En `firebase.json` ya quedó configurado:
- `/api/**` → Cloud Run service `att-dfe-api` (ajustar región si cambia)
- `**` → `index.html` (SPA)

Cuando el proxy está bien:
- el frontend llama `fetch("/api/dfe/health")` sin hardcodear URL externa.

