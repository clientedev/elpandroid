
/**
 * Script de teste para validar API de upload de fotos
 * Usar no console do navegador mobile
 */

async function testUploadAPI() {
    console.log('🧪 ========== TESTE DE UPLOAD API ==========');
    
    // Criar uma imagem de teste (1x1 pixel vermelho)
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'red';
    ctx.fillRect(0, 0, 1, 1);
    
    // Converter para blob
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
    console.log('✅ Imagem de teste criada:', blob.size, 'bytes');
    
    // Método 1: Testar com FormData (multipart)
    console.log('\n📤 TESTE 1: Upload via FormData (multipart)');
    const formData = new FormData();
    formData.append('imagem', blob, 'test.jpg');
    formData.append('relatorio_id', '11'); // Ajustar ID do relatório
    formData.append('legenda', 'Teste de Upload API');
    formData.append('categoria', 'Teste');
    
    try {
        const response1 = await fetch('/api/upload-photo-simple', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        
        const result1 = await response1.json();
        console.log('📥 Resposta FormData:', result1);
        
        if (result1.success) {
            console.log('✅ SUCESSO FormData! Foto ID:', result1.foto_id);
        } else {
            console.error('❌ FALHA FormData:', result1.error);
        }
    } catch (error) {
        console.error('❌ ERRO FormData:', error);
    }
    
    // Método 2: Testar com Base64
    console.log('\n📤 TESTE 2: Upload via Base64');
    const base64 = canvas.toDataURL('image/jpeg');
    
    try {
        const response2 = await fetch('/api/upload-photo-simple', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                relatorio_id: 11, // Ajustar ID do relatório
                imagem_base64: base64,
                legenda: 'Teste de Upload Base64',
                categoria: 'Teste',
                filename: 'test-base64.jpg'
            }),
            credentials: 'include'
        });
        
        const result2 = await response2.json();
        console.log('📥 Resposta Base64:', result2);
        
        if (result2.success) {
            console.log('✅ SUCESSO Base64! Foto ID:', result2.foto_id);
        } else {
            console.error('❌ FALHA Base64:', result2.error);
        }
    } catch (error) {
        console.error('❌ ERRO Base64:', error);
    }
    
    console.log('\n🏁 ========== FIM DO TESTE ==========');
}

// Executar teste automaticamente
console.log('🚀 Para testar a API de upload, execute: testUploadAPI()');
