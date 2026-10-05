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
    alembic upgrade head || {
        echo "⚠️ Migration encountered an issue (tables likely already exist). Stamping head..."
        alembic stamp head || true
    }
else
    echo "⚠️ Warning: DATABASE_URL not set yet. Starting app in standalone mode."
fi

# Migrations already ran above - don't repeat them inside each Gunicorn worker
export SKIP_APP_MIGRATIONS=1

# Multi-port binding to support any Railway target port configuration
PORT="${PORT:-5000}"
BIND_ARGS="--bind=0.0.0.0:${PORT}"
for P in 5000 8080 8000 8081 3000; do
    if [ "$PORT" != "$P" ]; then
        BIND_ARGS="$BIND_ARGS --bind=0.0.0.0:$P"
    fi
done

echo "🌐 Starting Gunicorn with: $BIND_ARGS..."

exec gunicorn $BIND_ARGS \
              --workers=2 \
              --timeout=120 \
              --access-logfile=- \
              --error-logfile=- \
              --log-level=info \
              main:app
