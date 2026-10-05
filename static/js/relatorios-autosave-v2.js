/**
 * Sistema de AutoSave Completo para Relatórios
 * Implementação conforme especificação técnica profissional
 * 
 * Funcionalidades:
 * - Upload imediato de imagens ao selecionar
 * - Debounce de 800ms + intervalo de 5s
 * - Retry com backoff exponencial
 * - Indicadores visuais de estado
 * - Sincronização temp_id → id definitivo
 * - Fila de salvamentos sem concorrência
 */

class RelatorioAutoSave {
    constructor(config = {}) {
        // Configurações
        this.debounceDelay = config.debounceDelay || 800;  // 800ms para typing
        this.saveInterval = config.saveInterval || 5000;  // 5s intervalo periódico
        this.maxRetries = config.maxRetries || 3;
        this.retryDelays = config.retryDelays || [2000, 5000, 10000];  // Backoff: 2s, 5s, 10s

        // Estado
        this.relatorioId = null;
        this.projetoId = null;
        this.alteracoesPendentes = false;
        this.salvando = false;
        this.pendentePosSave = false;
        this.retryCount = 0;

        // Dados do formulário
        this.formData = {};
        this.imagens = [];  // Array de objetos {temp_id, id, url, legenda, etc}

        // Timers
        this.debounceTimer = null;
        this.intervalTimer = null;

        // Inicializar
        this.init();
    }

    init() {
        console.log('🚀 AutoSave: Inicializando sistema...');

        // Carregar dados do formulário se houver
        this.loadFormData();

        // Configurar listeners de campos
        this.setupFieldListeners();

        // Configurar upload de imagens
        this.setupImageUpload();

        // Iniciar intervalo periódico
        this.startPeriodicSave();

        console.log('✅ AutoSave: Sistema inicializado');
    }

    loadFormData() {
        // Carregar relatorio_id se estiver editando
        const relatorioIdInput = document.getElementById('relatorio_id');
        if (relatorioIdInput && relatorioIdInput.value) {
            this.relatorioId = parseInt(relatorioIdInput.value);
            console.log(`📄 AutoSave: Modo edição - Relatório ID: ${this.relatorioId}`);
        }

        // Carregar projeto_id
        const projetoIdInput = document.getElementById('projeto_id');
        if (projetoIdInput && projetoIdInput.value) {
            this.projetoId = parseInt(projetoIdInput.value);
        }
    }

