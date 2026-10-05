/**
 * Sistema de Salvamento Automático para Relatórios
 * Implementação conforme especificação técnica profissional
 * 
 * Funcionalidades:
 * - Salvamento automático com debounce de 3 segundos
 * - Carregamento e edição de imagens
 * - Sincronização completa entre frontend e backend
 */

class ReportAutoSave {
    constructor(reportId = null) {
        this.reportId = reportId;
        this.autosaveTimeout = null;
        this.autosaveDelay = 3000; // 3 segundos conforme especificação
        this.isSaving = false;
        this.reportData = {
            id: reportId,
            titulo: '',
            descricao: '',
            categoria: '',
            local: '',
            lembrete_proxima_visita: null,
            observacoes_finais: '',
            conteudo: '',
            checklist_data: null,
            status: 'em_andamento',
            imagens: [],
            atualizado_em: null
        };
        
        this.init();
    }
    
    /**
     * Inicializa o sistema de autosave
     */
    init() {
        console.log('🔄 Sistema de Autosave iniciado');
        
        // Se reportId existe, carregar dados do relatório
        if (this.reportId) {
            this.loadReport();
        }
        
        // Configurar listeners para autosave
        this.setupAutoSaveListeners();
        
        // Configurar gerenciamento de imagens
        this.setupImageManagement();
    }
    
