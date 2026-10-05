/**
 * Editor de Fotos Modal - Integrado com Fabric.js
 * Versão otimizada para relatórios express
 * ==============================================
 */

class FabricPhotoEditorModal {
    constructor(modalId, canvasId) {
        this.modalId = modalId;
        this.canvasId = canvasId;
        this.canvas = null;
        this.photoEditor = null;
        this.currentPhotoData = null;
        this.currentPhotoId = null;
        this.onSaveCallback = null;
        
        console.log('🎨 Fabric Photo Editor Modal inicializado');
    }
    
    async openEditor(photoData, photoId, saveCallback) {
        console.log('📷 Abrindo editor para foto:', photoId);
        
        this.currentPhotoData = photoData;
        this.currentPhotoId = photoId;
        this.onSaveCallback = saveCallback;
        
        // Abrir modal
        const modal = document.getElementById(this.modalId);
        if (modal) {
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();
            
            // Aguardar modal estar totalmente visível
            modal.addEventListener('shown.bs.modal', () => {
                this.initEditor();
            }, { once: true });
        }
    }
    
    async initEditor() {
        try {
            console.log('🚀 Inicializando Fabric.js no modal');
            
            // Limpar editor anterior se existir
            if (this.photoEditor) {
                this.photoEditor.destroy();
                this.photoEditor = null;
            }
            
            // Criar novo editor
            this.photoEditor = new FabricPhotoEditor(this.canvasId, this.currentPhotoData);
            
            // Configurar eventos do modal
            this.setupModalEvents();
            
            // Configurar melhorias específicas para contexto modal
            this.setupModalTextSupport();
            
            console.log('✅ Editor modal inicializado');
            
            // Auto-scroll para o centro da imagem após inicializar
            setTimeout(() => {
                this.scrollToImageCenter();
            }, 200);
            
        } catch (error) {
            console.error('❌ Erro ao inicializar editor modal:', error);
        }
    }
    
    // Função para fazer auto-scroll para o centro da imagem - Melhorada para mobile
    scrollToImageCenter() {
        const modal = document.getElementById(this.modalId);
        const canvasContainer = modal?.querySelector('.canvas-container');
        const isMobile = window.innerWidth <= 768;
        
        if (canvasContainer) {
            // Para mobile, usar scroll suave com fallback
            if (isMobile) {
                // Scroll manual para mobile com melhor suporte
                const containerRect = canvasContainer.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                const scrollTop = window.pageYOffset + containerRect.top - (viewportHeight / 2) + (containerRect.height / 2);
                
                window.scrollTo({
                    top: Math.max(0, scrollTop),
                    behavior: 'smooth'
                });
            } else {
                // Desktop - usar scrollIntoView
                canvasContainer.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center',
                    inline: 'center'
                });
            }
            
