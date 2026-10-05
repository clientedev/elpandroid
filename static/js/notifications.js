// Sistema de Notificações Push - Versão Robusta com Debug Completo
class NotificationManager {
    constructor() {
        this.isSupported = 'Notification' in window && 'serviceWorker' in navigator;
        this.permission = this.isSupported ? Notification.permission : 'denied';
        this.subscriptionKey = null;
        this.currentPosition = null;
        this.watchId = null;
        this.nearbyProjects = [];
        this.notifiedProjects = new Set();
        this.swRegistration = null;

        console.log('🔔 NOTIFICATIONS: Inicializando sistema de notificações');
        console.log('🔔 NOTIFICATIONS: Suporte:', this.isSupported ? 'SIM' : 'NÃO');
        console.log('🔔 NOTIFICATIONS: Permissão atual:', this.permission);

        this.init();
    }

    async init() {
        console.log('🔔 NOTIFICATIONS: Inicializando sistema de notificações');
        console.log('🔔 NOTIFICATIONS: Suporte:', this.isSupported ? 'SIM' : 'NÃO');
        console.log('🔔 NOTIFICATIONS: Permissão atual:', Notification.permission);

        if (!this.isSupported) {
            console.warn('⚠️ NOTIFICATIONS: Navegador não suporta notificações');
            return;
        }

        this.permission = Notification.permission;

        // Register service worker for push notifications
        await this.registerServiceWorker();

        // AUTO-DETECTAR E FORÇAR PERMISSÕES SE NECESSÁRIO
        await this.autoCheckPermissions();

        // Make the manager globally available
        window.notificationManager = this;
        console.log('✅ NOTIFICATIONS: Gerenciador disponível globalmente');
    }

    async registerServiceWorker() {
        try {
            console.log('🔧 NOTIFICATIONS: Registrando service worker...');

            if ('serviceWorker' in navigator) {
                // Tentar obter registration existente
                this.swRegistration = await navigator.serviceWorker.getRegistration();

                if (!this.swRegistration) {
                    console.log('📦 NOTIFICATIONS: Registrando service worker...');
                    this.swRegistration = await navigator.serviceWorker.register('/static/js/sw.js');
                    console.log('✅ NOTIFICATIONS: Service worker registrado');
                } else {
                    console.log('✅ NOTIFICATIONS: Service worker já registrado');
                }

                // Aguardar estar pronto
                await navigator.serviceWorker.ready;
                console.log('✅ NOTIFICATIONS: Service worker pronto');
            }
        } catch (error) {
            console.error('❌ NOTIFICATIONS: Erro ao configurar service worker:', error);
            // Não fazer throw aqui para continuar funcionando sem push notifications
        }
    }

    async autoCheckPermissions() {
        console.log('🔍 NOTIFICATIONS: Auto-verificando permissões...');

        // Verificar se já temos as duas permissões
        const notificationStatus = Notification.permission;
        const hasLocationAccess = await this.checkLocationAccess();

        console.log('📊 AUTO-CHECK: Notificação:', notificationStatus, '| Localização:', hasLocationAccess);

        // Se não temos localização, mostrar aviso proativo
        if (!hasLocationAccess) {
            console.log('⚠️ AUTO-CHECK: Localização não disponível - usuário precisa ativar');
            // Não forçar agora, apenas logar
        }

        // Se não temos notificação, mostrar aviso proativo  
        if (notificationStatus === 'default') {
            console.log('⚠️ AUTO-CHECK: Notificação em default - usuário precisa ativar');
            // Não forçar agora, apenas logar
        }
    }

    async checkLocationAccess() {
        if (!navigator.geolocation) {
            return false;
        }

        try {
            // Teste rápido e silencioso se já temos acesso
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    resolve,
                    reject,
                    { enableHighAccuracy: false, timeout: 1000, maximumAge: 60000 }
                );
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    async ensureServiceWorker() {
        try {
            console.log('🔧 NOTIFICATIONS: Verificando service worker...');

            if ('serviceWorker' in navigator) {
                // Tentar obter registration existente
                this.swRegistration = await navigator.serviceWorker.getRegistration();

                if (!this.swRegistration) {
                    console.log('📦 NOTIFICATIONS: Registrando service worker...');
                    this.swRegistration = await navigator.serviceWorker.register('/static/js/sw.js');
                    console.log('✅ NOTIFICATIONS: Service worker registrado');
                } else {
                    console.log('✅ NOTIFICATIONS: Service worker já registrado');
                }

                // Aguardar estar pronto
                await navigator.serviceWorker.ready;
                console.log('✅ NOTIFICATIONS: Service worker pronto');
            }
        } catch (error) {
            console.error('❌ NOTIFICATIONS: Erro ao configurar service worker:', error);
            throw error;
        }
    }

    async checkPermissionStatus() {
        console.log('🔍 NOTIFICATIONS: Verificando status da permissão...');

        const status = Notification.permission;
        this.permission = status;

        console.log(`📊 NOTIFICATIONS: Status = "${status}"`);

        return {
            granted: status === 'granted',
            denied: status === 'denied',
            default: status === 'default',
            canAsk: status === 'default',
            needsManualEnable: status === 'denied'
        };
    }

    async requestLocationPermission() {
        console.log('📍 NOTIFICATIONS: Solicitando permissão de localização...');

        if (!navigator.geolocation) {
            console.warn('⚠️ NOTIFICATIONS: Geolocalização não suportada');
            return false;
        }

        try {
            // MOBILE: Forçar prompt de localização IMEDIATAMENTE
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    resolve,
                    reject,
                    { 
                        enableHighAccuracy: true, 
                        timeout: 15000, 
                        maximumAge: 0 // Sempre pedir permissão fresca
                    }
                );
            });

