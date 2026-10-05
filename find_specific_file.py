
#!/usr/bin/env python3
"""
Script para buscar especificamente o arquivo que está gerando erro 404
"""

import os
import sys
from app import app, db
from models import FotoRelatorio, FotoRelatorioExpress

def find_specific_file(target_filename):
    """Busca intensiva por arquivo específico"""
    print(f"🔍 Buscando arquivo: {target_filename}")
    
    # Diretórios para buscar
    search_dirs = [
        'uploads',
        'attached_assets',
        'static/uploads',
        'static/img',
        '.'
    ]
    
    found_files = []
    
    # Busca exata
    for search_dir in search_dirs:
        if os.path.exists(search_dir):
            print(f"📁 Buscando em: {search_dir}")
            
            for root, dirs, files in os.walk(search_dir):
                for file in files:
                    if file == target_filename:
                        full_path = os.path.join(root, file)
                        found_files.append(full_path)
                        print(f"✅ ENCONTRADO: {full_path}")
    
    # Se não encontrou, buscar por hash similar
    if not found_files:
        print(f"❌ Arquivo exato não encontrado. Buscando arquivos similares...")
        hash_part = target_filename[:20] if len(target_filename) > 20 else target_filename.split('_')[0]
        
        for search_dir in search_dirs:
            if os.path.exists(search_dir):
                for root, dirs, files in os.walk(search_dir):
                    for file in files:
                        if hash_part in file and file.lower().endswith(('.jpg', '.jpeg', '.png')):
                            full_path = os.path.join(root, file)
                            found_files.append(full_path)
                            print(f"🔍 SIMILAR: {full_path}")
    
    return found_files

def check_database_info(filename):
    """Verifica informações no banco de dados"""
    print(f"\n📊 Verificando banco de dados para: {filename}")
    
    with app.app_context():
        # Verificar relatórios normais
        foto_normal = FotoRelatorio.query.filter_by(filename=filename).first()
        if foto_normal:
            print(f"✅ Encontrado em FotoRelatorio:")
            print(f"   📋 Relatório ID: {foto_normal.relatorio_id}")
            print(f"   🏷️ Legenda: {foto_normal.legenda}")
            print(f"   📷 Ordem: {foto_normal.ordem}")
            print(f"   📅 Criado em: {foto_normal.created_at}")
            
            # Buscar dados do relatório
            from models import Relatorio
            relatorio = Relatorio.query.get(foto_normal.relatorio_id)
            if relatorio:
                print(f"   📄 Relatório: {relatorio.numero}")
                print(f"   🏗️ Projeto: {relatorio.projeto.nome if relatorio.projeto else 'N/A'}")
        
        # Verificar relatórios express
        foto_express = FotoRelatorioExpress.query.filter_by(filename=filename).first()
        if foto_express:
            print(f"✅ Encontrado em FotoRelatorioExpress:")
            print(f"   📋 Relatório Express ID: {foto_express.relatorio_express_id}")
            print(f"   🏷️ Legenda: {foto_express.legenda}")
            print(f"   📷 Ordem: {foto_express.ordem}")
            print(f"   📅 Criado em: {foto_express.created_at}")
        
        if not foto_normal and not foto_express:
            print(f"❌ Arquivo não encontrado no banco de dados")

def copy_file_to_uploads(source_path, filename):
    """Copia arquivo para pasta uploads"""
    if not os.path.exists(source_path):
        print(f"❌ Arquivo fonte não existe: {source_path}")
        return False
    
    uploads_dir = 'uploads'
    if not os.path.exists(uploads_dir):
        os.makedirs(uploads_dir)
        print(f"📁 Pasta uploads criada")
    
    dest_path = os.path.join(uploads_dir, filename)
    
    if os.path.exists(dest_path):
        print(f"⚠️ Arquivo já existe em uploads: {dest_path}")
        return True
    
    try:
        import shutil
        shutil.copy2(source_path, dest_path)
        print(f"✅ Arquivo copiado: {source_path} -> {dest_path}")
        return True
    except Exception as e:
        print(f"❌ Erro ao copiar arquivo: {str(e)}")
        return False

if __name__ == "__main__":
    target_file = "017050397c414b519d1df38fd32e78c8_17581431349423281964208488259198.jpg"
    
    if len(sys.argv) > 1:
        target_file = sys.argv[1]
    
    print("🚀 Busca Específica de Arquivo")
    print("=" * 50)
    
    # Buscar arquivo
    found = find_specific_file(target_file)
    
    # Verificar banco
    check_database_info(target_file)
    
    # Se encontrou, oferecer opção de copiar
    if found:
        print(f"\n✅ {len(found)} arquivo(s) encontrado(s)!")
        for i, file_path in enumerate(found):
            print(f"   {i+1}. {file_path}")
        
        choice = input("\nDeseja copiar o primeiro arquivo para uploads? (s/N): ")
        if choice.lower() == 's':
            copy_file_to_uploads(found[0], target_file)
    else:
        print(f"\n❌ Arquivo não encontrado em lugar nenhum.")
        print("💡 Verifique se o arquivo foi deletado ou se o nome está correto")