            console.log('🎨 Auto-scroll para centro da imagem executado');
        }
    }
    
    setupModalEvents() {
        const modal = document.getElementById(this.modalId);
        if (!modal) return;
        
        // Botão salvar
        const saveBtn = modal.querySelector('#modal-save-btn');
        if (saveBtn) {
            saveBtn.onclick = () => this.saveAndClose();
        }
        
        // Botão cancelar
        const cancelBtn = modal.querySelector('#modal-cancel-btn');
        if (cancelBtn) {
            cancelBtn.onclick = () => this.closeEditor();
        }
        
        // Configurar eventos de botões de ferramentas no modal
        const toolButtons = modal.querySelectorAll('[data-modal-tool]');
        toolButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const tool = btn.dataset.modalTool;
                this.setTool(tool);
                
                // Atualizar visual dos botões
                toolButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                console.log(`🔧 Ferramenta modal ativada: ${tool}`);
            });
        });
        
        // Limpar ao fechar modal
        modal.addEventListener('hidden.bs.modal', () => {
            this.cleanup();
        });
    }
    
    setupModalTextSupport() {
        // Configurações específicas para suporte de texto em modais
        const modal = document.getElementById(this.modalId);
        if (!modal || !this.photoEditor) return;
        
        // Garantir que o modal permite focus em elementos internos
        modal.setAttribute('tabindex', '-1');
        modal.style.outline = 'none';
        
        // Configurar o canvas para permitir focus em contexto modal
        const canvas = this.photoEditor.canvas;
        if (canvas && canvas.upperCanvasEl) {
            // Garantir que o canvas pode receber focus dentro do modal
            canvas.upperCanvasEl.setAttribute('tabindex', '0');
            canvas.upperCanvasEl.style.outline = 'none';
            
            // Configurar eventos específicos para texto em modal
            this.setupModalTextEvents(canvas);
        }
        
        console.log('🔤 Suporte a texto configurado para modal');
    }
    
    setupModalTextEvents(canvas) {
        // Override da função activateTextEditing para contexto modal
        if (this.photoEditor && this.photoEditor.activateTextEditing) {
            const originalActivateTextEditing = this.photoEditor.activateTextEditing.bind(this.photoEditor);
            
            this.photoEditor.activateTextEditing = (textObject) => {
                console.log('🔤📱 Ativando edição de texto no MODAL');
                
                // Garantir que o texto está selecionado
                canvas.setActiveObject(textObject);
                canvas.renderAll();
                
                // Aguardar o próximo frame para garantir que a seleção foi aplicada
                requestAnimationFrame(() => {
                    // Entrar em modo de edição
                    textObject.enterEditing();
                    
                    // Se texto está vazio, não selecionar tudo
                    if (!textObject.text || textObject.text.trim() === '') {
                        // Focar no campo de texto
                        if (textObject.hiddenTextarea) {
                            this.configureModalTextarea(textObject.hiddenTextarea);
                        }
                    } else {
                        // Selecionar todo o texto existente
                        textObject.selectAll();
                        if (textObject.hiddenTextarea) {
                            this.configureModalTextarea(textObject.hiddenTextarea);
                        }
                    }
                    
                    console.log('✅ Edição de texto ativada no MODAL com teclado mobile');
                });
            };
        }
    }
    
    configureModalTextarea(textarea) {
        if (!textarea) return;
        
        const modal = document.getElementById(this.modalId);
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Configurar textarea para funcionar dentro do modal
        textarea.style.position = 'fixed';
        textarea.style.left = '50%';
        textarea.style.top = '50%';
        textarea.style.transform = 'translate(-50%, -50%)';
        textarea.style.zIndex = '9999'; // Acima do modal
        textarea.style.opacity = '0.01'; // Quase invisível mas funcional
        textarea.style.pointerEvents = 'auto';
        textarea.style.fontSize = '16px'; // Impede zoom no iOS
        textarea.style.border = 'none';
        textarea.style.background = 'transparent';
        textarea.style.resize = 'none';
        textarea.style.outline = 'none';
        
        // Garantir que o textarea está dentro do contexto do modal
        if (modal) {
            // Mover o textarea para dentro do modal se não estiver
            if (!modal.contains(textarea)) {
                modal.appendChild(textarea);
            }
        }
        
        // Focar com delay para garantir funcionamento
        setTimeout(() => {
            textarea.focus();
            
            // Para mobile: forçar abertura do teclado com técnicas específicas
            if (isMobile) {
                // Trigger eventos específicos para mobile
                textarea.click();
                
                // Técnicas específicas para iOS
                if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
                    const touchEvent = new TouchEvent('touchstart', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    textarea.dispatchEvent(touchEvent);
                    
                    // Força o input visible
                    textarea.style.transform = 'translate(-50%, -50%) scale(1)';
                    textarea.setAttribute('readonly', false);
                    textarea.removeAttribute('readonly');
                }
                
                // Para Android
                if (/Android/i.test(navigator.userAgent)) {
                    textarea.style.fontSize = '16px'; // Evita zoom
                    textarea.focus();
                    textarea.setSelectionRange(0, textarea.value.length);
                }
            }
            
            console.log('⌨️ Textarea configurado para modal mobile');
        }, 150);
    }
    
    async saveAndClose() {
        if (!this.photoEditor) return;
        
        try {
            console.log('💾 Salvando foto editada...');
            
            // Obter dados da imagem editada
            const imageData = this.photoEditor.getCanvasImage('image/jpeg', 0.9);
            const legend = document.getElementById('modal-custom-legend')?.value || '';
            
            // Chamar callback de salvamento
            if (this.onSaveCallback) {
                await this.onSaveCallback({
                    photoId: this.currentPhotoId,
                    imageData: imageData,
                    legend: legend
                });
            }
            
            this.closeEditor();
            
        } catch (error) {
            console.error('❌ Erro ao salvar foto:', error);
            alert('Erro ao salvar foto. Tente novamente.');
        }
    }
    
    closeEditor() {
        const modal = document.getElementById(this.modalId);
        if (modal) {
            const bsModal = bootstrap.Modal.getInstance(modal);
            if (bsModal) {
                bsModal.hide();
            }
        }
    }
    
    cleanup() {
        if (this.photoEditor) {
            this.photoEditor.destroy();
            this.photoEditor = null;
        }
        
        this.currentPhotoData = null;
        this.currentPhotoId = null;
        this.onSaveCallback = null;
        
        console.log('🧹 Editor modal limpo');
    }
    
    // Métodos para controlar o editor
    setTool(tool) {
        if (this.photoEditor) {
            this.photoEditor.setTool(tool);
        }
    }
    
    setColor(color) {
        if (this.photoEditor) {
            this.photoEditor.setColor(color);
        }
    }
    
    setStrokeWidth(width) {
        if (this.photoEditor) {
            this.photoEditor.setStrokeWidth(width);
        }
    }
    
    undo() {
        if (this.photoEditor) {
            this.photoEditor.undo();
        }
    }
    
    redo() {
        if (this.photoEditor) {
            this.photoEditor.redo();
        }
    }
    
    clear() {
        if (this.photoEditor) {
            this.photoEditor.clear();
        }
    }
}

// Instância global do editor modal
window.fabricPhotoEditorModal = null;

