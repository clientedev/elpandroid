#!/usr/bin/env python3
"""
Script para limpar a tabela alembic_version e deixar o Alembic gerenciar automaticamente.
Execute este script UMA VEZ no Railway para limpar versões antigas.
"""

import os
import logging
from sqlalchemy import create_engine, text

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

def clear_alembic_version():
    """Limpa a tabela alembic_version para permitir que o Alembic gerencie automaticamente"""
    
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        logging.error("❌ DATABASE_URL não configurado")
        return False
    
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    
    try:
        engine = create_engine(database_url, isolation_level="AUTOCOMMIT")
        
        with engine.connect() as connection:
            logging.info("🔍 Verificando versão atual...")
            result = connection.execute(text("SELECT version_num FROM alembic_version")).fetchall()
            logging.info(f"   Versões encontradas: {result}")
            
            logging.info("🧹 Limpando tabela alembic_version...")
            connection.execute(text("DELETE FROM alembic_version"))
            logging.info("✅ Tabela alembic_version limpa")
            
            logging.info("✅ Agora o Alembic irá gerenciar as migrações automaticamente")
            logging.info("💡 Execute: alembic upgrade head")
            return True
                
    except Exception as e:
        logging.error(f"❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    logging.warning("=" * 60)
    logging.warning("⚠️ ESTE SCRIPT ESTÁ DEPRECATED")
    logging.warning("⚠️ O Alembic gerencia as migrações automaticamente")
    logging.warning("⚠️ Não é necessário limpar manualmente alembic_version")
    logging.warning("=" * 60)
    exit(1)
