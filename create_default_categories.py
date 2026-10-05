"""
Script para criar categorias padrão para projetos existentes
Executa apenas uma vez para migrar projetos sem categorias
"""
from app import app, db
from models import Projeto, CategoriaObra

def create_default_categories():
    with app.app_context():
        # Buscar todos os projetos
        projetos = Projeto.query.all()
        
        for projeto in projetos:
            # Verificar se o projeto já tem categorias
            existing_cats = CategoriaObra.query.filter_by(projeto_id=projeto.id).count()
            
            if existing_cats == 0:
                # Criar categorias padrão para este projeto
                categorias_padrao = [
                    {'nome': 'Geral', 'ordem': 1},
                    {'nome': 'Fachada', 'ordem': 2},
                    {'nome': 'Estrutura', 'ordem': 3},
                    {'nome': 'Acabamento', 'ordem': 4}
                ]
                
                for cat_data in categorias_padrao:
                    categoria = CategoriaObra(
                        projeto_id=projeto.id,
                        nome_categoria=cat_data['nome'],
                        ordem=cat_data['ordem']
                    )
                    db.session.add(categoria)
                
                print(f"✅ Categorias criadas para projeto: {projeto.nome}")
        
        db.session.commit()
        print("✅ Migração concluída!")

if __name__ == '__main__':
    create_default_categories()
