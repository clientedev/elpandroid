
#!/usr/bin/env python3
"""
Script para migrar todas as imagens de attached_assets para uploads
e atualizar o banco de dados
"""

import os
import shutil
from app import app, db
from models import FotoRelatorio, FotoRelatorioExpress

def migrate_images_to_uploads():
    """Migrar todas as imagens para o diretório uploads/"""
    
    with app.app_context():
        # Diretórios
        attached_assets_dir = 'attached_assets'
        uploads_dir = app.config.get('UPLOAD_FOLDER', 'uploads')
        
        # Criar diretório uploads se não existir
        os.makedirs(uploads_dir, exist_ok=True)
        
        print(f"📁 Migrando de {attached_assets_dir} para {uploads_dir}")
        print("=" * 60)
        
        migrated_count = 0
        error_count = 0
        
        # Buscar todas as imagens do banco
        fotos_normais = FotoRelatorio.query.all()
        fotos_express = FotoRelatorioExpress.query.all()
        
        all_photos = []
        for foto in fotos_normais:
            all_photos.append(('normal', foto.filename, foto.id))
        
        for foto in fotos_express:
            all_photos.append(('express', foto.filename, foto.id))
        
        print(f"📊 Total de fotos no banco: {len(all_photos)}")
        
        for photo_type, filename, photo_id in all_photos:
            try:
                uploads_path = os.path.join(uploads_dir, filename)
                attached_path = os.path.join(attached_assets_dir, filename)
                
                # Se já existe em uploads, pular
                if os.path.exists(uploads_path):
                    print(f"✅ JÁ EXISTE: {filename}")
                    continue
                
                # Se existe em attached_assets, migrar
                if os.path.exists(attached_path):
                    shutil.copy2(attached_path, uploads_path)
                    migrated_count += 1
                    print(f"📤 MIGRADO: {filename} ({photo_type} #{photo_id})")
                else:
                    print(f"❌ NÃO ENCONTRADO: {filename} ({photo_type} #{photo_id})")
                    error_count += 1
                    
            except Exception as e:
                print(f"💥 ERRO: {filename} - {str(e)}")
                error_count += 1
        
        print("=" * 60)
        print(f"✅ Migração concluída:")
        print(f"   📤 Migradas: {migrated_count}")
        print(f"   ❌ Erros: {error_count}")
        print(f"   📊 Total processadas: {len(all_photos)}")

if __name__ == '__main__':
    migrate_images_to_uploads()
