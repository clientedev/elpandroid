import os
from sqlalchemy import create_engine, text

# URL fornecida pelo usuário
DATABASE_URL = os.environ["DATABASE_URL"]

def update_alembic_version():
    print("🔌 Conectando ao banco de dados...")
    try:
        engine = create_engine(DATABASE_URL)
        
        with engine.connect() as conn:
            print("✅ Conexão estabelecida.")
            
            # Verificar versão atual
            result = conn.execute(text("SELECT version_num FROM alembic_version")).fetchone()
            current_version = result[0] if result else None
            print(f"ℹ️ Versão atual do Alembic: {current_version}")
            
            # Nossa nova versão
            new_version = "0d8a27655353"
            
            if current_version == new_version:
                print(f"✅ Versão já está correta: {new_version}")
            else:
                print(f"🔄 Atualizando versão de {current_version} para {new_version}...")
                conn.execute(text("UPDATE alembic_version SET version_num = :version"), {"version": new_version})
                conn.commit()
                print("✅ Versão do Alembic atualizada com SUCESSO!")
                
    except Exception as e:
        print(f"❌ ERRO: {e}")

if __name__ == "__main__":
    update_alembic_version()
