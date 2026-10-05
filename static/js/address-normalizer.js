/**
 * Sistema de Normalização Inteligente de Endereços
 * Converte abreviações comuns em formas completas para melhorar geocoding
 */

class AddressNormalizer {
    constructor() {
        // Dicionário de substituições configurável
        this.rules = {
            // Logradouros
            'R ': 'Rua ',
            'R.': 'Rua',
            'Av ': 'Avenida ',
            'Av.': 'Avenida',
            'Pç ': 'Praça ',
            'Pça ': 'Praça ',
            'Pç.': 'Praça',
            'Pça.': 'Praça',
            'Rod.': 'Rodovia',
            'Estr.': 'Estrada',
            'Al.': 'Alameda',
            'Tv.': 'Travessa',
            'Vl.': 'Vila',
            'Jd.': 'Jardim',
            'Pq.': 'Parque',
            'Cj.': 'Conjunto',
            'Res.': 'Residencial',
            'Bl.': 'Bloco',
            'Qt.': 'Quadra',
            'Lt.': 'Lote',
            
            // Números ordinais comuns
            ' 1o ': ' Primeiro ',
            ' 2o ': ' Segundo ',
            ' 3o ': ' Terceiro ',
            ' 1a ': ' Primeira ',
            ' 2a ': ' Segunda ',
            ' 3a ': ' Terceira ',
            
            // Abreviações de estados
            ' SP': ' São Paulo',
            ' RJ': ' Rio de Janeiro', 
            ' MG': ' Minas Gerais',
            ' RS': ' Rio Grande do Sul',
            ' PR': ' Paraná',
            ' SC': ' Santa Catarina',
            ' BA': ' Bahia',
            ' GO': ' Goiás',
            ' DF': ' Distrito Federal',
            ' ES': ' Espírito Santo',
            ' MT': ' Mato Grosso',
            ' MS': ' Mato Grosso do Sul',
            ' PE': ' Pernambuco',
            ' CE': ' Ceará',
            ' PB': ' Paraíba',
            ' RN': ' Rio Grande do Norte',
            ' AL': ' Alagoas',
            ' SE': ' Sergipe',
            ' PI': ' Piauí',
            ' MA': ' Maranhão',
            ' TO': ' Tocantins',
            ' PA': ' Pará',
            ' AM': ' Amazonas',
            ' RR': ' Roraima',
            ' AP': ' Amapá',
            ' AC': ' Acre',
            ' RO': ' Rondônia',
            
            // Outras abreviações comuns
            'Cep': 'CEP',
            ' N ': ' Norte ',
            ' S ': ' Sul ',
            ' L ': ' Leste ',
            ' O ': ' Oeste ',
            ' Centro': ' Centro',
            ' Ctr': ' Centro'
        };
    }

    /**
     * Normaliza um endereço aplicando todas as regras de substituição
     * @param {string} address - Endereço original
     * @returns {string} - Endereço normalizado
     */
    normalize(address) {
        if (!address || typeof address !== 'string') {
            return address;
        }

        let normalizedAddress = address.trim();
        const originalAddress = normalizedAddress;

        // Aplicar todas as regras de substituição
        for (const [abbreviation, fullForm] of Object.entries(this.rules)) {
            // Usar regex para substituições mais precisas
            if (abbreviation.endsWith(' ')) {
                // Para abreviações que terminam com espaço, garantir que seja início de palavra
                const regex = new RegExp(`\\b${this.escapeRegex(abbreviation)}`, 'gi');
                normalizedAddress = normalizedAddress.replace(regex, fullForm);
            } else if (abbreviation.startsWith(' ')) {
                // Para abreviações que começam com espaço, garantir que seja final de palavra
                const regex = new RegExp(`${this.escapeRegex(abbreviation)}\\b`, 'gi');
                normalizedAddress = normalizedAddress.replace(regex, fullForm);
            } else {
                // Para abreviações sem espaços, usar substituição direta
                const regex = new RegExp(`\\b${this.escapeRegex(abbreviation)}\\b`, 'gi');
                normalizedAddress = normalizedAddress.replace(regex, fullForm);
            }
        }

        // Limpar espaços duplos
        normalizedAddress = normalizedAddress.replace(/\s+/g, ' ').trim();

        // Aplicar correções adicionais
        normalizedAddress = this.applyAdditionalCorrections(normalizedAddress);

        // Log da transformação se houve mudança
        if (originalAddress !== normalizedAddress) {
            console.log(`📍 ENDEREÇO NORMALIZADO: "${originalAddress}" → "${normalizedAddress}"`);
        }

        return normalizedAddress;
    }

    /**
     * Escapa caracteres especiais para uso em regex
     * @param {string} string - String para escapar
     * @returns {string} - String escapada
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Aplica correções adicionais ao endereço normalizado
     * @param {string} address - Endereço para corrigir
     * @returns {string} - Endereço corrigido
     */
    applyAdditionalCorrections(address) {
        let corrected = address;

        // Corrigir "Rua de" para "Rua"
        corrected = corrected.replace(/\bRua de\b/gi, 'Rua');
        
        // Corrigir espaçamento após vírgulas
        corrected = corrected.replace(/,(\S)/g, ', $1');
        
        // Corrigir números de endereço (ex: "Rua X,123" → "Rua X, 123")
        corrected = corrected.replace(/([A-Za-z]),(\d)/g, '$1, $2');
        
        // Capitalizar primeira letra de cada palavra importante
        corrected = this.capitalizeImportantWords(corrected);

        return corrected;
    }

    /**
     * Capitaliza palavras importantes no endereço
     * @param {string} address - Endereço para capitalizar
     * @returns {string} - Endereço capitalizado
     */
    capitalizeImportantWords(address) {
        const prepositions = ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'para', 'por', 'com'];
        
        return address.replace(/\b\w+\b/g, function(word) {
            // Não capitalizar preposições (exceto se for a primeira palavra)
            if (prepositions.includes(word.toLowerCase()) && word !== address.split(' ')[0]) {
                return word.toLowerCase();
            }
            // Capitalizar primeira letra
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        });
    }

    /**
     * Adiciona uma nova regra de normalização
     * @param {string} abbreviation - Abreviação
     * @param {string} fullForm - Forma completa
     */
    addRule(abbreviation, fullForm) {
        this.rules[abbreviation] = fullForm;
        console.log(`📍 Nova regra adicionada: "${abbreviation}" → "${fullForm}"`);
    }

    /**
     * Remove uma regra de normalização
     * @param {string} abbreviation - Abreviação para remover
     */
    removeRule(abbreviation) {
        if (this.rules[abbreviation]) {
            delete this.rules[abbreviation];
            console.log(`📍 Regra removida: "${abbreviation}"`);
        }
    }

    /**
     * Lista todas as regras ativas
     * @returns {Object} - Objeto com todas as regras
     */
    listRules() {
        return { ...this.rules };
    }
}

// Criar instância global do normalizador
window.addressNormalizer = new AddressNormalizer();

// Função de conveniência para normalizar endereços
window.normalizeAddress = function(address) {
    return window.addressNormalizer.normalize(address);
};

// Exportar para uso como módulo se necessário
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AddressNormalizer;
}