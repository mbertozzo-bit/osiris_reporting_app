# Multi-stage Dockerfile for Osiris Reporting App

# Stage 1: Build backend
FROM node:18-slim AS backend-builder
WORKDIR /app/backend

# Copy ONLY the package.json (ignore the Windows lockfile)
COPY server/package.json ./

# Install all dependencies from scratch for Linux
RUN npm install

# Copy backend source
COPY server/ ./

# Build backend
RUN npm run build

# Stage 2: Build frontend
FROM node:18-slim AS frontend-builder
WORKDIR /app/frontend

# Copy ONLY the package.json (ignore the Windows lockfile)
COPY client/package.json ./

# Install frontend dependencies from scratch for Linux
RUN npm install

# Explicitly install the Linux binary for Tailwind 4
RUN npm install @tailwindcss/oxide-linux-x64-gnu

# Copy frontend source
COPY client/ ./

# Build frontend
RUN npm run build

# Stage 3: Production runtime
FROM node:18-slim
WORKDIR /app

# Install dependencies for production (and wget for healthcheck)
RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*
RUN npm install -g pm2

# Create app structure
RUN mkdir -p backend frontend data backups logs uploads

# Copy built backend
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/package*.json ./backend/
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy configuration files
COPY server/.env.example ./backend/.env.example
COPY docker/entrypoint.sh ./entrypoint.sh

# Create non-root user (Debian syntax)
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -s /bin/sh -m nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

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