            console.log('✅ NOTIFICATIONS: Permissão de localização concedida');
            return true;
        } catch (error) {
            console.warn('🚫 NOTIFICATIONS: Permissão de localização negada:', error.message);

            this.showUserMessage(
                'Localização Necessária',
                'Para receber alertas de obras próximas, é necessário permitir o acesso à sua localização.',
                'warning',
                8000
            );

            return false;
        }
    }

    async forceLocationPermission() {
        console.log('📍 NOTIFICATIONS: Forçando prompt de permissão de localização...');

        if (!navigator.geolocation) {
            console.warn('⚠️ NOTIFICATIONS: Geolocalização não suportada');
            return false;
        }

        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    resolve,
                    reject,
                    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 } // Tentar obter com alta precisão para garantir o prompt
                );
            });

            console.log('✅ NOTIFICATIONS: Prompt de localização ativado e concedido');
            return true;
        } catch (error) {
            console.warn('🚫 NOTIFICATIONS: Prompt de localização negado ou falhou:', error.message);
            return false;
        }
    }

    async requestPermission() {
        console.log('🔔 NOTIFICATIONS: Solicitando permissões...');

        if (!this.isSupported) {
            const error = 'Notificações não suportadas neste navegador';
            console.error('❌ NOTIFICATIONS:', error);
            this.showUserMessage('Notificações não disponíveis', 'Seu navegador não suporta notificações push.', 'warning');
            throw new Error(error);
        }

        // MOBILE FIX: Detectar se é mobile e ajustar comportamento
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        console.log('📱 MOBILE DETECTED:', isMobile);

        // PASSO 1: LOCALIZAÇÃO (OBRIGATÓRIA) - FORÇAR SEMPRE EM MOBILE
        try {
            console.log('📍 NOTIFICATIONS: 🔥 PASSO 1/2 - FORÇANDO permissão de localização...');

            // Mostrar mensagem explicativa ANTES de solicitar
            this.showUserMessage(
                'Primeira Permissão: Localização',
                'Primeiro vamos solicitar acesso à sua localização para alertas de proximidade.',
                'info',
                3000
            );

            // Aguardar um pouco para o usuário ler
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 🚀 FIX: chamada direta única que SEMPRE dispara prompt no Chrome mobile
            const hasLocation = await new Promise((resolve) => {
                navigator.geolocation.getCurrentPosition(
                    () => {
                        console.log("✅ Permissão de localização concedida");
                        resolve(true);
                    },
                    (error) => {
                        console.warn("🚫 Permissão de localização negada:", error.message);
                        resolve(false);
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 0  // 🔥 IMPORTANTE: SEM CACHE
                    }
                );
            });

            if (!hasLocation) {
                this.showUserMessage(
                    'Localização Obrigatória',
                    'É obrigatório permitir acesso à localização para ativar notificações de proximidade.',
                    'danger',
                    8000
                );
                return false;
            }

            console.log('✅ LOCALIZAÇÃO CONCEDIDA! Agora pedindo permissão de notificação...');
        } catch (error) {
            console.error('❌ ERRO ao solicitar localização:', error);
            return false;
        }

        // Agora verificar status de notificação
        const status = await this.checkPermissionStatus();
        console.log('📊 NOTIFICATIONS: Status de notificação:', status);

        // Se já concedido, apenas configurar
        if (status.granted) {
            console.log('✅ NOTIFICATIONS: Permissão de notificação já concedida');
            await this.setupNotifications();
            return true;
        }

        // Se negado, orientar usuário
        if (status.denied) {
            console.warn('🚫 NOTIFICATIONS: Permissão de notificação negada anteriormente');
            this.showDeniedInstructions();
            return false;
        }

        // PASSO 2: NOTIFICAÇÃO
        if (status.canAsk) {
            try {
                console.log('🔔 NOTIFICATIONS: 🔥 PASSO 2/2 - FORÇANDO permissão de notificação...');

                // Mostrar mensagem explicativa para a segunda permissão
                this.showUserMessage(
                    'Segunda Permissão: Notificações',
                    'Agora vamos solicitar permissão para enviar notificações sobre obras próximas.',
                    'info',
                    3000
                );

                // Aguardar um pouco mais em mobile
                await new Promise(resolve => setTimeout(resolve, isMobile ? 3000 : 2000));

                console.log('🔔 NOTIFICATIONS: Chamando Notification.requestPermission()...');
                const permission = await Notification.requestPermission();
                this.permission = permission;

                console.log('📊 NOTIFICATIONS: ✅ Resposta do usuário para NOTIFICAÇÃO:', permission);

                if (permission === 'granted') {
                    console.log('🎉 NOTIFICATIONS: 🎉 AMBAS PERMISSÕES CONCEDIDAS! 🎉');
                    await this.setupNotifications();
                    return true;
                } else if (permission === 'denied') {
                    console.warn('🚫 NOTIFICATIONS: Permissão de notificação NEGADA pelo usuário');
                    this.showDeniedInstructions();
                    return false;
                } else {
                    console.warn('⚠️ NOTIFICATIONS: Permissão ignorada/fechada pelo usuário');
                    this.showUserMessage(
                        'Permissão Necessária',
                        'É necessário permitir notificações para continuar. Tente novamente.',
                        'warning',
                        5000
                    );
                    return false;
                }
            } catch (error) {
                console.error('❌ NOTIFICATIONS: ERRO ao solicitar notificação:', error);
                this.showUserMessage('Erro', 'Erro ao solicitar permissão de notificação. Tente novamente.', 'error');
                throw error;
            }
        }

        return false;
    }

    async forceLocationPermissionMobile() {
        console.log('📍 MOBILE: FORÇA BRUTA - Solicitando permissão de localização específica para mobile...');

        if (!navigator.geolocation) {
            console.warn('⚠️ MOBILE: Geolocalização não suportada');
            return false;
        }

        // MOBILE FIX: Múltiplas tentativas com estratégias diferentes
        const strategies = [
            // Estratégia 1: Alta precisão com timeout curto
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
            // Estratégia 2: Baixa precisão com timeout maior
            { enableHighAccuracy: false, timeout: 12000, maximumAge: 0 },
            // Estratégia 3: Cache permitido para acelerar
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
        ];

        for (let i = 0; i < strategies.length; i++) {
            const strategy = strategies[i];
            console.log(`🔥 MOBILE: Tentativa ${i + 1}/3 com estratégia:`, strategy);

            try {
                const position = await new Promise((resolve, reject) => {
                    const timeoutId = setTimeout(() => {
                        console.warn(`⏰ MOBILE: Timeout na tentativa ${i + 1}`);
                        reject(new Error(`Timeout na tentativa ${i + 1}`));
                    }, strategy.timeout);

                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            clearTimeout(timeoutId);
                            console.log(`✅ MOBILE: Tentativa ${i + 1} bem-sucedida!`);
                            resolve(position);
                        },
                        (error) => {
                            clearTimeout(timeoutId);
                            console.error(`🚫 MOBILE: Tentativa ${i + 1} falhou:`, error.code, error.message);
                            reject(error);
                        },
                        strategy
                    );
                });

                return true; // Sucesso!

            } catch (error) {
                console.error(`❌ MOBILE: Tentativa ${i + 1} falhou:`, error.message);

                // Se for erro de permissão, não tentar mais
                if (error.code === 1) { // PERMISSION_DENIED
                    console.error('🚫 MOBILE: Permissão negada definitivamente');
                    this.showMobileLocationDeniedInstructions();
                    return false;
                }

                // Se não for a última tentativa, continuar
                if (i < strategies.length - 1) {
                    console.log(`🔄 MOBILE: Aguardando antes da próxima tentativa...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

        console.error('❌ MOBILE: Todas as tentativas falharam');
        this.showMobileLocationDeniedInstructions();
        return false;
    }

    showMobileLocationDeniedInstructions() {
        const userAgent = navigator.userAgent.toLowerCase();
        let instructions = '';
        let browserName = '';

        if (userAgent.includes('chrome') && userAgent.includes('android')) {
            browserName = 'Chrome Android';
            instructions = `
                <div class="alert alert-warning">
                    <h6><strong>📱 ${browserName} - Como permitir localização:</strong></h6>
                    <ol class="text-start mb-2">
                        <li>Toque no ícone <strong>🔒</strong> ou <strong>ℹ️</strong> na barra de endereço</li>
                        <li>Toque em <strong>"Permissões"</strong> ou <strong>"Configurações do site"</strong></li>
                        <li>Encontre <strong>"Localização"</strong> e altere para <strong>"Permitir"</strong></li>
                        <li>Recarregue a página e tente novamente</li>
                    </ol>
                    <div class="alert alert-info mb-0">
                        <strong>💡 Alternativa rápida:</strong><br>
                        Configurações do Android → Apps → Chrome → Permissões → Localização → Permitir
                    </div>
                </div>
            `;
        } else if (userAgent.includes('safari') && (userAgent.includes('iphone') || userAgent.includes('ipad'))) {
            browserName = 'Safari iOS';
            instructions = `
                <div class="alert alert-warning">
                    <h6><strong>📱 ${browserName} - Como permitir localização:</strong></h6>
                    <ol class="text-start mb-2">
                        <li>Abra <strong>Configurações</strong> do iOS</li>
                        <li>Role para baixo e toque em <strong>Privacidade e Segurança</strong></li>
                        <li>Toque em <strong>Serviços de Localização</strong></li>
                        <li>Certifique-se de que está <strong>ATIVADO</strong></li>
                        <li>Role até <strong>Safari</strong> e toque</li>
                        <li>Selecione <strong>"Ao Usar o App"</strong></li>
                        <li>Volte ao app e tente novamente</li>
                    </ol>
                </div>
            `;
        } else if (userAgent.includes('firefox') && userAgent.includes('android')) {
            browserName = 'Firefox Android';
            instructions = `
                <div class="alert alert-warning">
                    <h6><strong>📱 ${browserName} - Como permitir localização:</strong></h6>
                    <ol class="text-start mb-2">
                        <li>Toque no ícone <strong>🔒</strong> na barra de endereço</li>
                        <li>Toque em <strong>"Editar permissões do site"</strong></li>
                        <li>Altere <strong>"Localização"</strong> para <strong>"Permitir"</strong></li>
                        <li>Recarregue a página</li>
                    </ol>
                </div>
            `;
        } else {
            browserName = 'Mobile';
            instructions = `
                <div class="alert alert-warning">
                    <h6><strong>📱 Como permitir localização no ${browserName}:</strong></h6>
                    <ol class="text-start mb-2">
                        <li>Toque no ícone <strong>🔒</strong> ou <strong>ℹ️</strong> na barra de endereço</li>
                        <li>Procure por <strong>"Localização"</strong> ou <strong>"Location"</strong></li>
                        <li>Altere para <strong>"Permitir"</strong> ou <strong>"Allow"</strong></li>
                        <li>Recarregue a página e tente novamente</li>
                    </ol>
                    <div class="alert alert-info mb-0">
                        <strong>💡 Dica:</strong> O prompt de permissão pode aparecer como uma notificação no topo da tela.
                    </div>
                </div>
            `;
        }

        // Criar modal específico para instruções mobile
        const modal = document.createElement('div');
        modal.className = 'modal fade show';
        modal.style.display = 'block';
        modal.style.backgroundColor = 'rgba(0,0,0,0.7)';
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-warning text-dark">
                        <h5 class="modal-title">
                            <i class="fas fa-map-marker-alt"></i> 
                            Permissão de Localização Necessária
                        </h5>
                        <button type="button" class="btn-close" onclick="this.closest('.modal').remove()"></button>
                    </div>
                    <div class="modal-body">
                        <p class="lead mb-3">
                            <strong>Para ativar notificações de proximidade, é obrigatório permitir acesso à sua localização.</strong>
                        </p>
                        ${instructions}
                        <div class="alert alert-danger mt-3">
                            <strong>⚠️ Importante:</strong> Sem a permissão de localização, não será possível ativar as notificações de obras próximas.
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">
                            Cancelar
                        </button>
                        <button type="button" class="btn btn-primary" onclick="window.location.reload()">
                            <i class="fas fa-redo"></i> Recarregar e Tentar Novamente
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Auto-remover modal após 30 segundos
        setTimeout(() => {
            if (modal.parentNode) {
                modal.remove();
            }
        }, 30000);
    }

    async requestLocationPermissionMobile() {
        console.log('📍 MOBILE: Solicitando permissão de localização específica para mobile...');

        if (!navigator.geolocation) {
            console.warn('⚠️ MOBILE: Geolocalização não suportada');
            return false;
        }

        // MOBILE FIX: Usar getCurrentPosition de forma mais agressiva
        try {
            console.log('🔥 MOBILE: Forçando prompt de localização...');

            const position = await new Promise((resolve, reject) => {
                // Timeout menor para forçar o prompt mais rapidamente
                const timeoutId = setTimeout(() => {
                    console.warn('⏰ MOBILE: Timeout - tentando novamente...');
                    reject(new Error('Timeout ao solicitar localização'));
                }, 15000);

                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        clearTimeout(timeoutId);
                        console.log('✅ MOBILE: Permissão de localização CONCEDIDA');
                        resolve(position);
                    },
                    (error) => {
                        clearTimeout(timeoutId);
                        console.error('🚫 MOBILE: Erro ao solicitar localização:', error.code, error.message);

                        // Mostrar instruções detalhadas baseadas no tipo de erro
                        if (error.code === 1) { // PERMISSION_DENIED
                            this.showMobileLocationInstructions();
                        } else if (error.code === 2) { // POSITION_UNAVAILABLE
                            this.showUserMessage(
                                'GPS Indisponível',
                                'Não foi possível obter sua localização. Verifique se o GPS está ativado.',
                                'warning',
                                5000
                            );
                        } else if (error.code === 3) { // TIMEOUT
                            this.showUserMessage(
                                'Timeout de Localização',
                                'A solicitação de localização demorou muito. Tente novamente.',
                                'warning',
                                5000
                            );
                        }

                        reject(error);
                    },
                    { 
                        enableHighAccuracy: true, 
                        timeout: 12000,
                        maximumAge: 0 // SEMPRE forçar nova permissão
                    }
                );
            });

            return true;

        } catch (error) {
            console.error('❌ MOBILE: Falha ao obter permissão de localização:', error.message);

            // Se falhou, tentar uma segunda vez com configurações diferentes
            console.log('🔄 MOBILE: Tentativa secundária com enableHighAccuracy: false...');

            try {
                const fallbackPosition = await new Promise((resolve, reject) => {
                    const timeoutId = setTimeout(() => {
                        reject(new Error('Segunda tentativa - timeout'));
                    }, 10000);

                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            clearTimeout(timeoutId);
                            console.log('✅ MOBILE: Segunda tentativa bem-sucedida');
                            resolve(position);
                        },
                        (error) => {
                            clearTimeout(timeoutId);
                            console.error('🚫 MOBILE: Segunda tentativa falhou:', error.message);
                            reject(error);
                        },
                        { 
                            enableHighAccuracy: false, // Menos agressivo
                            timeout: 8000,
                            maximumAge: 0
                        }
                    );
                });

                return true;

            } catch (fallbackError) {
                console.error('❌ MOBILE: Todas as tentativas falharam');
                this.showMobileLocationInstructions();
                return false;
            }
        }
    }

    showMobileLocationInstructions() {
        const userAgent = navigator.userAgent.toLowerCase();
        let instructions = '';

        if (userAgent.includes('chrome') && userAgent.includes('android')) {
            instructions = `
                <div class="text-start">
                    <p><strong>📱 Chrome Android - Como permitir localização:</strong></p>
                    <ol>
                        <li>Toque no ícone <strong>🔒</strong> ou <strong>ℹ️</strong> na barra de endereço</li>
                        <li>Toque em <strong>"Permissões"</strong></li>
                        <li>Encontre <strong>"Localização"</strong> e altere para <strong>"Permitir"</strong></li>
                        <li>Recarregue a página</li>
                    </ol>
                    <p><strong>Alternativa:</strong> Vá em Configurações → Apps → Chrome → Permissões → Localização</p>
                </div>
            `;
        } else if (userAgent.includes('safari') && (userAgent.includes('iphone') || userAgent.includes('ipad'))) {
            instructions = `
                <div class="text-start">
                    <p><strong>📱 Safari iOS - Como permitir localização:</strong></p>
                    <ol>
                        <li>Vá em <strong>Configurações</strong> do iOS</li>
                        <li>Role para baixo e toque em <strong>Privacidade e Segurança</strong></li>
                        <li>Toque em <strong>Serviços de Localização</strong></li>
                        <li>Certifique-se de que está <strong>ATIVADO</strong></li>
                        <li>Role até <strong>Safari</strong> e toque</li>
                        <li>Selecione <strong>"Ao Usar o App"</strong></li>
                    </ol>
                    <p><strong>Ou:</strong> Configurações → Privacidade → Serviços de Localização → Safari</p>
                </div>
            `;
        } else if (userAgent.includes('firefox') && userAgent.includes('android')) {
            instructions = `
                <div class="text-start">
                    <p><strong>📱 Firefox Android - Como permitir localização:</strong></p>
                    <ol>
                        <li>Toque no ícone <strong>🔒</strong> na barra de endereço</li>
                        <li>Toque em <strong>"Editar permissões do site"</strong></li>
                        <li>Altere <strong>"Localização"</strong> para <strong>"Permitir"</strong></li>
                        <li>Recarregue a página</li>
                    </ol>
                </div>
            `;
        } else {
            instructions = `
                <div class="text-start">
                    <p><strong>📱 Como permitir localização no mobile:</strong></p>
                    <ol>
                        <li>Toque no ícone <strong>🔒</strong> ou <strong>ℹ️</strong> na barra de endereço</li>
                        <li>Procure por <strong>"Localização"</strong> ou <strong>"Location"</strong></li>
                        <li>Altere para <strong>"Permitir"</strong> ou <strong>"Allow"</strong></li>
                        <li>Recarregue a página e tente novamente</li>
                    </ol>
                    <p><small>💡 <strong>Dica:</strong> A permissão pode aparecer como uma notificação no topo da tela.</small></p>
                </div>
            `;
        }

        this.showUserMessage(
            'Permissão de Localização Necessária',
            instructions,
            'warning',
            15000
        );
    }

    async setupNotifications() {
        try {
            console.log('⚙️ NOTIFICATIONS: Configurando notificações...');

            // 1. Garantir service worker
            await this.ensureServiceWorker();
            console.log('✅ NOTIFICATIONS: Service worker OK');

            // 2. Fazer subscription
            await this.subscribeToPush();
            console.log('✅ NOTIFICATIONS: Subscription criada');

            // 3. Mostrar notificação de boas-vindas
            this.showWelcomeNotification();
            console.log('✅ NOTIFICATIONS: Boas-vindas exibida');

            // 4. Iniciar monitoramento
            this.startLocationMonitoring();
            this.startPeriodicCheck();
            console.log('✅ NOTIFICATIONS: Monitoramento iniciado');

            // 5. Mensagem de sucesso ao usuário
            this.showUserMessage(
                'Notificações Ativadas!',
                'Você receberá alertas sobre obras próximas e novidades do sistema.',
                'success'
            );

        } catch (error) {
            console.error('❌ NOTIFICATIONS: Erro ao configurar:', error);
            this.showUserMessage(
                'Erro ao Ativar Notificações',
                'Ocorreu um erro ao configurar as notificações. Tente novamente.',
                'danger'
            );
            throw error;
        }
    }

    async subscribeToPush() {
        try {
            console.log('📡 NOTIFICATIONS: Iniciando subscription push...');

            if (!this.swRegistration) {
                await this.ensureServiceWorker();
            }

            // Verificar se já existe uma subscription
            let subscription = await this.swRegistration.pushManager.getSubscription();

            if (subscription) {
                console.log('✅ NOTIFICATIONS: Subscription existente encontrada');
                this.subscriptionKey = subscription;
            } else {
                console.log('📡 NOTIFICATIONS: Criando nova subscription...');

                // Criar nova subscription
                subscription = await this.swRegistration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: this.urlBase64ToUint8Array(this.getVapidPublicKey())
                });

                console.log('✅ NOTIFICATIONS: Nova subscription criada');
                this.subscriptionKey = subscription;
            }

            // Obter localização atual (obrigatória para notificações de proximidade)
            console.log('📍 NOTIFICATIONS: Obtendo localização para registro...');
            let locationData = null;

            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(
                        resolve,
                        reject,
                        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                    );
                });

                locationData = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };

                console.log('✅ NOTIFICATIONS: Localização obtida para registro:', locationData);
            } catch (locationError) {
                console.error('❌ NOTIFICATIONS: Erro ao obter localização:', locationError);
                this.showUserMessage(
                    'Localização Necessária',
                    'É obrigatório permitir acesso à localização para ativar notificações de proximidade.',
                    'warning',
                    8000
                );
                throw new Error('Localização é obrigatória para ativar notificações');
            }

            // Enviar subscription para o servidor COM localização
            console.log('📤 NOTIFICATIONS: Enviando subscription ao servidor...');
            const response = await fetch('/api/notifications/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify({
                    subscription: subscription.toJSON(),
                    user_agent: navigator.userAgent,
                    timestamp: new Date().toISOString(),
                    location: locationData
                })
            });

            if (response.ok) {
                console.log('✅ NOTIFICATIONS: Subscription registrada no servidor');
            } else {
                const errorData = await response.json();
                console.warn('⚠️ NOTIFICATIONS: Falha ao registrar no servidor:', response.status, errorData);
                throw new Error(errorData.error || 'Falha ao registrar notificações');
            }

        } catch (error) {
            console.error('❌ NOTIFICATIONS: Erro ao criar push subscription:', error);
            console.error('❌ NOTIFICATIONS: Detalhes do erro:', error.message, error.stack);
            throw error;
        }
    }

    async checkExistingSubscription() {
        try {
            console.log('🔍 NOTIFICATIONS: Verificando subscription existente...');

            if (!this.swRegistration) {
                await this.ensureServiceWorker();
            }

            const subscription = await this.swRegistration.pushManager.getSubscription();

            if (subscription) {
                this.subscriptionKey = subscription;
                console.log('✅ NOTIFICATIONS: Subscription ativa encontrada');
                console.log('📊 NOTIFICATIONS: Endpoint:', subscription.endpoint);
            } else {
                console.log('ℹ️ NOTIFICATIONS: Nenhuma subscription ativa');
            }
        } catch (error) {
            console.error('❌ NOTIFICATIONS: Erro ao verificar subscription:', error);
        }
    }

    startLocationMonitoring() {
        if (!window.geoLocation) {
            console.warn('⚠️ NOTIFICATIONS: Sistema de geolocalização não disponível');
            return;
        }

        console.log('📍 NOTIFICATIONS: Iniciando monitoramento de localização com sistema avançado...');

        // Usar o sistema de geolocalização avançado com fallback para IP
        window.geoLocation.getLocation({
            enableHighAccuracy: false,
            timeout: 30000,
            maximumAge: 300000,
            showUI: false,  // Não mostrar UI para notificações em background
            fallbackToIP: true,  // Usar IP se GPS falhar
            reverseGeocode: false  // Não precisa de endereço para notificações
        })
        .then((position) => {
            this.currentPosition = position;
            console.log('📍 NOTIFICATIONS: Localização inicial obtida:', {
                lat: position.coords.latitude,
                lon: position.coords.longitude,
                source: position.source || 'gps'
            });
            this.checkNearbyProjects();

            // Monitorar mudanças de localização com sistema avançado
            this.watchId = window.geoLocation.watchLocation(
                (newPosition, error) => {
                    if (error) {
                        console.warn('⚠️ NOTIFICATIONS: Erro no monitoramento:', error.message);
                        return;
                    }

                    if (newPosition) {
                        this.currentPosition = newPosition;
                        console.log('📍 NOTIFICATIONS: Localização atualizada');
                        this.checkNearbyProjects();
                    }
                },
                {
                    enableHighAccuracy: false,
                    timeout: 60000,
                    maximumAge: 300000
                }
            );
            console.log('✅ NOTIFICATIONS: Watch position ativo (ID:', this.watchId, ')');
        })
        .catch((error) => {
            console.warn('⚠️ NOTIFICATIONS: Não foi possível obter localização:', error.message);
            // Mostrar erro ao usuário com instruções
            this.showUserMessage(
                'Erro de Localização',
                'Não foi possível obter sua localização. Verifique as permissões do GPS.',
                'warning',
                3000
            );
        });
    }

    async checkNearbyProjects() {
        if (!this.currentPosition) return;

        try {
            const lat = this.currentPosition.coords.latitude;
            const lon = this.currentPosition.coords.longitude;

            console.log(`🔍 NOTIFICATIONS: Buscando obras próximas (${lat.toFixed(4)}, ${lon.toFixed(4)})`);

            const response = await fetch(`/api/nearby-projects?lat=${lat}&lon=${lon}&radius=1`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.nearbyProjects = data.projects || [];

                console.log(`📊 NOTIFICATIONS: ${this.nearbyProjects.length} obra(s) próxima(s)`);

                this.nearbyProjects.forEach(project => {
                    if (!this.notifiedProjects.has(project.id) && project.distance < 500) {
                        console.log(`🔔 NOTIFICATIONS: Notificando obra próxima: ${project.nome}`);
                        this.showProximityNotification(project);
                        this.notifiedProjects.add(project.id);
                    }
                });
            }
        } catch (error) {
            console.error('❌ NOTIFICATIONS: Erro ao verificar projetos próximos:', error);
        }
    }

    startPeriodicCheck() {
        console.log('⏰ NOTIFICATIONS: Iniciando verificação periódica de atualizações');

        // Verificar a cada 30 minutos
        setInterval(() => {
            console.log('⏰ NOTIFICATIONS: Executando verificação periódica...');
            this.checkForUpdates();
        }, 30 * 60 * 1000);

        // Verificar imediatamente
        this.checkForUpdates();
    }

    async checkForUpdates() {
        try {
            console.log('🔍 NOTIFICATIONS: Verificando atualizações...');

            const response = await fetch('/api/notifications/check-updates');

            if (response.ok) {
                const data = await response.json();

                if (data.has_updates) {
                    console.log(`📬 NOTIFICATIONS: ${data.updates.length} atualização(ões) encontrada(s)`);
                    data.updates.forEach(update => {
                        this.showUpdateNotification(update);
                    });
                } else {
                    console.log('ℹ️ NOTIFICATIONS: Nenhuma atualização');
                }
            }
        } catch (error) {
            console.error('❌ NOTIFICATIONS: Erro ao verificar atualizações:', error);
        }
    }

    showWelcomeNotification() {
        if (this.permission === 'granted') {
            console.log('🎉 NOTIFICATIONS: Exibindo boas-vindas');

            new Notification('ELP Relatórios', {
                body: 'Notificações ativadas! Você será avisado sobre obras próximas e novidades.',
                icon: '/static/icons/icon-192x192.png',
                badge: '/static/icons/icon-96x96.png',
                tag: 'welcome'
            });
        }
    }

    showProximityNotification(project) {
        if (this.permission === 'granted') {
            console.log(`📍 NOTIFICATIONS: Exibindo alerta de proximidade: ${project.nome}`);

            new Notification('Obra Próxima Detectada', {
                body: `Você está próximo da obra: ${project.nome}\nDistância: ${Math.round(project.distance)}m`,
                icon: '/static/icons/icon-192x192.png',
                badge: '/static/icons/icon-96x96.png',
                vibrate: [200, 100, 200],
                tag: `proximity-${project.id}`,
                data: { 
                    type: 'proximity', 
                    project_id: project.id,
                    url: `/projects/${project.id}`
                }
            });
        }
    }

    showUpdateNotification(update) {
        if (this.permission === 'granted') {
            console.log(`📢 NOTIFICATIONS: Exibindo atualização: ${update.title}`);

            new Notification(update.title || 'Novidade no App', {
                body: update.message,
                icon: '/static/icons/icon-192x192.png',
                badge: '/static/icons/icon-96x96.png',
                tag: `update-${update.id}`,
                data: { 
                    type: 'update', 
                    update_id: update.id,
                    url: update.url || '/'
                }
            });
        }
    }

    showDeniedInstructions() {
        const instructions = this.getBrowserInstructions();

        this.showUserMessage(
            'Notificações Bloqueadas',
            `<p>As notificações foram bloqueadas anteriormente. Para ativá-las:</p>${instructions}`,
            'warning',
            10000
        );
    }

    getBrowserInstructions() {
        const userAgent = navigator.userAgent.toLowerCase();

        if (userAgent.includes('chrome')) {
            return `
                <ol class="text-start">
                    <li>Clique no ícone <strong>🔒</strong> ao lado da URL</li>
                    <li>Procure por <strong>"Notificações"</strong></li>
                    <li>Altere para <strong>"Permitir"</strong></li>
                    <li>Recarregue a página</li>
                </ol>
            `;
        } else if (userAgent.includes('firefox')) {
            return `
                <ol class="text-start">
                    <li>Clique no ícone <strong>🔒</strong> ao lado da URL</li>
                    <li>Clique em <strong>"Limpar Permissões"</strong></li>
                    <li>Recarregue e permita notificações novamente</li>
                </ol>
            `;
        } else if (userAgent.includes('safari')) {
            return `
                <ol class="text-start">
                    <li>Abra <strong>Preferências do Safari</strong></li>
                    <li>Vá em <strong>"Sites"</strong> → <strong>"Notificações"</strong></li>
                    <li>Encontre este site e altere para <strong>"Permitir"</strong></li>
                </ol>
            `;
        } else {
            return `
                <ol class="text-start">
                    <li>Acesse as configurações do navegador</li>
                    <li>Procure por "Notificações" ou "Permissões"</li>
                    <li>Encontre este site e permita notificações</li>
                    <li>Recarregue a página</li>
                </ol>
            `;
        }
    }

    showUserMessage(title, message, type = 'info', duration = 5000) {
        // Remover mensagens anteriores
        const existing = document.querySelector('.notification-user-message');
        if (existing) existing.remove();

        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show notification-user-message`;
        alertDiv.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 9999;
            min-width: 320px;
            max-width: 450px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `;
        alertDiv.innerHTML = `
            <strong>${title}</strong><br>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        document.body.appendChild(alertDiv);

        if (duration > 0) {
            setTimeout(() => {
                if (alertDiv.parentNode) {
                    alertDiv.remove();
                }
            }, duration);
        }
    }

    // Utilitários
    getVapidPublicKey() {
        return 'BEl62iUYgUivxIkv69yViEuiBIa40HI0staDiGnwSiGcC0K7QkU6g8R6T6I8O2fZllh7Z8i3K8E6NjwL5Q2v0G8';
    }

    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    getCSRFToken() {
        const token = document.querySelector('meta[name="csrf-token"]');
        return token ? token.getAttribute('content') : '';
    }

    // Desativar notificações
    async unsubscribe() {
        try {
            console.log('🔕 NOTIFICATIONS: Desativando notificações...');

            if (this.subscriptionKey) {
                await this.subscriptionKey.unsubscribe();
                console.log('✅ NOTIFICATIONS: Subscription removida');

                // Informar o servidor
                await fetch('/api/notifications/unsubscribe', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.getCSRFToken()
                    }
                });

                this.subscriptionKey = null;
            }

            if (this.watchId && window.geoLocation) {
                window.geoLocation.stopWatching(this.watchId);
                this.watchId = null;
                console.log('✅ NOTIFICATIONS: Monitoramento de localização parado');
            }

            this.showUserMessage(
                'Notificações Desativadas',
                'Você não receberá mais alertas de proximidade e novidades.',
                'info'
            );

            console.log('✅ NOTIFICATIONS: Notificações desativadas completamente');
        } catch (error) {
            console.error('❌ NOTIFICATIONS: Erro ao desativar:', error);
        }
    }
}

