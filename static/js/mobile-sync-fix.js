/**
 * SOLUÇÃO DEFINITIVA MOBILE-DESKTOP SYNC
 * Força mobile a usar dados PostgreSQL, não localStorage
 */

class MobileSyncFix {
    constructor() {
        this.isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.init();
    }

    init() {
        console.log(`🔄 SYNC FIX: Iniciando em ${this.isMobile ? 'MOBILE' : 'DESKTOP'}`);
        
        if (this.isMobile) {
            this.forceMobileOnline();
        }
        
        this.addSyncButton();
        this.interceptOfflineOperations();
    }

    forceMobileOnline() {
        console.log('📱 MOBILE: Forçando modo online obrigatório');
        
        // Desabilitar completamente offline.js
        if (window.OfflineManager) {
            window.OfflineManager.prototype.interceptForms = function() {
                console.log('🚫 INTERCEPTAÇÃO DESABILITADA - Forçando PostgreSQL');
            };
        }
        
        // Limpar dados offline existentes
        this.clearOfflineData();
        
        // Mostrar aviso
        this.showMobileOnlineWarning();
    }

    clearOfflineData() {
        const offlineKeys = [
            'offline_data', 'sync_queue', 'offlineData',
            'offline_reports', 'offline_visits', 'offline_projects', 
            'offline_reimbursements'
        ];
        
        let clearedCount = 0;
        offlineKeys.forEach(key => {
            if (localStorage.getItem(key)) {
                localStorage.removeItem(key);
                clearedCount++;
                console.log(`🧹 CLEARED: ${key}`);
            }
        });
        
        if (clearedCount > 0) {
            console.log(`✅ LIMPEZA: ${clearedCount} itens removidos do localStorage`);
        }
    }

    showMobileOnlineWarning() {
        const warningDiv = document.createElement('div');
        warningDiv.innerHTML = `
            <div class="alert alert-info alert-dismissible fade show position-fixed" style="top: 60px; right: 10px; z-index: 9999; max-width: 300px;">
                <strong>📱 Modo Mobile Online</strong><br>
                Dados sincronizados com PostgreSQL
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        document.body.appendChild(warningDiv);
        
        setTimeout(() => {
            if (warningDiv.parentNode) warningDiv.remove();
        }, 5000);
    }

    addSyncButton() {
        // Adicionar botão de sincronização forçada
        const syncButton = document.createElement('button');
        syncButton.innerHTML = '<i class="fas fa-sync"></i> Sync DB';
        syncButton.className = 'btn btn-outline-primary btn-sm position-fixed';
        syncButton.style.cssText = 'bottom: 20px; right: 20px; z-index: 9998; font-size: 12px;';
        
        syncButton.onclick = () => this.forceDatabaseSync();
        document.body.appendChild(syncButton);
    }

    async forceDatabaseSync() {
        console.log('🔄 SYNC: Verificando dados do PostgreSQL');
        
        try {
            const response = await fetch('/api/sync-status', {
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache',
                    'X-Mobile-Sync': 'true'
                }
            });
            
            const data = await response.json();
            
            const syncInfo = `
                <div class="alert alert-success alert-dismissible">
                    <strong>✅ Sincronização PostgreSQL</strong><br>
                    Projetos: ${data.projetos} | Relatórios: ${data.relatorios}<br>
                    Usuários: ${data.users} | Legendas: ${data.legendas}
                    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                </div>
            `;
            
            const infoDiv = document.createElement('div');
            infoDiv.innerHTML = syncInfo;
            infoDiv.style.cssText = 'position: fixed; top: 70px; left: 10px; z-index: 9999; max-width: 300px;';
            document.body.appendChild(infoDiv);
            
            setTimeout(() => infoDiv.remove(), 4000);
            
        } catch (error) {
            console.error('❌ Erro na sincronização:', error);
            alert('Erro ao verificar dados do PostgreSQL');
        }
    }

    interceptOfflineOperations() {
        // Interceptar qualquer tentativa de salvar offline
        const originalSetItem = localStorage.setItem;
        localStorage.setItem = function(key, value) {
            if (key.includes('offline') || key.includes('sync_queue')) {
                console.warn(`🚫 BLOQUEADO: Tentativa de salvar ${key} no localStorage`);
                return;
            }
            return originalSetItem.apply(this, arguments);
        };
    }
}

// Executar imediatamente
document.addEventListener('DOMContentLoaded', function() {
    window.mobileSyncFix = new MobileSyncFix();
});

// Expor globalmente
window.MobileSyncFix = MobileSyncFix;