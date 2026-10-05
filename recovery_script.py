
#!/usr/bin/env python3
"""
Script para recuperar imagens perdidas dos attached_assets
"""

import os
import shutil
from app import app, db
from models import FotoRelatorio, FotoRelatorioExpress

def recuperar_imagens_perdidas():
    """Recupera imagens perdidas dos attached_assets"""
    with app.app_context():
        upload_folder = app.config.get('UPLOAD_FOLDER', 'uploads')
        attached_assets_folder = 'attached_assets'
        
        print(f"🔍 Buscando imagens perdidas...")
        print(f"📁 Upload folder: {upload_folder}")
        print(f"📁 Attached assets: {attached_assets_folder}")
        
        # Criar pasta uploads se não existir
        if not os.path.exists(upload_folder):
            os.makedirs(upload_folder)
            print(f"✅ Pasta {upload_folder} criada")
        
        recuperadas = 0
        nao_encontradas = 0
        
        # Processar fotos de relatórios normais
        print("\n📋 Processando relatórios normais...")
        fotos_normais = FotoRelatorio.query.all()
        
        for foto in fotos_normais:
            filename = foto.filename
            upload_path = os.path.join(upload_folder, filename)
            
            if not os.path.exists(upload_path):
                attached_path = os.path.join(attached_assets_folder, filename)
                
                if os.path.exists(attached_path):
                    try:
                        shutil.copy2(attached_path, upload_path)
                        print(f"✅ Recuperada: {filename} (relatório {foto.relatorio_id})")
                        recuperadas += 1
                    except Exception as e:
                        print(f"❌ Erro ao copiar {filename}: {str(e)}")
                        nao_encontradas += 1
                else:
                    print(f"❌ Não encontrada: {filename} (relatório {foto.relatorio_id})")
                    nao_encontradas += 1
        
        # Processar fotos de relatórios express
        print("\n🚀 Processando relatórios express...")
        fotos_express = FotoRelatorioExpress.query.all()
        
        for foto in fotos_express:
            filename = foto.filename
            upload_path = os.path.join(upload_folder, filename)
            
            if not os.path.exists(upload_path):
                attached_path = os.path.join(attached_assets_folder, filename)
                
                if os.path.exists(attached_path):
                    try:
                        shutil.copy2(attached_path, upload_path)
                        print(f"✅ Recuperada: {filename} (express {foto.relatorio_express_id})")
                        recuperadas += 1
                    except Exception as e:
                        print(f"❌ Erro ao copiar {filename}: {str(e)}")
                        nao_encontradas += 1
                else:
                    print(f"❌ Não encontrada: {filename} (express {foto.relatorio_express_id})")
                    nao_encontradas += 1
        
        print(f"\n📊 RESULTADO:")
        print(f"✅ Imagens recuperadas: {recuperadas}")
        print(f"❌ Imagens não encontradas: {nao_encontradas}")
        
        return recuperadas, nao_encontradas

if __name__ == "__main__":
    recuperadas, nao_encontradas = recuperar_imagens_perdidas()
    
    if recuperadas > 0:
        print(f"\n🎉 Sucesso! {recuperadas} imagens foram recuperadas!")
    
    if nao_encontradas > 0:
        print(f"\n⚠️ Atenção: {nao_encontradas} imagens permanecem perdidas.")
        print("💡 Verifique se os arquivos existem em 'attached_assets' ou se foram deletados permanentemente.")
<line_number>1</line_number>
#!/usr/bin/env python3
"""
Script de Recuperação de Imagens Perdidas - Versão Completa
Busca e recupera imagens que existem no filesystem mas não estão sendo servidas corretamente
"""

import os
import sys
import shutil
import logging
from datetime import datetime

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

def find_missing_images():
    """Encontra imagens que podem estar perdidas"""
    print("🔍 Iniciando busca por imagens perdidas...")
    
    # Diretórios para buscar
    search_directories = [
        'attached_assets',
        'uploads',
        'static/uploads'
    ]
    
    # Diretório alvo para imagens
    target_directory = 'uploads'
    
    # Garantir que diretório alvo existe
    if not os.path.exists(target_directory):
        os.makedirs(target_directory)
        print(f"✅ Criado diretório: {target_directory}")
    
    found_images = []
    
    # Buscar em todos os diretórios
    for search_dir in search_directories:
        if os.path.exists(search_dir):
            print(f"📁 Buscando em: {search_dir}")
            
            for root, dirs, files in os.walk(search_dir):
                for file in files:
                    if file.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp')):
                        full_path = os.path.join(root, file)
                        target_path = os.path.join(target_directory, file)
                        
                        # Se não existe no diretório alvo, adicionar à lista
                        if not os.path.exists(target_path):
                            found_images.append({
                                'source': full_path,
                                'target': target_path,
                                'filename': file,
                                'source_dir': search_dir
                            })
    
    return found_images

