// Main JavaScript file for Construction Site Visit Tracking System

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    initializeComponents();
    setupFormValidation();
    setupDateTimeInputs();
    setupPhotoPreview();
    setupLocationServices();
    setupNotifications();
});

// Initialize all components
function initializeComponents() {
    // Initialize tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Initialize popovers
    var popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
    var popoverList = popoverTriggerList.map(function (popoverTriggerEl) {
        return new bootstrap.Popover(popoverTriggerEl);
    });

    // Auto-hide alerts after 5 seconds
    setTimeout(function () {
        const alerts = document.querySelectorAll('.alert-dismissible');
        alerts.forEach(function (alert) {
            if (alert) {
                const bsAlert = new bootstrap.Alert(alert);
                bsAlert.close();
            }
        });
    }, 5000);
}

// Setup form validation
function setupFormValidation() {
    // Custom validation for forms
    const forms = document.querySelectorAll('.needs-validation');

    Array.prototype.slice.call(forms).forEach(function (form) {
        form.addEventListener('submit', function (event) {
            if (!form.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
            }
            form.classList.add('was-validated');
        }, false);
    });

    // Email validation
    const emailInputs = document.querySelectorAll('input[type="email"]');
    emailInputs.forEach(function (input) {
        input.addEventListener('blur', function () {
            validateEmail(this);
        });
    });

    // Phone validation (Brazilian format)
    const phoneInputs = document.querySelectorAll('input[name="telefone"]');
    phoneInputs.forEach(function (input) {
        input.addEventListener('input', function () {
            formatPhoneNumber(this);
        });
    });
}

// Setup date and time inputs
function setupDateTimeInputs() {
    // Set minimum date to today for future dates
    const futureDateInputs = document.querySelectorAll('input[type="date"]:not(.allow-past)');
    const today = new Date().toISOString().split('T')[0];

    futureDateInputs.forEach(function (input) {
        if (!input.value) {
            input.min = today;
        }
    });

    // Função auxiliar para formatar data no horário local
    function formatarDataLocal(date) {
        const ano = date.getFullYear();
        const mes = String(date.getMonth() + 1).padStart(2, '0');
        const dia = String(date.getDate()).padStart(2, '0');
        const hora = String(date.getHours()).padStart(2, '0');
        const minuto = String(date.getMinutes()).padStart(2, '0');
        return `${ano}-${mes}-${dia}T${hora}:${minuto}`;
    }

    // Set default datetime for visit scheduling
    const datetimeInputs = document.querySelectorAll('input[type="datetime-local"]');
    datetimeInputs.forEach(function (input) {
        // Não sobrescrever se já tem valor ou se está em formulário de visitas
        // (o formulário de visitas tem seu próprio controle)
        if (!input.value && !input.closest('form[action*="visit"]')) {
            const now = new Date();
            now.setMinutes(0); // Round to the hour
            now.setSeconds(0);
            now.setMilliseconds(0);

            const horarioLocal = formatarDataLocal(now);
            input.value = horarioLocal;
            input.min = horarioLocal;
        }
    });
}

// Setup photo preview functionality
function setupPhotoPreview() {
    const photoInputs = document.querySelectorAll('input[type="file"][accept*="image"]');

    photoInputs.forEach(function (input) {
        input.addEventListener('change', function () {
            previewImage(this);
        });
    });
}

// Setup location services
function setupLocationServices() {
    const getLocationBtns = document.querySelectorAll('#getLocationBtn');

    getLocationBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            getCurrentLocation(this);
        });
    });
}

// Setup notification system
function setupNotifications() {
    // Check for notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// Utility functions

// Email validation
function validateEmail(input) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(input.value);

    if (input.value && !isValid) {
        input.classList.add('is-invalid');
        showFieldError(input, 'Por favor, insira um email válido.');
    } else {
        input.classList.remove('is-invalid');
        hideFieldError(input);
    }
}

