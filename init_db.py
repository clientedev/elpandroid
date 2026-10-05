#!/usr/bin/env python
"""Script para inicializar o banco de dados com todas as tabelas"""

import os
import sys

# Add current directory to path
sys.path.insert(0, os.path.dirname(__file__))

from app import app, db
from models import *

def init_database():
    """Inicializa o banco de dados criando todas as tabelas"""
    with app.app_context():
        print("🔧 Iniciando criação do banco de dados...")
        
        # Drop all tables (apenas para desenvolvimento)
        # db.drop_all()
        # print("🗑️  Tabelas antigas removidas")
        
        # Create all tables
        db.create_all()
        print("✅ Todas as tabelas criadas com sucesso!")
        
        # Verificar tabelas criadas
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        tables = inspector.get_table_names()
        print(f"\n📋 Tabelas criadas ({len(tables)}):")
        for table in sorted(tables):
            print(f"   - {table}")

if __name__ == "__main__":
    init_database()
