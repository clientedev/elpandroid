/**
 * DESABILITAR SISTEMA OFFLINE COMPLETAMENTE
 * Garante que mobile use EXCLUSIVAMENTE PostgreSQL
 */

// 1. DESABILITAR SERVICE WORKER COMPLETAMENTE
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for (let registration of registrations) {
            registration.unregister();
            console.log('🚫 Service Worker desabilitado:', registration);
        }
    });
}

// 2. INTERCEPTAR E BLOQUEAR OFFLINE.JS
window.OfflineManager = class {
    constructor() {
        console.log('🚫 OfflineManager DESABILITADO - Usando apenas PostgreSQL');
    }
    
    init() { /* BLOQUEADO */ }
    interceptForms() { /* BLOQUEADO */ }
    saveFormOffline() { /* BLOQUEADO */ }
    syncData() { /* BLOQUEADO */ }
    loadOfflineData() { /* BLOQUEADO */ }
    saveOfflineData() { /* BLOQUEADO */ }
    showConnectionStatus() { /* BLOQUEADO */ }
};

// 3. BLOQUEAR localStorage PARA DADOS OFFLINE
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
    const blockedKeys = [
        'offline', 'sync', 'cache', 'pwa', 
        'reports', 'visits', 'projects', 'reimbursements'
    ];
    
    const isBlocked = blockedKeys.some(blocked => 
        key.toLowerCase().includes(blocked)
    );
    
    if (isBlocked) {
        console.warn('🚫 BLOQUEADO: localStorage.' + key + ' - Usando PostgreSQL');
        return;
    }
    
    return originalSetItem.apply(this, arguments);
};

// 4. LIMPAR DADOS OFFLINE EXISTENTES
function clearAllOfflineData() {
    const keys = Object.keys(localStorage);
    let clearedCount = 0;
    
    keys.forEach(key => {
        const isOfflineData = [
            'offline', 'sync', 'cache', 'pwa',
            'reports', 'visits', 'projects', 'reimbursements'
        ].some(term => key.toLowerCase().includes(term));
        
        if (isOfflineData) {
            localStorage.removeItem(key);
            clearedCount++;
            console.log('🧹 REMOVIDO:', key);
        }
    });
    
    if (clearedCount > 0) {
        console.log(`✅ ${clearedCount} dados offline removidos`);
    }
}

// 5. DESABILITAR CACHE DE NAVEGADOR
if ('caches' in window) {
    caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
            caches.delete(cacheName);
            console.log('🧹 Cache removido:', cacheName);
        });
    });
}

// 6. FORÇAR SEMPRE ONLINE
Object.defineProperty(navigator, 'onLine', {
    get: function() { return true; },
    configurable: false
});

// 7. EXECUTAR LIMPEZA IMEDIATA
clearAllOfflineData();

// 8. MOSTRAR STATUS DE FORÇA ONLINE
document.addEventListener('DOMContentLoaded', function() {
    const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    // Mensagens removidas conforme solicitado
});

console.log('🎯 SISTEMA OFFLINE COMPLETAMENTE DESABILITADO - PostgreSQL ONLY');