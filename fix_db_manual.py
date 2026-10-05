import os
from sqlalchemy import create_engine, text, inspect

# URL fornecida pelo usuário
DATABASE_URL = "postgresql://postgres:KgyYkEmMztCNMSPHVbOpWLTiKZFXYwpB@switchback.proxy.rlwy.net:17107/railway"

def fix_db():
    print(f"🔌 Conectando ao banco de dados...")
    try:
        engine = create_engine(DATABASE_URL)
        
        with engine.connect() as conn:
            print("✅ Conexão estabelecida.")
            
            # Verificar se a coluna existe
            print("🔍 Verificando estrutura da tabela 'users'...")
            inspector = inspect(engine)
            columns = [col['name'] for col in inspector.get_columns('users')]
            
            if 'is_aprovador_express' in columns:
                print("✅ Coluna 'is_aprovador_express' JÁ EXISTE.")
            else:
                print("⚠️ Coluna 'is_aprovador_express' AUSENTE.")
                print("🛠️ Adicionando coluna manualmente...")
                
                # Adicionar coluna
                conn.execute(text("ALTER TABLE users ADD COLUMN is_aprovador_express BOOLEAN DEFAULT FALSE"))
                conn.commit()
                
                print("✅ Coluna adicionada com SUCESSO!")
            
            # Verificar versão do Alembic
            try:
                result = conn.execute(text("SELECT version_num FROM alembic_version")).fetchone()
                version = result[0] if result else 'Desconhecida'
                print(f"ℹ️ Versão atual do Alembic: {version}")
                
                # Opcional: Atualizar para a versão correta se estiver travado
                # Mas como nossa migration é idempotente, não é estritamente necessário forçar
            except Exception as e:
                print(f"⚠️ Não foi possível ler versão do Alembic: {e}")

    except Exception as e:
        print(f"❌ ERRO CRÍTICO: {e}")

if __name__ == "__main__":
    fix_db()
