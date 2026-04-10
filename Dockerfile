# Multi-stage Dockerfile for Osiris Reporting App

# Stage 1: Build backend (compiled on server)
FROM node:18-slim AS backend-builder
WORKDIR /app/backend
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# Stage 2: Production runtime
FROM node:18-slim
WORKDIR /app

# Install dependencies (pm2 for process management and wget for healthcheck)
RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*
RUN npm install -g pm2

# Create app structure
RUN mkdir -p backend frontend data backups logs uploads

# Copy built backend from Stage 1
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/package*.json ./backend/
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules

# Copy PRE-BUILT frontend from local 'client/dist'
# (Note: You must run 'npm run build' locally before building this image)
COPY client/dist ./frontend/dist

# Copy configuration files
COPY server/.env.example ./backend/.env.example
COPY docker/entrypoint.sh ./entrypoint.sh

# Create non-root user (Debian syntax)
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -s /bin/sh -m nodejs && \
    chown -R nodejs:nodejs /app

# (Removed USER nodejs to allow entrypoint to run as root and fix permissions)

# Set environment variables
ENV NODE_ENV=production
ENV PORT=9001
ENV DATABASE_PATH=/app/data/osiris.db
ENV BACKUP_PATH=/app/backups
ENV UPLOAD_PATH=/app/uploads
ENV LOG_PATH=/app/logs

# Expose ports
EXPOSE 9001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:9001/api/health || exit 1

# Entrypoint script
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]

# Start application with PM2
CMD ["pm2-runtime", "start", "/app/backend/dist/index.js", "--name", "osiris-reporting"]