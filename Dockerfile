# Dockerfile: the pipeline only (python -m pipeline run). Settings come from environment variables (pipeline/config.py);
# the database password comes from a secret, never from this image.
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app
COPY pipeline/requirements.txt pipeline/requirements.txt
RUN pip install -r pipeline/requirements.txt
COPY pipeline/ pipeline/

# Run as a plain user, not root.
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin pipeline
USER 10001

CMD ["python", "-m", "pipeline", "run"]