// Inicializar gerenciador de notificações
let notificationManager;

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 NOTIFICATIONS: DOM carregado, inicializando...');
    notificationManager = new NotificationManager();

    // Expor globalmente
    window.notificationManager = notificationManager;
    console.log('✅ NOTIFICATIONS: Gerenciador disponível globalmente');
});

// Interface para ativar/desativar notificações
async function toggleNotifications() {
    console.log('🔄 NOTIFICATIONS: Toggle solicitado');

    // Se já está concedido, desativar
    if (notificationManager.permission === 'granted') {
        console.log('🔕 NOTIFICATIONS: Desativando (já concedido)');
        await notificationManager.unsubscribe();
        
        // Atualizar UI
        const toggleBtn = document.getElementById('notification-toggle');
        const toggleText = document.getElementById('toggle-text');
        if (toggleBtn && toggleText) {
            toggleBtn.classList.remove('btn-danger');
            toggleBtn.classList.add('btn-outline-primary');
            toggleText.textContent = 'Ativar';
        }
        
        return false;
    }
    
    // ATIVANDO: Verificações antes de pedir permissões
    console.log('🔔 NOTIFICATIONS: Ativando (não concedido)');
    
    // 1) Verificar se geolocation está disponível
    if (!navigator.geolocation) {
        notificationManager.showUserMessage(
            'Geolocalização Não Disponível',
            'Seu navegador não suporta geolocalização. Use um navegador moderno (Chrome, Firefox, Safari).',
            'danger',
            8000
        );
        return false;
    }
    
    // 2) Verificar se Notification já está DENIED
    if (Notification.permission === 'denied') {
        notificationManager.showUserMessage(
            'Permissão Bloqueada',
            'Você bloqueou as notificações anteriormente. Para ativar: toque no ícone 🔒 na barra de endereço → Permissões → Ative Notificações e Localização → Recarregue a página.',
            'danger',
            10000
        );
        return false;
    }
    
    // 3) 🔥 FIX MOBILE: CHAMADA SÍNCRONA E DIRETA no clique para garantir prompt no Chrome Mobile
    // IMPORTANTE: getCurrentPosition() DEVE ser chamado DIRETAMENTE no clique (sem await/setTimeout antes)
    try {
        navigator.geolocation.getCurrentPosition(
            async function(position) {
                console.info('✅ GEO OK (user gesture):', position.coords);
                
                // 4) Só depois pedir permissão de notificação
                const notifPermission = await Notification.requestPermission();
                console.info('📊 Notification permission:', notifPermission);
                
                if (notifPermission === 'granted') {
                    // Ativar notificações com a posição obtida
                    notificationManager.permission = notifPermission;
                    await notificationManager.setupNotifications();
                    notificationManager.currentPosition = position;
                    
                    notificationManager.showUserMessage(
                        'Notificações Ativadas',
                        'Você receberá alertas quando estiver próximo de obras cadastradas.',
                        'success'
                    );
                    
                    // Atualizar UI
                    const toggleBtn = document.getElementById('notification-toggle');
                    const toggleText = document.getElementById('toggle-text');
                    if (toggleBtn && toggleText) {
                        toggleBtn.classList.remove('btn-outline-primary');
                        toggleBtn.classList.add('btn-danger');
                        toggleText.textContent = 'Desativar';
                    }
                } else {
                    notificationManager.showUserMessage(
                        'Permissão Negada',
                        'Você negou a permissão de notificação. Para ativar: toque no ícone 🔒 na barra de endereço → Permissões → Ative Notificações.',
                        'warning',
                        8000
                    );
                }
            },
            function(error) {
                console.warn('🚫 GEO ERROR:', error);
                
                if (error && error.code === 1) {
                    // PERMISSION_DENIED
                    notificationManager.showUserMessage(
                        'Localização Bloqueada',
                        'Você bloqueou o acesso à localização. Para ativar: toque no ícone 🔒 na barra de endereço → Permissões → Ative Localização → Recarregue e tente novamente.',
                        'danger',
                        10000
                    );
                } else if (error.code === 2) {
                    // POSITION_UNAVAILABLE
                    notificationManager.showUserMessage(
                        'Localização Indisponível',
                        'Não foi possível obter sua localização. Verifique se o GPS está ativado e tente novamente.',
                        'warning',
                        8000
                    );
                } else if (error.code === 3) {
                    // TIMEOUT
                    notificationManager.showUserMessage(
                        'Timeout',
                        'A solicitação de localização demorou muito. Tente novamente.',
                        'warning',
                        5000
                    );
                } else {
                    notificationManager.showUserMessage(
                        'Erro de Localização',
                        'Erro ao obter localização: ' + (error.message || error),
                        'danger'
                    );
                }
            },
            { 
                enableHighAccuracy: true, 
                timeout: 10000, 
                maximumAge: 0  // 🔥 IMPORTANTE: 0 = sem cache, força prompt
            }
        );
    } catch (err) {
        console.error('❌ Erro no click handler geo:', err);
        notificationManager.showUserMessage(
            'Erro',
            'Erro ao solicitar permissões: ' + (err.message || err),
            'danger'
        );
    }
    
    return false;
}