// Format phone number (Brazilian format)
function formatPhoneNumber(input) {
    let value = input.value.replace(/\D/g, '');

    if (value.length >= 11) {
        value = value.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (value.length >= 10) {
        value = value.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    } else if (value.length >= 6) {
        value = value.replace(/(\d{2})(\d{4})(\d*)/, '($1) $2-$3');
    } else if (value.length >= 2) {
        value = value.replace(/(\d{2})(\d*)/, '($1) $2');
    }

    input.value = value;
}

// Preview uploaded image
function previewImage(input) {
    const file = input.files[0];
    if (!file) return;

    // Sem limite individual de arquivo - apenas limite total do relatório (3GB)

    // Validate file type
    if (!file.type.startsWith('image/')) {
        showAlert('Erro: Por favor, selecione apenas arquivos de imagem.', 'danger');
        input.value = '';
        return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = function (e) {
        let preview = document.getElementById('imagePreview');

        if (!preview) {
            preview = document.createElement('div');
            preview.id = 'imagePreview';
            preview.className = 'mt-3';
            input.parentNode.appendChild(preview);
        }

        preview.innerHTML = `
            <div class="card" style="max-width: 300px;">
                <img src="${e.target.result}" class="card-img-top" alt="Preview">
                <div class="card-body p-2">
                    <small class="text-muted">
                        <i class="fas fa-file-image me-1"></i>
                        ${file.name} (${formatFileSize(file.size)})
                    </small>
                </div>
            </div>
        `;
    };

    reader.readAsDataURL(file);
}

// Get current location using GPS com sistema avançado
async function getCurrentLocation(button) {
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Obtendo localização...';
    button.disabled = true;

    try {
        // Usar o sistema de geolocalização avançado (com fallback automático para IP)
        const position = await window.geoLocation.getLocation({
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
            showUI: true,
            fallbackToIP: true,
            reverseGeocode: true
        });

        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy || 5000;

        // Preencher campos do formulário
        const latInput = document.querySelector('input[name="latitude"]');
        const lngInput = document.querySelector('input[name="longitude"]');
        const addressInput = document.querySelector('input[name="endereco_gps"]');

        if (latInput) latInput.value = lat;
        if (lngInput) lngInput.value = lng;

        if (addressInput) {
            if (position.address) {
                // Se temos endereço completo do reverse geocoding
                addressInput.value = position.address;
            } else if (position.source === 'ip') {
                // Se veio do IP
                addressInput.value = `📍 Localização aproximada por IP: ${position.address || `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`}`;
            } else {
                // GPS sem reverse geocoding
                addressInput.value = `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)} (±${Math.round(accuracy)}m)`;
            }
        }

        // Mostrar sucesso
        button.innerHTML = '<i class="fas fa-check me-1"></i>Localização Obtida';
        button.classList.remove('btn-outline-primary', 'btn-warning');
        button.classList.add('btn-success');

        // Indicar se foi usado fallback
        if (position.source === 'ip') {
            showAlert('📍 Localização aproximada obtida por IP (GPS não disponível)', 'warning');
        } else {
            showAlert('✅ Localização GPS obtida com precisão de ±' + Math.round(accuracy) + 'm', 'success');
        }

    } catch (error) {
        console.error('❌ Erro ao obter localização:', error);

        // Restaurar botão
        button.innerHTML = '<i class="fas fa-map-marker-alt me-1"></i>Tentar Novamente';
        button.disabled = false;
        button.classList.remove('btn-outline-primary', 'btn-success');
        button.classList.add('btn-warning');

        showAlert('❌ Não foi possível obter localização: ' + error.message, 'danger');
    }
}

// Reverse geocoding using backend proxy
// Função para mostrar instruções sobre como habilitar localização
function showLocationInstructions() {
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    let instructions = '';

    if (isAndroid) {
        instructions = `
            <strong>📱 Para habilitar localização no Android:</strong><br>
            1. Toque no ícone de cadeado/informações na barra de endereço<br>
            2. Selecione "Localização" → "Permitir"<br>
            3. Ou vá em Configurações → Apps → Navegador → Permissões → Localização
        `;
    } else if (isIOS) {
        instructions = `
            <strong>📱 Para habilitar localização no iOS:</strong><br>
            1. Vá em Configurações → Privacidade → Serviços de Localização<br>
            2. Ative "Serviços de Localização"<br>
            3. Role para baixo até seu navegador (Safari/Chrome) e ative
        `;
    } else {
        instructions = `
            <strong>💻 Para habilitar localização:</strong><br>
            1. Clique no ícone de localização na barra de endereço<br>
            2. Selecione "Sempre permitir"<br>
            3. Recarregue a página
        `;
    }

    return instructions;
}

// Função melhorada para tratar erros de geolocalização
function handleGeolocationError(error, buttonElement) {
    let errorMessage = '';
    let instructions = '';

    switch (error.code) {
        case error.PERMISSION_DENIED:
            errorMessage = '🚫 Permissão de localização negada';
            instructions = showLocationInstructions();
            break;
        case error.POSITION_UNAVAILABLE:
            errorMessage = '📍 Localização indisponível';
            instructions = 'Verifique se o GPS está ativado e tente novamente.';
            break;
        case error.TIMEOUT:
            errorMessage = '⏰ Tempo limite para obter localização';
            instructions = 'Tente novamente em alguns segundos.';
            break;
        default:
            errorMessage = '❌ Erro desconhecido de localização';
            instructions = 'Verifique as configurações do seu dispositivo.';
            break;
    }

    // Mostrar modal com instruções
    const modal = document.createElement('div');
    modal.className = 'modal fade show';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">${errorMessage}</h5>
                    <button type="button" class="btn-close" onclick="this.closest('.modal').remove()"></button>
                </div>
                <div class="modal-body">
                    <p>${instructions}</p>
                    <div class="alert alert-info">
                        <strong>💡 Dica:</strong> Após alterar as configurações, recarregue a página e tente novamente.
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Entendi</button>
                    <button type="button" class="btn btn-primary" onclick="window.location.reload()">Recarregar Página</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Restaurar botão se fornecido
    if (buttonElement) {
        buttonElement.innerHTML = '<i class="fas fa-map-marker-alt"></i> Tentar Novamente';
        buttonElement.disabled = false;
        buttonElement.className = 'btn btn-outline-warning';
    }
}

function reverseGeocode(lat, lng, addressInput) {
    if (!addressInput) return;

    fetch('/api/reverse-geocoding', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': document.querySelector('meta[name=csrf-token]')?.getAttribute('content') || ''
        },
        body: JSON.stringify({
            latitude: lat,
            longitude: lng
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.endereco) {
                addressInput.value = data.endereco;
                console.log('Endereço obtido:', data.endereco);
            } else {
                console.log('Não foi possível obter endereço, mantendo coordenadas');
            }
        })
        .catch(error => {
            console.log('Erro no reverse geocoding:', error);
        });
}

// Show alert message
function showAlert(message, type = 'info') {
    const alertContainer = document.createElement('div');
    alertContainer.className = `alert alert-${type} alert-dismissible fade show`;
    alertContainer.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    // Insert at the top of the main container
    const mainContainer = document.querySelector('main.container');
    if (mainContainer) {
        mainContainer.insertBefore(alertContainer, mainContainer.firstChild);
    }

    // Auto-remove after 5 seconds
    setTimeout(function () {
        if (alertContainer.parentNode) {
            alertContainer.remove();
        }
    }, 5000);
}

// Show field error
function showFieldError(input, message) {
    let errorDiv = input.parentNode.querySelector('.invalid-feedback');

    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.className = 'invalid-feedback';
        input.parentNode.appendChild(errorDiv);
    }

    errorDiv.textContent = message;
}

