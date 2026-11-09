#!/usr/bin/env python3
"""
Replit-specific main entry point for the construction tracking system
Handles Replit environment configuration and startup
"""
import os
import sys
import logging

# Configure logging for Replit
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def main():
    """Main application startup for Replit environment"""
    try:
        logger.info("🏗️  Starting Construction Tracking System - ELP")
        logger.info("🔧 Environment: Replit")
        
        # Configure Railway database connection for production
        if not os.environ.get('DATABASE_URL'):
            raise RuntimeError('Configure a variável DATABASE_URL (nunca coloque a senha no código).')
        logger.info("🚂 Usando DATABASE_URL do ambiente")
        
        # Import and configure the main Flask app
        from main import app
        
        # Get Replit domain for CORS configuration 
        replit_domain = os.environ.get('REPLIT_DEV_DOMAIN', 'localhost')
        logger.info(f"🌐 Replit domain: {replit_domain}")
        
        # Configure for Replit environment
        app.config['SERVER_NAME'] = None  # Allow all hostnames
        
        # Get port (Replit provides PORT environment variable)
        port = int(os.environ.get('PORT', 5000))
        logger.info(f"🚀 Starting server on 0.0.0.0:{port}")
        
        # Run the Flask application
        app.run(
            host='0.0.0.0',  # Required for Replit
            port=port,
            debug=False,     # Set to False for production-like behavior
            threaded=True
        )
        
    except ImportError as e:
        logger.error(f"❌ Failed to import Flask app: {e}")
        logger.error("💡 Make sure all dependencies are installed")
        sys.exit(1)
    except Exception as e:
        logger.error(f"❌ Startup error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()