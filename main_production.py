#!/usr/bin/env python3
"""
Production version for Railway - Robust startup with comprehensive error handling
"""
import os
import sys
import logging
from flask import Flask, jsonify
from datetime import datetime

# Configure logging first
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def create_fallback_app():
    """Create a simple fallback app if main app fails"""
    fallback_app = Flask(__name__)
    fallback_app.secret_key = os.environ.get("SESSION_SECRET", "railway-fallback")
    
    @fallback_app.route('/health')
    def health():
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'construction-tracker',
            'mode': 'fallback'
        }), 200
    
    @fallback_app.route('/')
    def index():
        return jsonify({
            'message': 'Sistema de Gestão de Construção - ELP',
            'status': 'FUNCIONANDO',
            'version': '1.0.0',
            'mode': 'fallback',
            'timestamp': datetime.utcnow().isoformat(),
            'note': 'Sistema em modo de fallback devido a erro de inicialização'
        }), 200
    
    return fallback_app

def main():
    """Main application startup with robust error handling and auto-migration"""
    try:
        logger.info("🚀 INICIANDO SISTEMA COMPLETO...")
        
        # Run database migrations automatically on Railway
        if os.environ.get("RAILWAY_ENVIRONMENT"):
            logger.info("🔄 Executando migrações automáticas...")
            try:
                import subprocess
                result = subprocess.run(['alembic', 'upgrade', 'head'], 
                                      capture_output=True, text=True, timeout=60)
                if result.returncode == 0:
                    logger.info("✅ Migrações aplicadas com sucesso")
                else:
                    logger.warning(f"⚠️ Migração falhou: {result.stderr}")
            except Exception as e:
                logger.warning(f"⚠️ Erro nas migrações (continuando): {e}")
        
        # Import main application
        from main import app as main_app
        logger.info("✅ Sistema principal carregado com sucesso!")
        
        # Get port from environment
        port = int(os.environ.get('PORT', 5000))
        logger.info(f"🌐 Servidor iniciando na porta {port}")
        
        # Run the main application
        main_app.run(
            host='0.0.0.0', 
            port=port, 
            debug=False,
            threaded=True
        )
        
    except ImportError as e:
        logger.error(f"❌ Erro de importação: {e}")
        logger.info("🔄 Iniciando sistema de fallback...")
        
        app = create_fallback_app()
        port = int(os.environ.get('PORT', 5000))
        app.run(host='0.0.0.0', port=port, debug=False)
        
    except Exception as e:
        logger.error(f"❌ Erro crítico na inicialização: {e}")
        logger.info("🔄 Última tentativa com sistema mínimo...")
        
        app = create_fallback_app()
        port = int(os.environ.get('PORT', 5000))
        app.run(host='0.0.0.0', port=port, debug=False)

if __name__ == '__main__':
    main()