// Hide field error
function hideFieldError(input) {
    const errorDiv = input.parentNode.querySelector('.invalid-feedback');
    if (errorDiv) {
        errorDiv.remove();
    }
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Currency formatting
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

// Date formatting
function formatDate(date) {
    return new Intl.DateTimeFormat('pt-BR').format(new Date(date));
}

// DateTime formatting
function formatDateTime(date) {
    return new Intl.DateTimeFormat('pt-BR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(date));
}

// Confirm deletion
function confirmDelete(message = 'Tem certeza que deseja excluir este item?') {
    return confirm(message);
}

// Show loading state
function showLoading(element) {
    const originalContent = element.innerHTML;
    element.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Carregando...';
    element.disabled = true;
    return originalContent;
}

// Hide loading state
function hideLoading(element, originalContent) {
    element.innerHTML = originalContent;
    element.disabled = false;
}

// Copy to clipboard
function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
            showAlert('Copiado para a área de transferência!', 'success');
        });
    } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showAlert('Copiado para a área de transferência!', 'success');
    }
}

// Check network status
function checkNetworkStatus() {
    if (!navigator.onLine) {
        showAlert('Você está offline. Algumas funcionalidades podem não estar disponíveis.', 'warning');
    }
}

// Initialize network status check
window.addEventListener('online', function () {
    // Removido popup de "Conexão restabelecida" - era muito intrusivo
    // showAlert('Conexão restabelecida!', 'success');
});

window.addEventListener('offline', function () {
    showAlert('Você está offline!', 'warning');
});

