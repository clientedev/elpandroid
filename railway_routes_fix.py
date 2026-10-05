#!/usr/bin/env python3
"""
Railway-specific route fixes and debugging tools
Arquivo para diagnosticar e corrigir problemas específicos do Railway
"""

import os
import logging
from flask import jsonify, request
from app import app, db

logger = logging.getLogger(__name__)

def fix_migration_issues():
    """Fix common migration issues in Railway environment - DEPRECATED"""
    # Migration issues are now handled by Alembic automatically
    logger.info("ℹ️ Migration handling is now automatic via Alembic")
    pass

@app.route('/railway/health')
def railway_health():
    """Health check específico para Railway"""
    try:
        # Test database connection
        from sqlalchemy import text
        with db.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        db_status = "healthy"
    except Exception as e:
        db_status = f"error: {str(e)}"
    
    # Test reports table
    try:
        from models import Relatorio
        reports_count = Relatorio.query.count()
        reports_status = f"healthy ({reports_count} reports)"
    except Exception as e:
        reports_status = f"error: {str(e)}"
    
    # Test user authentication
    try:
        from models import User
        admin_count = User.query.filter_by(is_master=True).count()
        auth_status = f"healthy ({admin_count} admins)"
    except Exception as e:
        auth_status = f"error: {str(e)}"
    
    health_data = {
        'status': 'healthy',
        'environment': 'railway',
        'database': db_status,
        'reports': reports_status,
        'authentication': auth_status,
        'session_secret': 'configured' if os.environ.get("SESSION_SECRET") else 'missing',
        'database_url': 'configured' if os.environ.get("DATABASE_URL") else 'missing'
    }
    
    status_code = 200 if 'error' not in str(health_data) else 503
    return jsonify(health_data), status_code

@app.route('/railway/reports-debug')
def railway_reports_debug():
    """Debug específico para problemas da rota /reports no Railway"""
    try:
        from models import Relatorio, User
        from flask_login import current_user
        
        debug_info = {
            'reports_table_exists': True,
            'reports_count': 0,
            'user_authenticated': False,
            'user_info': None,
            'database_info': {},
            'errors': []
        }
        
        # Test reports table
        try:
            debug_info['reports_count'] = Relatorio.query.count()
        except Exception as e:
            debug_info['errors'].append(f"Reports query error: {str(e)}")
        
        # Test user authentication
        try:
            if hasattr(current_user, 'id') and current_user.is_authenticated:
                debug_info['user_authenticated'] = True
                debug_info['user_info'] = {
                    'id': current_user.id,
                    'username': current_user.username,
                    'is_master': current_user.is_master
                }
        except Exception as e:
            debug_info['errors'].append(f"Auth error: {str(e)}")
        
        # Database info
        try:
            debug_info['database_info'] = {
                'url': os.environ.get('DATABASE_URL', 'not set')[:50] + '...' if os.environ.get('DATABASE_URL') else 'not set',
                'engine': str(db.engine.url).split('@')[0] if '@' in str(db.engine.url) else str(db.engine.url)
            }
        except Exception as e:
            debug_info['errors'].append(f"DB info error: {str(e)}")
        
        return jsonify(debug_info), 200
        
    except Exception as e:
        return jsonify({
            'error': 'Critical debug error',
            'message': str(e)
        }), 500

@app.route('/railway/fix-reports')
def railway_fix_reports():
    """Tentativa de correção automática para problemas da rota /reports"""
    try:
        fixes_applied = []
        
        # 1. Test and fix database connection
        try:
            from sqlalchemy import text
            with db.engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            fixes_applied.append("Database connection OK")
        except Exception as e:
            fixes_applied.append(f"Database connection failed: {str(e)}")
        
        # 2. Ensure reports table exists
        try:
            from models import Relatorio
            db.create_all()
            fixes_applied.append("Tables created/verified")
        except Exception as e:
            fixes_applied.append(f"Table creation failed: {str(e)}")
        
        # 3. Test admin user
        try:
            from models import User
            admin = User.query.filter_by(is_master=True).first()
            if admin:
                fixes_applied.append(f"Admin user exists: {admin.username}")
            else:
                fixes_applied.append("No admin user found - create one manually")
        except Exception as e:
            fixes_applied.append(f"Admin user check failed: {str(e)}")
        
        return jsonify({
            'status': 'fixes attempted',
            'fixes_applied': fixes_applied
        }), 200
        
    except Exception as e:
        return jsonify({
            'error': 'Fix attempt failed',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    print("Railway routes fix module loaded")