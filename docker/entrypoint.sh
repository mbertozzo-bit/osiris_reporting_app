#!/bin/sh
set -e

echo "Starting Osiris Reporting Application..."

# Create necessary directories if they don't exist
mkdir -p /app/data /app/backups /app/uploads /app/logs

# Set proper permissions
chown -R nodejs:nodejs /app/data /app/backups /app/uploads /app/logs

# Check if .env file exists in backend, copy from example if not
if [ ! -f "/app/backend/.env" ]; then
    echo "No .env file found, copying from example..."
    cp /app/backend/.env.example /app/backend/.env
    
    # Generate random JWT secret if not set
    if grep -q "JWT_SECRET=your-super-secret-jwt-key-change-this-in-production" /app/backend/.env; then
        RANDOM_SECRET=$(openssl rand -base64 32)
        sed -i "s|JWT_SECRET=.*|JWT_SECRET=${RANDOM_SECRET}|" /app/backend/.env
        echo "Generated random JWT secret"
    fi
fi

# Check if database exists, initialize if not
if [ ! -f "/app/data/osiris.db" ]; then
    echo "Database not found, initializing..."
    cd /app/backend
    node dist/database/migrate.js
    echo "Database initialized successfully"
fi

# Start the application
echo "Starting application..."
exec "$@"