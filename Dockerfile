# Multi-stage Dockerfile for Osiris Reporting App

# Stage 1: Build backend
FROM node:18-alpine AS backend-builder
WORKDIR /app/backend

# Copy backend package files
COPY server/package*.json ./

# Install backend dependencies
RUN npm ci --only=production

# Copy backend source
COPY server/ ./

# Build backend
RUN npm run build

# Stage 2: Build frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy frontend package files
COPY client/package*.json ./

# Install frontend dependencies
RUN npm ci

# Copy frontend source
COPY client/ ./

# Build frontend
RUN npm run build

# Stage 3: Production runtime
FROM node:18-alpine
WORKDIR /app

# Install dependencies for production
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

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/app/data/osiris.db
ENV BACKUP_PATH=/app/backups
ENV UPLOAD_PATH=/app/uploads
ENV LOG_PATH=/app/logs

# Expose ports
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Entrypoint script
ENTRYPOINT ["sh", "/app/entrypoint.sh"]

# Start application with PM2
CMD ["pm2-runtime", "start", "/app/backend/dist/index.js", "--name", "osiris-reporting"]