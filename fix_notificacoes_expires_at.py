
"""
Script para adicionar coluna expires_at na tabela notificacoes
Corrige erro: column notificacoes.expires_at does not exist
"""
import logging
import os
from sqlalchemy import create_engine, text, inspect

logging.basicConfig(level=logging.INFO)

def fix_notificacoes_expires_at():
    """Adiciona coluna expires_at na tabela notificacoes"""
    
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        logging.error("❌ DATABASE_URL não configurado")
        return False
    
    # Corrigir URL do PostgreSQL se necessário
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    
    try:
        engine = create_engine(database_url, isolation_level="AUTOCOMMIT")
        inspector = inspect(engine)
        
        # Verificar se tabela notificacoes existe
        if 'notificacoes' not in inspector.get_table_names():
            logging.error("❌ Tabela notificacoes não existe!")
            return False
        
        # Obter colunas existentes
        existing_columns = {col['name'] for col in inspector.get_columns('notificacoes')}
        logging.info(f"📋 Colunas existentes: {existing_columns}")
        
        with engine.connect() as connection:
            # Adicionar expires_at se não existir
            if 'expires_at' not in existing_columns:
                logging.info("➕ Adicionando coluna expires_at...")
                connection.execute(text(
                    "ALTER TABLE notificacoes ADD COLUMN expires_at TIMESTAMP"
                ))
                logging.info("✅ Coluna expires_at adicionada")
            else:
                logging.info("ℹ️ Coluna expires_at já existe")
            
            return True
                
    except Exception as e:
        logging.error(f"❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    logging.info("🔧 Iniciando correção da tabela notificacoes...")
    if fix_notificacoes_expires_at():
        logging.info("✅ CORREÇÃO CONCLUÍDA COM SUCESSO!")
        logging.info("💡 Reinicie o servidor Flask para aplicar as mudanças")
    else:
        logging.error("❌ CORREÇÃO FALHOU - Verifique os logs acima")