    setupFieldListeners() {
        // Lista de campos para monitorar
        const fieldIds = [
            'titulo', 'categoria', 'local', 'observacoes_finais',
            'lembrete_proxima_visita', 'conteudo', 'status'
        ];

        fieldIds.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('input', () => this.markChanged());
                field.addEventListener('change', () => this.markChanged());
            }
        });

        console.log('✅ AutoSave: Listeners configurados para campos de texto');
    }

    setupImageUpload() {
        const imageInput = document.getElementById('upload-imagens');
        if (imageInput) {
            imageInput.addEventListener('change', (e) => this.handleImageSelection(e));
            console.log('✅ AutoSave: Listener configurado para upload de imagens');
        }
    }

    async handleImageSelection(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        console.log(`📤 AutoSave: ${files.length} imagem(ns) selecionada(s)`);

        // Upload imediato de cada imagem
        for (let i = 0; i < files.length; i++) {
            await this.uploadImageTemp(files[i]);
        }

        // Limpar input
        event.target.value = '';

        // Marcar como alterado e salvar
        this.markChanged();
        this.debouncedSave();
    }

    async uploadImageTemp(file) {
        try {
            this.showStatus('Enviando imagem...', 'uploading');

            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/uploads/temp', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Erro ao enviar imagem');
            }

            const data = await response.json();

            if (data.success) {
                // Extrair extensão do filename
                const extension = data.filename.split('.').pop();

                // Adicionar imagem à lista com temp_id
                const imageObj = {
                    temp_id: data.temp_id,
                    path: data.path,
                    filename: data.filename,
                    extension: extension,
                    size: data.size,
                    mime_type: data.mime_type,
                    legenda: '',
                    titulo: '',
                    local: '',
                    tipo_servico: '',
                    ordem: this.imagens.length
                };

                this.imagens.push(imageObj);

                // Adicionar preview no DOM
                this.addImagePreview(imageObj);

                console.log(`✅ Upload temp concluído: ${data.temp_id}`);
                this.showStatus('Imagem enviada', 'success');
            }

        } catch (error) {
            console.error('❌ Erro no upload temporário:', error);
            this.showStatus(`Erro: ${error.message}`, 'error');
        }
    }

    addImagePreview(imageObj) {
        const container = document.getElementById('imagens-preview-container');
        if (!container) return;

        const imageCard = document.createElement('div');
        imageCard.className = 'image-preview-card';
        imageCard.dataset.tempId = imageObj.temp_id;

        imageCard.innerHTML = `
            <img src="${imageObj.path}" alt="Preview" class="preview-thumbnail">
            <div class="preview-info">
                <input type="text" 
                       placeholder="Legenda" 
                       class="form-control form-control-sm mb-1" 
                       data-field="legenda"
                       value="${imageObj.legenda || ''}">
                <input type="text" 
                       placeholder="Local" 
                       class="form-control form-control-sm" 
                       data-field="local"
                       value="${imageObj.local || ''}">
            </div>
            <button type="button" class="btn btn-sm btn-danger preview-remove" title="Remover">
                <i class="fas fa-trash"></i>
            </button>
            <div class="preview-status">
                <i class="fas fa-clock text-warning" title="Pendente"></i>
            </div>
        `;

        // Listener para campos
        imageCard.querySelectorAll('input[data-field]').forEach(input => {
            input.addEventListener('input', (e) => {
                const field = e.target.dataset.field;
                imageObj[field] = e.target.value;
                this.markChanged();
            });
        });

        // Listener para remover
        const removeBtn = imageCard.querySelector('.preview-remove');
        removeBtn.addEventListener('click', () => this.removeImage(imageObj));

        container.appendChild(imageCard);
    }

    removeImage(imageObj) {
        // Marcar para deletar no próximo autosave
        if (imageObj.id) {
            imageObj.deletar = true;
        } else {
            // Se ainda não tem id, apenas remover da lista
            const index = this.imagens.indexOf(imageObj);
            if (index > -1) {
                this.imagens.splice(index, 1);
            }
        }

        // Remover do DOM
        const container = document.getElementById('imagens-preview-container');
        if (container) {
            const card = container.querySelector(`[data-temp-id="${imageObj.temp_id}"]`) ||
                        container.querySelector(`[data-image-id="${imageObj.id}"]`);
            if (card) card.remove();
        }

        this.markChanged();
        this.debouncedSave();
    }

    markChanged() {
        this.alteracoesPendentes = true;
        this.debouncedSave();
    }

    debouncedSave() {
        // Limpar timer anterior
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Criar novo timer
        this.debounceTimer = setTimeout(() => {
            this.executeSave();
        }, this.debounceDelay);
    }

    startPeriodicSave() {
        // Salvar periodicamente se houver alterações pendentes
        this.intervalTimer = setInterval(() => {
            if (this.alteracoesPendentes && !this.salvando) {
                console.log('⏰ AutoSave: Salvamento periódico (5s)');
                this.executeSave();
            }
        }, this.saveInterval);
    }

    async executeSave() {
        // Evitar concorrência
        if (this.salvando) {
            this.pendentePosSave = true;
            console.log('⏸️ AutoSave: Já está salvando, agendado para pós-save');
            return;
        }

        if (!this.alteracoesPendentes) {
            return;
        }

        this.salvando = true;
        this.showStatus('Salvando...', 'saving');

        try {
            // Coletar dados do formulário
            const payload = this.collectFormData();

            // Enviar para API
            const response = await fetch('/api/relatorios/autosave', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                // Atualizar relatorio_id se foi criado
                if (!this.relatorioId && data.relatorio_id) {
                    this.relatorioId = data.relatorio_id;
                    const relatorioIdInput = document.getElementById('relatorio_id');
                    if (relatorioIdInput) {
                        relatorioIdInput.value = this.relatorioId;
                    }
                    console.log(`✅ AutoSave: Novo relatório criado com ID ${this.relatorioId}`);
                }

                // Sincronizar imagens: temp_id → id definitivo
                if (data.imagens && data.imagens.length > 0) {
                    this.syncImages(data.imagens);
                }

                // Marcar como salvo
                this.alteracoesPendentes = false;
                this.retryCount = 0;

                const savedTime = new Date().toLocaleTimeString();
                this.showStatus(`Salvo às ${savedTime}`, 'success');

                console.log('✅ AutoSave: Salvamento concluído');
            } else {
                throw new Error(data.error || 'Erro desconhecido');
            }

        } catch (error) {
            console.error('❌ AutoSave: Erro ao salvar:', error);
            await this.handleSaveError(error);
        } finally {
            this.salvando = false;

            // Se houver salvamento pendente, executar
            if (this.pendentePosSave) {
                this.pendentePosSave = false;
                setTimeout(() => this.executeSave(), 100);
            }
        }
    }

    collectFormData() {
        const payload = {
            id: this.relatorioId,
            projeto_id: this.projetoId,
            titulo: this.getFieldValue('titulo') || 'Relatório sem título',
            categoria: this.getFieldValue('categoria') || 'falta preencher',
            local: this.getFieldValue('local') || 'falta preencher',
            observacoes_finais: this.getFieldValue('observacoes_finais'),
            lembrete_proxima_visita: this.getFieldValue('lembrete_proxima_visita'),
            conteudo: this.getFieldValue('conteudo'),
            status: this.getFieldValue('status') || 'em_andamento',
            checklist_data: this.getChecklistData(),
            acompanhantes: this.getAcompanhantes(),
            fotos: this.imagens.map(img => ({
                id: img.id || null,
                temp_id: img.temp_id,
                extension: img.extension,
                url: img.url,
                filename: img.filename,
                legenda: img.legenda || 'falta preencher',
                titulo: img.titulo,
                tipo_servico: img.tipo_servico || 'falta preencher',
                local: img.local || 'falta preencher',
                ordem: img.ordem,
                deletar: img.deletar || false
            }))
        };

        return payload;
    }

    getFieldValue(fieldId) {
        const field = document.getElementById(fieldId);
        return field ? field.value : '';
    }

    getChecklistData() {
        // Implementar conforme estrutura do checklist no projeto
        return {};
    }

    getAcompanhantes() {
        // Implementar conforme estrutura de acompanhantes no projeto
        return [];
    }

    syncImages(serverImages) {
        // Atualizar imagens locais com dados do servidor
        serverImages.forEach(serverImg => {
            if (serverImg.temp_id) {
                // Encontrar imagem local por temp_id
                const localImg = this.imagens.find(img => img.temp_id === serverImg.temp_id);
                if (localImg) {
                    // Atualizar com id definitivo
                    localImg.id = serverImg.id;
                    localImg.url = serverImg.url;
                    localImg.filename = serverImg.filename;

                    // Atualizar status visual no DOM
                    const container = document.getElementById('imagens-preview-container');
                    if (container) {
                        const card = container.querySelector(`[data-temp-id="${serverImg.temp_id}"]`);
                        if (card) {
                            card.dataset.imageId = serverImg.id;
                            const statusIcon = card.querySelector('.preview-status i');
                            if (statusIcon) {
                                statusIcon.className = 'fas fa-check text-success';
                                statusIcon.title = 'Salvo';
                            }
                        }
                    }

                    console.log(`🔄 Sync: temp_id=${serverImg.temp_id} → id=${serverImg.id}`);
                }
            }
        });

        // Remover imagens marcadas para deletar
        this.imagens = this.imagens.filter(img => !img.deletar);
    }

    async handleSaveError(error) {
        if (this.retryCount < this.maxRetries) {
            const delay = this.retryDelays[this.retryCount] || 10000;
            this.retryCount++;

            this.showStatus(`Erro ao salvar. Tentando novamente em ${delay/1000}s... (${this.retryCount}/${this.maxRetries})`, 'warning');

            console.log(`🔄 AutoSave: Retry ${this.retryCount}/${this.maxRetries} em ${delay}ms`);

            setTimeout(() => {
                this.executeSave();
            }, delay);
        } else {
            this.showStatus('Erro ao salvar. Verifique sua conexão.', 'error');
            console.error('❌ AutoSave: Máximo de tentativas atingido');
            this.retryCount = 0;
        }
    }

    showStatus(message, type) {
        // Criar ou atualizar elemento de status
        let statusEl = document.getElementById('autosave-status');
        if (!statusEl) {
            statusEl = document.createElement('div');
            statusEl.id = 'autosave-status';
            statusEl.className = 'autosave-status';
            document.body.appendChild(statusEl);
        }

        // Definir classes de tipo
        statusEl.className = 'autosave-status';
        if (type) {
            statusEl.classList.add(`status-${type}`);
        }

        // Definir ícone
        let icon = '';
        switch(type) {
            case 'saving':
            case 'uploading':
                icon = '<i class="fas fa-spinner fa-spin"></i>';
                break;
            case 'success':
                icon = '<i class="fas fa-check-circle"></i>';
                break;
            case 'error':
                icon = '<i class="fas fa-exclamation-circle"></i>';
                break;
            case 'warning':
                icon = '<i class="fas fa-exclamation-triangle"></i>';
                break;
        }

        statusEl.innerHTML = `${icon} ${message}`;
        statusEl.style.display = 'block';

        // Auto-hide para mensagens de sucesso
        if (type === 'success') {
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 3000);
        }
    }

    destroy() {
        // Limpar timers
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        if (this.intervalTimer) clearInterval(this.intervalTimer);

        console.log('🛑 AutoSave: Sistema destruído');
    }
}

// Exportar para uso global
window.RelatorioAutoSave = RelatorioAutoSave;

// Auto-inicializar se estiver em página de relatório
document.addEventListener('DOMContentLoaded', () => {
    const formRelatorio = document.getElementById('form-relatorio');
    if (formRelatorio) {
        console.log('📝 Inicializando AutoSave para formulário de relatório...');
        window.autoSaveInstance = new RelatorioAutoSave();
    }
});