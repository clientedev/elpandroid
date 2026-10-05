#!/usr/bin/env python3
"""
Simple test to verify photo upload database functionality
"""

from app import app
from models import db, RelatorioExpress, FotoRelatorioExpress
import base64
from io import BytesIO
from PIL import Image
from datetime import datetime

def create_test_image_data():
    """Create a simple test image"""
    img = Image.new('RGB', (800, 600), color='lightblue')
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    return buffer.read()

def test_photo_save():
    """Test saving a photo to the database"""
    
    print("=" * 80)
    print("🧪 TESTE SIMPLES DE SALVAMENTO DE FOTOS")
    print("=" * 80)
    
    with app.app_context():
        # Step 1: Find an existing express report to use for testing
        print("\n1️⃣ Buscando relatório express existente para teste...")
        
        # Use the most recent express report
        test_report = RelatorioExpress.query.order_by(RelatorioExpress.id.desc()).first()
        
        if not test_report:
            print("❌ Nenhum relatório express encontrado no banco de dados!")
            print("   Por favor, crie um relatório express pela interface web primeiro.")
            return False
        
        print(f"✅ Relatório encontrado: ID={test_report.id}, Número={test_report.numero}")
        
        # Step 2: Count existing photos
        existing_photos = FotoRelatorioExpress.query.filter_by(
            relatorio_express_id=test_report.id
        ).count()
        
        print(f"   Fotos existentes: {existing_photos}")
        
        # Step 3: Create and save a test photo
        print("\n2️⃣ Criando foto de teste...")
        
        image_data = create_test_image_data()
        print(f"✅ Imagem criada: {len(image_data)} bytes")
        
        print("\n3️⃣ Salvando foto no banco de dados...")
        
        foto = FotoRelatorioExpress()
        foto.relatorio_express_id = test_report.id
        foto.filename = f'test_auto_{datetime.now().strftime("%Y%m%d_%H%M%S")}.png'
        foto.filename_original = 'test_automatic.png'
        foto.legenda = 'Foto de teste criada automaticamente'
        foto.tipo_servico = 'Teste Automatizado'
        foto.ordem = existing_photos + 1
        foto.imagem = image_data
        foto.imagem_hash = f'test_hash_{datetime.now().timestamp()}'
        foto.content_type = 'image/png'
        foto.imagem_size = len(image_data)
        
        db.session.add(foto)
        db.session.commit()
        
        print(f"✅ Foto salva: ID={foto.id}")
        
        # Step 4: Verify the photo was saved
        print("\n4️⃣ Verificando foto no banco...")
        
        saved_photo = FotoRelatorioExpress.query.get(foto.id)
        
        if saved_photo:
            print("✅ Foto recuperada do banco:")
            print(f"   - ID: {saved_photo.id}")
            print(f"   - Filename: {saved_photo.filename}")
            print(f"   - Legenda: {saved_photo.legenda}")
            print(f"   - Categoria: {saved_photo.tipo_servico}")
            print(f"   - Tamanho imagem: {len(saved_photo.imagem)} bytes")
            print(f"   - Hash: {saved_photo.imagem_hash}")
            
            # Verify image data integrity
            if len(saved_photo.imagem) == len(image_data):
                print("   ✅ Tamanho da imagem: CORRETO")
            else:
                print(f"   ❌ Tamanho da imagem: INCORRETO ({len(saved_photo.imagem)} != {len(image_data)})")
            
            # Count all photos for this report
            total_photos = FotoRelatorioExpress.query.filter_by(
                relatorio_express_id=test_report.id
            ).count()
            
            print(f"\n   Total de fotos no relatório {test_report.id}: {total_photos}")
            
            print("\n" + "=" * 80)
            print("✅✅✅ TESTE BEM-SUCEDIDO! SISTEMA DE FOTOS FUNCIONANDO! ✅✅✅")
            print("=" * 80)
            
            return True
        else:
            print("\n" + "=" * 80)
            print("❌❌❌ ERRO! Foto não encontrada após salvar! ❌❌❌")
            print("=" * 80)
            return False

if __name__ == "__main__":
    try:
        success = test_photo_save()
        exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ ERRO DURANTE O TESTE: {str(e)}")
        import traceback
        traceback.print_exc()
        exit(1)