// Localizar Obras Próximas
async function localizarObrasProximas() {
    console.log('🔍 Iniciando busca de obras próximas...');

    // Verificar se geolocalização está disponível
    if (!navigator.geolocation) {
        showAlert('Seu dispositivo não suporta geolocalização.', 'warning');
        return;
    }

    const btnLocalizar = document.getElementById('btnLocalizarObras');
    const originalContent = btnLocalizar ? showLoading(btnLocalizar) : null;

    try {
        // Obter localização do usuário com configurações otimizadas
        console.log('🔍 Solicitando permissão de localização...');

        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    console.log('✅ Coordenadas capturadas:', pos.coords.latitude, pos.coords.longitude);
                    resolve(pos);
                },
                (err) => {
                    console.error('❌ Erro de geolocalização:', err);
                    reject(err);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        });

        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        console.log(`📍 Coordenadas capturadas: lat=${latitude}, lng=${longitude}`);

        // Fazer requisição para API
        const response = await fetch('/api/projects/nearby', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ latitude, longitude })
        });

        if (!response.ok) {
            const errorMsg = await response.text();
            console.error('❌ Erro no nearby API:', errorMsg);
            throw new Error(`Erro ao buscar obras próximas: ${errorMsg}`);
        }

        const data = await response.json();
        console.log("✅ Obras próximas recebidas:", data);

        // Renderizar resultados - API retorna data.nearby
        renderizarObrasProximas(data.nearby || []);

        // Esconder loading
        if (btnLocalizar && originalContent) {
            hideLoading(btnLocalizar, originalContent);
        }

    } catch (error) {
        console.error('❌ Erro ao buscar obras próximas:', error);

        // Tratamento específico de erros de geolocalização
        if (error.code === 1) {
            showAlert('Permissão de localização negada. Habilite para usar esta função.', 'warning');
        } else if (error.code === 2) {
            showAlert('Não foi possível capturar sua localização. Tente novamente.', 'warning');
        } else if (error.code === 3) {
            showAlert('Tempo esgotado ao tentar obter localização. Tente novamente.', 'warning');
        } else if (error.message && error.message.includes('API')) {
            showAlert(error.message, 'danger');
        } else {
            showAlert('Erro de comunicação com o servidor.', 'danger');
        }

        // Esconder loading em caso de erro
        if (btnLocalizar && originalContent) {
            hideLoading(btnLocalizar, originalContent);
        }
    }
}

