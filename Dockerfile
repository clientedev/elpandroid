# Railway Dockerfile for ELP Backend
FROM python:3.11-slim

# Install system dependencies for WeasyPrint, PostgreSQL and healthchecks
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    libgobject-2.0-0 \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libcairo2 \
    libfontconfig1 \
    libfreetype6 \
    libgdk-pixbuf-2.0-0 \
    libharfbuzz0b \
    libfribidi0 \
    libpng16-16 \
    libjpeg62-turbo \
    curl \
    dos2unix \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p uploads static/reports

# Ensure start.sh has Unix line endings and execute permissions
RUN dos2unix start.sh && chmod +x start.sh

# Expose default port
EXPOSE 5000

# Set environment variables
ENV PYTHONPATH=/app
ENV FLASK_ENV=production
ENV PYTHONUNBUFFERED=1

# Start application
CMD ["bash", "start.sh"]
