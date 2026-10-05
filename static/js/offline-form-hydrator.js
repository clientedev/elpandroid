/**
 * ============================================================
 * OFFLINE FORM HYDRATOR v2.0
 * ============================================================
 * Motor de hidratação offline para o formulário de relatório.
 * Carrega TODOS os dados do projeto a partir do IndexedDB:
 *   - Número do relatório
 *   - Informações técnicas
 *   - Checklist da obra
 *   - Acompanhantes / funcionários
 *   - Categorias das fotos
 *   - Legendas pré-definidas
 *   - Lembrete anterior
 *
 * Também intercepta o submit offline e salva no IndexedDB
 * para sincronização posterior.
 * ============================================================
 */
(function () {
    'use strict';

    const HYDRATOR_VERSION = '2.0';

    // ============================================================
    // Helpers
    // ============================================================
    function log(msg, ...args) {
        console.log(`[Hydrator] ${msg}`, ...args);
    }
    function warn(msg, ...args) {
        console.warn(`[Hydrator] ⚠️ ${msg}`, ...args);
    }
    function err(msg, ...args) {
        console.error(`[Hydrator] ❌ ${msg}`, ...args);
    }

    /**
     * Verifica se o ELPOfflineManager já está pronto
     */
    function waitForOfflineManager(maxWaitMs = 5000) {
        return new Promise((resolve) => {
            if (window.ELPOfflineManager && typeof window.ELPOfflineManager.getProjects === 'function') {
                return resolve(window.ELPOfflineManager);
            }
            const start = Date.now();
            const interval = setInterval(() => {
                if (window.ELPOfflineManager && typeof window.ELPOfflineManager.getProjects === 'function') {
                    clearInterval(interval);
                    resolve(window.ELPOfflineManager);
                } else if (Date.now() - start > maxWaitMs) {
                    clearInterval(interval);
                    warn('ELPOfflineManager não disponível após timeout');
                    resolve(null);
                }
            }, 100);
        });
    }

    /**
     * Obtém o projeto_id da URL
     */
    function getProjetoIdFromURL() {
        return new URLSearchParams(window.location.search).get('projeto_id');
    }

    /**
     * Mostra uma notificação toast discreta
     */
    function showToast(message, type = 'info') {
        const colors = { info: '#0d6efd', success: '#198754', warning: '#ffc107', danger: '#dc3545' };
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: ${colors[type] || colors.info}; color: white; padding: 12px 24px;
            border-radius: 8px; z-index: 99999; font-size: 14px; font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 90vw; text-align: center;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // ============================================================
    // HIDRATAÇÃO DO PROJETO
    // ============================================================
    async function hydratarProjeto(manager, projetoId) {
        if (!projetoId) { warn('Sem projeto_id para hidratar'); return; }

        log(`Buscando projeto ${projetoId} no IndexedDB...`);
        const projetos = await manager.getProjects();
        const projeto = projetos.find(p => String(p.id) === String(projetoId));

        if (!projeto) {
            warn(`Projeto ${projetoId} não encontrado no cache. Sync pode não ter rodado.`);
            return;
        }

        log(`✅ Projeto encontrado: "${projeto.nome}" — Iniciando hidratação completa`);

        // 1. SELECIONAR PROJETO NO SELECT (garante que o select tem a opção)
        const selectEl = document.getElementById('projeto_id');
        if (selectEl) {
            let optionFound = false;
            for (let i = 0; i < selectEl.options.length; i++) {
                if (String(selectEl.options[i].value) === String(projetoId)) {
                    selectEl.selectedIndex = i;
                    optionFound = true;
                    break;
                }
            }
            if (!optionFound) {
                const opt = document.createElement('option');
                opt.value = projetoId;
                opt.textContent = `${projeto.numero || ''} - ${projeto.nome}`;
                opt.selected = true;
                selectEl.appendChild(opt);
            }
            log('✅ Projeto selecionado no dropdown');
        }

        // 2. NÚMERO DO RELATÓRIO
        const numeroInput = document.getElementById('numero');
        if (numeroInput && projeto.next_numero) {
            numeroInput.value = projeto.next_numero;
            numeroInput.readOnly = false;
            log(`✅ Número do relatório: ${projeto.next_numero}`);
        } else {
            warn('Campo #numero não encontrado ou next_numero ausente');
        }

        // 3. INFORMAÇÕES TÉCNICAS
        if (projeto.technical_info && typeof projeto.technical_info === 'object') {
            Object.entries(projeto.technical_info).forEach(([key, value]) => {
                // Tenta encontrar pelo ID ou pelo NAME
                const field = document.getElementById(key) || document.querySelector(`[name="${key}"]`);
                if (field && value) {
                    field.value = value;
                }
            });
            log('✅ Informações técnicas preenchidas');
        }

        // 4. CATEGORIAS DAS FOTOS
        if (projeto.categorias && projeto.categorias.length > 0) {
            window.currentProjectCategorias = projeto.categorias;
            log(`✅ ${projeto.categorias.length} categorias carregadas para fotos`);
            // Preencher dropdowns de categoria já existentes
            document.querySelectorAll('.categoria-select').forEach(sel => {
                const photoId = sel.dataset.photoId || sel.id.replace('category_', '');
                preencherCategoriasSelect(sel, projeto.categorias, photoId);
            });
        }

        // 5. CHECKLIST DA OBRA — apenas itens pendentes (já filtrados no backend)
        if (projeto.checklist_projeto && projeto.checklist_projeto.length > 0) {
            log(`✅ Carregando checklist: ${projeto.checklist_projeto.length} itens pendentes`);
            // Itens recebidos já são somente pendentes (concluido=False no backend)
            const items = projeto.checklist_projeto.map(item => ({
                id: item.id,
                texto: item.texto,
                ordem: item.ordem || 0,
                concluido: false,  // pendente por definição
                checked_in_this_report: false
            }));

            // Renderizar diretamente via função especializada do form
            if (typeof window.carregarChecklist === 'function') {
                window.carregarChecklist(items);
            } else {
                // Renderização manual — fallback robusto
                renderizarChecklistManual(items);
            }

            // Persistir estado global para coleta no submit
            window._checklistItemsData = items.map(i => ({
                id: i.id,
                texto: i.texto,
                concluido: false
            }));
            window._checklistCarregado = true;
        } else {
            log('Projeto sem itens pendentes no checklist');
            // Mostrar mensagem sem itens
            const semItens = document.getElementById('checklistSemItens');
            if (semItens) semItens.classList.remove('d-none');
            const container = document.getElementById('checklistItemsDynamic');
            if (container) container.innerHTML = '';
        }

        // 6. FUNCIONÁRIOS / ACOMPANHANTES
        if (projeto.funcionarios && projeto.funcionarios.length > 0) {
            window._offlineFuncionarios = projeto;
            log(`✅ ${projeto.funcionarios.length} funcionários disponíveis offline`);
            // Preencher o select de funcionários já aberto
            const selectFunc = document.getElementById('funcionario-select');
            if (selectFunc) {
                preencherSelectFuncionarios(selectFunc, projeto);
            }
        }

        // 7. LEMBRETE ANTERIOR
        if (projeto.lembrete_anterior) {
            const card = document.getElementById('lembrete-card');
            const titulo = document.getElementById('lembrete-titulo');
            const texto = document.getElementById('lembrete-texto');
            if (card && titulo && texto) {
                titulo.textContent = `⚠️ Lembrete anterior (${projeto.lembrete_anterior.numero || 'último'}):`;
                texto.textContent = projeto.lembrete_anterior.texto;
                card.style.display = 'block';
                log('✅ Lembrete anterior exibido');
            }
        }

        log('🎉 Hidratação do projeto completa!');
    }

    // ============================================================
    // CHECKLIST PADRÃO (fallback)
    // ============================================================
    async function hydratarChecklistPadrao(manager) {
        try {
            const checklist = await manager.getChecklist ? await manager.getChecklist() : [];
            if (checklist && checklist.length > 0) {
                if (typeof window.carregarChecklist === 'function') {
                    window.carregarChecklist(checklist.map(item => ({
                        ...item,
                        concluido: false,
                        checked: false
                    })));
                    window._checklistItemsData = checklist.map(i => ({ id: i.id, texto: i.texto, concluido: false }));
                    window._checklistCarregado = true;
                    log(`✅ Checklist padrão: ${checklist.length} itens`);
                }
            }
        } catch (e) {
            warn('Erro ao carregar checklist padrão:', e);
        }
    }

    // ============================================================
    // RENDERIZAR CHECKLIST MANUALMENTE
    // ============================================================
    function renderizarChecklistManual(items) {
        // Tentar o container dinâmico primeiro
        const containerDynamic = document.getElementById('checklistItemsDynamic');
        const containerStatic = document.getElementById('checklistItems');
        const container = containerDynamic || containerStatic;

        if (!container) { warn('Container de checklist não encontrado'); return; }

        const semItens = document.getElementById('checklistSemItens');
        if (semItens) semItens.classList.add('d-none');

        const badge = document.getElementById('checklistBadge');
        if (badge) {
            badge.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
            badge.className = 'badge ms-2 bg-primary';
        }

        window._checklistItemsData = [];
        let html = '';
        items.forEach((item, idx) => {
            const itemId = `cl_item_${item.id || idx}`;
            html += `
            <div class="d-flex align-items-start mb-3 p-2 rounded"
                 style="border: 1px solid #dee2e6; background: #fff;"
                 id="cl_row_${item.id || idx}">
                <input class="form-check-input me-3 mt-1 flex-shrink-0"
                       type="checkbox"
                       id="${itemId}"
                       data-item-id="${item.id || idx}"
                       onchange="onChecklistItemChange ? onChecklistItemChange(this, ${item.id || idx}) : null">
                <div class="flex-grow-1">
                    <label class="form-check-label fw-bold" for="${itemId}" style="cursor:pointer;">
                        ${idx + 1}. ${item.texto}
                    </label>
                </div>
            </div>`;
            window._checklistItemsData.push({ id: item.id || idx, texto: item.texto, concluido: false });
        });

        container.innerHTML = html;
        window._checklistCarregado = true;
        log(`✅ Checklist renderizado manualmente: ${items.length} itens`);
    }

    // ============================================================
    // PREENCHER SELECT DE CATEGORIAS DA FOTO
    // ============================================================
    function preencherCategoriasSelect(selectEl, categorias, photoId) {
        if (!selectEl || !categorias) return;
        let html = '<option value="">Sem categoria</option>';
        categorias.forEach(cat => {
            const nome = typeof cat === 'string' ? cat : (cat.nome_categoria || cat.nome || '');
            if (nome) html += `<option value="${nome}">${nome}</option>`;
        });
        selectEl.innerHTML = html;

        // Restaurar seleção anterior se existir
        if (photoId && window.mobilePhotoData) {
            const photoData = window.mobilePhotoData.find(p => String(p.id) === String(photoId) || p.id == photoId);
            if (photoData && photoData.category) selectEl.value = photoData.category;
        }
    }

    // ============================================================
    // PREENCHER SELECT DE FUNCIONÁRIOS
    // ============================================================
    function preencherSelectFuncionarios(selectEl, projeto) {
        const funcionarios = projeto.funcionarios || [];
        const emails = projeto.emails || [];

        if (funcionarios.length === 0) {
            selectEl.innerHTML = '<option value="">Nenhum funcionário cadastrado</option>';
            return;
        }

        let html = '';
        funcionarios.forEach(func => {
            let rawId = func.id;
            if (typeof rawId === 'string') rawId = rawId.replace('fp_', '').replace('ec_', '');
            const emailObj = emails.find(e => String(e.id) === String(rawId) || String(e.id) === String(func.id));
            const email = emailObj ? emailObj.email : '';
            const nome = func.nome_funcionario || 'Sem nome';
            const cargo = func.cargo || '';
            html += `<option value="${rawId}" data-nome="${nome}" data-cargo="${cargo}" data-email="${email}" data-id="${rawId}">${nome}${cargo ? ' – ' + cargo : ''}</option>`;
        });
        selectEl.innerHTML = html;

        if (typeof $ !== 'undefined' && $.fn && $.fn.select2) {
            $(selectEl).trigger('change');
        }
        log(`✅ ${funcionarios.length} funcionários carregados no select`);
    }

    // ============================================================
    // LEGENDAS
    // ============================================================
    async function hydratarLegendas(manager) {
        try {
            const legendas = await manager.getLegendas();
            if (legendas && legendas.length > 0) {
                window.predefinedLegendas = legendas;
                log(`✅ ${legendas.length} legendas carregadas do IDB`);
                if (typeof window.preencherDropdownLegendas === 'function') {
                    window.preencherDropdownLegendas();
                }
            } else {
                warn('Nenhuma legenda encontrada no IDB');
                window.predefinedLegendas = [];
            }
        } catch (e) {
            err('Erro ao carregar legendas:', e);
        }
    }

    // ============================================================
    // INTERCEPTAÇÃO DO SUBMIT OFFLINE
    // ============================================================
    function setupOfflineSubmitInterception(manager) {
        const form = document.getElementById('reportForm');
        if (!form) { warn('Formulário #reportForm não encontrado'); return; }

        form.addEventListener('submit', async function (e) {
            // Só interceptar se REALMENTE estiver offline
            if (navigator.onLine) return;

            log('🛑 Offline detectado no submit, interceptando...');
            e.preventDefault();
            e.stopImmediatePropagation(); // Impedir que o handler online em form_complete.html rode

            showToast('📴 Offline — Salvando relatório no dispositivo...', 'warning');

            try {
                // CRITICAL: Marcar como tratado ANTES de salvar para evitar que a safety net de
                // form_complete.html também salve (duplicando o relatório).
                window._offlineSubmitHandled = true;

                const payload = await coletarPayloadCompleto();
                // CRITICAL: Reutilizar o ID do rascunho se existir, para SOBRESCREVER
                // o rascunho salvo ao adicionar fotos, em vez de criar um duplicado.
                payload.offline_id = window._offlineDraftId || `offline_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                window._offlineDraftId = payload.offline_id; // Manter consistência
                
                payload.created_offline = true;
                payload.created_at = new Date().toISOString();

                // ═══════════════════════════════════════════════════════════════
                // CRITICAL: Se o autosave já criou este relatório no servidor
                // (window.currentReportId), incluir esse ID no payload para que
                // o backend ATUALIZE o relatório existente em vez de criar novo.
                // ═══════════════════════════════════════════════════════════════
                const existingReportId = window.currentReportId
                    || form.getAttribute('data-report-id')
                    || document.querySelector('input[name="edit_report_id"]')?.value;
                if (existingReportId) {
                    payload.relatorio_id = parseInt(existingReportId, 10);
                    log(`📎 Relatório existente detectado (autosave): ID ${payload.relatorio_id} — será atualizado, não duplicado`);
                }

                await manager.savePendingReport(payload);

                log(`💾 Relatório salvo offline com ID: ${payload.offline_id}${existingReportId ? ' (update mode)' : ' (new)'}`);
                showToast('✅ Relatório salvo! Será enviado quando você tiver conexão.', 'success');

                // Redirecionar após 2s com filtros ocultos e ID do projeto
                setTimeout(() => {
                    const projetoId = payload.projeto_id || '';
                    window.location.href = `/reports?projeto_id=${projetoId}&hide_filters=1&offline_saved=1`;
                }, 2200);

            } catch (error) {
                err('Erro ao salvar relatório offline:', error);
                showToast('❌ Erro ao salvar offline. Verifique o console.', 'danger');
            }
        }, true); // capture=true para rodar antes de outros listeners

        log('✅ Interceptação de submit offline configurada');
    }

    // ============================================================
    // COLETA COMPLETA DO PAYLOAD
    // ============================================================
    async function coletarPayloadCompleto() {
        const getValue = (selectors) => {
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el && el.value && el.value.trim() !== '') return el.value.trim();
            }
            return '';
        };

        let projetoId = null;
        // Priorizar o select se ele tiver um valor selecionado
        const selectProj = document.querySelector('select#projeto_id') || document.querySelector('select[name="projeto_id"]');
        if (selectProj && selectProj.value) {
            projetoId = selectProj.value;
        }

        // Se o select não tiver valor, tenta buscar de qualquer input (hidden ou não)
        if (!projetoId) {
            const backup = document.getElementById('projeto_id_backup');
            if (backup && backup.value) {
                projetoId = backup.value;
                log('📍 projeto_id recuperado do backup hidden');
            }
        }

        // Última instância: fallback do window persistido no init
        if (!projetoId && window._currentProjetoId) {
            projetoId = window._currentProjetoId;
            log('📍 projeto_id recuperado do fallback global (URL)');
        }

        if (!projetoId) {
            const anyProj = document.querySelector('#projeto_id') || document.querySelector('[name="projeto_id"]');
            if (anyProj && anyProj.value) {
                projetoId = anyProj.value;
            }
        }

        const titulo = getValue(['#titulo_relatorio', '#titulo', '[name="titulo"]']);
        const numero = getValue(['#numero', '[name="numero"]', '#numero_relatorio']);
        const dataRelatorio = getValue(['#data_relatorio', '[name="data_relatorio"]']);
        const observacoes = getValue(['#observacoes', '[name="observacoes_finais"]', '#observacoes_finais', '#conteudo', '[name="conteudo"]']);
        const lembrete = getValue(['#novo_lembrete_texto', '#novo_lembrete_texto_inferior', '#lembrete_proxima_visita']);
        const categoria = getValue(['#categoria', '[name="categoria"]']);
        const local = getValue(['#local', '[name="local"]']);
        const descricao = getValue(['#descricao', '[name="descricao"]']);
        const conteudo = getValue(['#conteudo', '[name="conteudo"]']);

        // Informações técnicas — coletar por ID direto para funcionar mesmo com collapse fechado
        const TECH_FIELDS = [
            'elementos_construtivos_base',
            'especificacao_chapisco_colante',
            'especificacao_chapisco_alvenaria',
            'especificacao_argamassa_emboco',
            'forma_aplicacao_argamassa',
            'acabamentos_revestimento',
            'acabamento_peitoris',
            'acabamento_muretas',
            'definicao_frisos_cor',
            'definicao_face_inferior_abas',
            'observacoes_projeto_fachada',
            'outras_observacoes'
        ];
        const techInfo = {};
        TECH_FIELDS.forEach(fieldName => {
            const el = document.getElementById(fieldName);
            if (el && el.value && el.value.trim() !== '') {
                techInfo[fieldName] = el.value.trim();
            }
        });
        // Fallback: também tenta coletar por seletor de classe
        document.querySelectorAll('.technical-field').forEach(field => {
            if (field.name && field.value && field.value.trim() && !techInfo[field.name]) {
                techInfo[field.name] = field.value.trim();
            }
        });
        
        console.log('🏗️ Informações técnicas coletadas no hydrator:', techInfo);

        // Checklist - Coleta robusta
        let checklistData = [];
        if (typeof window.getChecklistDataForAutosave === 'function') {
            const dynamic = window.getChecklistDataForAutosave();
            if (dynamic && dynamic.length > 0) checklistData = dynamic;
        }

        // Se não conseguiu via função global, tenta coletar manualmente dos inputs
        if (checklistData.length === 0) {
            const items = document.querySelectorAll('#checklistItemsDynamic .form-check-input, #checklistItems .form-check-input');
            items.forEach(input => {
                const id = input.dataset.itemId || input.id.replace('cl_item_', '');
                const row = input.closest('.d-flex') || input.closest('.checklist-item');
                const obsField = row ? row.querySelector('textarea, input[type="text"]:not(.form-check-input)') : null;
                checklistData.push({
                    id: parseInt(id),
                    concluido: input.checked,
                    observacoes: obsField ? obsField.value : ''
                });
            });
        }

        if (checklistData.length === 0 && window._checklistItemsData) {
            checklistData = window._checklistItemsData;
        }

        // Acompanhantes
        let acompanhantes = [];
        const hiddenField = document.getElementById('acompanhantes-data');
        if (hiddenField && hiddenField.value) {
            try {
                const parsed = JSON.parse(hiddenField.value);
                if (Array.isArray(parsed)) acompanhantes = parsed;
            } catch (e) {
                warn('Erro ao parsear #acompanhantes-data:', e);
            }
        }

        // Se ainda vazio, tenta variável global
        if (acompanhantes.length === 0 && Array.isArray(window.acompanhantes)) {
            acompanhantes = window.acompanhantes;
        }

        // Fotos — com base64 para armazenamento offline
        const fotos = await coletarFotosComBase64();

        const payload = {
            projeto_id: projetoId ? parseInt(projetoId) : null,
            titulo: titulo || `Relatório de Visita`,
            // Não enviar numero pre-preenchido pelo servidor: o backend irá gerar
            // um número sequencial correto no momento do sync.
            numero: null,
            data_relatorio: dataRelatorio,
            categoria: categoria || 'Geral',
            local: local || 'Obra',
            descricao: descricao,
            conteudo: conteudo,
            observacoes_finais: observacoes,
            lembrete_proxima_visita: lembrete || null,
            technical_info: techInfo,
            checklist_data: checklistData,
            acompanhantes: acompanhantes,
            fotos: fotos,
            status: 'preenchimento'
        };

        log('📦 Payload coletado para salvar offline:', {
            projeto_id: payload.projeto_id,
            titulo: payload.titulo,
            numero: payload.numero,
            checklist: checklistData.length,
            acompanhantes: acompanhantes.length,
            fotos: fotos.length
        });

        return payload;
    }

    // ============================================================
    // FOTOS COM BASE64 PARA OFFLINE
    // ============================================================
    async function coletarFotosComBase64() {
        // Usa mobilePhotoData como fonte principal; selectedPhotos (form.html) como fallback
        let imgs = window.mobilePhotoData || [];

        // Fallback: incluir fotos de window.selectedPhotos (form.html) que não estejam em mobilePhotoData
        if (Array.isArray(window.selectedPhotos) && window.selectedPhotos.length > 0) {
            const mobileIds = new Set(imgs.map(i => i.id));
            window.selectedPhotos.forEach(function(sp) {
                if (!mobileIds.has(sp.id)) {
                    imgs.push({
                        id: sp.id,
                        file: sp.file,
                        blob: sp.file,
                        category: sp.category,
                        name: sp.file ? sp.file.name : 'foto.jpg',
                        filename: sp.file ? sp.file.name : 'foto.jpg',
                        previewUrl: sp.originalSrc || null
                    });
                }
            });
        }

        const resultado = [];

        for (const img of imgs) {
            const id = img.id;

            // Tentar ler valores ATUAIS do DOM se os inputs existirem
            const domCategory = document.querySelector(`#category_${id}`);
            const domLocal = document.querySelector(`#local_${id}`);
            // Try both naming conventions used in form_complete.html:
            // Old system: id="predefined_${photoId}"
            // New mobile system: id="predefined_caption_${id}"
            const domManualCaption = document.querySelector(`#manual_caption_${id}`);
            const domPredefinedCaption =
                document.querySelector(`#predefined_caption_${id}`) ||
                document.querySelector(`#predefined_${id}`) ||
                document.querySelector(`[data-photo-id="${id}"] .caption-select`) ||
                document.querySelector(`[data-photo-id="${id}"] select[name^="photo_caption"]`);

            const categoryValue = domCategory ? domCategory.value : (img.category || '');
            const localValue = domLocal ? domLocal.value : (img.local || '');
            // Priority: manual text input > predefined dropdown > stored data properties
            const captionValue = (domManualCaption && domManualCaption.value.trim()) ? domManualCaption.value.trim() :
                ((domPredefinedCaption && domPredefinedCaption.value && domPredefinedCaption.value.trim()) ? domPredefinedCaption.value.trim() :
                    (img.manualCaption || img.predefinedCaption || img.caption || img.metadata?.legenda || ''));

            const entry = {
                id: id,
                savedId: img.savedId || null,
                category: categoryValue || 'Geral',
                local: localValue || '',
                caption: captionValue || '',
                filename: img.name || img.filename || 'foto.jpg',
                previewUrl: img.previewUrl || null,
                isExisting: img.isExisting || false,
                ordem: img.ordem !== undefined ? img.ordem : 0
            };

            // Se tiver blob (nova foto), converter para base64
            if (img.blob || img.file) {
                try {
                    const base64 = await blobToBase64(img.blob || img.file);
                    entry.base64 = base64;
                } catch (e) {
                    warn('Não foi possível converter foto para base64:', e);
                }
            }

            resultado.push(entry);
        }

        return resultado;
    }
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            if (!blob) return resolve(null);
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Erro ao ler blob'));
            reader.readAsDataURL(blob);
        });
    }

    // ============================================================
    // OBSERVER PARA SELECTS CRIADOS DINAMICAMENTE (categorias de foto)
    // ============================================================
    function observarNovasFotos() {
        const photoContainer = document.getElementById('mobilePhotoCards');
        if (!photoContainer) return;

        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    // Preencher selects de categoria nas novas fotos adicionadas
                    node.querySelectorAll('.categoria-select').forEach(sel => {
                        const photoId = sel.dataset.photoId || sel.id.replace('category_', '');
                        if (window.currentProjectCategorias && window.currentProjectCategorias.length > 0) {
                            preencherCategoriasSelect(sel, window.currentProjectCategorias, photoId);
                        }
                    });
                    // Preencher selects de legenda
                    node.querySelectorAll('.caption-select').forEach(() => {
                        if (typeof window.preencherDropdownLegendas === 'function') {
                            window.preencherDropdownLegendas();
                        }
                    });
                });
            });
        });

        observer.observe(photoContainer, { childList: true, subtree: true });
        log('✅ Observer para novas fotos configurado');
    }

    // ============================================================
    // OVERRIDE DAS FUNÇÕES DE BUSCA DEPENDENTES DE REDE
    // ============================================================
    function patchNetworkFunctions(manager, projetoId) {
        // Quando `carregarFuncionariosParaAcompanhantes` for chamada,
        // tentar a rede e, se falhar, usar dados do IDB
        const originalCarregarFunc = window.carregarFuncionariosParaAcompanhantes;
        window.carregarFuncionariosParaAcompanhantes = async function (pid) {
            try {
                if (originalCarregarFunc) return await originalCarregarFunc(pid);
            } catch (e) {
                // Rede falhou — usar IndexedDB
                log('📴 carregarFuncionariosParaAcompanhantes falhou na rede, usando IDB:', e.message);
                const projetos = await manager.getProjects();
                const proj = projetos.find(p => String(p.id) === String(pid));
                const select = document.getElementById('funcionario-select');
                if (proj && select) {
                    preencherSelectFuncionarios(select, proj);
                }
            }
        };

        // Quando `populateCategorySelect` for chamada
        const originalPopulateCategory = window.populateCategorySelect;
        window.populateCategorySelect = async function (photoId) {
            try {
                if (originalPopulateCategory) return await originalPopulateCategory(photoId);
            } catch (e) {
                // Rede falhou — usar cache
                log('📴 populateCategorySelect falhou na rede, usando IDB:', e.message);
                const sel = document.getElementById(`category_${photoId}`);
                if (sel && window.currentProjectCategorias) {
                    preencherCategoriasSelect(sel, window.currentProjectCategorias, photoId);
                }
            }
        };

        log('✅ Funções de rede substituídas por versões offline-aware');
    }

    // ============================================================
    // SYNC AO VOLTAR ONLINE
    // ============================================================
    function setupOnlineSync(manager) {
        window.addEventListener('online', async () => {
            log('🔗 Conexão restaurada — iniciando sincronização de relatórios pendentes...');
            showToast('🔗 Conexão restaurada! Sincronizando relatórios...', 'info');

            try {
                await new Promise(r => setTimeout(r, 3000)); // Aguardar estabilização
                const result = await manager.syncPendingReports();
                if (result && result.synced > 0) {
                    showToast(`✅ ${result.synced} relatório(s) sincronizado(s) com sucesso!`, 'success');
                    log(`✅ ${result.synced} relatório(s) sincronizados`);
                }
            } catch (e) {
                err('Erro ao sincronizar relatórios pendentes:', e);
            }
        });
    }

    // ============================================================
    // ENTRADA PRINCIPAL
    // ============================================================
    async function init() {
        log(`Inicializando versão ${HYDRATOR_VERSION}...`);

        // Aguardar DOM
        await new Promise(resolve => {
            if (document.readyState !== 'loading') return resolve();
            document.addEventListener('DOMContentLoaded', resolve);
        });

        // Verificar se estamos numa página de formulário de relatório
        if (!document.getElementById('reportForm') && !document.getElementById('projeto_id')) {
            log('Não é página de formulário de relatório. Hydrator inativo.');
            return;
        }

        // Aguardar ELPOfflineManager
        const manager = await waitForOfflineManager();
        if (!manager) {
            warn('Hydrator não pode inicialidar: ELPOfflineManager indisponível.');
            return;
        }

        const projetoId = getProjetoIdFromURL();

        // Configurar sync online e intercept de submit
        setupOnlineSync(manager);
        setupOfflineSubmitInterception(manager);
        observarNovasFotos();

        // Carregar legendas (online ou offline)
        if (!navigator.onLine) {
            await hydratarLegendas(manager);
        }

        // Se estiver offline, fazer hidratação completa do projeto
        if (!navigator.onLine && projetoId) {
            log('📴 Modo OFFLINE — Iniciando hidratação completa...');
            patchNetworkFunctions(manager, projetoId);
            await hydratarProjeto(manager, projetoId);
        } else if (navigator.onLine && projetoId) {
            // Online: ainda assim carregar categorias do cache como backup
            try {
                const projetos = await manager.getProjects();
                const projeto = projetos.find(p => String(p.id) === String(projetoId));
                if (projeto && projeto.categorias) {
                    window.currentProjectCategorias = projeto.categorias;
                    log(`✅ [Online] Categorias cacheadas: ${projeto.categorias.length} itens`);
                }
            } catch (e) { /* silencioso */ }

            // Configurar patch mesmo online para quando ficar offline
            patchNetworkFunctions(manager, projetoId);
        }

        // Listener para quando o projeto é trocado no select
        const selectEl = document.getElementById('projeto_id');
        if (selectEl) {
            selectEl.addEventListener('change', async function () {
                const newProjetoId = this.value;
                if (!navigator.onLine && newProjetoId) {
                    log(`🔄 Projeto alterado para ${newProjetoId} — re-hidratando...`);
                    await hydratarProjeto(manager, newProjetoId);
                    await hydratarLegendas(manager);
                }
            });
        }

        log('🏗️ Inicializando OfflineFormHydrator...');

        // Persistir projeto_id da URL como fallback global
        const urlParams = new URLSearchParams(window.location.search);
        const urlProjId = urlParams.get('projeto_id');
        if (urlProjId) {
            window._currentProjetoId = urlProjId;
            log(`📍 Projeto ID da URL persistido: ${urlProjId}`);
        }
        log('✅ Offline Form Hydrator inicializado com sucesso!');
    }

    // Inicializar
    init().catch(e => console.error('[Hydrator] Erro fatal na inicialização:', e));

    // Expor API para debugging
    window.ELPFormHydrator = {
        version: HYDRATOR_VERSION,
        hydratarProjeto,
        hydratarLegendas,
        coletarPayloadCompleto,
        showToast
    };

})();