// Função para inicializar o editor modal
function initFabricPhotoEditorModal() {
    if (!window.fabricPhotoEditorModal) {
        window.fabricPhotoEditorModal = new FabricPhotoEditorModal('fabricPhotoEditorModal', 'fabricModalCanvas');
        console.log('📱 Editor modal pronto para uso');
    }
}

// Função para abrir editor de uma foto
async function openPhotoEditorFromElement(photoElement) {
    try {
        const photoSrc = photoElement.src;
        const photoId = photoElement.dataset.photoId || Date.now();
        
        if (!window.fabricPhotoEditorModal) {
            initFabricPhotoEditorModal();
        }
        
        // Callback para salvar a foto editada
        const saveCallback = async (data) => {
            console.log('💾 Salvando foto via callback:', data.photoId);
            
            // Atualizar preview da foto
            if (photoElement) {
                photoElement.src = data.imageData;
                photoElement.dataset.edited = 'true';
                photoElement.dataset.legend = data.legend;
            }
            
            // Marcar como editada visualmente
            const photoContainer = photoElement.closest('.photo-container');
            if (photoContainer) {
                photoContainer.classList.add('edited');
                
                // Adicionar badge de editado
                if (!photoContainer.querySelector('.edited-badge')) {
                    const badge = document.createElement('div');
                    badge.className = 'edited-badge';
                    badge.innerHTML = '<i class="fas fa-edit"></i> Editado';
                    photoContainer.appendChild(badge);
                }
            }
            
            console.log('✅ Foto salva com sucesso');
        };
        
        await window.fabricPhotoEditorModal.openEditor(photoSrc, photoId, saveCallback);
        
    } catch (error) {
        console.error('❌ Erro ao abrir editor:', error);
        alert('Erro ao abrir editor de fotos. Tente novamente.');
    }
}

// Event listeners globais para editor
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎯 Configurando listeners do editor modal');
    
    // MOBILE: Função unificada para seleção de ferramentas - CORREÇÃO DEFINITIVA
    function selectTool(tool, buttonElement) {
        // Feedback visual imediato
        buttonElement.style.transform = 'scale(0.95)';
        setTimeout(() => {
            buttonElement.style.transform = '';
        }, 100);
        
        if (window.fabricPhotoEditorModal) {
            window.fabricPhotoEditorModal.setTool(tool);
            
            // Atualizar estado visual dos botões
            document.querySelectorAll('[data-modal-tool]').forEach(btn => {
                btn.classList.remove('active');
            });
            buttonElement.classList.add('active');
            
            console.log('🔧 Ferramenta modal selecionada:', tool);
        }
    }
    
    // MOBILE: Touch event handler - prioridade para mobile
    let touchHandled = false;
    
    document.addEventListener('touchstart', function(e) {
        const toolButton = e.target.closest('[data-modal-tool]');
        if (toolButton) {
            e.preventDefault();
            e.stopPropagation();
            
            // Feedback táctil imediato
            toolButton.classList.add('touching');
            
            touchHandled = true;
            const tool = toolButton.dataset.modalTool;
            selectTool(tool, toolButton);
            
            // Reset flag após um tempo
            setTimeout(() => { touchHandled = false; }, 300);
        }
    }, { passive: false });
    
    // Remover classe touching ao finalizar toque
    document.addEventListener('touchend', function(e) {
        const toolButton = e.target.closest('[data-modal-tool]');
        if (toolButton) {
            setTimeout(() => {
                toolButton.classList.remove('touching');
            }, 150);
        }
    });
    
    // DESKTOP: Click event handler - fallback para desktop
    document.addEventListener('click', function(e) {
        const toolButton = e.target.closest('[data-modal-tool]');
        if (toolButton && !touchHandled) {
            e.preventDefault();
            e.stopPropagation();
            
            const tool = toolButton.dataset.modalTool;
            selectTool(tool, toolButton);
        }
    });
    
    // Click listener para outros elementos
    document.addEventListener('click', function(e) {
        // Botão de editar foto
        if (e.target.matches('.edit-photo-btn') || e.target.closest('.edit-photo-btn')) {
            const btn = e.target.matches('.edit-photo-btn') ? e.target : e.target.closest('.edit-photo-btn');
            const photoElement = btn.closest('.photo-container')?.querySelector('img');
            
            if (photoElement) {
                openPhotoEditor(photoElement);
            }
        }
    });
    
    // Listener para mudanças de cor
    document.addEventListener('change', function(e) {
        if (e.target.matches('#modal-color-picker')) {
            const color = e.target.value;
            if (window.fabricPhotoEditorModal) {
                window.fabricPhotoEditorModal.setColor(color);
            }
        }
        
        if (e.target.matches('#modal-stroke-width')) {
            const width = parseInt(e.target.value);
            if (window.fabricPhotoEditorModal) {
                window.fabricPhotoEditorModal.setStrokeWidth(width);
            }
        }
    });
});

console.log('📱 Fabric Photo Editor Modal v2.0 - Sistema carregado');