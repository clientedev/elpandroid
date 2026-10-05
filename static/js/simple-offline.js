// Sistema Simples de Detecção Offline
(function() {
    'use strict';
    
    // Status da conexão
    let isOnline = navigator.onLine;
    
    // Criar indicador de status na navbar
    function createOfflineIndicator() {
        const navbar = document.querySelector('.navbar-brand');
        if (!navbar) return;
        
        const indicator = document.createElement('span');
        indicator.id = 'offline-indicator';
        indicator.className = 'badge bg-warning ms-2';
        indicator.style.display = 'none';
        indicator.innerHTML = '<i class="fas fa-wifi-slash"></i> Offline';
        navbar.appendChild(indicator);
        
        return indicator;
    }
    
    // Mostrar/ocultar indicador
    function updateIndicator() {
        const indicator = document.getElementById('offline-indicator');
        if (!indicator) return;
        
        if (!navigator.onLine) {
            indicator.style.display = 'inline-block';
        } else {
            indicator.style.display = 'none';
        }
    }
    
    // Mostrar notificação de status
    function showNotification(message, type = 'info') {
        // Remove notificações anteriores
        const existing = document.querySelector('.connection-notification');
        if (existing) existing.remove();
        
        const notification = document.createElement('div');
        notification.className = `alert alert-${type} connection-notification`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            min-width: 300px;
            opacity: 0.95;
        `;
        notification.innerHTML = message;
        
        document.body.appendChild(notification);
        
        // Auto-remover após alguns segundos
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, type === 'success' ? 3000 : 5000);
    }
    
    // Interceptar envios de formulário para avisar quando offline
    function interceptForms() {
        document.addEventListener('submit', function(e) {
            if (!navigator.onLine) {
                e.preventDefault();
                showNotification(
                    '<i class="fas fa-wifi-slash"></i> <strong>Sem conexão!</strong><br>' +
                    'Você está offline. Conecte-se à internet para enviar dados.',
                    'warning'
                );
                return false;
            }
        });
    }
    
    // Event listeners para mudanças de conexão
    function setupEventListeners() {
        window.addEventListener('online', function() {
            isOnline = true;
            updateIndicator();
            showNotification(
                '<i class="fas fa-wifi"></i> <strong>Conectado!</strong><br>' +
                'Conexão com a internet restabelecida.',
                'success'
            );
        });
        
        window.addEventListener('offline', function() {
            isOnline = false;
            updateIndicator();
            showNotification(
                '<i class="fas fa-wifi-slash"></i> <strong>Offline!</strong><br>' +
                'Sem conexão com a internet. Funcionalidades limitadas.',
                'warning'
            );
        });
    }
    
    // Inicializar quando DOM estiver pronto
    document.addEventListener('DOMContentLoaded', function() {
        createOfflineIndicator();
        updateIndicator();
        setupEventListeners();
        interceptForms();
        
        // Mostrar status inicial se offline
        if (!navigator.onLine) {
            setTimeout(() => {
                showNotification(
                    '<i class="fas fa-wifi-slash"></i> <strong>Offline!</strong><br>' +
                    'Sem conexão com a internet detectada.',
                    'warning'
                );
            }, 1000);
        }
    });
    
})();