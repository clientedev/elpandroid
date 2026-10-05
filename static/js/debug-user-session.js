/**
 * DEBUG USER SESSION - DESABILITADO POR SEGURANÇA
 * Este script foi desabilitado para evitar exposição de dados sensíveis
 */

function debugUserSession() {
    // DEBUG DESABILITADO - não expor dados de sessão na interface
    console.log('Debug de sessão desabilitado por segurança');
    return;
    
    // Tentar fazer requisição para obter dados do usuário atual
    fetch('/api/current-user', {
        method: 'GET',
        headers: {
            'Cache-Control': 'no-cache'
        }
    })
    .then(response => response.json())
    .then(data => {
        console.log('=== CURRENT USER ===');
        console.log('ID:', data.id);
        console.log('Username:', data.username);
        console.log('Email:', data.email);
        console.log('Is Master:', data.is_master);
    })
    .catch(error => {
        console.error('Erro ao obter usuário atual:', error);
    });
    
    // Verificar contadores de dados
    fetch('/api/user-data-counts', {
        method: 'GET',
        headers: {
            'Cache-Control': 'no-cache'
        }
    })
    .then(response => response.json())
    .then(data => {
        console.log('=== USER DATA COUNTS ===');
        console.log('Projetos:', data.projetos);
        console.log('Relatórios:', data.relatorios);
        console.log('Visitas:', data.visitas);
        console.log('Reembolsos:', data.reembolsos);
    })
    .catch(error => {
        console.error('Erro ao obter contadores:', error);
    });
}

// DEBUG AUTOMÁTICO DESABILITADO
// document.addEventListener('DOMContentLoaded', debugUserSession);

// Debug manual ainda disponível se necessário (mas seguro)
// window.debugUserSession = debugUserSession;