
"""
Script para corrigir tabela user_email_config adicionando colunas faltantes
"""
import logging
from app import app, db
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)

def fix_user_email_config_table():
    """Adiciona colunas faltantes na tabela user_email_config"""
    with app.app_context():
        try:
            import sqlalchemy as sa
            inspector = sa.inspect(db.engine)
            
            # Verificar se tabela existe
            if 'user_email_config' not in inspector.get_table_names():
                logging.error("❌ Tabela user_email_config não existe!")
                return False
            
            # Obter colunas existentes
            existing_columns = {col['name'] for col in inspector.get_columns('user_email_config')}
            logging.info(f"📋 Colunas existentes: {existing_columns}")
            
            # Colunas que devem existir
            required_columns = {
                'is_active': 'ALTER TABLE user_email_config ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE',
                'last_test_status': "ALTER TABLE user_email_config ADD COLUMN last_test_status VARCHAR(20) DEFAULT 'pending'",
                'last_test_at': 'ALTER TABLE user_email_config ADD COLUMN last_test_at TIMESTAMP'
            }
            
            with db.engine.connect() as connection:
                for col_name, alter_sql in required_columns.items():
                    if col_name not in existing_columns:
                        logging.info(f"➕ Adicionando coluna: {col_name}")
                        connection.execute(text(alter_sql))
                        connection.commit()
                        logging.info(f"✅ Coluna {col_name} adicionada")
                    else:
                        logging.info(f"ℹ️  Coluna {col_name} já existe")
            
            # Verificar resultado final
            final_columns = {col['name'] for col in inspector.get_columns('user_email_config')}
            logging.info(f"✅ Colunas finais: {final_columns}")
            
            return True
            
        except Exception as e:
            logging.exception(f"❌ Erro ao corrigir user_email_config: {e}")
            return False

if __name__ == '__main__':
    logging.info("🔧 Iniciando correção da tabela user_email_config...")
    if fix_user_email_config_table():
        logging.info("✅ CORREÇÃO CONCLUÍDA COM SUCESSO!")
    else:
        logging.error("❌ CORREÇÃO FALHOU!")
