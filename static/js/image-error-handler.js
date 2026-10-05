/**
 * Sistema de imagens DEFINITIVO - SOLUÇÃO COMPLETA
 */

// Definir função global IMEDIATAMENTE - VERSÃO OTIMIZADA
window.handleImageError = function(img) {
    // Evitar reprocessamento
    if (img.dataset.errorProcessed === 'true') {
        return;
    }

    const originalSrc = img.src;
    const filename = originalSrc.split('/').pop().split('?')[0];

    console.log('❌ ERRO IMAGEM:', filename);

    // Marcar como processado
    img.dataset.errorProcessed = 'true';
    img.dataset.originalSrc = originalSrc;

    // Se já está usando placeholder, não fazer nada
    if (img.src.includes('no-image.png') || img.src.includes('placeholder')) {
        return;
    }

    // Tentar /uploads/ APENAS
    const correctPath = `/uploads/${filename}`;
    
    // Teste direto com timeout
    const testImg = new Image();
    let testCompleted = false;
    
    testImg.onload = function() {
        if (!testCompleted) {
            testCompleted = true;
            console.log('✅ SUCESSO:', filename);
            img.dataset.errorProcessed = 'false';
            img.src = correctPath + '?t=' + Date.now(); // Cache bust
        }
    };
    
    testImg.onerror = function() {
        if (!testCompleted) {
            testCompleted = true;
            console.log('❌ USANDO PLACEHOLDER:', filename);
            useImagePlaceholder(img, filename);
        }
    };
    
    // Timeout para evitar travamento
    setTimeout(() => {
        if (!testCompleted) {
            testCompleted = true;
            console.log('⏰ TIMEOUT:', filename);
            useImagePlaceholder(img, filename);
        }
    }, 5000);
    
    testImg.src = correctPath;
};

// Função para usar placeholder com informações de diagnóstico
function useImagePlaceholder(img, filename, diagnosticData = null) {
    // Usar placeholder específico
    img.src = '/static/img/no-image.png';
    img.alt = `Imagem não encontrada: ${filename}`;

    // Criar título com informações de diagnóstico
    let title = `Clique para tentar recarregar: ${filename}`;
    if (diagnosticData) {
        if (diagnosticData.database_info.foto_relatorio) {
            title += `\n📋 Existe no banco (Relatório ID: ${diagnosticData.database_info.foto_relatorio.relatorio_id})`;
        }
        if (diagnosticData.database_info.foto_express) {
            title += `\n📋 Existe no banco (Express ID: ${diagnosticData.database_info.foto_express.relatorio_express_id})`;
        }
        if (diagnosticData.file_system_scan.length > 0) {
            title += `\n🔍 ${diagnosticData.file_system_scan.length} arquivo(s) similar(es) encontrado(s)`;
        }
    }
    img.title = title;

    // Aplicar estilos de erro
    img.classList.add('image-error');
    img.style.border = '2px dashed #ffc107';
    img.style.opacity = '0.7';
    img.style.background = 'linear-gradient(45deg, #f8f9fa 25%, transparent 25%), linear-gradient(-45deg, #f8f9fa 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f8f9fa 75%), linear-gradient(-45deg, transparent 75%, #f8f9fa 75%)';
    img.style.backgroundSize = '10px 10px';
    img.style.backgroundPosition = '0 0, 0 5px, 5px -5px, -5px 0px';

    console.log(`📋 PLACEHOLDER APLICADO: ${filename}`, diagnosticData);

    // Adicionar evento de clique para reload manual com diagnóstico
    img.onclick = function(e) {
        e.preventDefault();

        let message = `Tentar recarregar ${filename}?`;
        if (diagnosticData && diagnosticData.file_system_scan.length > 0) {
            message += `\n\nArquivos similares encontrados:\n${diagnosticData.file_system_scan.map(f => f.found_file).join('\n')}`;
        }

        if (confirm(message)) {
            console.log('🔄 RELOAD MANUAL iniciado para:', filename);
            const originalSrc = this.dataset.originalSrc;
            this.dataset.errorProcessed = 'false';
            this.classList.remove('image-error');
            this.style.border = '';
            this.style.opacity = '1';
            this.style.background = '';
            this.onclick = null;
            this.src = originalSrc + '?force_reload=' + Date.now();
        }
    };
}

// Função global para recarregar imagens com erro
window.reloadBrokenImages = function() {
    const brokenImages = document.querySelectorAll('img.image-error');
    console.log(`🔄 Recarregando ${brokenImages.length} imagens com erro`);

    brokenImages.forEach(img => {
        const originalSrc = img.dataset.originalSrc;
        if (originalSrc) {
            img.dataset.errorProcessed = 'false';
            img.classList.remove('image-error');
            img.style.border = '';
            img.style.opacity = '1';
            img.onclick = null;
            img.src = originalSrc + '?force=' + Date.now();
        }
    });

    return brokenImages.length;
};

// Log de carregamento
console.log('🖼️ Sistema de imagens carregado - handleImageError disponível globalmente');

// Aplicar handlers quando DOM carregar
document.addEventListener('DOMContentLoaded', function() {
    console.log('🖼️ Inicializando handlers de imagem');

    // Função para aplicar handlers
    function applyImageHandlers() {
        // Selecionar todas as imagens que podem ter problemas
        const images = document.querySelectorAll('img[src*="/uploads/"], img[src*="/attached_assets/"], img[src*="relatorio"], img[src*="express"]');

        images.forEach(img => {
            if (!img.dataset.handlerApplied) {
                img.dataset.handlerApplied = 'true';

                // Aplicar handler de erro usando a função global
                img.onerror = function() {
                    window.handleImageError(this);
                };

                // Verificar se a imagem já falhou ao carregar
                if (img.complete && img.naturalWidth === 0) {
                    window.handleImageError(img);
                }
            }
        });

        console.log(`🖼️ Handlers aplicados em ${images.length} imagens`);
    }

    // Aplicar handlers iniciais
    applyImageHandlers();

    // Observer para novas imagens
    const observer = new MutationObserver(function(mutations) {
        let hasNewImages = false;

        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) {
                    if (node.tagName === 'IMG' || node.querySelector && node.querySelector('img')) {
                        hasNewImages = true;
                    }
                }
            });
        });

        if (hasNewImages) {
            setTimeout(applyImageHandlers, 200);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
});