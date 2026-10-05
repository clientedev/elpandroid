// Auto Save para Relatórios - Sistema ELP
// Implementa salvamento automático de dados do formulário

class AutoSave {
    constructor(reportId, options = {}) {
        this.reportId = reportId;
        this.interval = options.interval || 10000; // 10 segundos por padrão
        this.statusElement = options.statusElement || document.getElementById('autosave-status');
        this.form = options.form || document.getElementById('reportForm');
        this.isActive = false;
        this.timer = null;
        this.lastSave = null;
        
        this.init();
    }
    
    init() {
        if (!this.reportId || !this.form) {
            console.warn('AutoSave: Report ID ou form não encontrado');
            return;
        }
        
        // Adicionar listeners para mudanças no formulário
        this.addFormListeners();
        
        // Iniciar auto save periódico
        this.start();
        
        // Salvar quando o usuário sair da página
        window.addEventListener('beforeunload', () => {
            this.saveNow();
        });
        
        console.log('AutoSave inicializado para relatório', this.reportId);
    }
    
    addFormListeners() {
        // Campos que devem disparar auto save
        const fields = this.form.querySelectorAll('input, textarea, select');
        
        fields.forEach(field => {
            // Ignorar campos de arquivo e botões
            if (field.type === 'file' || field.type === 'button' || field.type === 'submit') {
                return;
            }
            
            field.addEventListener('input', () => {
                this.onFieldChange();
            });
            
            field.addEventListener('change', () => {
                this.onFieldChange();
            });
        });
    }
    
    onFieldChange() {
        // Marcar que há mudanças pendentes
        this.showStatus('Alterações pendentes...', 'warning');
    }
    
    start() {
        if (this.isActive) return;
        
        this.isActive = true;
        this.timer = setInterval(() => {
            this.saveNow();
        }, this.interval);
        
        console.log('AutoSave ativo a cada', this.interval / 1000, 'segundos');
    }
    
    stop() {
        if (!this.isActive) return;
        
        this.isActive = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        
        console.log('AutoSave parado');
    }
    
    async saveNow() {
        try {
            this.showStatus('Salvando...', 'info');
            
            const formData = this.getFormData();
            
            // Só salvar se houver dados
            if (Object.keys(formData).length === 0) {
                this.showStatus('Nenhum dado para salvar', 'muted');
                return;
            }
            
            const response = await fetch(`/reports/autosave/${this.reportId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': document.querySelector('input[name="csrf_token"]').value
                },
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.lastSave = new Date();
                this.showStatus('Salvo automaticamente', 'success');
                console.log('AutoSave: Dados salvos com sucesso');
            } else {
                this.showStatus('Erro ao salvar: ' + result.error, 'error');
                console.error('AutoSave: Erro', result.error);
            }
            
        } catch (error) {
            this.showStatus('Erro de conexão', 'error');
            console.error('AutoSave: Erro de conexão', error);
        }
    }
    
    getFormData() {
        const data = {};
        
        // Campos básicos do relatório
        const titulo = this.form.querySelector('input[name="titulo"]');
        if (titulo && titulo.value.trim()) {
            data.titulo = titulo.value;
        }
        
        const conteudo = this.form.querySelector('textarea[name="conteudo"]');
        if (conteudo && conteudo.value.trim()) {
            data.conteudo = conteudo.value;
        }
        
        // Coordenadas GPS
        const latitude = this.form.querySelector('input[name="latitude"]');
        if (latitude && latitude.value) {
            data.latitude = latitude.value;
        }
        
        const longitude = this.form.querySelector('input[name="longitude"]');
        if (longitude && longitude.value) {
            data.longitude = longitude.value;
        }
        
        // Dados do checklist
        const checklistData = this.getChecklistData();
        if (checklistData) {
            data.checklist_data = JSON.stringify(checklistData);
        }
        
        return data;
    }
    
    getChecklistData() {
        const checklist = {};
        
        // Checkboxes de checklist
        const checkboxes = this.form.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            if (checkbox.id) {
                checklist[checkbox.id] = checkbox.checked;
            }
        });
        
        // Observações do checklist
        const textareas = this.form.querySelectorAll('textarea[name^="obs_"]');
        textareas.forEach(textarea => {
            if (textarea.value.trim()) {
                checklist[textarea.name] = textarea.value;
            }
        });
        
        return Object.keys(checklist).length > 0 ? checklist : null;
    }
    
    showStatus(message, type = 'info') {
        // DESABILITAR MENSAGENS DE DEBUG - Sistema silencioso conforme solicitado
        return;
        
        if (!this.statusElement) return;
        
        const icons = {
            info: 'fas fa-sync-alt fa-spin',
            success: 'fas fa-check',
            warning: 'fas fa-exclamation-triangle',
            error: 'fas fa-exclamation-circle',
            muted: 'fas fa-info-circle'
        };
        
        const colors = {
            info: 'text-primary',
            success: 'text-success',
            warning: 'text-warning',
            error: 'text-danger',
            muted: 'text-muted'
        };
        
        this.statusElement.innerHTML = `
            <small class="${colors[type]}">
                <i class="${icons[type]} me-1"></i>
                ${message}
            </small>
        `;
        
        // Auto-limpar status de sucesso após 3 segundos
        if (type === 'success') {
            setTimeout(() => {
                if (this.statusElement) {
                    this.statusElement.innerHTML = '';
                }
            }, 3000);
        }
    }
    
    getLastSaveTime() {
        return this.lastSave;
    }
    
    destroy() {
        this.stop();
        window.removeEventListener('beforeunload', this.saveNow);
        console.log('AutoSave destruído');
    }
}

// Função global para inicializar auto save
function initAutoSave(reportId, options = {}) {
    if (window.autoSaveInstance) {
        window.autoSaveInstance.destroy();
    }
    
    window.autoSaveInstance = new AutoSave(reportId, options);
    return window.autoSaveInstance;
}

// Export para uso como módulo
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AutoSave;
}