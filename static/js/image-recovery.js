
/**
 * Sistema de Recuperação Automática de Imagens
 * Tenta migrar imagens automaticamente quando não encontradas
 */

class ImageRecoverySystem {
    constructor() {
        this.recoveryAttempts = new Set();
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 segundo
        
        console.log('🔄 Sistema de Recuperação de Imagens iniciado');
    }
    
    init() {
        this.setupImageObserver();
        this.setupErrorHandlers();
        this.startPeriodicCheck();
    }
    
    setupImageObserver() {
        // Observer para novas imagens
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        if (node.tagName === 'IMG') {
                            this.processImage(node);
                        } else if (node.querySelector) {
                            node.querySelectorAll('img').forEach(img => {
                                this.processImage(img);
                            });
                        }
                    }
                });
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    setupErrorHandlers() {
        // Interceptar erros de imagem globalmente
        document.addEventListener('error', (event) => {
            if (event.target.tagName === 'IMG') {
                this.handleImageError(event.target);
            }
        }, true);
    }
    
    processImage(img) {
        if (!img.src || img.dataset.recoveryProcessed) return;
        
        // Marcar como processado
        img.dataset.recoveryProcessed = 'true';
        
        // Se a imagem tem problemas, tentar recuperar
        if (img.complete && img.naturalWidth === 0) {
            this.handleImageError(img);
        }
    }
    
    async handleImageError(img) {
        const filename = this.extractFilename(img.src);
        if (!filename || this.recoveryAttempts.has(filename)) {
            return;
        }
        
        console.log('🔄 Tentando recuperar imagem:', filename);
        this.recoveryAttempts.add(filename);
        
        try {
            // Tentar migração automática
            const migrationResult = await this.attemptMigration(filename);
            
            if (migrationResult.success) {
                console.log('✅ Imagem recuperada:', filename);
                
                // Recarregar a imagem
                const newSrc = `/uploads/${filename}?recovered=${Date.now()}`;
                img.src = newSrc;
                
                // Remover do conjunto de tentativas após sucesso
                setTimeout(() => {
                    this.recoveryAttempts.delete(filename);
                }, 5000);
            } else {
                console.log('❌ Recuperação falhou:', filename);
                this.applyErrorPlaceholder(img, filename);
            }
        } catch (error) {
            console.error('💥 Erro na recuperação:', error);
            this.applyErrorPlaceholder(img, filename);
        }
    }
    
    async attemptMigration(filename) {
        try {
            const response = await fetch('/api/recover-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify({ filename })
            });
            
            return await response.json();
        } catch (error) {
            console.error('Erro na API de recuperação:', error);
            return { success: false, error: error.message };
        }
    }
    
    extractFilename(src) {
        if (!src) return null;
        return src.split('/').pop().split('?')[0];
    }
    
    getCSRFToken() {
        const token = document.querySelector('meta[name="csrf-token"]');
        return token ? token.getAttribute('content') : '';
    }
    
    applyErrorPlaceholder(img, filename) {
        // Aplicar placeholder visual
        img.style.border = '2px dashed #ffc107';
        img.style.background = '#f8f9fa';
        img.style.opacity = '0.7';
        
        // Adicionar tooltip explicativo
        img.title = `❌ Imagem não encontrada: ${filename}\nClique para tentar recarregar`;
        
        // Adicionar evento de clique para reload manual
        img.style.cursor = 'pointer';
        img.onclick = () => {
            this.recoveryAttempts.delete(filename);
            img.src = img.dataset.originalSrc || img.src;
            this.handleImageError(img);
        };
        
        // Aplicar src placeholder se disponível
        if (!img.src.includes('no-image.png')) {
            img.src = '/static/img/no-image.png';
        }
    }
    
    startPeriodicCheck() {
        // Verificação periódica a cada 30 segundos
        setInterval(() => {
            this.checkBrokenImages();
        }, 30000);
    }
    
    checkBrokenImages() {
        const images = document.querySelectorAll('img[src*="/uploads/"]');
        let brokenCount = 0;
        
        images.forEach(img => {
            if (img.complete && img.naturalWidth === 0 && !img.src.includes('no-image.png')) {
                brokenCount++;
                this.handleImageError(img);
            }
        });
        
        if (brokenCount > 0) {
            console.log(`🔄 Verificação periódica: ${brokenCount} imagens quebradas encontradas`);
        }
    }
    
    // Função pública para recuperação manual
    async recoverImage(filename) {
        return await this.attemptMigration(filename);
    }
    
    getStats() {
        return {
            recoveryAttempts: this.recoveryAttempts.size,
            totalImages: document.querySelectorAll('img').length,
            brokenImages: document.querySelectorAll('img[style*="border: 2px dashed"]').length
        };
    }
}

// Inicializar sistema globalmente
const imageRecoverySystem = new ImageRecoverySystem();

// Inicializar quando DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => imageRecoverySystem.init());
} else {
    imageRecoverySystem.init();
}

// Expor globalmente
window.imageRecoverySystem = imageRecoverySystem;

console.log('🔄 Sistema de Recuperação de Imagens carregado');
