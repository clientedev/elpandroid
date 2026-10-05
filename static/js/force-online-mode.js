/**
 * FORÇAR MODO ONLINE - Garantir dados do PostgreSQL
 * Sistema para limpar cache offline e forçar uso do banco de dados
 */

class ForceOnlineMode {
    constructor() {
        this.init();
    }

    init() {
        console.log('🔥 FORCE ONLINE: Iniciando limpeza de cache offline');
        
        // 1. Limpar localStorage
        this.clearLocalStorage();
        
        // 2. Limpar sessionStorage  
        this.clearSessionStorage();
        
        // 3. Desregistrar Service Worker
        this.clearServiceWorker();
        
        // 4. Limpar cache do navegador
        this.clearBrowserCache();
        
        // 5. CACHE BUSTING AGRESSIVO para PWA
        this.aggressiveCacheBusting();
        
        // 6. Forçar reload sem cache
        this.forceReload();
    }

    // Cache busting agressivo especialmente para PWA
    aggressiveCacheBusting() {
        try {
            // Forçar revalidação de todos os recursos
            const resources = [
                '/api/legendas',
                '/api/test', 
                '/static/js/realtime-sync.js',
                '/static/css/style.css'
            ];
            
            resources.forEach(resource => {
                const timestamp = Date.now();
                fetch(`${resource}?_cb=${timestamp}`, { 
                    cache: 'no-store',
                    headers: { 'Cache-Control': 'no-cache' }
                }).catch(() => {
                    // Ignore errors, just trying to bust cache
                });
            });
            
            console.log('🔥 PWA CACHE BUSTING: Recursos forçados a revalidar');
            
        } catch (error) {
            console.error('❌ Erro no cache busting:', error);
        }
    }

    clearLocalStorage() {
        try {
            // LIMPEZA AGRESSIVA PARA PWA MOBILE - Garantir dados PostgreSQL
            const offlineKeys = [
                'offline_data',
                'sync_queue', 
                'offline_reports',
                'offline_visits',
                'offline_projects',
                'offline_reimbursements',
                'cached_legendas',
                'mobile_data',
                'pwa_cache',
                'app_data'
            ];
            
            offlineKeys.forEach(key => {
                localStorage.removeItem(key);
                console.log(`🧹 PWA CLEAR: localStorage.${key}`);
            });
            
            // Limpar TODAS as chaves que possam ter dados cached
            const allKeys = Object.keys(localStorage);
            allKeys.forEach(key => {
                if (key.includes('offline') || key.includes('sync') || key.includes('cache') || 
                    key.includes('legenda') || key.includes('mobile') || key.includes('pwa') ||
                    key.includes('app_') || key.includes('data_')) {
                    localStorage.removeItem(key);
                    console.log(`🧹 PWA CLEAR: localStorage.${key}`);
                }
            });
            
            // CLEAR TOTAL para PWA problemático
            if (this.isPWAApp()) {
                localStorage.clear();
                console.log('🧹 PWA TOTAL CLEAR: localStorage completamente limpo');
            }
            
        } catch (error) {
            console.error('❌ Erro ao limpar localStorage:', error);
        }
    }

    // Detectar se está rodando como PWA instalado
    isPWAApp() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true ||
               document.referrer.includes('android-app://');
    }

    clearSessionStorage() {
        try {
            sessionStorage.clear();
            console.log('🧹 CLEARED: sessionStorage');
        } catch (error) {
            console.error('❌ Erro ao limpar sessionStorage:', error);
        }
    }

    async clearServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const registration of registrations) {
                    await registration.unregister();
                    console.log('🧹 PWA CLEAR: Service Worker removido');
                    
                    // Força atualização do registro
                    if (registration.active) {
                        registration.active.postMessage({command: 'SKIP_WAITING'});
                    }
                }
                
                // Forçar reload de service workers
                if (registrations.length > 0) {
                    console.log('🔄 PWA: Forçando reload por Service Worker detectado');
                    setTimeout(() => window.location.reload(true), 100);
                }
                
            } catch (error) {
                console.error('❌ Erro ao limpar Service Worker:', error);
            }
        }
    }

    async clearBrowserCache() {
        if ('caches' in window) {
            try {
                const cacheNames = await caches.keys();
                for (const name of cacheNames) {
                    await caches.delete(name);
                    console.log(`🧹 CLEARED: Cache ${name}`);
                }
            } catch (error) {
                console.error('❌ Erro ao limpar cache:', error);
            }
        }
    }

    forceReload() {
        console.log('🔄 FORCE RELOAD: Recarregando sem cache');
        
        // Adicionar parâmetro anti-cache
        const url = new URL(window.location);
        url.searchParams.set('force_online', Date.now());
        
        // Reload forçado sem cache
        window.location.replace(url.toString());
    }

    // Função para verificar se está em modo offline
    static isOfflineMode() {
        return localStorage.getItem('offline_data') !== null || 
               localStorage.getItem('sync_queue') !== null;
    }

    // Função para forçar modo online em qualquer página
    static forceOnlineForPage() {
        if (ForceOnlineMode.isOfflineMode()) {
            console.log('⚠️ DETECTADO MODO OFFLINE - Forçando limpeza');
            new ForceOnlineMode();
        }
    }
}

// EXECUÇÃO AGRESSIVA PARA PWA MOBILE
document.addEventListener('DOMContentLoaded', function() {
    // Verificar se tem parâmetro para forçar online
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('force_online') || urlParams.has('clear_cache')) {
        new ForceOnlineMode();
        return;
    }
    
    // SEMPRE verificar em PWA mobile - não confiar em cache
    const isPWA = window.matchMedia('(display-mode: standalone)').matches;
    if (isPWA) {
        console.log('📱 PWA DETECTADO - Forçando modo online');
        // Pequeno delay para não interferir no carregamento
        setTimeout(() => {
            ForceOnlineMode.forceOnlineForPage();
        }, 500);
    } else {
        // Verificar se está em modo offline
        ForceOnlineMode.forceOnlineForPage();
    }
});

// Expor globalmente e criar endpoint de limpeza manual
window.ForceOnlineMode = ForceOnlineMode;

// Função global para limpar cache via console/URL
window.clearPWACache = function() {
    console.log('🔥 LIMPEZA MANUAL PWA');
    new ForceOnlineMode();
};

// Auto-detectar problemas de dados inconsistentes
window.detectDataInconsistency = function() {
    // Se a API retorna 42 legendas mas a interface mostra menos, há problema
    fetch('/api/legendas')
        .then(response => response.json())
        .then(data => {
            const apiCount = data.legendas ? data.legendas.length : 0;
            console.log(`📊 API retorna: ${apiCount} legendas`);
            
            if (apiCount !== 42) {
                console.log('⚠️ INCONSISTÊNCIA DETECTADA - Limpando cache');
                new ForceOnlineMode();
            }
        })
        .catch(err => console.error('Erro ao verificar dados:', err));
};

// Executar verificação automática em PWAs
if (window.matchMedia('(display-mode: standalone)').matches) {
    setTimeout(detectDataInconsistency, 2000);
}