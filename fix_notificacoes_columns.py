
"""
Script para adicionar colunas usuario_origem_id e usuario_destino_id na tabela notificacoes
"""
import logging
import os
from sqlalchemy import create_engine, text, inspect

logging.basicConfig(level=logging.INFO)

def fix_notificacoes_columns():
    """Adiciona colunas faltantes na tabela notificacoes"""
    
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
            # Adicionar usuario_origem_id se não existir
            if 'usuario_origem_id' not in existing_columns:
                logging.info("➕ Adicionando coluna usuario_origem_id...")
                connection.execute(text(
                    "ALTER TABLE notificacoes ADD COLUMN usuario_origem_id INTEGER"
                ))
                connection.execute(text(
                    "ALTER TABLE notificacoes ADD CONSTRAINT fk_notificacoes_usuario_origem "
                    "FOREIGN KEY (usuario_origem_id) REFERENCES users(id)"
                ))
                logging.info("✅ Coluna usuario_origem_id adicionada")
            else:
                logging.info("ℹ️ Coluna usuario_origem_id já existe")
            
            # Adicionar usuario_destino_id se não existir
            if 'usuario_destino_id' not in existing_columns:
                logging.info("➕ Adicionando coluna usuario_destino_id...")
                connection.execute(text(
                    "ALTER TABLE notificacoes ADD COLUMN usuario_destino_id INTEGER"
                ))
                connection.execute(text(
                    "ALTER TABLE notificacoes ADD CONSTRAINT fk_notificacoes_usuario_destino "
                    "FOREIGN KEY (usuario_destino_id) REFERENCES users(id)"
                ))
                logging.info("✅ Coluna usuario_destino_id adicionada")
            else:
                logging.info("ℹ️ Coluna usuario_destino_id já existe")
            
            # Atualizar alembic_version para marcar migração como aplicada
            logging.info("📝 Atualizando alembic_version...")
            connection.execute(text(
                "UPDATE alembic_version SET version_num = 'add_usuario_columns' "
                "WHERE version_num = '265f97ab88c1'"
            ))
            logging.info("✅ Alembic_version atualizado")
            
            return True
                
    except Exception as e:
        logging.error(f"❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    logging.info("🔧 Iniciando correção da tabela notificacoes...")
    if fix_notificacoes_columns():
        logging.info("✅ CORREÇÃO CONCLUÍDA COM SUCESSO!")
        logging.info("💡 Reinicie o servidor Flask para aplicar as mudanças")
    else:
        logging.error("❌ CORREÇÃO FALHOU - Verifique os logs acima")
