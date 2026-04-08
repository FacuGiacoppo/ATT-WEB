# Automatización DFE (Scheduler) — preparado

Este repo ya deja listo el **job manual** de sync:
- `POST /api/dfe/sync` (masivo)
- `POST /api/dfe/sync-client` (1 CUIT)

Ambos requieren:
- Firebase ID token válido (Authorization Bearer)
- Usuario activo y rol permitido
- Rol ∈ `DFE_SYNC_ROLES` (default: `superadmin,admin`)

## Opción recomendada (Cloud Scheduler → HTTP → Cloud Run)

### 1) Crear un “usuario técnico” (opcional pero recomendado)
Crear un usuario de Firebase Auth + doc en `users/{uid}` con:
- `active=true`
- `role=admin` (o un rol dedicado si luego lo agregamos)

### 2) Generar un ID token para el usuario técnico
Hay dos caminos:
- A) usar un pequeño script/CLI fuera del repo que hace login con email/pass y obtiene ID token
- B) (mejor a futuro) migrar a Cloud Tasks/Service-to-service con IAM y quitar necesidad de tokens de usuario

### 3) Crear el job de Cloud Scheduler (HTTP)

```bash
REGION="southamerica-east1"
SERVICE_URL="$(gcloud run services describe att-dfe-api --region "$REGION" --format='value(status.url)')"

gcloud scheduler jobs create http att-dfe-sync \
  --schedule="*/15 * * * *" \
  --uri="$SERVICE_URL/api/dfe/sync" \
  --http-method=POST \
  --time-zone="America/Argentina/Buenos_Aires" \
  --headers="Authorization=Bearer REEMPLAZAR_TOKEN"
```

Notas:
- En esta etapa dejamos “REEMPLAZAR_TOKEN” manual para activar rápido.
- Próximo paso (cuando quieras) es hacer esto robusto sin tokens de usuario (IAM + invoker).

