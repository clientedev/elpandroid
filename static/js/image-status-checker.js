
/**
 * Sistema de verificação de status das imagens em tempo real
 */

class ImageStatusChecker {
    constructor() {
        this.checkedImages = new Set();
        this.failedImages = new Set();
        this.successfulImages = new Set();
        this.isRunning = false;
    }
    
    // Inicializar verificação automática
    init() {
        console.log('🔍 ImageStatusChecker inicializado');
        
        // Verificar imagens ao carregar a página
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => this.checkAllImages(), 1000);
        });
        
        // Verificar imagens adicionadas dinamicamente
        const observer = new MutationObserver((mutations) => {
            let hasNewImages = false;
            mutations.forEach(mutation => {
                if (mutation.addedNodes) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && (node.tagName === 'IMG' || node.querySelectorAll)) {
                            hasNewImages = true;
                        }
                    });
                }
            });
            
            if (hasNewImages && !this.isRunning) {
                setTimeout(() => this.checkAllImages(), 500);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // Expor métodos globalmente
        window.imageStatusChecker = this;
    }
    
    // Verificar todas as imagens da página
    async checkAllImages() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        console.log('🔍 Iniciando verificação de todas as imagens...');
        
        const images = document.querySelectorAll('img[src*="/uploads/"], img[src*="/attached_assets/"], img[src*="express_"], img[src*="_edited"], img[src*="relatorio_"]');
        
        console.log(`📊 Encontradas ${images.length} imagens para verificar`);
        
        let checked = 0;
        let successful = 0;
        let failed = 0;
        
        for (const img of images) {
            try {
                const result = await this.checkSingleImage(img);
                if (result.success) {
                    successful++;
                    this.successfulImages.add(img.src);
                } else {
                    failed++;
                    this.failedImages.add(img.src);
                }
                checked++;
            } catch (error) {
                console.error('❌ Erro ao verificar imagem:', error);
                failed++;
                checked++;
            }
        }
        
        console.log(`✅ Verificação concluída: ${checked} verificadas, ${successful} ok, ${failed} com erro`);
        
        // Atualizar status visual
        this.updateVisualStatus();
        
        this.isRunning = false;
        
        return {
            total: images.length,
            checked,
            successful,
            failed,
            successRate: checked > 0 ? (successful / checked * 100).toFixed(1) : 0
        };
    }
    
    // Verificar uma única imagem
    checkSingleImage(img) {
        return new Promise((resolve) => {
            const src = img.src;
            const filename = src.split('/').pop();
            
            // Se já foi verificada, pular
            if (this.checkedImages.has(src)) {
                resolve({ success: !this.failedImages.has(src), cached: true });
                return;
            }
            
            // Marcar como verificada
            this.checkedImages.add(src);
            
            // Se a imagem já carregou com sucesso
            if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
                resolve({ success: true, reason: 'already_loaded' });
                return;
            }
            
            // Se já tem classe de erro
            if (img.classList.contains('image-error')) {
                resolve({ success: false, reason: 'has_error_class' });
                return;
            }
            
            // Testar carregamento da imagem
            const testImg = new Image();
            const timeout = setTimeout(() => {
                resolve({ success: false, reason: 'timeout' });
            }, 5000);
            
            testImg.onload = () => {
                clearTimeout(timeout);
                resolve({ success: true, reason: 'test_load_success' });
            };
            
            testImg.onerror = () => {
                clearTimeout(timeout);
                resolve({ success: false, reason: 'test_load_failed' });
            };
            
            testImg.src = src + (src.includes('?') ? '&' : '?') + 'check=' + Date.now();
        });
    }
    
    // Atualizar status visual das imagens
    updateVisualStatus() {
        const images = document.querySelectorAll('img[src*="/uploads/"], img[src*="/attached_assets/"]');
        
        images.forEach(img => {
            const src = img.src;
            
            if (this.successfulImages.has(src)) {
                // Remover indicadores de erro se existirem
                img.classList.remove('image-error');
                img.style.border = '';
                img.style.opacity = '';
                
                // Adicionar indicador de sucesso discreto
                if (!img.dataset.statusChecked) {
                    img.dataset.statusChecked = 'success';
                    img.title = img.title || `✅ ${img.src.split('/').pop()}`;
                }
            } else if (this.failedImages.has(src)) {
                // Adicionar indicador de erro se não existir
                if (!img.classList.contains('image-error')) {
                    img.classList.add('image-error');
                    img.style.border = '2px dashed #ffc107';
                    img.style.opacity = '0.7';
                    img.dataset.statusChecked = 'failed';
                    img.title = `❌ Erro: ${img.src.split('/').pop()} - Clique para tentar novamente`;
                }
            }
        });
    }
    
    // Obter estatísticas
    getStats() {
        return {
            checked: this.checkedImages.size,
            successful: this.successfulImages.size,
            failed: this.failedImages.size,
            isRunning: this.isRunning
        };
    }
    
    // Limpar cache de verificação
    clearCache() {
        this.checkedImages.clear();
        this.failedImages.clear();
        this.successfulImages.clear();
        console.log('🧹 Cache de verificação de imagens limpo');
    }
    
    // Reexecutar verificação
    async recheck() {
        this.clearCache();
        return await this.checkAllImages();
    }
}

// Inicializar automaticamente
const imageStatusChecker = new ImageStatusChecker();
imageStatusChecker.init();

// Funções globais para uso manual
window.checkImageStatus = () => imageStatusChecker.checkAllImages();
window.recheckImages = () => imageStatusChecker.recheck();
window.getImageStats = () => imageStatusChecker.getStats();
window.clearImageCache = () => imageStatusChecker.clearCache();

console.log('📊 Sistema de verificação de status de imagens carregado');
