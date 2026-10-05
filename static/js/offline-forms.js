/**
 * offline-forms.js
 * Intercepta envios de formulário quando offline
 */

document.addEventListener('DOMContentLoaded', () => {
    const reportForm = document.getElementById('reportForm');

    if (reportForm) {
        reportForm.addEventListener('submit', async (e) => {
            if (!navigator.onLine) {
                e.preventDefault();
                await handleOfflineSubmit(reportForm);
            }
            // Se online, deixa passar normal
        });
    }
});

async function handleOfflineSubmit(form) {
    try {
        // Mostrar loading
        const btnSubmit = form.querySelector('button[type="submit"]');
        const originalText = btnSubmit.innerHTML;
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-save me-2"></i>Salvando Offline...';

        // 1. Capturar dados do formulário
        const formData = new FormData(form);
        const reportData = {};

        // Converter FormData para objeto simples
        for (const [key, value] of formData.entries()) {
            // Ignorar arquivos no objeto principal, processar separadamente
            if (key !== 'photos' && key !== 'csrf_token') {
                reportData[key] = value;
            }
        }

        // Adicionar ID temporário
        const reportId = crypto.randomUUID();
        reportData.id = reportId;
        reportData.tempOfflineId = true;

        // 2. Salvar Relatório no IndexedDB
        await OfflineDB.saveReport(reportData);

        // 3. Processar e Salvar Fotos
        const photoInput = form.querySelector('input[type="file"][name="photos"]');
        if (photoInput && photoInput.files.length > 0) {
            // IMPORTANTE: O app usa categorias. Se o input tem categoria selecionada...
            // Mas no form.html original, o input é recriado ou limpo.
            // Vamos pegar os arquivos selecionados atualmente.
            // Nota: O script main.js original mantém 'selectedPhotos' globalmente?
            // Vamos verificar se conseguimos acessar a variável global 'selectedPhotos' do main.js
            // Se não, usamos os arquivos do input direto (que seria apenas o último lote uploadado se não fosse custom JS)

            // Melhor abordagem: Ler os arquivos do input atual
            // (Considerando que o usuário pode ter adicionado vários. O main.js gerencia isso?)
            // O form.html usa um input simples para CADA adição? Ou acumula?
            // O form.html mostra "updatePhotoInput" e "selectedPhotos" array global.

            // Tentar acessar array global de fotos se existir
            const photosToSave = window.selectedPhotos || Array.from(photoInput.files);

            for (const file of photosToSave) {
                // file pode ser um objeto File direto ou um objeto customizado do main.js
                // Se for do main.js provavelmente tem .file e .category

                let blob = file;
                let category = 'Geral'; // Default bucket

                if (file.file && file.file instanceof Blob) {
                    blob = file.file;
                    category = file.category || 'Geral';
                }

                await OfflineDB.savePhoto(blob, reportId, category);
            }
        }

        // 4. Adicionar à fila de sincronização
        await OfflineDB.addToSyncQueue({
            type: 'report',
            dataId: reportId,
            description: `Relatório da obra ${reportData.projeto_id}`
        });

        // 5. Feedback e Redirect
        if (typeof showToast === 'function') {
            showToast('Relatório salvo offline! Será enviado quando houver conexão.', 'warning');
        } else {
            alert('Relatório salvo offline! Será enviado quando houver conexão.');
        }

        // Redirecionar para lista (que deve carregar do IDB também se offline?)
        // Por enquanto, redirecionar para home ou lista
        window.location.href = '/reports';

    } catch (error) {
        console.error('Erro ao salvar offline:', error);
        alert('Erro ao salvar localmente: ' + error.message);

        // Restaurar botão
        const btnSubmit = form.querySelector('button[type="submit"]');
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = originalText;
    }
}
