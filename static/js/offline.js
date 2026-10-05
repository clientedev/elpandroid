// Sistema de Funcionalidade Offline
class OfflineManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.syncQueue = [];
        this.offlineData = {
            reports: [],
            visits: [],
            projects: [],
            reimbursements: []
        };
        
        this.init();
    }

    init() {
        // Registrar Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/static/js/sw.js')
                .then(registration => {
                    console.log('Service Worker registrado:', registration);
                })
                .catch(error => {
                    console.log('Erro ao registrar Service Worker:', error);
                });
        }

        // Monitorar status da conexão
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.showConnectionStatus('online');
            this.syncData();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.showConnectionStatus('offline');
        });

        // Carregar dados offline salvos
        this.loadOfflineData();
        
        // Interceptar formulários para funcionar offline
        this.interceptForms();
        
        // Mostrar status inicial
        this.showConnectionStatus(this.isOnline ? 'online' : 'offline');
    }

    showConnectionStatus(status) {
        // Remove notificações anteriores
        const existingNotification = document.querySelector('.connection-status');
        if (existingNotification) {
            existingNotification.remove();
        }

        const notification = document.createElement('div');
        notification.className = `alert connection-status ${status === 'online' ? 'alert-success' : 'alert-warning'}`;
        notification.style.position = 'fixed';
        notification.style.top = '20px';
        notification.style.right = '20px';
        notification.style.zIndex = '9999';
        notification.style.minWidth = '300px';
        
        if (status === 'online') {
            notification.innerHTML = `
                <i class="fas fa-wifi"></i> 
                <strong>Online</strong> - Conectado à internet
                ${this.syncQueue.length > 0 ? `<br><small>Sincronizando ${this.syncQueue.length} item(s)...</small>` : ''}
            `;
            // Auto-remover após 3 segundos se online
            setTimeout(() => notification.remove(), 3000);
        } else {
            notification.innerHTML = `
                <i class="fas fa-wifi-slash"></i> 
                <strong>Offline</strong> - Trabalhando offline
                <br><small>Seus dados serão salvos localmente</small>
            `;
        }
        
        document.body.appendChild(notification);
    }

    loadOfflineData() {
        const saved = localStorage.getItem('elp_offline_data');
        if (saved) {
            this.offlineData = JSON.parse(saved);
        }
        
        const queue = localStorage.getItem('elp_sync_queue');
        if (queue) {
            this.syncQueue = JSON.parse(queue);
        }
    }

    saveOfflineData() {
        localStorage.setItem('elp_offline_data', JSON.stringify(this.offlineData));
        localStorage.setItem('elp_sync_queue', JSON.stringify(this.syncQueue));
    }

    interceptForms() {
        // Interceptar formulários de relatório
        document.addEventListener('submit', (e) => {
            const form = e.target;
            
            if (form.matches('#reportForm, #visitForm, #projectForm, #reimbursementForm')) {
                if (!this.isOnline) {
                    e.preventDefault();
                    this.saveFormOffline(form);
                }
            }
        });
    }

    saveFormOffline(form) {
        const formData = new FormData(form);
        const data = {};
        
        // Converter FormData para objeto
        for (let [key, value] of formData.entries()) {
            if (key === 'photos[]') {
                if (!data.photos) data.photos = [];
                data.photos.push(value);
            } else {
                data[key] = value;
            }
        }

        // Adicionar timestamp e ID temporário
        data.offline_id = 'offline_' + Date.now();
        data.created_offline = new Date().toISOString();
        data.form_action = form.action;
        data.form_method = form.method || 'POST';

        // Determinar tipo de dados baseado no formulário
        let dataType = 'unknown';
        if (form.id === 'reportForm' || form.action.includes('report')) {
            dataType = 'reports';
        } else if (form.id === 'visitForm' || form.action.includes('visit')) {
            dataType = 'visits';
        } else if (form.id === 'projectForm' || form.action.includes('project')) {
            dataType = 'projects';
        } else if (form.id === 'reimbursementForm' || form.action.includes('reimbursement')) {
            dataType = 'reimbursements';
        }

        // Salvar dados offline
        this.offlineData[dataType].push(data);
        this.syncQueue.push({
            type: dataType,
            action: 'create',
            data: data,
            offline_id: data.offline_id
        });

        this.saveOfflineData();

        // Mostrar confirmação
        this.showSuccessMessage('Dados salvos offline! Serão sincronizados quando a conexão for restabelecida.');
        
        // Redirecionar para lista ou página apropriada
        if (dataType === 'reports') {
            window.location.href = '/reports';
        } else if (dataType === 'visits') {
            window.location.href = '/visits';
        } else if (dataType === 'projects') {
            window.location.href = '/projects';
        } else if (dataType === 'reimbursements') {
            window.location.href = '/reimbursements';
        }
    }

    async syncData() {
        if (!this.isOnline || this.syncQueue.length === 0) {
            return;
        }

        this.showConnectionStatus('online');
        
        const itemsToSync = [...this.syncQueue];
        let syncedCount = 0;
        let errorCount = 0;

        for (const item of itemsToSync) {
            try {
                await this.syncItem(item);
                
                // Remover da fila após sincronização bem-sucedida
                this.syncQueue = this.syncQueue.filter(queueItem => 
                    queueItem.offline_id !== item.offline_id
                );
                
                // Remover dos dados offline
                if (this.offlineData[item.type]) {
                    this.offlineData[item.type] = this.offlineData[item.type].filter(data => 
                        data.offline_id !== item.offline_id
                    );
                }
                
                syncedCount++;
            } catch (error) {
                console.error('Erro ao sincronizar item:', error);
                errorCount++;
            }
        }

        this.saveOfflineData();

        // Mostrar resultado da sincronização
        if (syncedCount > 0) {
            this.showSuccessMessage(`${syncedCount} item(s) sincronizado(s) com sucesso!`);
        }
        
        if (errorCount > 0) {
            this.showErrorMessage(`${errorCount} item(s) falharam na sincronização. Tentando novamente...`);
        }
    }

    async syncItem(item) {
        const formData = new FormData();
        
        // Adicionar todos os campos do formulário
        for (const [key, value] of Object.entries(item.data)) {
            if (key !== 'offline_id' && key !== 'created_offline' && key !== 'form_action' && key !== 'form_method') {
                if (key === 'photos' && Array.isArray(value)) {
                    value.forEach(photo => formData.append('photos[]', photo));
                } else {
                    formData.append(key, value);
                }
            }
        }

        const response = await fetch(item.data.form_action, {
            method: item.data.form_method,
            body: formData,
            headers: {
                'X-Offline-Sync': 'true'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
    }

    showSuccessMessage(message) {
        this.showToast(message, 'success');
    }

    showErrorMessage(message) {
        this.showToast(message, 'error');
    }

    showToast(message, type) {
        const toast = document.createElement('div');
        toast.className = `alert alert-${type === 'success' ? 'success' : 'danger'} toast-notification`;
        toast.style.position = 'fixed';
        toast.style.top = '80px';
        toast.style.right = '20px';
        toast.style.zIndex = '9999';
        toast.style.minWidth = '300px';
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check' : 'exclamation-triangle'}"></i> 
            ${message}
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => toast.remove(), 5000);
    }

    // Verificar se há dados offline pendentes
    hasPendingSync() {
        return this.syncQueue.length > 0;
    }

    // Obter contagem de itens pendentes
    getPendingCount() {
        return this.syncQueue.length;
    }

    // Forçar sincronização manual
    forcSync() {
        if (this.isOnline) {
            this.syncData();
        } else {
            this.showErrorMessage('Não é possível sincronizar: sem conexão com a internet');
        }
    }
}

// Inicializar gerenciador offline quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    window.offlineManager = new OfflineManager();
    
    // Adicionar indicador visual de status offline na navbar
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        const offlineIndicator = document.createElement('div');
        offlineIndicator.id = 'offline-indicator';
        offlineIndicator.style.display = 'none';
        offlineIndicator.className = 'badge bg-warning ms-2';
        offlineIndicator.innerHTML = '<i class="fas fa-wifi-slash"></i> Offline';
        
        const navbarBrand = navbar.querySelector('.navbar-brand');
        if (navbarBrand) {
            navbarBrand.appendChild(offlineIndicator);
        }
        
        // Mostrar/ocultar indicador baseado no status
        window.addEventListener('online', () => {
            offlineIndicator.style.display = 'none';
        });
        
        window.addEventListener('offline', () => {
            offlineIndicator.style.display = 'inline-block';
        });
        
        // Definir estado inicial
        if (!navigator.onLine) {
            offlineIndicator.style.display = 'inline-block';
        }
    }
});