# Conector ARCA — comunicaciones e-Ventanilla (VEConsumer + WSAA)

Integración **sin navegador**: certificado digital → **WSAA** (token/sign) → **SOAP VEConsumer** según el manual de ARCA para *Consumir comunicaciones por Web Services*.

## Requisitos previos (operativos)

1. **Certificado digital** del integrador (persona jurídica o física que firmará el TRA).
2. **Delegación en ARCA** del servicio de consulta/lectura de comunicaciones hacia ese integrador (mismo esquema que describen terceros tipo SOS).
3. **CUIT representada** por operación: la del contribuyente cuyas comunicaciones se consultan (con relación/delegación vigente).
4. Validar en el manual vigente el nombre exacto del servicio en el TRA (`ARCA_WSAA_SERVICE`, ej. `veconsumerws`) y las URLs QA/prod.

## URLs de referencia (verificar ante cambios de ARCA)

| Entorno | WSDL VEConsumer |
|--------|-----------------|
| QA | `https://stable-middleware-tecno-ext.afip.gob.ar/ve-ws/services/veconsumer?wsdl` |
| Prod | `https://infraestructura.afip.gob.ar/ve-ws/services/veconsumer?wsdl` |

WSAA homologación: `https://wsaahomo.afip.gov.ar/ws/services/LoginCms`  
WSAA producción: `https://wsaa.afip.gov.ar/ws/services/LoginCms`

## Instalación

```bash
cd backend/arca_ve_connector
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Editar .env: rutas a .crt/.key PEM, CUIT, WSDL y servicio WSAA
```

El módulo **firma el TRA con el binario `openssl`** (`openssl smime -sign`). En macOS/Linux suele estar instalado.

### Certificado .p12

Convertir a PEM:

```bash
openssl pkcs12 -in certificado.p12 -clcerts -nokeys -out cert.pem
openssl pkcs12 -in certificado.p12 -nocerts -nodes -out key.pem
```

## Comandos

Orden recomendado en **homologación**: WSAA → `consultarEstados` → `consultarSistemasPublicadores` → `consultarComunicaciones` → (luego) `consumirComunicacion` sin adjuntos.

```bash
# Cargar variables (ejemplo)
set -a; source .env; set +a

# 1) Solo WSAA (si esto falla, no sigas: cert/clave, ambiente, servicio, reloj)
python -m arca_ve_connector.cli wsaa

# 2) Operaciones del WSDL (sin certificado)
python -m arca_ve_connector.cli inspect-wsdl

# 3) Secuencia completa de humo (falla si WSAA, consultarEstados o consultarComunicaciones rompen;
#    consultarSistemasPublicadores es opcional: si falla por id inválido, se avisa y sigue a comunicaciones)
python -m arca_ve_connector.cli smoke-test --debug

# 4) Pasos sueltos
python -m arca_ve_connector.cli probe-consultar-estados --debug
python -m arca_ve_connector.cli probe-consultar-comunicaciones --debug
```

- **`--debug`** puede ir **en cualquier posición** (lo detecta la CLI antes del parseo) o usá **`ARCA_DEBUG=1`** en el entorno.
- En debug: XML del **TRA antes de firmar**, **subject/issuer** del certificado (`openssl x509`), **binding Zeep** (service/port/operaciones) y cuerpos **SOAP** enviados/recibidos (vía Zeep `HistoryPlugin`).
- El **TRA** usa `generationTime` = ahora Argentina **menos 5 minutos** y `expirationTime` = **+10 min** respecto de ese `generationTime` (menos sensibilidad al desfase de reloj vs WSAA).

El WSDL define **`authRequest`** con `token`, `sign` y `cuitRepresentada` (long), **no** campos sueltos fuera de ese tipo. `consumirComunicacion` incluye **`incluirAdjuntos`** (boolean).

### Caché del TA (WSAA)

El conector guarda el último TA válido en un JSON local (por defecto bajo el directorio temporal del SO: `…/arca_ve_connector/wsaa_ta_cache.json`). La clave incluye **certificado + clave + URL WSAA + servicio** (`veconsumerws`). Antes de cada `LoginCms` se reutiliza el TA si **aún no venció** (margen 2 min).

Si WSAA responde **`coe.alreadyAuthenticated`** (“el CEE ya posee un TA válido…”) y hay un TA **vigente en caché**, se usa ese TA y el flujo continúa (p. ej. `smoke-test`). Si no hay caché útil, se informa que hay que esperar el vencimiento del TA en el servidor o reintentar. Variable opcional: **`ARCA_TA_CACHE_PATH`**.

Filtro de `probe-consultar-comunicaciones` / paso (d) de `smoke-test`: `pagina`, `resultadosPorPagina`, `fechaDesde` / `fechaHasta` (`YYYY-MM-dd`). Valores por defecto: últimos ~35 días; personalizar con `ARCA_SMOKE_*` en `.env` (ver `.env.example`).

## Estructura del paquete

| Módulo | Rol |
|--------|-----|
| `config.py` | Variables de entorno |
| `wsaa_client.py` | TRA (skew −5 min), firma CMS, `LoginCms`, parseo de TA |
| `veconsumer_client.py` | Zeep + `HistoryPlugin` si debug; `dump_zeep_binding_info`, `format_soap_fault` |
| `debug_util.py` | `ARCA_DEBUG` / `--debug` |
| `cli.py` | Incluye `smoke-test` |
| `sync_service.py` | Contrato sincronización incremental (pendiente) |
| `firestore_repository.py` | Stub persistencia (Etapa 3) |

## Próximos pasos (roadmap)

1. **Etapa 2**: Fijar parámetros exactos de `consultarComunicaciones` / `consumirComunicacion` según WSDL y pruebas en homologación.
2. **Etapa 3**: `google-cloud-firestore` + colecciones por cliente / comunicación + dedupe por `idComunicacion`.
3. **Etapa 4**: Adjuntos (MTOM) y almacenamiento en Cloud Storage si aplica.
4. **Etapa 5**: API o Cloud Functions que consuma ATT-WEB y UI “Comunicaciones”.

## Seguridad

- No commitear `.env`, claves ni certificados (ver `.gitignore`).
- En producción, ejecutar este conector solo en servidor seguro (VM, Cloud Run, etc.) con secret manager.
