# Multi-stage Dockerfile for VTEX IO Deployment Automation

# Stage 1: Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Stage 2: Production stage
FROM node:18-alpine AS production

# Install system dependencies
RUN apk add --no-cache \
    git \
    curl \
    bash \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S vtex && \
    adduser -S vtex -u 1001 -G vtex

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy configuration files
COPY config/ ./config/

# Create necessary directories
RUN mkdir -p logs && \
    chown -R vtex:vtex /app

# Switch to non-root user
USER vtex

# Expose port (if needed for health checks)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node dist/cli/index.js status --health || exit 1

# Set entrypoint
ENTRYPOINT ["node", "dist/cli/index.js"]

# Default command
CMD ["--help"]

# Labels for metadata
LABEL maintainer="VTEX IO Deployment Team" \
      version="1.0.0" \
      description="VTEX IO Deployment Automation Tool" \
      org.opencontainers.image.title="vtex-deploy" \
      org.opencontainers.image.description="Automated deployment tool for VTEX IO applications" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.vendor="VTEX" \
      org.opencontainers.image.licenses="MIT"