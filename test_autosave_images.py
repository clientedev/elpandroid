
#!/usr/bin/env python3
"""
Script de teste para verificar autosave de imagens
"""

import requests
import json
import os
from io import BytesIO
from PIL import Image
import base64

# Configuração
BASE_URL = "http://localhost:5000"  # Ou URL do Railway
USERNAME = "admin"
PASSWORD = "admin123"

def create_test_image():
    """Cria uma imagem de teste"""
    img = Image.new('RGB', (100, 100), color='red')
    img_bytes = BytesIO()
    img.save(img_bytes, format='JPEG')
    img_bytes.seek(0)
    return img_bytes

def test_upload_temp():
    """Testa upload temporário"""
    print("🧪 TESTE 1: Upload Temporário")
    
    # Login
    session = requests.Session()
    login_response = session.post(f"{BASE_URL}/login", data={
        'username': USERNAME,
        'password': PASSWORD
    })
    
    if login_response.status_code != 200:
        print(f"❌ Erro no login: {login_response.status_code}")
        return None
    
    print("✅ Login OK")
    
    # Upload temporário
    img_bytes = create_test_image()
    files = {'file': ('test.jpg', img_bytes, 'image/jpeg')}
    
    upload_response = session.post(
        f"{BASE_URL}/api/uploads/temp",
        files=files
    )
    
    print(f"📤 Upload Response Status: {upload_response.status_code}")
    
    if upload_response.status_code == 200:
        data = upload_response.json()
        print(f"✅ Upload temporário OK:")
        print(f"   - temp_id: {data.get('temp_id')}")
        print(f"   - path: {data.get('path')}")
        print(f"   - filename: {data.get('filename')}")
        return data
    else:
        print(f"❌ Erro no upload: {upload_response.text}")
        return None

def test_autosave_with_image(temp_data):
    """Testa autosave com imagem"""
    if not temp_data:
        print("⏭️ Pulando teste autosave (sem temp_data)")
        return
    
    print("\n🧪 TESTE 2: AutoSave com Imagem")
    
    session = requests.Session()
    login_response = session.post(f"{BASE_URL}/login", data={
        'username': USERNAME,
        'password': PASSWORD
    })
    
    # Criar payload de autosave
    payload = {
        'projeto_id': 1,  # Ajustar conforme necessário
        'titulo': 'Relatório Teste AutoSave',
        'categoria': 'Teste',
        'local': 'Teste Local',
        'status': 'preenchimento',
        'fotos': [
            {
                'temp_id': temp_data['temp_id'],
                'extension': temp_data['filename'].split('.')[-1],
                'legenda': 'Foto de Teste',
                'ordem': 0
            }
        ]
    }
    
    print(f"📦 Payload:")
    print(json.dumps(payload, indent=2))
    
    autosave_response = session.post(
        f"{BASE_URL}/api/relatorios/autosave",
        json=payload,
        headers={'Content-Type': 'application/json'}
    )
    
    print(f"📥 AutoSave Response Status: {autosave_response.status_code}")
    
    if autosave_response.status_code == 200:
        data = autosave_response.json()
        print(f"✅ AutoSave OK:")
        print(f"   - relatorio_id: {data.get('relatorio_id')}")
        print(f"   - imagens: {len(data.get('imagens', []))}")
        
        if data.get('imagens'):
            for img in data['imagens']:
                print(f"      - id={img.get('id')}, url={img.get('url')}")
    else:
        print(f"❌ Erro no autosave: {autosave_response.text}")

if __name__ == '__main__':
    print("=" * 60)
    print("TESTE DE AUTOSAVE DE IMAGENS")
    print("=" * 60)
    
    # Teste 1: Upload temporário
    temp_data = test_upload_temp()
    
    # Teste 2: AutoSave com imagem
    test_autosave_with_image(temp_data)
    
    print("\n" + "=" * 60)
    print("TESTES CONCLUÍDOS")
    print("=" * 60)
