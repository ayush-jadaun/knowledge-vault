# =============================================================================
# Go — Multi-Stage Production Dockerfile
# =============================================================================
# Features:
#   - Multi-stage build with static binary (CGO_ENABLED=0)
#   - Final image uses distroless for minimal attack surface (~2MB base)
#   - Non-root user
#   - Scratch-compatible (no shell, no package manager)
#   - Build cache optimization with go mod download
#
# Build:
#   docker build -t myapp:latest .
#
# Run:
#   docker run -p 8080:8080 myapp:latest
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------------------------------
FROM golang:1.22-alpine AS build

# Install git (needed for go mod download) and CA certificates
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /src

# Copy go.mod and go.sum first for dependency caching
COPY go.mod go.sum ./
RUN go mod download && go mod verify

# Copy source code
COPY . .

# Build a fully static binary
# CGO_ENABLED=0  — no C dependencies, fully static
# -ldflags        — strip debug info for smaller binary
# -trimpath       — remove file system paths from binary (reproducible builds)
# -tags timetzdata — embed timezone data (no OS dependency)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w -X main.version=$(git describe --tags --always --dirty 2>/dev/null || echo 'dev') -X main.buildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    -trimpath \
    -tags timetzdata \
    -o /app/server \
    ./cmd/server

# ---------------------------------------------------------------------------
# Stage 2: Production (distroless)
# ---------------------------------------------------------------------------
# gcr.io/distroless/static-debian12 contains:
#   - CA certificates
#   - /etc/passwd (nonroot user)
#   - timezone data
#   - No shell, no package manager — minimal attack surface
FROM gcr.io/distroless/static-debian12:nonroot

# Copy timezone data and CA certificates from build stage
COPY --from=build /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy the compiled binary
COPY --from=build /app/server /server

# Copy any static assets or config files needed at runtime
# COPY --from=build /src/configs /configs
# COPY --from=build /src/migrations /migrations

# Use the built-in nonroot user (UID 65532)
USER nonroot:nonroot

# Expose the application port
EXPOSE 8080

# Run the binary directly — no shell needed
ENTRYPOINT ["/server"]