    /**
     * Carrega dados do relatório existente
     */
    async loadReport() {
        try {
            console.log(`📥 Carregando relatório ID: ${this.reportId}`);
            
            // Exibir loader enquanto carrega
            this.showLoadingState();
            
            const response = await fetch(`/api/relatorios/${this.reportId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Erro ao carregar relatório: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.relatorio) {
                this.reportData = {
                    ...this.reportData,
                    ...data.relatorio
                };
                
                // Preencher formulário com dados carregados
                this.populateForm(data.relatorio);
                
                // Selecionar projeto se disponível
                if (data.projeto) {
                    this.selectProjeto(data.projeto);
                }
                
                // Carregar imagens com categoria e local
                if (data.imagens && data.imagens.length > 0) {
                    this.loadImages(data.imagens);
                }
                
                // Preencher checklist
                if (data.checklist && data.checklist.length > 0) {
                    this.preencherChecklist(data.checklist);
                }
                
                // Preencher acompanhantes
                if (data.acompanhantes && data.acompanhantes.length > 0) {
                    this.preencherAcompanhantes(data.acompanhantes);
                }
                
                console.log('✅ Relatório carregado com sucesso');
                this.showStatus('✔️ Tudo carregado', 'success');
                this.hideLoadingState();
            }
            
        } catch (error) {
            console.error('❌ Erro ao carregar relatório:', error);
            this.showStatus('Erro ao carregar relatório', 'error');
            this.hideLoadingState();
        }
    }
    
    /**
     * Preenche o formulário com dados do relatório
     */
    populateForm(data) {
        // Preencher campos de texto
        const fields = ['titulo', 'descricao', 'categoria', 'local', 'observacoes_finais', 'conteudo'];
        
        fields.forEach(field => {
            const element = document.getElementById(field) || document.querySelector(`[name="${field}"]`);
            if (element && data[field]) {
                element.value = data[field];
            }
        });
        
        // Preencher lembrete_proxima_visita (campo de data/hora)
        if (data.lembrete_proxima_visita) {
            const lembreteElement = document.getElementById('lembrete_proxima_visita');
            if (lembreteElement) {
                // Converter ISO string para formato datetime-local
                const date = new Date(data.lembrete_proxima_visita);
                const localDatetime = date.toISOString().slice(0, 16);
                lembreteElement.value = localDatetime;
            }
        }
        
        // Preencher status
        if (data.status) {
            const statusElement = document.getElementById('status');
            if (statusElement) {
                statusElement.value = data.status;
            }
        }
    }
    
    /**
     * Carrega e exibe imagens do relatório
     */
    loadImages(imagens) {
        const container = document.getElementById('imagens-container');
        if (!container) {
            console.warn('Container de imagens não encontrado');
            return;
        }
        
        // Limpar container
        container.innerHTML = '';
        
        // Ordenar imagens por ordem
        const imagensSorted = imagens.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
        
        // Adicionar cada imagem
        imagensSorted.forEach((img, index) => {
            this.addImageToContainer(img, index);
        });
        
        console.log(`✅ ${imagens.length} imagens carregadas`);
    }
    
    /**
     * Adiciona uma imagem ao container
     */
    addImageToContainer(img, index) {
        const container = document.getElementById('imagens-container');
        if (!container) return;
        
        const imageCard = document.createElement('div');
        imageCard.className = 'image-card foto-relatorio';
        imageCard.dataset.imageId = img.id;
        imageCard.dataset.ordem = img.ordem || index;
        imageCard.draggable = true;
        
        imageCard.innerHTML = `
            <div class="image-preview">
                <img src="${img.path || img.url}" alt="${img.caption || img.legenda || 'Foto'}" 
                     class="preview-imagem"
                     onerror="this.src='/static/placeholder-image.png'" />
            </div>
            <div class="image-info foto-info">
                <input type="text" 
                       class="image-legenda foto-legenda" 
                       placeholder="Legenda" 
                       value="${img.caption || img.legenda || ''}"
                       data-image-id="${img.id}" />
                <input type="text" 
                       class="image-categoria foto-categoria" 
                       placeholder="Categoria" 
                       value="${img.category || img.tipo_servico || ''}"
                       data-image-id="${img.id}" />
                <input type="text" 
                       class="image-local foto-local" 
                       placeholder="Local" 
                       value="${img.local || ''}"
                       data-image-id="${img.id}" />
                <div class="image-actions">
                    <button type="button" class="btn-move-up" title="Mover para cima">▲</button>
                    <button type="button" class="btn-move-down" title="Mover para baixo">▼</button>
                    <button type="button" class="btn-delete-image" title="Excluir imagem">🗑️</button>
                </div>
            </div>
        `;
        
        container.appendChild(imageCard);
        
        // Adicionar listeners
        this.setupImageCardListeners(imageCard);
    }
    
    /**
     * Seleciona o projeto no campo de seleção
     */
    selectProjeto(projeto) {
        if (!projeto) return;
        
        const projetoSelect = document.getElementById('projeto_id') || document.querySelector('select[name="projeto_id"]');
        if (projetoSelect) {
            // Verificar se a opção já existe
            let optionExists = false;
            for (let i = 0; i < projetoSelect.options.length; i++) {
                if (projetoSelect.options[i].value == projeto.id) {
                    projetoSelect.selectedIndex = i;
                    optionExists = true;
                    break;
                }
            }
            
            // Se não existe, adicionar a opção
            if (!optionExists) {
                const option = new Option(projeto.nome, projeto.id, true, true);
                projetoSelect.appendChild(option);
            }
            
            console.log(`✅ Projeto selecionado: ${projeto.nome}`);
        }
    }
    
    /**
     * Preenche o checklist com os dados carregados
     */
    preencherChecklist(checklist) {
        const checklistContainer = document.getElementById('checklist') || document.querySelector('.checklist-container');
        if (!checklistContainer) {
            console.warn('Container de checklist não encontrado');
            return;
        }
        
        checklistContainer.innerHTML = '';
        
        if (!Array.isArray(checklist)) {
            console.warn('Checklist não é um array:', checklist);
            return;
        }
        
        checklist.forEach(item => {
            const row = document.createElement('div');
            row.classList.add('checklist-item');
            row.innerHTML = `
                <label>
                    <input type="checkbox" ${item.concluido || item.resposta ? 'checked' : ''}>
                    ${item.pergunta || item.texto || ''}
                </label>
            `;
            checklistContainer.appendChild(row);
        });
        
        console.log(`✅ ${checklist.length} itens de checklist carregados`);
    }
    
    /**
     * Preenche os acompanhantes com os dados carregados
     */
    preencherAcompanhantes(acompanhantes) {
        const container = document.getElementById('acompanhantes') || document.querySelector('.acompanhantes-container');
        if (!container) {
            console.warn('Container de acompanhantes não encontrado');
            return;
        }
        
        container.innerHTML = '';
        
        if (!Array.isArray(acompanhantes)) {
            console.warn('Acompanhantes não é um array:', acompanhantes);
            return;
        }
        
        acompanhantes.forEach(acompanhante => {
            const div = document.createElement('div');
            div.classList.add('acompanhante-item');
            div.textContent = `${acompanhante.nome || acompanhante.name || ''} - ${acompanhante.funcao || acompanhante.role || ''}`;
            container.appendChild(div);
        });
        
        console.log(`✅ ${acompanhantes.length} acompanhantes carregados`);
    }
    
    /**
     * Exibe estado de carregamento
     */
    showLoadingState() {
        const statusElement = document.getElementById('autosave-status') || document.querySelector('.status-message');
        if (statusElement) {
            statusElement.textContent = '🔄 Carregando dados...';
            statusElement.className = 'status-message loading';
        }
    }
    
    /**
     * Oculta estado de carregamento
     */
    hideLoadingState() {
        const statusElement = document.getElementById('autosave-status') || document.querySelector('.status-message');
        if (statusElement) {
            // Manter a mensagem de sucesso visível por alguns segundos
            setTimeout(() => {
                statusElement.textContent = '';
                statusElement.className = 'status-message';
            }, 2000);
        }
    }
    
    /**
     * Configura listeners de autosave
     */
    setupAutoSaveListeners() {
        // Campos de texto
        const textFields = ['titulo', 'descricao', 'categoria', 'local', 'observacoes_finais', 'conteudo'];
        
        textFields.forEach(fieldName => {
            const element = document.getElementById(fieldName) || document.querySelector(`[name="${fieldName}"]`);
            if (element) {
                element.addEventListener('input', (e) => {
                    this.reportData[fieldName] = e.target.value;
                    this.scheduleAutoSave();
                });
            }
        });
        
        // Campo de lembrete
        const lembreteElement = document.getElementById('lembrete_proxima_visita');
        if (lembreteElement) {
            lembreteElement.addEventListener('change', (e) => {
                this.reportData.lembrete_proxima_visita = e.target.value || null;
                this.scheduleAutoSave();
            });
        }
        
        // Status
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.addEventListener('change', (e) => {
                this.reportData.status = e.target.value;
                this.scheduleAutoSave();
            });
        }
        
        console.log('✅ Listeners de autosave configurados');
    }
    
    /**
     * Configura gerenciamento de imagens
     */
    setupImageManagement() {
        // Upload de novas imagens
        const uploadInput = document.getElementById('upload-imagens');
        if (uploadInput) {
            uploadInput.addEventListener('change', (e) => {
                this.handleImageUpload(e.target.files);
            });
        }
        
        // Drag and drop para reordenação
        const container = document.getElementById('imagens-container');
        if (container) {
            let draggedCard = null;
            
            container.addEventListener('dragstart', (e) => {
                if (e.target.classList.contains('image-card')) {
                    draggedCard = e.target;
                    e.target.style.opacity = '0.5';
                }
            });
            
            container.addEventListener('dragend', (e) => {
                if (e.target.classList.contains('image-card')) {
                    e.target.style.opacity = '1';
                    draggedCard = null;
                }
            });
            
            container.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                // Encontrar o card sobre o qual está sendo arrastado
                const afterElement = this.getDragAfterElement(container, e.clientY);
                if (draggedCard && afterElement == null) {
                    container.appendChild(draggedCard);
                } else if (draggedCard && afterElement) {
                    container.insertBefore(draggedCard, afterElement);
                }
            });
            
            container.addEventListener('drop', (e) => {
                e.preventDefault();
                
                // Reordenação foi feita durante dragover
                // Agora salvar a nova ordem
                if (draggedCard) {
                    this.scheduleAutoSave();
                }
            });
        }
    }
    
    /**
     * Configura listeners específicos de cada card de imagem
     */
    setupImageCardListeners(card) {
        // Legenda - autosave ao editar
        const legendaInput = card.querySelector('.image-legenda');
        if (legendaInput) {
            legendaInput.addEventListener('input', () => {
                this.scheduleAutoSave();
            });
        }
        
        // Botão de excluir
        const btnDelete = card.querySelector('.btn-delete-image');
        if (btnDelete) {
            btnDelete.addEventListener('click', () => {
                const imageId = card.dataset.imageId;
                this.deleteImage(imageId, card);
            });
        }
        
        // Botões de mover
        const btnMoveUp = card.querySelector('.btn-move-up');
        const btnMoveDown = card.querySelector('.btn-move-down');
        
        if (btnMoveUp) {
            btnMoveUp.addEventListener('click', () => {
                this.moveImageUp(card);
            });
        }
        
        if (btnMoveDown) {
            btnMoveDown.addEventListener('click', () => {
                this.moveImageDown(card);
            });
        }
    }
    
    /**
     * Agenda salvamento automático com debounce
     */
    scheduleAutoSave() {
        // Limpar timeout anterior
        if (this.autosaveTimeout) {
            clearTimeout(this.autosaveTimeout);
        }
        
        // Mostrar status "Salvando..."
        this.showStatus('Salvando...', 'info');
        
        // Agendar novo salvamento após 3 segundos
        this.autosaveTimeout = setTimeout(() => {
            this.saveReport();
        }, this.autosaveDelay);
    }
    
    /**
     * Salva o relatório
     */
    async saveReport() {
        if (this.isSaving) {
            console.log('⏳ Salvamento já em andamento, aguardando...');
            return;
        }
        
        this.isSaving = true;
        this.showStatus('Salvando...', 'info');
        
        try {
            // Coletar dados atuais do formulário
            const formData = this.collectFormData();
            
            // Coletar informações das imagens
            const imagensInfo = this.collectImagesData();
            
            // Dados completos do relatório
            const reportPayload = {
                ...formData,
                imagens: imagensInfo
            };
            
            let response;
            
            if (this.reportId) {
                // Atualizar relatório existente (PUT)
                response = await fetch(`/api/relatorios/${this.reportId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(reportPayload)
                });
            } else {
                // Criar novo relatório (POST)
                response = await fetch('/api/relatorios', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(reportPayload)
                });
            }
            
            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                // Atualizar reportId se foi criado novo
                if (!this.reportId && data.id) {
                    this.reportId = data.id;
                    this.reportData.id = data.id;
                }
                
