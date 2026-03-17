# =============================================================================
# Node.js 20 Alpine — Multi-Stage Production Dockerfile
# =============================================================================
# Features:
#   - Multi-stage build for minimal image size
#   - TypeScript compilation in build stage
#   - Non-root user for security
#   - tini init for proper signal handling (PID 1 problem)
#   - Health check built in
#   - Optimized layer caching
#
# Build:
#   docker build -t myapp:latest .
#
# Run:
#   docker run -p 3000:3000 --env-file .env myapp:latest
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Dependencies
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps

# Install security updates
RUN apk update && apk upgrade --no-cache

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install ALL dependencies (including devDependencies for build)
# --ignore-scripts prevents arbitrary code execution from packages
RUN npm ci --ignore-scripts

# ---------------------------------------------------------------------------
# Stage 2: Build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Compile TypeScript
RUN npm run build

# Prune devDependencies — only keep production deps
RUN npm prune --production && \
    # Clean npm cache to reduce image size
    npm cache clean --force

# ---------------------------------------------------------------------------
# Stage 3: Production
# ---------------------------------------------------------------------------
FROM node:20-alpine AS production

# Install tini for proper init process (handles signals, reaps zombies)
# Install curl for health checks
# Install security updates
RUN apk update && \
    apk upgrade --no-cache && \
    apk add --no-cache tini curl && \
    # Remove apk cache
    rm -rf /var/cache/apk/*

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Create non-root user and group
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

WORKDIR /app

# Copy built application and production dependencies
COPY --from=build --chown=appuser:appgroup /app/dist ./dist
COPY --from=build --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appgroup /app/package.json ./package.json

# Switch to non-root user
USER appuser

# Expose application port
EXPOSE ${PORT}

# Health check — checks every 30s, times out after 5s, retries 3x
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

# Use tini as init process — ensures proper signal forwarding
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "dist/index.js"]
