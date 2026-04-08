FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dependencias primero (mejor cache)
COPY backend/arca_ve_connector/requirements.txt /app/backend/arca_ve_connector/requirements.txt
COPY backend/dfe_api/requirements.txt /app/backend/dfe_api/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/dfe_api/requirements.txt

# Código (DFE API + conector ARCA)
COPY backend/arca_ve_connector /app/backend/arca_ve_connector
COPY backend/dfe_api /app/backend/dfe_api

WORKDIR /app/backend/dfe_api

# Cloud Run inyecta PORT
ENV PORT=8080

EXPOSE 8080

# Gunicorn recomendado en Cloud Run
RUN pip install --no-cache-dir gunicorn
CMD ["gunicorn", "-b", ":8080", "--workers", "2", "--threads", "8", "--timeout", "120", "server:app"]

