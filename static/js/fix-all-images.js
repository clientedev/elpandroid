
/**
 * Script para corrigir TODAS as URLs de imagem na página
 * Executa automaticamente ao carregar - VERSÃO CORRIGIDA
 */

(function() {
    'use strict';
    
    console.log('🔧 CORRETOR DE IMAGENS: Iniciando correção automática v2.0');
    
    function corrigirTodasAsImagens() {
        // Selecionar TODAS as imagens da página
        const todasImagens = document.querySelectorAll('img');
        let corrigidas = 0;
        
        todasImagens.forEach(function(img, index) {
            const srcOriginal = img.src;
            
            // Verificar se a URL precisa de correção
            if (srcOriginal.includes('/attached_assets/') || 
                srcOriginal.includes('/static/uploads/') ||
                (srcOriginal.includes('/static/img/') && !srcOriginal.includes('no-image.png'))) {
                
                // Extrair apenas o nome do arquivo
                const filename = srcOriginal.split('/').pop().split('?')[0];
                
                // Verificar se é um arquivo de imagem válido
                if (filename && filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                    const novaUrl = `/uploads/${filename}`;
                    
                    console.log(`🔧 CORRIGINDO imagem ${index + 1}:`);
                    console.log(`   ❌ De: ${srcOriginal}`);
                    console.log(`   ✅ Para: ${novaUrl}`);
                    
                    // Aplicar correção
                    img.src = novaUrl;
                    img.dataset.originalSrc = srcOriginal;
                    img.dataset.corrected = 'true';
                    
                    // Aplicar handler de erro
                    img.onerror = function() {
                        if (window.handleImageError) {
                            window.handleImageError(this);
                        } else {
                            console.log('⚠️ handleImageError não disponível');
                        }
                    };
                    
                    corrigidas++;
                }
            }
            
            // Garantir que todas as imagens tenham o handler de erro
            if (!img.onerror && !img.src.includes('no-image.png')) {
                img.onerror = function() {
                    if (window.handleImageError) {
                        window.handleImageError(this);
                    }
                };
            }
        });
        
        console.log(`✅ CORRETOR: ${corrigidas} imagens corrigidas de ${todasImagens.length} total`);
        return corrigidas;
    }
    
    // Executar quando DOM carregar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', corrigirTodasAsImagens);
    } else {
        corrigirTodasAsImagens();
    }
    
    // Executar novamente após 1 segundo para imagens carregadas dinamicamente
    setTimeout(corrigirTodasAsImagens, 1000);
    
    // Observar mudanças no DOM para corrigir novas imagens
    const observer = new MutationObserver(function(mutations) {
        let hasNewImages = false;
        
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) {
                    if (node.tagName === 'IMG' || (node.querySelector && node.querySelector('img'))) {
                        hasNewImages = true;
                    }
                }
            });
        });
        
        if (hasNewImages) {
            setTimeout(corrigirTodasAsImagens, 100);
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Função global para correção manual
    window.corrigirTodasAsImagens = corrigirTodasAsImagens;
    
    console.log('🔧 CORRETOR DE IMAGENS: Sistema v2.0 instalado');
})();
