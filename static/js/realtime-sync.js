/**
 * SISTEMA DE SINCRONIZAÇÃO EM TEMPO REAL
 * Garante que o app mobile PWA tenha 100% dos dados do PostgreSQL
 */

class RealTimeSync {
    constructor() {
        this.syncInterval = null;
        this.lastSyncTimestamp = null;
        this.syncFrequency = 5000; // 5 segundos
        this.retryCount = 0;
        this.maxRetries = 3;
        this.isActive = false;

        // Dados em cache para comparação
        this.cachedData = {};

        // Array para armazenar imagens temporárias antes de serem salvas permanentemente
        this.imagens = []; // Inicializa como um array vazio

        this.init();
    }

    init() {
        console.log('🔄 REAL-TIME SYNC: Sistema iniciado');

        // Detectar se é PWA e ajustar frequência
        if (this.isPWAApp()) {
            this.syncFrequency = 3000; // PWA sincroniza mais frequentemente
            console.log('📱 PWA DETECTADO: Sincronização a cada 3s');
        }

        // Começar sincronização imediata
        this.startSync();

        // Escutar eventos de focus/blur para otimizar
        window.addEventListener('focus', () => {
            console.log('📱 APP FOCADO: Forçando sincronização');
            this.forceSyncNow();
        });

        window.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                console.log('📱 APP VISÍVEL: Forçando sincronização');
                this.forceSyncNow();
            }
        });

        // Verificar conectividade
        window.addEventListener('online', () => {
            console.log('🌐 CONECTADO: Iniciando sincronização');
            this.startSync();
        });

        window.addEventListener('offline', () => {
            console.log('❌ OFFLINE: Pausando sincronização');
            this.stopSync();
        });
    }

    isPWAApp() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true ||
               document.referrer.includes('android-app://');
    }

    startSync() {
        if (this.isActive) return;

        this.isActive = true;
        console.log(`🔄 SYNC ATIVO: Polling a cada ${this.syncFrequency}ms`);

        // Primeira sincronização imediata
        this.syncNow();

        // Polling contínuo
        this.syncInterval = setInterval(() => {
            this.syncNow();
        }, this.syncFrequency);
    }

    stopSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        this.isActive = false;
        console.log('⏸️ SYNC PAUSADO');
    }

    async forceSyncNow() {
        this.stopSync();
        await this.syncNow();
        this.startSync();
    }

    async syncNow() {
        if (!navigator.onLine) {
            console.log('❌ OFFLINE: Sync cancelado');
            return;
        }

        try {
            // Adicionar timestamp anti-cache
            const timestamp = Date.now();
            const url = `/api/legendas?categoria=all&_t=${timestamp}&sync=realtime`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'If-None-Match': '*'
                },
                cache: 'no-store'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (data.success && data.legendas) {
                const currentCount = data.legendas.length;
                const lastCount = this.cachedData.count || 0;

                // Verificar se houve mudanças
                const dataChanged = this.hasDataChanged(data);

                if (dataChanged || currentCount !== lastCount) {
                    console.log(`🔄 DADOS ATUALIZADOS: ${currentCount} legendas (era ${lastCount})`);
                    this.updateUI(data);
                    this.cachedData = {
                        count: currentCount,
                        timestamp: data.timestamp,
                        hash: this.hashData(data.legendas)
                    };

                    // Sincronizar imagens: temp_id → id definitivo
                    if (data.imagens && Array.isArray(data.imagens) && data.imagens.length > 0) {
                        try {
                            this.syncImages(data.imagens);
                        } catch (syncError) {
                            console.error('❌ ERRO SYNC:', syncError);
                        }
                    }

                    // Dispatch evento personalizado para outros componentes
                    window.dispatchEvent(new CustomEvent('realtime-sync-update', {
                        detail: { data: data, changed: true }
                    }));
                } else {
                    console.log(`✅ DADOS OK: ${currentCount} legendas (sem mudanças)`);
                }

                this.retryCount = 0; // Reset retry counter on success
            }

        } catch (error) {
            console.error('❌ ERRO SYNC:', error);
            this.handleSyncError(error);
        }
    }

    hasDataChanged(newData) {
        if (!this.cachedData.hash) return true;

        const newHash = this.hashData(newData.legendas);
        return newHash !== this.cachedData.hash;
    }

    hashData(data) {
        // Criar hash simples dos dados para detectar mudanças
        return btoa(JSON.stringify(data.map(item => ({ id: item.id, texto: item.texto })))).slice(0, 10);
    }

    updateUI(data) {
        // Atualizar interfaces que dependem de legendas
        this.updateLegendasSelects(data.legendas);
        this.updateLegendasCounters(data);
        this.showSyncNotification(data.legendas.length);
    }

    updateLegendasSelects(legendas) {
        // Atualizar todos os selects de legendas na página
        const selects = document.querySelectorAll('select[data-legendas], .legendas-select, #legendasSelect');

        selects.forEach(select => {
            if (select && typeof window.updateLegendasSelect === 'function') {
                window.updateLegendasSelect(select, legendas);
            }
        });
    }

    updateLegendasCounters(data) {
        // Atualizar contadores na interface
        const counters = document.querySelectorAll('[data-legenda-count]');
        counters.forEach(counter => {
            counter.textContent = data.total;
        });

        // Atualizar títulos de categorias
        const categories = {};
        data.legendas.forEach(legenda => {
            categories[legenda.categoria] = (categories[legenda.categoria] || 0) + 1;
        });

        Object.keys(categories).forEach(cat => {
            const catElements = document.querySelectorAll(`[data-category="${cat}"]`);
            catElements.forEach(el => {
                if (el.textContent.includes('(')) {
                    el.textContent = el.textContent.replace(/\(\d+\)/, `(${categories[cat]})`);
                }
            });
        });
    }

    showSyncNotification(count) {
        // Notificação removida - apenas log console para debug
        console.log(`🔄 REAL-TIME SYNC: ${count} legendas fresh do PostgreSQL`);
    }

    handleSyncError(error) {
        this.retryCount++;

        if (this.retryCount <= this.maxRetries) {
            console.log(`🔄 RETRY ${this.retryCount}/${this.maxRetries} em 2s`);
            setTimeout(() => this.syncNow(), 2000);
        } else {
            console.log('❌ MAX RETRIES atingido - pausando sync por 30s');
            this.stopSync();
            setTimeout(() => {
                this.retryCount = 0;
                this.startSync();
            }, 30000);
        }
    }

    syncImages(serverImages) {
        // Validação de entrada
        if (!Array.isArray(serverImages)) {
            console.warn('⚠️ syncImages: serverImages não é um array');
            return;
        }

        // Atualizar imagens locais com dados do servidor
        serverImages.forEach(serverImg => {
            // Validar objeto serverImg
            if (!serverImg || typeof serverImg !== 'object') {
                console.warn('⚠️ syncImages: item inválido', serverImg);
                return;
            }

            if (serverImg.temp_id) {
                // Encontrar imagem local por temp_id
                const localImg = this.imagens.find(img => img && img.temp_id === serverImg.temp_id);
                if (localImg) {
                    // Atualizar com id definitivo
                    localImg.id = serverImg.id;
                    localImg.url = serverImg.url;
                    localImg.filename = serverImg.filename;
                    localImg.legenda = serverImg.legenda || localImg.legenda;
                    localImg.local = serverImg.local || localImg.local;
                    localImg.categoria = serverImg.categoria || localImg.categoria;
                    // Remover a imagem da lista de pendentes após atualização bem-sucedida
                    const index = this.imagens.indexOf(localImg);
                    if (index > -1) {
                        this.imagens.splice(index, 1);
                    }
                } else {
                    // Se a imagem local não for encontrada (pode acontecer em cenários de cache ou recarga),
                    // podemos optar por adicioná-la ou simplesmente ignorá-la.
                    // Para este caso, vamos adicionar para garantir que não haja perda de dados.
                    this.imagens.push({
                        id: serverImg.id,
                        temp_id: serverImg.temp_id,
                        url: serverImg.url,
                        filename: serverImg.filename,
                        legenda: serverImg.legenda || '',
                        local: serverImg.local || '',
                        categoria: serverImg.categoria || '',
                        categoria: serverImg.categoria || null // Assumindo que pode vir do servidor
                    });
                    console.log(`➕ IMAGEM ADICIONADA (via sync): ${serverImg.filename} (ID: ${serverImg.id})`);
                }
            } else if (serverImg.id) {
                // Caso a imagem já tenha um ID definitivo (não é uma imagem nova em upload)
                // e precise ser atualizada (ex: URL, filename).
                const existingImg = this.imagens.find(img => img.id === serverImg.id);
                if (existingImg) {
                    existingImg.url = serverImg.url;
                    existingImg.filename = serverImg.filename;
                } else {
                    // Se a imagem com ID definitivo não estiver na lista de pendentes,
                    // podemos adicioná-la para garantir consistência, se apropriado.
                    // Ou, se for uma imagem já existente e sincronizada, este bloco pode não ser necessário.
                    // Para robustez, vamos adicioná-la se não existir.
                    this.imagens.push({
                        id: serverImg.id,
                        url: serverImg.url,
                        filename: serverImg.filename,
                        categoria: serverImg.categoria || null
                    });
                    console.log(`➕ IMAGEM EXISTENTE ADICIONADA (via sync): ${serverImg.filename} (ID: ${serverImg.id})`);
                }
            }
        });

        // Limpar array this.imagens se todas as imagens foram processadas com sucesso
        // e não há mais pendências.
        if (this.imagens.length === 0) {
            console.log('✅ Todas as imagens sincronizadas e processadas.');
        }
    }


    // Método para salvar imagens que estão em this.imagens
    async savePendingImages() {
        if (!this.imagens || this.imagens.length === 0) {
            console.log('📸 Nenhuma imagem pendente para salvar.');
            return;
        }

        console.log(`📸 Salvando ${this.imagens.length} imagens pendentes...`);

        // Tentar salvar as imagens em lotes ou individualmente
        for (const img of this.imagens) {
            try {
                const formData = new FormData();
                formData.append('id', img.id); // Enviar ID definitivo se já existir
                formData.append('temp_id', img.temp_id); // Enviar temp_id se existir
                formData.append('url', img.url);
                formData.append('filename', img.filename);
                formData.append('categoria', img.categoria || '');

                const response = await fetch('/api/save-image', {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} - ${await response.text()}`);
                }

                const result = await response.json();

                if (result.success) {
                    console.log(`✅ Imagem salva: ${result.filename} (ID: ${result.id})`);
                    // Remover da lista de pendentes após salvar com sucesso
                    const index = this.imagens.indexOf(img);
                    if (index > -1) {
                        this.imagens.splice(index, 1);
                    }
                } else {
                    throw new Error(result.message || 'Falha ao salvar imagem no servidor.');
                }

            } catch (error) {
                console.error('❌ ERRO SALVANDO IMAGEM:', error);
                // O erro será tratado pelo handleSaveError, que implementa retentativas
                this.handleSaveError(error);
                // Parar o loop atual para não sobrecarregar com erros consecutivos
                break;
            }
        }
    }

    // Método para tratar erros de salvamento com retentativas
    async handleSaveError(error) {
        // Log detalhado do erro
        console.error('❌ handleSaveError:', {
            message: error.message,
            stack: error.stack,
            retryCount: this.retryCount,
            maxRetries: this.maxRetries
        });

        if (this.retryCount < this.maxRetries) {
            const delay = this.retryDelays[this.retryCount] || 10000; // Usa retriesDelays se definido, senão 10s
            this.retryCount++;

            this.showStatus(`Erro ao salvar. Tentando novamente em ${delay/1000}s... (${this.retryCount}/${this.maxRetries})`, 'warning');

            console.log(`🔄 RETRY ${this.retryCount}/${this.maxRetries} em ${delay/1000}s`);

            // Tenta salvar novamente após o delay
            setTimeout(() => this.savePendingImages(), delay);
        } else {
            console.error('❌ MAX RETRIES ATINGIDO: Falha ao salvar imagens.');
            this.showStatus('Falha crítica ao salvar imagens após múltiplas tentativas.', 'error');
            this.stopSync(); // Pausa a sincronização para evitar mais erros
            // Opcional: notificar o usuário ou tomar outra ação
        }
    }

    // Inicializa os delays de retry (pode ser configurado conforme necessidade)
    retryDelays = [1000, 5000, 10000, 30000]; // Exemplo: 1s, 5s, 10s, 30s

    // Método público para forçar sync
    static forceSyncNow() {
        if (window.realtimeSync) {
            window.realtimeSync.forceSyncNow();
        }
    }

    // Método público para verificar status
    static getStatus() {
        if (window.realtimeSync) {
            return {
                active: window.realtimeSync.isActive,
                lastSync: window.realtimeSync.lastSyncTimestamp,
                cachedCount: window.realtimeSync.cachedData.count || 0
            };
        }
        return null;
    }
}

// Iniciar automaticamente
document.addEventListener('DOMContentLoaded', function() {
    // Aguardar 1 segundo para não interferir no carregamento
    setTimeout(() => {
        window.realtimeSync = new RealTimeSync();

        // Expor funções globais
        window.forceSyncNow = RealTimeSync.forceSyncNow;
        window.getSyncStatus = RealTimeSync.getStatus;

        console.log('🔄 REAL-TIME SYNC: Sistema pronto');
    }, 1000);
});

// CSS para notificações
const syncStyle = document.createElement('style');
syncStyle.textContent = `
    .sync-notification {
        animation: slideIn 0.3s ease-out;
    }

    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 0.9;
        }
    }
`;
document.head.appendChild(syncStyle);