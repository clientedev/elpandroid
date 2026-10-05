#!/usr/bin/env python3
"""
Script de teste para verificar se imagens estão sendo salvas corretamente no banco
"""
import base64
import io
from PIL import Image
from app import app, db
from models import Relatorio, FotoRelatorio, Projeto, User
from datetime import datetime

def create_test_image():
    """Criar uma imagem de teste em base64"""
    # Criar uma imagem simples 100x100 vermelha
    img = Image.new('RGB', (100, 100), color='red')
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG')
    img_bytes = buffer.getvalue()
    img_base64 = base64.b64encode(img_bytes).decode()
    return f"data:image/jpeg;base64,{img_base64}", img_bytes

with app.app_context():
    print("🧪 Iniciando teste de salvamento de imagens...")
    
    # Verificar se temos usuário e projeto
    user = User.query.first()
    if not user:
        print("❌ Nenhum usuário encontrado - crie um usuário primeiro")
        exit(1)
    
    projeto = Projeto.query.first()
    if not projeto:
        print("❌ Nenhum projeto encontrado - criando projeto de teste...")
        projeto = Projeto(
            numero=f"PROJ-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            nome="Projeto Teste",
            tipo_obra="Residencial",
            construtora="Construtora Teste",
            nome_funcionario="Funcionário Teste",
            responsavel_id=user.id,
            email_principal="teste@teste.com",
            status="Ativo"
        )
        db.session.add(projeto)
        db.session.commit()
    
    # Criar relatório de teste
    print(f"📝 Criando relatório de teste...")
    relatorio = Relatorio(
        numero=f"TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        projeto_id=projeto.id,
        autor_id=user.id,
        titulo="Relatório Teste - Upload de Imagem",
        data_visita=datetime.now(),
        status="Rascunho"
    )
    db.session.add(relatorio)
    db.session.commit()
    print(f"✅ Relatório criado: ID={relatorio.id}, Número={relatorio.numero}")
    
    # Criar imagem de teste
    base64_data, raw_bytes = create_test_image()
    print(f"📸 Imagem de teste criada: {len(raw_bytes)} bytes")
    
    # Simular upload - Método 1: Base64 (como mobile)
    print(f"\n🔬 TESTE 1: Salvamento via Base64 (como mobile)")
    foto1 = FotoRelatorio()
    foto1.relatorio_id = relatorio.id
    foto1.filename = "test_mobile.jpg"
    foto1.legenda = "Teste Mobile - Base64"
    foto1.tipo_servico = "Teste"
    foto1.ordem = 1
    
    # Decodificar base64 e salvar
    if ',' in base64_data:
        base64_clean = base64_data.split(',')[1]
    else:
        base64_clean = base64_data
    
    image_binary = base64.b64decode(base64_clean)
    foto1.imagem = image_binary
    
    db.session.add(foto1)
    db.session.commit()
    
    print(f"✅ Foto 1 salva: ID={foto1.id}")
    print(f"   - Filename: {foto1.filename}")
    print(f"   - Legenda: {foto1.legenda}")
    print(f"   - Imagem bytes: {len(foto1.imagem) if foto1.imagem else 0}")
    
    # Simular upload - Método 2: Bytes direto (como file upload)
    print(f"\n🔬 TESTE 2: Salvamento via Bytes direto (como file upload)")
    foto2 = FotoRelatorio()
    foto2.relatorio_id = relatorio.id
    foto2.filename = "test_upload.jpg"
    foto2.legenda = "Teste Upload - Bytes"
    foto2.tipo_servico = "Teste"
    foto2.ordem = 2
    foto2.imagem = raw_bytes
    
    db.session.add(foto2)
    db.session.commit()
    
    print(f"✅ Foto 2 salva: ID={foto2.id}")
    print(f"   - Filename: {foto2.filename}")
    print(f"   - Legenda: {foto2.legenda}")
    print(f"   - Imagem bytes: {len(foto2.imagem) if foto2.imagem else 0}")
    
    # Verificar leitura do banco
    print(f"\n🔍 VERIFICAÇÃO: Lendo fotos do banco...")
    fotos_saved = FotoRelatorio.query.filter_by(relatorio_id=relatorio.id).all()
    print(f"📊 Total de fotos salvas: {len(fotos_saved)}")
    
    for foto in fotos_saved:
        has_image = foto.imagem is not None
        image_size = len(foto.imagem) if foto.imagem else 0
        status = "✅ COM DADOS" if has_image and image_size > 0 else "❌ SEM DADOS"
        print(f"   - ID {foto.id}: {foto.filename} - {status} ({image_size} bytes)")
    
    print(f"\n🎯 CONCLUSÃO:")
    fotos_com_dados = sum(1 for f in fotos_saved if f.imagem and len(f.imagem) > 0)
    if fotos_com_dados == len(fotos_saved):
        print(f"✅ SUCESSO! Todas as {len(fotos_saved)} fotos foram salvas com dados binários")
    else:
        print(f"⚠️ PROBLEMA! Apenas {fotos_com_dados} de {len(fotos_saved)} fotos têm dados binários")
    
    print(f"\n📝 Relatório de teste: ID={relatorio.id}")
    print(f"   URL: /reports/{relatorio.id}")