def recover_images(found_images, dry_run=True):
    """Recupera as imagens encontradas"""
    if not found_images:
        print("✅ Nenhuma imagem perdida encontrada!")
        return
    
    print(f"📋 Encontradas {len(found_images)} imagens para recuperar:")
    
    recovered = 0
    failed = 0
    
    for img_info in found_images:
        try:
            source = img_info['source']
            target = img_info['target']
            filename = img_info['filename']
            
            print(f"🔄 {filename}")
            print(f"   📂 De: {source}")
            print(f"   📂 Para: {target}")
            
            if not dry_run:
                # Copiar arquivo
                shutil.copy2(source, target)
                print(f"   ✅ Copiado com sucesso!")
            else:
                print(f"   🔍 [DRY RUN] Seria copiado")
            
            recovered += 1
            
        except Exception as e:
            print(f"   ❌ Erro: {str(e)}")
            failed += 1
    
    print(f"\n📊 Resultado:")
    print(f"✅ Recuperadas: {recovered}")
    print(f"❌ Falharam: {failed}")
    
    if dry_run:
        print(f"\n💡 Para executar a recuperação, execute: python recovery_script.py --execute")

def check_specific_image(filename):
    """Verifica se uma imagem específica pode ser encontrada"""
    print(f"🔍 Buscando imagem específica: {filename}")
    
    search_locations = [
        'uploads',
        'attached_assets',
        'static/uploads',
        'static/img'
    ]
    
    found_locations = []
    
    for location in search_locations:
        if os.path.exists(location):
            for root, dirs, files in os.walk(location):
                if filename in files:
                    full_path = os.path.join(root, filename)
                    found_locations.append(full_path)
    
    if found_locations:
        print(f"✅ Imagem encontrada em {len(found_locations)} local(is):")
        for location in found_locations:
            print(f"   📁 {location}")
    else:
        print(f"❌ Imagem não encontrada em nenhum local")
        
        # Buscar por partes do nome
        print(f"🔍 Buscando por nomes similares...")
        similar_files = []
        
        # Extrair parte do nome para busca
        base_name = filename[:20] if len(filename) > 20 else filename.split('.')[0]
        
        for location in search_locations:
            if os.path.exists(location):
                for root, dirs, files in os.walk(location):
                    for file in files:
                        if base_name in file and file.lower().endswith(('.jpg', '.jpeg', '.png', '.gif')):
                            similar_files.append(os.path.join(root, file))
        
        if similar_files:
            print(f"🔍 Arquivos similares encontrados:")
            for similar in similar_files[:10]:  # Mostrar apenas os primeiros 10
                print(f"   📄 {similar}")
        else:
            print(f"❌ Nenhum arquivo similar encontrado")

def main():
    """Função principal"""
    print("🚀 Script de Recuperação de Imagens - ELP Sistema")
    print("=" * 50)
    
    # Verificar argumentos
    if len(sys.argv) > 1:
        if sys.argv[1] == '--execute':
            print("⚠️ MODO EXECUÇÃO - Arquivos serão movidos/copiados")
            dry_run = False
        elif sys.argv[1].startswith('--find='):
            filename = sys.argv[1].split('=')[1]
            check_specific_image(filename)
            return
        else:
            print("❓ Uso:")
            print("  python recovery_script.py                    # Modo dry-run")
            print("  python recovery_script.py --execute         # Executar recuperação")
            print("  python recovery_script.py --find=arquivo.jpg # Buscar arquivo específico")
            return
    else:
        print("🔍 MODO DRY-RUN - Apenas análise, nenhum arquivo será movido")
        dry_run = True
    
    # Buscar e recuperar imagens
    found_images = find_missing_images()
    recover_images(found_images, dry_run)
    
    print("\n🏁 Script finalizado!")

if __name__ == "__main__":
    main()
