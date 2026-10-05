#!/bin/bash
# Railway startup script for ELP Backend

echo "🚀 RAILWAY DEPLOYMENT - Starting ELP Backend..."

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

# Ensure PORT is defined (default to 5000 if not set by Railway)
PORT="${PORT:-5000}"
echo "🌐 Starting Gunicorn server on 0.0.0.0:${PORT}..."

exec gunicorn --bind="0.0.0.0:${PORT}" \
              --workers=2 \
              --timeout=120 \
              --access-logfile=- \
              --error-logfile=- \
              --log-level=info \
              main:app
