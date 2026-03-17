# =============================================================================
# Python — Multi-Stage Production Dockerfile
# =============================================================================
# Features:
#   - Multi-stage build with virtualenv isolation
#   - slim base image for minimal size
#   - Gunicorn WSGI server with sensible defaults
#   - Non-root user
#   - No pip/setuptools in production image
#   - Build-time dependency compilation separated from runtime
#
# Build:
#   docker build -t myapp:latest .
#
# Run:
#   docker run -p 8000:8000 --env-file .env myapp:latest
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Builder — install dependencies
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS builder

# Install build dependencies for compiling Python packages (psycopg2, etc.)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        gcc \
    && rm -rf /var/lib/apt/lists/*

# Create a virtualenv to isolate dependencies
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Upgrade pip and install wheel for faster installs
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Copy requirements first for layer caching
COPY requirements.txt .

# Install Python dependencies into the virtualenv
# --no-cache-dir reduces image size
# --no-compile skips .pyc generation (done at runtime)
RUN pip install --no-cache-dir --no-compile -r requirements.txt

# ---------------------------------------------------------------------------
# Stage 2: Production
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS production

# Install runtime dependencies only (no build tools)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libpq5 \
        curl \
        tini \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get purge -y --auto-remove

# Set Python environment variables
# PYTHONDONTWRITEBYTECODE — prevents .pyc files (reduces disk writes in container)
# PYTHONUNBUFFERED — ensures logs are immediately flushed
# PYTHONFAULTHANDLER — enables fault handler for better crash diagnostics
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PORT=8000

# Copy virtualenv from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Create non-root user
RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --shell /bin/false --create-home appuser

WORKDIR /app

# Copy application code
COPY --chown=appuser:appgroup . .

# Compile Python files to bytecode for faster startup
RUN python -m compileall -q .

# Switch to non-root user
USER appuser

# Expose application port
EXPOSE ${PORT}

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Use tini as init process
ENTRYPOINT ["tini", "--"]

# Start Gunicorn with production settings
# Workers: (2 * CPU cores) + 1 is the recommended formula
# timeout: 120s for long-running requests
# graceful-timeout: 30s for graceful shutdown
# access-logfile: log to stdout for container logging
CMD ["gunicorn", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "4", \
     "--worker-class", "gthread", \
     "--threads", "2", \
     "--timeout", "120", \
     "--graceful-timeout", "30", \
     "--keep-alive", "5", \
     "--max-requests", "1000", \
     "--max-requests-jitter", "50", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "--log-level", "info", \
     "app.wsgi:application"]
