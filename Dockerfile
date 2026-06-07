# ── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-slim AS build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci

COPY frontend/ ./frontend/
RUN cd frontend && npm run build


# ── Stage 2: Python runtime + Typst ─────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# curl needed for Typst download and HEALTHCHECK; xz-utils for .tar.xz extraction
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Download and install Typst binary — auto-detects x86_64 / aarch64
ARG TYPST_VERSION=v0.14.2
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then TARGET="x86_64"; \
    elif [ "$ARCH" = "aarch64" ]; then TARGET="aarch64"; \
    else echo "Unsupported architecture: $ARCH" && exit 1; fi && \
    curl -fsSL "https://github.com/typst/typst/releases/download/${TYPST_VERSION}/typst-${TARGET}-unknown-linux-musl.tar.xz" \
        -o /tmp/typst.tar.xz && \
    tar -xJf /tmp/typst.tar.xz \
        --strip-components=1 \
        -C /usr/local/bin \
        "typst-${TARGET}-unknown-linux-musl/typst" && \
    rm /tmp/typst.tar.xz && \
    typst --version

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY *.py ./
COPY templates/ ./templates/

# Copy built frontend from Stage 1
COPY --from=build /app/frontend/dist ./frontend/dist

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8080/api/v1/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
