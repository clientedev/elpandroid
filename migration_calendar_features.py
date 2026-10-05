#!/usr/bin/env python3
"""
Migração para implementar recursos de calendário e agenda (Itens 28-31):
- Adicionar cor_agenda ao modelo User (Item 29)
- Adicionar is_pessoal e criado_por ao modelo Visita (Item 31)
- Garantir que status da Visita suporte 'Cancelado' (Item 30)
"""

import os
import sys
from app import app, db
from models import User, Visita
from sqlalchemy import text

def run_migration():
    """Execute a migração incremental do banco de dados"""
    with app.app_context():
        try:
            print("🔄 Iniciando migração de recursos de calendário e agenda...")
            
            # Item 29: Adicionar campo cor_agenda ao modelo User
            print("📝 Adicionando campo cor_agenda aos usuários...")
            try:
                db.session.execute(text("ALTER TABLE users ADD COLUMN cor_agenda VARCHAR(7) DEFAULT '#0EA5E9'"))
                print("✅ Campo cor_agenda adicionado com sucesso")
            except Exception as e:
                if "already exists" in str(e) or "duplicate column" in str(e).lower():
                    print("ℹ️  Campo cor_agenda já existe")
                else:
                    print(f"⚠️  Erro ao adicionar cor_agenda: {e}")

            # Item 31: Adicionar campos is_pessoal e criado_por ao modelo Visita
            print("📝 Adicionando campos de compromisso pessoal...")
            try:
                db.session.execute(text("ALTER TABLE visitas ADD COLUMN is_pessoal BOOLEAN DEFAULT FALSE"))
                print("✅ Campo is_pessoal adicionado com sucesso")
            except Exception as e:
                if "already exists" in str(e) or "duplicate column" in str(e).lower():
                    print("ℹ️  Campo is_pessoal já existe")
                else:
                    print(f"⚠️  Erro ao adicionar is_pessoal: {e}")
            
            try:
                db.session.execute(text("ALTER TABLE visitas ADD COLUMN criado_por INTEGER REFERENCES users(id)"))
                print("✅ Campo criado_por adicionado com sucesso")
            except Exception as e:
                if "already exists" in str(e) or "duplicate column" in str(e).lower():
                    print("ℹ️  Campo criado_por já existe")
                else:
                    print(f"⚠️  Erro ao adicionar criado_por: {e}")
                    
            # Garantir que visitas existentes tenham criado_por preenchido
            try:
                result = db.session.execute(text("SELECT COUNT(*) FROM visitas WHERE criado_por IS NULL")).scalar()
                if result > 0:
                    db.session.execute(text("""
                        UPDATE visitas 
                        SET criado_por = responsavel_id 
                        WHERE criado_por IS NULL
                    """))
                    print(f"✅ Preenchido criado_por para {result} visitas existentes")
            except Exception as e:
                print(f"⚠️  Erro ao preencher criado_por: {e}")

            # Item 30: Verificar se status já suporte 'Cancelado'
            print("📝 Verificando status de visitas...")
            try:
                # Verificar se já existem visitas canceladas
                canceladas = db.session.execute(text("SELECT COUNT(*) FROM visitas WHERE status = 'Cancelado'")).scalar()
                print(f"ℹ️  Encontradas {canceladas} visitas com status 'Cancelado'")
                
                # Verificar se precisamos ajustar algum status 
                result = db.session.execute(text("SELECT DISTINCT status FROM visitas")).fetchall()
                status_existentes = [row[0] for row in result]
                print(f"ℹ️  Status existentes: {', '.join(status_existentes)}")
                
                if 'Cancelado' not in status_existentes:
                    print("✅ Status 'Cancelado' será suportado pelo modelo atualizado")
                    
            except Exception as e:
                print(f"⚠️  Erro ao verificar status: {e}")

            # Aplicar todas as mudanças
            db.session.commit()
            print("✅ Migração concluída com sucesso!")
            return True
            
        except Exception as e:
            db.session.rollback()
            print(f"❌ Erro na migração: {e}")
            return False

if __name__ == "__main__":
    if run_migration():
        print("🎉 Migração de recursos de calendário completada!")
        sys.exit(0)
    else:
        print("💥 Falha na migração!")
        sys.exit(1)