// Renderizar obras próximas
function renderizarObrasProximas(obras) {
    console.log(`🏗️ Renderizando ${obras.length} obra(s) próxima(s)`);

    const container = document.getElementById('obrasProximasContainer');

    if (!container) {
        console.warn('⚠️ Container de obras próximas não encontrado');

        // Mostrar em alerta se não houver container
        if (obras.length === 0) {
            showAlert('Nenhuma obra encontrada em um raio de 10km', 'info');
        } else {
            const listaObras = obras.map(o =>
                `${o.nome} (${o.distancia}km)`
            ).join(', ');
            showAlert(`${obras.length} obra(s) próxima(s): ${listaObras}`, 'success');
        }
        return;
    }

    // Limpar container
    container.innerHTML = '';

    if (obras.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-info-circle me-2"></i>
                Nenhuma obra encontrada em um raio de 10km
            </div>
        `;
        return;
    }

    // Renderizar lista de obras
    container.innerHTML = `
        <div class="alert alert-success mb-3">
            <i class="fas fa-check-circle me-2"></i>
            ${obras.length} obra(s) encontrada(s) próxima(s)
        </div>
        <div class="list-group">
            ${obras.map(obra => `
                <a href="/projects/${obra.id}" class="list-group-item list-group-item-action">
                    <div class="d-flex w-100 justify-content-between align-items-center">
                        <div>
                            <h5 class="mb-1">
                                <i class="fas fa-building me-2 text-primary"></i>
                                ${obra.nome}
                            </h5>
                            <p class="mb-1 text-muted">
                                <i class="fas fa-map-marker-alt me-1"></i>
                                ${obra.endereco}
                            </p>
                        </div>
                        <span class="badge bg-primary rounded-pill">
                            ${obra.distancia} km
                        </span>
                    </div>
                </a>
            `).join('')}
        </div>
    `;
}

// Carregar funcionários e e-mails de um projeto
async function carregarFuncionariosEmails(eventOrId) {
    let projetoId;

    // Extrair projetoId do evento ou usar diretamente
    if (typeof eventOrId === 'object' && eventOrId && eventOrId.target) {
        projetoId = parseInt(eventOrId.target.value);
    } else if (typeof eventOrId === 'number') {
        projetoId = eventOrId;
    } else if (typeof eventOrId === 'string') {
        projetoId = parseInt(eventOrId);
    } else if (!eventOrId) {
        const projetoHidden = document.querySelector('input[name="projeto_id"][type="hidden"]');
        if (projetoHidden && projetoHidden.value) {
            projetoId = parseInt(projetoHidden.value);
        } else {
            const projetoSelect = document.getElementById('projeto_id');
            if (projetoSelect && projetoSelect.value) {
                projetoId = parseInt(projetoSelect.value);
            }
        }
    }

    if (!projetoId || isNaN(projetoId)) {
        console.log('⚠️ Projeto não selecionado');
        return;
    }

    console.log('🔄 Carregando funcionários/e-mails para projeto:', projetoId);

    // Buscar elementos DOM com IDs corretos
    const funcionariosDiv = document.getElementById('funcionarios-projeto');
    const emailsDiv = document.getElementById('emails-projeto');

    if (!funcionariosDiv || !emailsDiv) {
        console.log('⚠️ Elementos DOM não encontrados');
        return;
    }

    // Mostrar loading
    funcionariosDiv.innerHTML = '<div class="alert alert-info mb-0"><i class="fas fa-spinner fa-spin me-2"></i>Carregando funcionários...</div>';
    emailsDiv.innerHTML = '<div class="alert alert-info mb-0"><i class="fas fa-spinner fa-spin me-2"></i>Carregando e-mails...</div>';

    try {
        const response = await fetch(`/api/projeto/${projetoId}/funcionarios-emails`, {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (response.redirected || !response.headers.get('content-type')?.includes('application/json')) {
            throw new Error('Sessão expirada - faça login novamente');
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            // Renderizar funcionários como checkboxes
            let funcionariosHtml = '';
            if (data.funcionarios && data.funcionarios.length > 0) {
                data.funcionarios.forEach(func => {
                    const checked = func.is_responsavel_principal ? 'checked' : '';
                    funcionariosHtml += `
                        <div class="form-check mb-2">
                            <input class="form-check-input" type="checkbox" id="func_${func.id}" 
                                   name="funcionarios_selecionados[]" value="${func.id}" ${checked}>
                            <label class="form-check-label" for="func_${func.id}">
                                <strong>${func.nome_funcionario || 'Sem nome'}</strong><br>
                                <small class="text-muted">${func.cargo || 'Não informado'} - ${func.empresa || 'Não informado'}</small>
                                ${func.is_responsavel_principal ? '<span class="badge bg-primary ms-2">Principal</span>' : ''}
                            </label>
                        </div>
                    `;
                });
            } else {
                funcionariosHtml = '<div class="alert alert-info mb-0"><i class="fas fa-info-circle me-2"></i>Nenhum funcionário cadastrado para este projeto</div>';
            }
            funcionariosDiv.innerHTML = funcionariosHtml;

            // Renderizar e-mails como checkboxes
            let emailsHtml = '';
            if (data.emails && data.emails.length > 0) {
                data.emails.forEach(email => {
                    const checked = email.is_principal ? 'checked' : '';
                    emailsHtml += `
                        <div class="form-check mb-2">
                            <input class="form-check-input" type="checkbox" id="email_${email.id}" 
                                   name="emails_selecionados[]" value="${email.id}" ${checked}>
                            <label class="form-check-label" for="email_${email.id}">
                                <strong>${email.email || 'Sem email'}</strong><br>
                                <small class="text-muted">${email.nome_contato || 'Sem nome'} - ${email.cargo || 'Não informado'}</small>
                                ${email.is_principal ? '<span class="badge bg-success ms-2">Principal</span>' : ''}
                            </label>
                        </div>
                    `;
                });
            } else {
                emailsHtml = '<div class="alert alert-info mb-0"><i class="fas fa-info-circle me-2"></i>Nenhum e-mail cadastrado para este projeto</div>';
            }
            emailsDiv.innerHTML = emailsHtml;

            console.log(`✅ Carregados ${data.funcionarios.length} funcionários e ${data.emails.length} e-mails`);
        } else {
            throw new Error(data.error || 'Erro ao carregar dados');
        }

    } catch (error) {
        console.error('❌ Erro ao carregar funcionários/e-mails:', error);
        funcionariosDiv.innerHTML = `<div class="alert alert-danger mb-0"><i class="fas fa-exclamation-triangle me-2"></i>Erro: ${error.message}</div>`;
        emailsDiv.innerHTML = `<div class="alert alert-danger mb-0"><i class="fas fa-exclamation-triangle me-2"></i>Erro: ${error.message}</div>`;
    }
}

// Export functions for global use
window.ConstructionApp = {
    showAlert,
    formatCurrency,
    formatDate,
    formatDateTime,
    confirmDelete,
    showLoading,
    hideLoading,
    copyToClipboard,
    getCurrentLocation,
    localizarObrasProximas,
    renderizarObrasProximas,
    carregarFuncionariosEmails
};

// Tornar função disponível globalmente
window.carregarFuncionariosEmails = carregarFuncionariosEmails;
