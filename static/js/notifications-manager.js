class NotificationsManager {
    constructor() {
        this.notificacoes = [];
        this.drawer = null;
        this.badge = null;
        this.badgeMobile = null;
        this.bell = null;
        this.bellMobile = null;
        this.notificationsList = null;
        this.unreadCountSpan = null;
        this.markAllReadBtn = null;
        this.clearNotificationsBtn = null;
        this.refreshInterval = null;
        this.offcanvasInstance = null;
        
        this.init();
    }
    
    init() {
        document.addEventListener('DOMContentLoaded', () => {
            this.drawer = document.getElementById('notificationsDrawer');
            this.badge = document.getElementById('notificationBadge');
            this.badgeMobile = document.getElementById('notificationBadgeMobile');
            this.bell = document.getElementById('notificationBell');
            this.bellMobile = document.getElementById('notificationBellMobile');
            this.notificationsList = document.getElementById('notificationsList');
            this.unreadCountSpan = document.getElementById('unreadCount');
            this.markAllReadBtn = document.getElementById('markAllReadBtn');
            this.clearNotificationsBtn = document.getElementById('clearNotificationsBtn');
            
            // Desktop bell
            if (this.bell) {
                this.bell.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.openDrawer();
                });
            }
            
            // Mobile bell
            if (this.bellMobile) {
                this.bellMobile.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.openDrawer();
                });
            }
            
            // Se nenhum bell existir, o usuário não está logado
            if (!this.bell && !this.bellMobile) {
                console.debug('ℹ️ Sistema de notificações: aguardando login do usuário');
                return;
            }
            
            if (this.markAllReadBtn) {
                this.markAllReadBtn.addEventListener('click', () => {
                    this.markAllAsRead();
                });
            }
            
            if (this.clearNotificationsBtn) {
                this.clearNotificationsBtn.addEventListener('click', () => {
                    if (confirm('Tem certeza que deseja limpar todas as notificações? Esta ação não pode ser desfeita.')) {
                        this.clearAllNotifications();
                    }
                });
            }
            
            this.carregarNotificacoes();
            
            this.refreshInterval = setInterval(() => {
                this.carregarNotificacoes(true);
            }, 30000);
            
            console.log('✅ Notifications Manager inicializado');
        });
    }
    
    async carregarNotificacoes(silent = false) {
        // Se estiver offline, não tenta buscar notificações para não poluir o console com erros
        if (!navigator.onLine) {
            console.debug('📡 [Offline] Verificação de notificações ignorada');
            return;
        }

        try {
            const response = await fetch('/api/notificacoes', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.notificacoes = data.notificacoes;
                this.atualizarContador(data.nao_lidas);
                
                if (!silent) {
                    this.renderizarNotificacoes();
                }
                
                console.log(`✅ ${data.total} notificações carregadas (${data.nao_lidas} não lidas)`);
            } else {
                // Se falhar, zerar o contador
                this.atualizarContador(0);
            }
        } catch (error) {
            console.error('❌ Erro ao carregar notificações:', error);
            // Em caso de erro, zerar o contador
            this.atualizarContador(0);
        }
    }
    
    atualizarContador(count) {
        const displayCount = count > 99 ? '99+' : count;
        
        // Atualizar badge desktop
        if (this.badge) {
            if (count > 0) {
                this.badge.textContent = displayCount;
                this.badge.style.display = 'inline-block';
            } else {
                this.badge.style.display = 'none';
            }
        }
        
        // Atualizar badge mobile
        if (this.badgeMobile) {
            if (count > 0) {
                this.badgeMobile.textContent = displayCount;
                this.badgeMobile.style.display = 'inline-block';
            } else {
                this.badgeMobile.style.display = 'none';
            }
        }
        
        if (this.unreadCountSpan) {
            this.unreadCountSpan.textContent = count;
        }
    }
    
    renderizarNotificacoes() {
        if (!this.notificationsList) return;
        
        if (this.notificacoes.length === 0) {
            this.notificationsList.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <i class="fas fa-bell-slash fa-3x mb-3 d-block"></i>
                    <p>Nenhuma notificação</p>
                </div>
            `;
            return;
        }
        
        this.notificationsList.innerHTML = '';
        
        this.notificacoes.forEach(notif => {
            const item = this.criarItemNotificacao(notif);
            this.notificationsList.appendChild(item);
        });
    }
    
    criarItemNotificacao(notif) {
        const div = document.createElement('div');
        div.className = `list-group-item list-group-item-action ${notif.status === 'nao_lida' ? 'bg-light' : ''}`;
        div.style.cursor = 'pointer';
        div.dataset.notifId = notif.id;
        
        const timeAgo = this.formatarTempo(notif.created_at);
        
        div.innerHTML = `
            <div class="d-flex w-100 justify-content-between align-items-start">
                <div class="flex-grow-1">
                    <div class="d-flex align-items-center mb-1">
                        <span class="me-2" style="font-size: 1.2rem;">${notif.icone}</span>
                        <strong>${notif.titulo}</strong>
                        ${notif.status === 'nao_lida' ? '<span class="badge bg-primary ms-2" style="font-size: 0.65rem;">Nova</span>' : ''}
                    </div>
                    <p class="mb-1 small text-muted">${notif.mensagem}</p>
                    <small class="text-muted">
                        <i class="far fa-clock me-1"></i>${timeAgo}
                    </small>
                </div>
            </div>
        `;
        
        div.addEventListener('click', () => {
            this.marcarComoLida(notif.id);
            
            if (notif.link_destino) {
                window.location.href = notif.link_destino;
            }
        });
        
        return div;
    }
    
    formatarTempo(isoString) {
        const data = new Date(isoString);
        const agora = new Date();
        const diff = Math.floor((agora - data) / 1000);
        
        if (diff < 60) return 'Agora mesmo';
        if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} h atrás`;
        if (diff < 604800) return `${Math.floor(diff / 86400)} dias atrás`;
        
        return data.toLocaleDateString('pt-BR', { 
            day: '2-digit', 
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    async marcarComoLida(notifId) {
        try {
            const response = await fetch('/api/notificacoes/marcar-lida', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken()
                },
                body: JSON.stringify({ notificacao_id: notifId })
            });
            
            if (response.ok) {
                await this.carregarNotificacoes();
            }
        } catch (error) {
            console.error('❌ Erro ao marcar notificação como lida:', error);
        }
    }
    
    async markAllAsRead() {
        try {
            const response = await fetch('/api/notificacoes/marcar-todas-lidas', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken()
                }
            });
            
            if (response.ok) {
                await this.carregarNotificacoes();
                console.log('✅ Todas as notificações marcadas como lidas');
            }
        } catch (error) {
            console.error('❌ Erro ao marcar todas como lidas:', error);
        }
    }
    
    async clearAllNotifications() {
        try {
            const response = await fetch('/api/notificacoes/limpar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken()
                }
            });
            
            if (response.ok) {
                this.notificacoes = [];
                this.renderizarNotificacoes();
                this.atualizarContador(0);
                console.log('✅ Todas as notificações foram apagadas');
            }
        } catch (error) {
            console.error('❌ Erro ao limpar notificações:', error);
        }
    }
    
    openDrawer() {
        if (this.drawer) {
            if (!this.offcanvasInstance) {
                this.offcanvasInstance = new bootstrap.Offcanvas(this.drawer);
                
                this.drawer.addEventListener('hidden.bs.offcanvas', () => {
                    this.removeBackdrop();
                });
            }
            this.offcanvasInstance.show();
            this.carregarNotificacoes();
        }
    }
    
    removeBackdrop() {
        const backdrops = document.querySelectorAll('.offcanvas-backdrop');
        backdrops.forEach(backdrop => {
            backdrop.remove();
        });
        document.body.classList.remove('overflow-hidden');
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('padding-right');
    }
    
    getCsrfToken() {
        const metaTag = document.querySelector('meta[name="csrf-token"]');
        return metaTag ? metaTag.getAttribute('content') : '';
    }
}

const notificationsManager = new NotificationsManager();
