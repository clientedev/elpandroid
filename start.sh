#!/bin/bash
# Railway startup script for ELP Backend

echo "🚀 RAILWAY DEPLOYMENT - Starting ELP Backend..."

# Ensure necessary directories exist
mkdir -p uploads static/reports uploads/ELP

# Check and normalize DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    if [ -n "$POSTGRESQL_URL" ]; then
        export DATABASE_URL="$POSTGRESQL_URL"
    elif [ -n "$DATABASE_PUBLIC_URL" ]; then
        export DATABASE_URL="$DATABASE_PUBLIC_URL"
    elif [ -n "$POSTGRES_URL" ]; then
        export DATABASE_URL="$POSTGRES_URL"
    fi
fi

if [ -n "$DATABASE_URL" ]; then
    echo "✅ Database URL configured: ${DATABASE_URL:0:15}..."
    echo "🔄 Running Alembic migrations..."
    alembic upgrade head || echo "⚠️ Migration notice: continuing startup"
else
    echo "⚠️ Warning: DATABASE_URL not set yet. Starting app in standalone mode."
fi

# Multi-port binding to support any Railway port configuration
PORT="${PORT:-5000}"
BIND_ARGS="--bind=0.0.0.0:${PORT}"
if [ "$PORT" != "8081" ]; then
    BIND_ARGS="$BIND_ARGS --bind=0.0.0.0:8081"
fi
if [ "$PORT" != "5000" ]; then
    BIND_ARGS="$BIND_ARGS --bind=0.0.0.0:5000"
fi

echo "🌐 Starting Gunicorn with: $BIND_ARGS..."

exec gunicorn $BIND_ARGS \
              --workers=2 \
              --timeout=120 \
              --preload \
              --access-logfile=- \
              --error-logfile=- \
              --log-level=info \
              main:app
