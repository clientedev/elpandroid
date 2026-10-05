/**
 * sync-manager.js
 * Gerencia a sincronização de dados offline com o servidor
 */

const SyncManager = {
    isSyncing: false,

    init() {
        console.log('🔄 SyncManager inicializado');

        // Listener para quando voltar online
        window.addEventListener('online', () => {
            console.log('🌐 Conexão restabelecida - Iniciando sincronização...');
            this.processQueue();
            this.updateStatus('online');
        });

        window.addEventListener('offline', () => {
            console.log('📡 Sem conexão - Modo offline ativado');
            this.updateStatus('offline');
        });

        // Tentar sincronizar ao iniciar se estiver online
        if (navigator.onLine) {
            this.processQueue();
        } else {
            this.updateStatus('offline');
        }
    },

    updateStatus(status) {
        const indicator = document.getElementById('offlineIndicator');
        if (!indicator) return;

        if (status === 'offline') {
            indicator.style.display = 'block';
            indicator.className = 'alert alert-warning fixed-bottom m-3 shadow-lg';
            indicator.innerHTML = '<i class="fas fa-wifi-slash me-2"></i>Você está offline. Dados serão salvos localmente.';
        } else if (status === 'syncing') {
            // Removido para não exibir mensagem intrusiva
            // indicator.style.display = 'block';
            // indicator.className = 'alert alert-info fixed-bottom m-3 shadow-lg';
            // indicator.innerHTML = '<i class="fas fa-sync fa-spin me-2"></i>Sincronizando dados...';
        } else if (status === 'online') {
            // Mostrar brevemente que está online e esconder
            // indicator.className = 'alert alert-success fixed-bottom m-3 shadow-lg';
            // indicator.innerHTML = '<i class="fas fa-check-circle me-2"></i>Conexão restabelecida.';
            // setTimeout(() => {
            //     indicator.style.display = 'none';
            // }, 3000);
        }
    },

    async processQueue() {
        if (this.isSyncing || !navigator.onLine) return;

        try {
            this.isSyncing = true;
            this.updateStatus('syncing');

            // Abrir DB
            const db = await OfflineDB.open();

            // Ler fila
            const queue = await OfflineDB.getSyncQueue();

            if (queue.length === 0) {
                console.log('✅ Fila de sincronização vazia');
                this.isSyncing = false;
                this.updateStatus('online');
                return;
            }

            console.log(`📦 Processando ${queue.length} itens da fila...`);

            // Processar cada item
            for (const item of queue) {
                try {
                    await this.syncItem(item);
                    // Se sucesso, remover da fila
                    await OfflineDB.removeFromSyncQueue(item.id);
                    // E remover dados originais do IDB (opcional, ou manter como cache)
                    // await OfflineDB.deleteReport(item.reportId); 
                } catch (error) {
                    console.error(`❌ Erro ao sincronizar item ${item.id}:`, error);
                    // Manter na fila para tentar depois
                }
            }

            console.log('✅ Sincronização concluída');

            // Notificar usuário
            this.showNotification('Sincronização concluída com sucesso!');

            // Atualizar UI se estiver na lista
            if (window.location.pathname.includes('/reports')) {
                window.location.reload();
            }

        } catch (error) {
            console.error('❌ Erro geral na sincronização:', error);
        } finally {
            this.isSyncing = false;
            this.updateStatus('online');
        }
    },

    async syncItem(item) {
        if (item.type === 'report') {
            return this.syncReport(item.dataId);
        }
    },

    async syncReport(reportId) {
        // Buscar dados completos no IDB
        const report = await OfflineDB.getReport(reportId);
        if (!report) {
            console.warn(`⚠️ Relatório ${reportId} não encontrado no IDB, removendo da fila.`);
            return;
        }

        const photos = await OfflineDB.getPhotosByReport(reportId);

        // Montar FormData
        const formData = new FormData();

        // Adicionar campos do relatório
        Object.keys(report).forEach(key => {
            if (key !== 'id' && key !== 'synced' && key !== 'createdAt') {
                formData.append(key, report[key]);
            }
        });

        // Adicionar fotos
        // IMPORTANTE: backend espera 'photos' como lista de arquivos
        // Cada foto deve ter filename
        if (photos && photos.length > 0) {
            photos.forEach((photo, index) => {
                // Converter blob para arquivo com nome
                const filename = `offline_photo_${reportId}_${index}.jpg`;
                formData.append('photos', photo.blob, filename);

                // Se o backend exigir categoria mapeada, precisaria de logica extra
                // Aqui assumimos que o backend processa ou a gente manda metadados extra
                // O app atual usa um input file multiple simples, sem categoria por foto no upload inicial
                // Mas o form.html tem lógica de categoria. Vamos verificar como o backend recebe.
            });
        }

        // Enviar
        const response = await fetch('/reports/create', {
            method: 'POST',
            body: formData,
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }

        return await response.json(); // Assumindo que retorna JSON
    },

    showNotification(message) {
        // Usar toast do bootstrap se disponível
        if (typeof showToast === 'function') {
            showToast(message, 'success');
        } else {
            alert(message);
        }
    }
};

// Auto-inicializar se o DOM já estiver carregado
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SyncManager.init());
} else {
    SyncManager.init();
}

window.SyncManager = SyncManager;