                // Atualizar timestamp
                if (data.relatorio && data.relatorio.updated_at) {
                    this.reportData.atualizado_em = data.relatorio.updated_at;
                }
                
                console.log('✅ Relatório salvo com sucesso');
                this.showStatus('Salvo com sucesso', 'success');
            } else {
                throw new Error(data.error || 'Erro desconhecido');
            }
            
        } catch (error) {
            console.error('❌ Erro ao salvar relatório:', error);
            this.showStatus('Erro ao salvar', 'error');
        } finally {
            this.isSaving = false;
        }
    }
    
    /**
     * Coleta dados do formulário
     */
    collectFormData() {
        const data = {};
        
        const fields = ['titulo', 'descricao', 'categoria', 'local', 'observacoes_finais', 'conteudo', 'status'];
        
        fields.forEach(field => {
            const element = document.getElementById(field) || document.querySelector(`[name="${field}"]`);
            if (element) {
                data[field] = element.value || null;
            }
        });
        
        // Lembrete próxima visita
        const lembreteElement = document.getElementById('lembrete_proxima_visita');
        if (lembreteElement && lembreteElement.value) {
            data.lembrete_proxima_visita = lembreteElement.value;
        }
        
        // Projeto ID (se disponível)
        const projetoElement = document.getElementById('projeto_id');
        if (projetoElement) {
            data.projeto_id = projetoElement.value;
        }
        
        return data;
    }
    
    /**
     * Coleta dados das imagens
     */
    collectImagesData() {
        const container = document.getElementById('imagens-container');
        if (!container) return [];
        
        const imageCards = container.querySelectorAll('.image-card');
        const imagens = [];
        
        imageCards.forEach((card, index) => {
            const imageId = card.dataset.imageId;
            const legendaInput = card.querySelector('.image-legenda');
            const categoriaInput = card.querySelector('.image-categoria');
            const localInput = card.querySelector('.image-local');
            
            imagens.push({
                id: imageId ? parseInt(imageId) : null,
                legenda: (legendaInput && legendaInput.value) ? legendaInput.value : 'falta preencher',
                category: (categoriaInput && categoriaInput.value) ? categoriaInput.value : 'falta preencher',
                local: (localInput && localInput.value) ? localInput.value : 'falta preencher',
                ordem: index
            });
        });
        
        return imagens;
    }
    
    /**
     * Exclui uma imagem
     */
    async deleteImage(imageId, card) {
        if (!confirm('Deseja realmente excluir esta imagem?')) {
            return;
        }
        
        try {
            if (imageId && this.reportId) {
                // Excluir no servidor
                const response = await fetch(`/api/relatorios/${this.reportId}/imagens/${imageId}`, {
                    method: 'DELETE'
                });
                
                if (!response.ok) {
                    throw new Error('Erro ao excluir imagem no servidor');
                }
            }
            
            // Remover do DOM
            card.remove();
            
            // Salvar alterações
            this.scheduleAutoSave();
            
            this.showStatus('Imagem removida', 'success');
            
        } catch (error) {
            console.error('❌ Erro ao excluir imagem:', error);
            this.showStatus('Erro ao excluir imagem', 'error');
        }
    }
    
    /**
     * Move imagem para cima
     */
    moveImageUp(card) {
        const previousCard = card.previousElementSibling;
        if (previousCard) {
            card.parentNode.insertBefore(card, previousCard);
            this.scheduleAutoSave();
        }
    }
    
    /**
     * Move imagem para baixo
     */
    moveImageDown(card) {
        const nextCard = card.nextElementSibling;
        if (nextCard) {
            card.parentNode.insertBefore(nextCard, card);
            this.scheduleAutoSave();
        }
    }
    
    /**
     * Processa upload de novas imagens
     */
    async handleImageUpload(files) {
        if (!files || files.length === 0) return;
        
        const formData = new FormData();
        
        // Adicionar arquivos
        Array.from(files).forEach((file, index) => {
            formData.append('novas_imagens', file);
        });
        
        // Adicionar dados do relatório se necessário
        if (this.reportId) {
            formData.append('relatorio_id', this.reportId);
        }
        
        try {
            this.showStatus('Enviando imagens...', 'info');
            
            let url = this.reportId 
                ? `/api/relatorios/${this.reportId}` 
                : '/api/relatorios';
            
            const response = await fetch(url, {
                method: this.reportId ? 'PUT' : 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error('Erro ao enviar imagens');
            }
            
            const data = await response.json();
            
            if (data.success) {
                // Recarregar imagens
                if (data.imagens) {
                    this.loadImages(data.imagens);
                }
                
                this.showStatus('Imagens enviadas com sucesso', 'success');
            }
            
        } catch (error) {
            console.error('❌ Erro ao enviar imagens:', error);
            this.showStatus('Erro ao enviar imagens', 'error');
        }
    }
    
    /**
     * Determina o elemento após o qual inserir durante drag and drop
     */
    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.image-card:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    
    /**
     * Mostra status do salvamento
     */
    showStatus(message, type = 'info') {
        const statusElement = document.getElementById('autosave-status');
        if (!statusElement) {
            console.log(`${type.toUpperCase()}: ${message}`);
            return;
        }
        
        statusElement.textContent = message;
        statusElement.className = `autosave-status ${type}`;
        
        // Remover após 3 segundos (exceto se for "Salvando...")
        if (message !== 'Salvando...') {
            setTimeout(() => {
                statusElement.textContent = '';
                statusElement.className = 'autosave-status';
            }, 3000);
        }
    }
}

// Tornar disponível globalmente
window.ReportAutoSave = ReportAutoSave;

console.log('✅ Sistema de Autosave de Relatórios carregado');
