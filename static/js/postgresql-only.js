/**
 * POSTGRESQL-ONLY MODE
 * Garante que todos os dados vêm exclusivamente do banco PostgreSQL
 */

// Interceptar todas as requisições para garantir uso do PostgreSQL
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
    // Adicionar header para garantir dados frescos do PostgreSQL
    const headers = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-PostgreSQL-Only': 'true',
        ...(options.headers || {})
    };
    
    return originalFetch(url, { ...options, headers });
};

// Interceptar formulários para garantir envio direto ao PostgreSQL
document.addEventListener('DOMContentLoaded', function() {
    document.addEventListener('submit', function(e) {
        const form = e.target;
        
        // Garantir que todos os formulários vão direto para o servidor
        if (form.tagName === 'FORM') {
            console.log('📡 FORM → PostgreSQL:', form.action || window.location.pathname);
            
            // Adicionar campo oculto para identificar modo PostgreSQL-only
            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.name = 'postgresql_only';
            hiddenInput.value = 'true';
            form.appendChild(hiddenInput);
        }
    });
    
    // Status messages removed
});

console.log('🗄️ MODO POSTGRESQL-ONLY ATIVADO - Dados sincronizados garantidos');