
function collectExpressFormData() {
    return new Promise((resolve) => {
        const form = document.getElementById('expressReportForm');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        // Ensure informacoes_tecnicas is included
        const infoTecnica = document.getElementById('informacoes_tecnicas');
        if (infoTecnica) {
            data.informacoes_tecnicas = infoTecnica.value;
        }

        // Checklist
        const checklist = [];
        document.querySelectorAll('.checklist-item').forEach(item => {
             const checkbox = item.querySelector('input[type="checkbox"]');
             const obs = item.querySelector('textarea');
             const label = item.querySelector('label');
             
             if (checkbox || obs) {
                 checklist.push({
                     item: label ? label.textContent.trim() : (checkbox ? checkbox.id : 'Item'),
                     checked: checkbox ? checkbox.checked : false,
                     observacao: obs ? obs.value : ''
                 });
             }
        });
        data.checklist_data = JSON.stringify(checklist);

        // Acompanhantes
        const acomp = document.getElementById('acompanhantes-data');
        if (acomp) {
            data.acompanhantes = acomp.value;
        }

        // Photos
        const fotos = selectedPhotos.map((p, index) => ({
            id: p.savedId,
            temp_id: p.tempId,
            legenda: p.metadata.legenda,
            local: p.metadata.local,
            manually_added: true,
            ordem: index
        }));
        data.fotos = fotos;

        resolve(data);
    });
}
