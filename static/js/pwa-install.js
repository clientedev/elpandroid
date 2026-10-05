// PWA Installation Manager
class PWAInstaller {
    constructor() {
        this.deferredPrompt = null;
        this.isInstalled = false;
        this.init();
    }

    init() {
        // Verificar se já está instalado
        this.checkIfInstalled();
        
        // Escutar evento de instalação
        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('✅ PWA: Install prompt disponível');
            
            // Verificar se devemos interceptar o prompt
            if (this.shouldShowInstallPrompt()) {
                console.log('🎯 PWA: Interceptando prompt para exibição customizada');
                e.preventDefault();
                this.deferredPrompt = e;
                this.showInstallButton();
            } else {
                console.log('ℹ️ PWA: Permitindo prompt nativo do navegador');
                // Não chamar preventDefault - deixar o navegador mostrar o banner nativo
                this.deferredPrompt = e;
            }
        });

        // Escutar quando é instalado
        window.addEventListener('appinstalled', (e) => {
            console.log('PWA: App instalado com sucesso');
            this.isInstalled = true;
            this.hideInstallButton();
            this.showInstalledMessage();
        });

        // Verificar se está rodando como PWA
        if (window.matchMedia('(display-mode: standalone)').matches || 
            window.navigator.standalone === true) {
            this.isInstalled = true;
            console.log('PWA: Rodando como app instalado');
        }
    }

    checkIfInstalled() {
        // Verificar se está rodando em modo standalone
        if (window.matchMedia('(display-mode: standalone)').matches) {
            this.isInstalled = true;
            return true;
        }
        
        // Verificar no iOS
        if (window.navigator.standalone === true) {
            this.isInstalled = true;
            return true;
        }
        
        return false;
    }

    showInstallButton() {
        if (this.isInstalled) return;
        
        // Verificar se estamos nas páginas onde o popup deve aparecer
        if (!this.shouldShowInstallPrompt()) {
            console.log('PWA: Não mostrando popup - página não permitida');
            return;
        }

        // Remover botão anterior se existir
        const existingButton = document.getElementById('pwa-install-button');
        if (existingButton) existingButton.remove();

        // Detectar sistema operacional
        const platform = this.detectPlatform();
        const installContent = this.getInstallContent(platform);
        
        // Criar botão de instalação
        const installButton = document.createElement('div');
        installButton.id = 'pwa-install-button';
        installButton.className = 'pwa-install-prompt';
        installButton.innerHTML = `
            <div class="card border-primary" style="position: fixed; bottom: 20px; left: 20px; z-index: 9999; max-width: 380px;">
                <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                    <div>
                        ${installContent.icon}
                        <strong>Instalar App - ${installContent.platformName}</strong>
                    </div>
                    <button type="button" class="btn-close btn-close-white" onclick="this.closest('.pwa-install-prompt').remove()"></button>
                </div>
                <div class="card-body">
                    <p class="mb-3">
                        <i class="fas fa-download text-primary me-2"></i>
                        Instale o app ELP Relatórios no seu ${installContent.deviceName} para acesso rápido e funcionalidades offline!
                    </p>
                    <div class="d-grid gap-2">
                        ${installContent.buttons}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(installButton);
    }

    hideInstallButton() {
        const button = document.getElementById('pwa-install-button');
        if (button) button.remove();
    }

    async installApp() {
        if (!this.deferredPrompt) {
            this.showManualInstructions();
            return;
        }

        try {
            // Mostrar prompt de instalação
            this.deferredPrompt.prompt();
            
            // Aguardar resposta do usuário
            const result = await this.deferredPrompt.userChoice;
            
            if (result.outcome === 'accepted') {
                console.log('PWA: Usuário aceitou instalação');
                this.showSuccessMessage();
            } else {
                console.log('PWA: Usuário recusou instalação');
            }
            
            this.deferredPrompt = null;
            this.hideInstallButton();
            
        } catch (error) {
            console.error('PWA: Erro na instalação:', error);
            this.showManualInstructions();
        }
    }

    showManualInstructions() {
        const userAgent = navigator.userAgent.toLowerCase();
        let instructions = '';
        
        if (userAgent.includes('android')) {
            if (userAgent.includes('chrome')) {
                instructions = `
                    <strong>Para instalar no Android Chrome:</strong><br>
                    1. Toque no menu (⋮) no canto superior direito<br>
                    2. Selecione "Instalar app" ou "Adicionar à tela inicial"<br>
                    3. Confirme a instalação<br><br>
                    <strong>Ou:</strong> Procure por "Adicionar à tela inicial" na barra de endereços
                `;
            } else if (userAgent.includes('firefox')) {
                instructions = `
                    <strong>Para instalar no Android Firefox:</strong><br>
                    1. Toque no menu (⋯) no canto superior direito<br>
                    2. Selecione "Instalar" ou "Adicionar à tela inicial"<br>
                    3. Confirme a instalação
                `;
            } else {
                instructions = `
                    <strong>Para instalar no Android:</strong><br>
                    1. Abra este site no Chrome ou Firefox<br>
                    2. Use o menu do navegador<br>
                    3. Procure por "Instalar app" ou "Adicionar à tela inicial"
                `;
            }
        } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
            instructions = `
                <strong>Para instalar no iOS Safari:</strong><br>
                1. Toque no botão de compartilhar (📤)<br>
                2. Role para baixo e toque em "Adicionar à Tela de Início"<br>
                3. Toque em "Adicionar" no canto superior direito<br><br>
                <em>Nota: Funciona apenas no Safari, não em outros navegadores iOS</em>
            `;
        } else {
            instructions = `
                <strong>Para instalar no desktop:</strong><br>
                1. Procure pelo ícone de instalação na barra de endereços<br>
                2. Ou use o menu do navegador<br>
                3. Selecione "Instalar ELP Relatórios"<br><br>
                <strong>Dispositivos móveis:</strong><br>
                Use o menu do seu navegador e procure por "Adicionar à tela inicial" ou "Instalar app"
            `;
        }

        this.showModal('Como Instalar o App', instructions);
    }

    showSuccessMessage() {
        this.showNotification(
            '<i class="fas fa-check-circle text-success me-2"></i>' +
            '<strong>App instalado com sucesso!</strong><br>' +
            'Agora você pode acessar o ELP Relatórios diretamente da sua tela inicial.',
            'success'
        );
    }

    showInstalledMessage() {
        this.showNotification(
            '<i class="fas fa-mobile-alt text-info me-2"></i>' +
            '<strong>App detectado!</strong><br>' +
            'Você está usando a versão instalada do ELP Relatórios.',
            'info'
        );
    }

    showNotification(message, type = 'info') {
        // Remove notificações anteriores
        const existing = document.querySelector('.pwa-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `alert alert-${type} pwa-notification`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            min-width: 300px;
            max-width: 400px;
        `;
        notification.innerHTML = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    showModal(title, content) {
        // Criar modal se não existir
        let modal = document.getElementById('pwa-instructions-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'pwa-instructions-modal';
            modal.className = 'modal fade';
            modal.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="pwa-modal-title"></h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="pwa-modal-body"></div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        // Atualizar conteúdo
        document.getElementById('pwa-modal-title').textContent = title;
        document.getElementById('pwa-modal-body').innerHTML = content;

        // Mostrar modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    }

    // Verificar se pode mostrar prompt de instalação
    canShowInstallPrompt() {
        return !this.isInstalled && this.deferredPrompt !== null;
    }

    // Verificar suporte a PWA
    isPWASupported() {
        return 'serviceWorker' in navigator && 'PushManager' in window;
    }
    
    // Verificar se deve mostrar o prompt de instalação baseado na página atual
    shouldShowInstallPrompt() {
        const currentPath = window.location.pathname;
        const allowedPages = [
            '/',              // Dashboard/Home
            '/dashboard',     // Dashboard explícito
            '/install-guide'  // Página de guia de instalação
        ];
        
        // Verificar se a página atual está na lista de páginas permitidas
        return allowedPages.some(page => 
            currentPath === page || 
            currentPath.startsWith(page + '/') ||
            (page === '/' && currentPath === '')
        );
    }
    
    // Detectar plataforma do usuário
    detectPlatform() {
        const userAgent = navigator.userAgent.toLowerCase();
        
        if (userAgent.includes('android')) {
            return 'android';
        } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
            return 'ios';
        } else if (userAgent.includes('windows')) {
            return 'windows';
        } else if (userAgent.includes('mac')) {
            return 'mac';
        } else if (userAgent.includes('linux')) {
            return 'linux';
        } else {
            return 'desktop';
        }
    }
    
    // Obter conteúdo específico para cada plataforma
    getInstallContent(platform) {
        const contents = {
            android: {
                platformName: 'Android',
                deviceName: 'dispositivo Android',
                icon: '<i class="fab fa-android me-2"></i>',
                buttons: `
                    <button class="btn btn-success" onclick="window.pwaInstaller.installApp()">
                        <i class="fab fa-google-play me-2"></i>
                        Instalar via Chrome
                    </button>
                    <button class="btn btn-outline-primary btn-sm" onclick="window.pwaInstaller.showAndroidInstructions()">
                        <i class="fas fa-mobile-alt me-2"></i>
                        Instruções Android
                    </button>
                `
            },
            ios: {
                platformName: 'iOS',
                deviceName: 'iPhone/iPad',
                icon: '<i class="fab fa-apple me-2"></i>',
                buttons: `
                    <button class="btn btn-primary" onclick="window.pwaInstaller.showIosInstructions()">
                        <i class="fas fa-share me-2"></i>
                        Adicionar à Tela Inicial
                    </button>
                    <button class="btn btn-outline-secondary btn-sm" onclick="window.pwaInstaller.showManualInstructions()">
                        <i class="fas fa-question-circle me-2"></i>
                        Ver Instruções Detalhadas
                    </button>
                `
            },
            windows: {
                platformName: 'Windows',
                deviceName: 'computador Windows',
                icon: '<i class="fab fa-windows me-2"></i>',
                buttons: `
                    <button class="btn btn-info" onclick="window.pwaInstaller.installApp()">
                        <i class="fas fa-desktop me-2"></i>
                        Instalar no Windows
                    </button>
                    <button class="btn btn-outline-secondary btn-sm" onclick="window.pwaInstaller.showDesktopInstructions()">
                        <i class="fas fa-question-circle me-2"></i>
                        Instruções Windows
                    </button>
                `
            },
            mac: {
                platformName: 'macOS',
                deviceName: 'Mac',
                icon: '<i class="fab fa-apple me-2"></i>',
                buttons: `
                    <button class="btn btn-secondary" onclick="window.pwaInstaller.installApp()">
                        <i class="fas fa-laptop me-2"></i>
                        Instalar no Mac
                    </button>
                    <button class="btn btn-outline-secondary btn-sm" onclick="window.pwaInstaller.showDesktopInstructions()">
                        <i class="fas fa-question-circle me-2"></i>
                        Instruções macOS
                    </button>
                `
            },
            linux: {
                platformName: 'Linux',
                deviceName: 'computador Linux',
                icon: '<i class="fab fa-linux me-2"></i>',
                buttons: `
                    <button class="btn btn-warning" onclick="window.pwaInstaller.installApp()">
                        <i class="fas fa-terminal me-2"></i>
                        Instalar no Linux
                    </button>
                    <button class="btn btn-outline-secondary btn-sm" onclick="window.pwaInstaller.showDesktopInstructions()">
                        <i class="fas fa-question-circle me-2"></i>
                        Instruções Linux
                    </button>
                `
            },
            desktop: {
                platformName: 'Desktop',
                deviceName: 'computador',
                icon: '<i class="fas fa-desktop me-2"></i>',
                buttons: `
                    <button class="btn btn-primary" onclick="window.pwaInstaller.installApp()">
                        <i class="fas fa-download me-2"></i>
                        Instalar Agora
                    </button>
                    <button class="btn btn-outline-secondary btn-sm" onclick="window.pwaInstaller.showManualInstructions()">
                        <i class="fas fa-question-circle me-2"></i>
                        Como instalar?
                    </button>
                `
            }
        };
        
        return contents[platform] || contents.desktop;
    }
    
    // Instruções específicas para Android
    showAndroidInstructions() {
        const instructions = `
            <div class="text-center mb-3">
                <i class="fab fa-android fa-3x text-success"></i>
                <h4 class="mt-2">Instalação no Android</h4>
            </div>
            
            <div class="row">
                <div class="col-md-6">
                    <h5><i class="fab fa-chrome me-2"></i>Chrome</h5>
                    <ol>
                        <li>Toque no menu <strong>(⋮)</strong> no canto superior direito</li>
                        <li>Selecione <strong>"Instalar app"</strong> ou <strong>"Adicionar à tela inicial"</strong></li>
                        <li>Confirme tocando em <strong>"Instalar"</strong></li>
                        <li>O app aparecerá na sua tela inicial</li>
                    </ol>
                </div>
                <div class="col-md-6">
                    <h5><i class="fab fa-firefox me-2"></i>Firefox</h5>
                    <ol>
                        <li>Toque no menu <strong>(⋯)</strong> no canto superior direito</li>
                        <li>Selecione <strong>"Instalar"</strong></li>
                        <li>Confirme a instalação</li>
                        <li>Acesse pelo ícone na tela inicial</li>
                    </ol>
                </div>
            </div>
            
            <div class="alert alert-info mt-3">
                <i class="fas fa-lightbulb me-2"></i>
                <strong>Dica:</strong> Procure também por uma barra de notificação no topo da página oferecendo a instalação!
            </div>
        `;
        
        this.showModal('Instalar no Android', instructions);
    }
    
    // Instruções específicas para iOS
    showIosInstructions() {
        const instructions = `
            <div class="text-center mb-3">
                <i class="fab fa-apple fa-3x text-primary"></i>
                <h4 class="mt-2">Instalação no iPhone/iPad</h4>
            </div>
            
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong>Importante:</strong> Funciona apenas no Safari, não em outros navegadores iOS.
            </div>
            
            <h5><i class="fab fa-safari me-2"></i>Passos no Safari:</h5>
            <ol class="fs-6">
                <li class="mb-2">
                    <strong>Toque no botão de compartilhar</strong><br>
                    <span class="text-muted">Ícone 📤 na parte inferior da tela</span>
                </li>
                <li class="mb-2">
                    <strong>Role para baixo</strong><br>
                    <span class="text-muted">Procure por "Adicionar à Tela de Início"</span>
                </li>
                <li class="mb-2">
                    <strong>Toque em "Adicionar à Tela de Início"</strong><br>
                    <span class="text-muted">Pode estar na segunda linha de opções</span>
                </li>
                <li class="mb-2">
                    <strong>Confirme tocando em "Adicionar"</strong><br>
                    <span class="text-muted">No canto superior direito</span>
                </li>
                <li>
                    <strong>Pronto!</strong><br>
                    <span class="text-muted">O app aparecerá na sua tela inicial</span>
                </li>
            </ol>
            
            <div class="alert alert-success mt-3">
                <i class="fas fa-check-circle me-2"></i>
                <strong>Funcionalidades:</strong> Trabalha offline, notificações push, interface nativa
            </div>
        `;
        
        this.showModal('Instalar no iPhone/iPad', instructions);
    }
    
    // Instruções específicas para Desktop
    showDesktopInstructions() {
        const platform = this.detectPlatform();
        let browserInstructions = '';
        
        if (navigator.userAgent.includes('Chrome')) {
            browserInstructions = `
                <h5><i class="fab fa-chrome me-2"></i>Google Chrome</h5>
                <ol>
                    <li>Procure pelo ícone <strong>⊕</strong> ou <strong>🖥️</strong> na barra de endereços</li>
                    <li>Ou vá no menu <strong>(⋮)</strong> → <strong>"Instalar ELP Relatórios..."</strong></li>
                    <li>Clique em <strong>"Instalar"</strong></li>
                    <li>O app aparecerá como programa instalado</li>
                </ol>
            `;
        } else if (navigator.userAgent.includes('Firefox')) {
            browserInstructions = `
                <h5><i class="fab fa-firefox me-2"></i>Mozilla Firefox</h5>
                <ol>
                    <li>Procure pelo ícone na barra de endereços</li>
                    <li>Ou vá no menu <strong>(☰)</strong> → <strong>"Instalar esta página como app"</strong></li>
                    <li>Confirme a instalação</li>
                    <li>Acesse pelo menu de aplicativos</li>
                </ol>
            `;
        } else if (navigator.userAgent.includes('Safari')) {
            browserInstructions = `
                <h5><i class="fab fa-safari me-2"></i>Safari</h5>
                <ol>
                    <li>Vá no menu <strong>Safari</strong> → <strong>"Adicionar à Dock"</strong></li>
                    <li>Ou use <strong>Arquivo</strong> → <strong>"Adicionar à Dock"</strong></li>
                    <li>O app ficará disponível na Dock</li>
                </ol>
            `;
        } else {
            browserInstructions = `
                <h5><i class="fas fa-browser me-2"></i>Navegador</h5>
                <ol>
                    <li>Procure por um ícone de instalação na barra de endereços</li>
                    <li>Ou vá no menu do navegador</li>
                    <li>Procure por "Instalar app" ou "Adicionar à área de trabalho"</li>
                    <li>Confirme a instalação</li>
                </ol>
            `;
        }
        
        const instructions = `
            <div class="text-center mb-3">
                <i class="fas fa-desktop fa-3x text-info"></i>
                <h4 class="mt-2">Instalação no Desktop - ${platform.toUpperCase()}</h4>
            </div>
            
            ${browserInstructions}
            
            <div class="alert alert-info mt-3">
                <i class="fas fa-lightbulb me-2"></i>
                <strong>Vantagens:</strong>
                <ul class="mb-0 mt-2">
                    <li>Acesso direto pela área de trabalho</li>
                    <li>Funciona offline</li>
                    <li>Interface como aplicativo nativo</li>
                    <li>Atualizações automáticas</li>
                </ul>
            </div>
        `;
        
        this.showModal('Instalar no Desktop', instructions);
    }
}

// Inicializar PWA Installer quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator) {
        window.pwaInstaller = new PWAInstaller();
        
        // Registrar Service Worker
        navigator.serviceWorker.register('/static/js/sw.js')
            .then(registration => {
                console.log('PWA: Service Worker registrado:', registration);
            })
            .catch(error => {
                console.log('PWA: Erro ao registrar Service Worker:', error);
            });
    } else {
        console.log('PWA: Service Worker não suportado');
    }
});