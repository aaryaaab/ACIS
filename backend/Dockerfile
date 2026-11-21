# Build context is the REPOSITORY ROOT (see docker-compose.yml) so the datasets and scripts are included.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /srv/acis/backend

COPY backend/requirements.txt .
RUN pip install -r requirements.txt

COPY backend/ /srv/acis/backend/
COPY datasets/ /srv/acis/datasets/
COPY scripts/ /srv/acis/scripts/

# Do not run as root.
RUN useradd --system --uid 10001 --no-create-home acis && chown -R acis:acis /srv/acis
USER acis

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 \
  CMD python -c "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"

CMD ["python", "entrypoint.py"]
