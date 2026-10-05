"""
Gerador de PDF usando WeasyPrint para replicar exatamente o modelo Artesano
"""

import os
import json
from datetime import datetime
import pytz
from jinja2 import Template
from flask import current_app

# Try to import WeasyPrint with graceful fallback
try:
    from weasyprint import HTML, CSS
    WEASYPRINT_AVAILABLE = True
except ImportError as e:
    print(f"⚠️  WeasyPrint não disponível: {e}")
    print("🔄 Sistema funcionará com ReportLab como fallback")
    WEASYPRINT_AVAILABLE = False
    HTML = None
    CSS = None

class WeasyPrintReportGenerator:
    def __init__(self):
        self.template_html = self._create_html_template()
        self.template_css = self._create_css_styles()
    
    def generate_report_pdf(self, relatorio, fotos=None, output_path=None):
        """
        Gera PDF do relatório usando WeasyPrint
        
        Args:
            relatorio: Objeto do relatório com dados
            fotos: Lista de fotos do relatório
            output_path: Caminho para salvar o arquivo (opcional)
            
        Returns:
            bytes ou caminho do arquivo gerado
        """
        if not WEASYPRINT_AVAILABLE:
            # Fallback para ReportLab se WeasyPrint não estiver disponível
            try:
                from pdf_generator import ReportGenerator
                reportlab_generator = ReportGenerator()
                return reportlab_generator.generate_report_pdf(relatorio, fotos, output_path)
            except Exception as e:
                raise Exception(f"Erro: WeasyPrint não disponível e falha no fallback ReportLab: {str(e)}")
        
        try:
            # Preparar dados para o template
            data = self._prepare_report_data(relatorio, fotos)
            
            # Renderizar HTML com os dados
            template = Template(self.template_html)
            html_content = template.render(data=data)
            
            # Gerar PDF
            html_doc = HTML(string=html_content)
            css_doc = CSS(string=self.template_css)
            
            if output_path:
                html_doc.write_pdf(output_path, stylesheets=[css_doc])
                return output_path
            else:
                pdf_bytes = html_doc.write_pdf(stylesheets=[css_doc])
                return pdf_bytes
                
        except Exception as e:
            # Fallback para ReportLab se WeasyPrint falhar
            try:
                print(f"⚠️  WeasyPrint falhou: {e}")
                print("🔄 Tentando fallback para ReportLab...")
                from pdf_generator import ReportGenerator
                reportlab_generator = ReportGenerator()
                return reportlab_generator.generate_report_pdf(relatorio, fotos, output_path)
            except Exception as fallback_error:
                raise Exception(f"Erro ao gerar PDF - WeasyPrint: {str(e)} | ReportLab: {str(fallback_error)}")
    
    def _prepare_report_data(self, relatorio, fotos):
        """Preparar dados do relatório para o template"""
        projeto = relatorio.projeto
        
        # Carregar logo em base64
        logo_base64 = ""
        try:
            logo_path = os.path.join('static', 'logo_elp_new.jpg')
            if os.path.exists(logo_path):
                import base64
                with open(logo_path, 'rb') as f:
                    logo_base64 = base64.b64encode(f.read()).decode('utf-8')
        except Exception as e:
            print(f"Erro ao carregar logo: {e}")
        
        # Dados básicos - CHECKLIST REMOVIDO
        observacoes_filtradas = None
        if hasattr(relatorio, 'conteudo') and relatorio.conteudo:
            # Filtrar conteúdo para remover checklist
            content_lines = relatorio.conteudo.split('\n')
            filtered_lines = []
            in_checklist = False
            
            for line in content_lines:
                if 'CHECKLIST DA OBRA:' in line:
                    in_checklist = True
                    continue
                elif 'LOCALIZAÇÃO DO RELATÓRIO:' in line:
                    in_checklist = False
                    filtered_lines.append(line)
                    continue
                elif not in_checklist or not (line.startswith('✓') or line.startswith('○') or line.strip().startswith('Observações:')):
                    if not in_checklist:
                        filtered_lines.append(line)
            
            observacoes_filtradas = '\n'.join(filtered_lines).strip()
        
        # Usar timezone do Brasil (São Paulo)
        brazil_tz = pytz.timezone('America/Sao_Paulo')
        utc_tz = pytz.UTC
        now_brazil = datetime.now(brazil_tz)
        
        # Helper para converter datetime naive (UTC) para Brazil timezone
        def to_brazil_tz(dt):
            """Converte datetime para timezone do Brasil"""
            if dt is None:
                return now_brazil
            
            # Se datetime é naive (sem timezone), assumir que é UTC (Padrão Railway/Server)
            if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
                dt = utc_tz.localize(dt)
            
            # Converter para timezone do Brasil
            return dt.astimezone(brazil_tz)
        
        # Processar acompanhantes - lista de nomes dos participantes
        acompanhantes_nomes = []
        if hasattr(relatorio, 'acompanhantes') and relatorio.acompanhantes:
            try:
                acomp_data = relatorio.acompanhantes
                if isinstance(acomp_data, str):
                    import json
                    acomp_data = json.loads(acomp_data)
                
                if isinstance(acomp_data, list):
                    for acomp in acomp_data:
                        if isinstance(acomp, dict):
                            nome = acomp.get('nome') or acomp.get('nome_completo') or acomp.get('name', '')
                            if nome:
                                acompanhantes_nomes.append(nome)
                        elif isinstance(acomp, str):
                            acompanhantes_nomes.append(acomp)
            except Exception as e:
                print(f"⚠️ Erro ao processar acompanhantes: {e}")
        
        # Formatar lista de acompanhantes como string
        responsavel_acompanhamento = ', '.join(acompanhantes_nomes) if acompanhantes_nomes else "Não informado"
        
        # Formatar data com o exato momento da geração do relatório (Horário do Brasil)
        final_dt = now_brazil
        date_str = final_dt.strftime('%d/%m/%Y %H:%M')

        data = {
            'titulo': 'Relatório de Visita',
            'data_atual': date_str,
            'numero_relatorio': relatorio.numero,
            'empresa': projeto.construtora if projeto and hasattr(projeto, 'construtora') and projeto.construtora else (projeto.nome if projeto else "ELP Consultoria"),
            'obra': projeto.nome if projeto else "Não informado",
            'endereco': projeto.endereco or "Não informado",
            'observacoes': observacoes_filtradas,
            'preenchido_por': relatorio.autor.nome_completo if relatorio.autor else "Não informado",
            'liberado_por': "Eng. José Leopoldo Pugliese",
            'responsavel': responsavel_acompanhamento,
            'data_relatorio': date_str, # Usar a mesma data (Criação)
            'logo_base64': logo_base64,
            'fotos': []
        }
        
        # Processar fotos - PRIORIDADE: PostgreSQL (campo imagem)
        if fotos:
            import base64
            
            for foto in fotos:
                foto_base64 = None
                
                print(f"🔍 Processando foto {foto.ordem}: filename={foto.filename if hasattr(foto, 'filename') else 'N/A'}")
                
                # PRIORIDADE 1: Buscar imagem do campo BYTEA do PostgreSQL
                if hasattr(foto, 'imagem') and foto.imagem:
                    try:
                        # Verificar se é memoryview (PostgreSQL retorna assim)
                        if isinstance(foto.imagem, memoryview):
                            image_bytes = bytes(foto.imagem)
                            foto_base64 = base64.b64encode(image_bytes).decode('utf-8')
                            print(f"✅ Foto {foto.ordem} carregada do PostgreSQL (memoryview): {len(image_bytes)} bytes")
                        elif isinstance(foto.imagem, bytes):
                            foto_base64 = base64.b64encode(foto.imagem).decode('utf-8')
                            print(f"✅ Foto {foto.ordem} carregada do PostgreSQL (bytes): {len(foto.imagem)} bytes")
                        else:
                            print(f"⚠️ Foto {foto.ordem}: campo imagem tem tipo inesperado: {type(foto.imagem)}")
                    except Exception as e:
                        print(f"⚠️ Erro ao processar imagem do PostgreSQL para foto {foto.ordem}: {e}")
                else:
                    print(f"⚠️ Foto {foto.ordem}: campo imagem não existe ou está vazio")
                
                # FALLBACK: Tentar carregar do filesystem
                if not foto_base64 and hasattr(foto, 'filename') and foto.filename:
                    try:
                        upload_folder = current_app.config.get('UPLOAD_FOLDER', 'uploads')
                    except RuntimeError:
                        upload_folder = 'uploads'
                    
                    foto_path = os.path.join(upload_folder, foto.filename)
                    print(f"🔍 Tentando carregar do filesystem: {foto_path}")
                    
                    if os.path.exists(foto_path):
                        try:
                            with open(foto_path, 'rb') as f:
                                file_bytes = f.read()
                                foto_base64 = base64.b64encode(file_bytes).decode('utf-8')
                            print(f"✅ Foto {foto.ordem} carregada do filesystem: {foto_path} ({len(file_bytes)} bytes)")
                        except Exception as e:
                            print(f"⚠️ Erro ao ler arquivo {foto_path}: {e}")
                    else:
                        print(f"❌ Arquivo não encontrado: {foto_path}")
                
                if not foto_base64:
                    print(f"❌ ERRO: Foto {foto.ordem} NÃO CARREGADA - não encontrada no PostgreSQL nem no filesystem")
                
                # Criar legenda completa - incluir categoria e local
                legenda_texto = ""
                if hasattr(foto, 'descricao') and foto.descricao:
                    legenda_texto = foto.descricao
                elif hasattr(foto, 'legenda') and foto.legenda:
                    legenda_texto = foto.legenda
                
                # Obter categoria da foto
                categoria = ""
                if hasattr(foto, 'tipo_servico') and foto.tipo_servico:
                    categoria = foto.tipo_servico
                
                # Obter local da foto
                local = ""
                if hasattr(foto, 'local') and foto.local:
                    local = foto.local
                
                # Construir legenda completa com categoria e local
                legenda_partes = []
                if categoria:
                    legenda_partes.append(categoria)
                if local:
                    legenda_partes.append(f"Local: {local}")
                if legenda_texto:
                    legenda_partes.append(legenda_texto)
                
                legenda_completa = " - ".join(legenda_partes) if legenda_partes else f"Foto {foto.ordem}"
                
                print(f"📝 Foto {foto.ordem} - Legenda: {legenda_completa}")
                
                # Adicionar foto aos dados
                data['fotos'].append({
                    'base64': foto_base64,
                    'legenda': legenda_completa,
                    'categoria': categoria,
                    'local': local,
                    'ordem': foto.ordem,
                    'not_found': not foto_base64
                })
        
        return data
    
    def _create_html_template(self):
        """Template HTML replicando EXATAMENTE o modelo: 2 fotos na 1ª página, 4 nas demais"""
        return """
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>{{ data.titulo }}</title>
</head>
<body>
    <!-- Cabeçalho com logo ELP e título -->
    <div class="header-section">
        <div class="logo-container">
            <img src="data:image/jpeg;base64,{{ data.logo_base64 }}" alt="ELP Consultoria" class="elp-logo">
        </div>
        
        <h1 class="main-title">{{ data.titulo }}</h1>
        
        <div class="date-info">Em: {{ data.data_atual }}</div>
    </div>

    <!-- Seção Relatório com fundo cinza -->
    <div class="report-section">
        <div class="section-header">Relatório</div>
        <div class="report-content">
            <div class="report-label">Relatório Número</div>
            <div class="report-number">{{ data.numero_relatorio }}</div>
        </div>
    </div>

    <!-- Dados Gerais com fundo cinza -->
    <div class="dados-section">
        <div class="section-header">Dados gerais</div>
        <div class="dados-table">
            <div class="dados-row header-row">
                <div class="dados-cell">Empresa</div>
                <div class="dados-cell">Obra</div>
                <div class="dados-cell">Endereço</div>
            </div>
            <div class="dados-row value-row">
                <div class="dados-cell">{{ data.empresa }}</div>
                <div class="dados-cell">{{ data.obra }}</div>
                <div class="dados-cell">{{ data.endereco }}</div>
            </div>
        </div>
    </div>

    <!-- Itens Observados com fundo cinza -->
    <div class="observacoes-section">
        <div class="section-header">Itens observados</div>
        <div class="observacoes-content">
            {% if data.observacoes %}
                <div class="obs-text">{{ data.observacoes }}</div>
            {% else %}
                <div class="obs-text">Nenhuma observação</div>
            {% endif %}
        </div>
    </div>

    <!-- PRIMEIRA PÁGINA: 2 IMAGENS LADO A LADO ABAIXO DE "ITENS OBSERVADOS" -->
    {% if data.fotos %}
    {% set first_page_photos = data.fotos[:2] %}
    {% set remaining_photos = data.fotos[2:] %}
    {% set has_remaining = remaining_photos|length > 0 %}
    
    {% if first_page_photos %}
    <div class="first-page-photos-grid">
        {% for foto in first_page_photos %}
        <div class="first-photo-item">
            {% if foto.base64 and not foto.not_found %}
                <img src="data:image/jpeg;base64,{{ foto.base64 }}" alt="Foto {{ foto.ordem }}" class="first-photo-img">
            {% else %}
                <div class="photo-placeholder-first">Foto não disponível</div>
            {% endif %}
            <div class="first-photo-caption">Foto {{ loop.index }} - {{ foto.legenda }}</div>
        </div>
        {% endfor %}
    </div>
    {% endif %}
    
    <!-- ASSINATURAS NA PRIMEIRA PÁGINA: Se só tem até 2 fotos, mostrar assinaturas aqui -->
    {% if not has_remaining %}
    <div class="assinaturas-section first-page-signatures">
        <div class="section-header">Assinaturas</div>
        <div class="assinaturas-table">
            <div class="assin-row header-row">
                <div class="assin-cell">Preenchido por:</div>
                <div class="assin-cell">Liberado por:</div>
                <div class="assin-cell">Responsável pelo acompanhamento</div>
            </div>
            <div class="assin-row value-row">
                <div class="assin-cell">{{ data.preenchido_por }}</div>
                <div class="assin-cell">{{ data.liberado_por }}</div>
                <div class="assin-cell">{{ data.responsavel }}</div>
            </div>
        </div>
    </div>
    {% endif %}
    
    <!-- DEMAIS PÁGINAS: 4 IMAGENS POR PÁGINA EM GRID 2x2 -->
    {% set total_batches = ((remaining_photos|length - 1) // 4) + 1 if remaining_photos|length > 0 else 0 %}
    {% for batch_index in range(total_batches) %}
    {% set batch_start = batch_index * 4 %}
    {% set is_last_batch = batch_index == total_batches - 1 %}
    
    <div class="page-break-before grid-photos-page {% if is_last_batch %}last-batch{% endif %}">
        <div class="photos-grid-2x2">
            {% for foto in remaining_photos[batch_start:batch_start+4] %}
            {% if foto %}
            <div class="grid-photo-item">
                {% if foto.base64 and not foto.not_found %}
                    <img src="data:image/jpeg;base64,{{ foto.base64 }}" alt="Foto {{ foto.ordem }}" class="grid-photo-img">
                {% else %}
                    <div class="photo-placeholder-grid">Foto não disponível</div>
                {% endif %}
                <div class="grid-photo-caption">Foto {{ loop.index + 2 + batch_start }} - {{ foto.legenda }}</div>
            </div>
            {% endif %}
            {% endfor %}
        </div>
        
        <!-- ASSINATURAS: Aparecem APÓS as últimas fotos, na mesma página -->
        {% if is_last_batch %}
        <div class="assinaturas-inline">
            <div class="assinaturas-section">
                <div class="section-header">Assinaturas</div>
                <div class="assinaturas-table">
                    <div class="assin-row header-row">
                        <div class="assin-cell">Preenchido por:</div>
                        <div class="assin-cell">Liberado por:</div>
                        <div class="assin-cell">Responsável pelo acompanhamento</div>
                    </div>
                    <div class="assin-row value-row">
                        <div class="assin-cell">{{ data.preenchido_por }}</div>
                        <div class="assin-cell">{{ data.liberado_por }}</div>
                        <div class="assin-cell">{{ data.responsavel }}</div>
                    </div>
                </div>
            </div>
        </div>
        {% endif %}
    </div>
    {% endfor %}
    
    {% else %}
    <!-- SEM FOTOS: Mostrar assinaturas na primeira página -->
    <div class="assinaturas-section first-page-signatures">
        <div class="section-header">Assinaturas</div>
        <div class="assinaturas-table">
            <div class="assin-row header-row">
                <div class="assin-cell">Preenchido por:</div>
                <div class="assin-cell">Liberado por:</div>
                <div class="assin-cell">Responsável pelo acompanhamento</div>
            </div>
            <div class="assin-row value-row">
                <div class="assin-cell">{{ data.preenchido_por }}</div>
                <div class="assin-cell">{{ data.liberado_por }}</div>
                <div class="assin-cell">{{ data.responsavel }}</div>
            </div>
        </div>
    </div>
    {% endif %}

    <!-- Rodapé ELP -->
    <div class="footer-section">
        <div class="footer-left">
            <img src="data:image/jpeg;base64,{{ data.logo_base64 }}" alt="ELP Consultoria" class="footer-logo">
            <div class="company-info">
                <div class="company-name">ELP Consultoria</div>
                <div>Rua Jaboticabal, 530 apto. 31 - São Paulo - SP - CEP: 03188-000</div>
                <div><a href="mailto:leopoldo@elpconsultoria.eng.br">leopoldo@elpconsultoria.eng.br</a></div>
                <div><a href="https://www.elpconsultoria.com" target="_blank">www.elpconsultoria.com</a></div>
                <div>Telefone: (11) 99138-4517</div>
            </div>
        </div>
        <div class="footer-right">
            <!-- Texto removido conforme solicitação -->
        </div>
    </div>
</body>
</html>
        """
    
    def _create_css_styles(self):
        """CSS replicando exatamente o layout do PDF de referência"""
        return """
@page {
    size: A4;
    margin: 20mm 15mm 45mm 15mm;
    
    @bottom-center {
        content: element(footer);
    }
    
    @bottom-right {
        content: "Página " counter(page) " / " counter(pages);
        font-family: Arial, Helvetica, sans-serif;
        font-size: 9pt;
        color: #666666;
        margin-bottom: 5mm;
        padding-right: 5mm;
    }
}

* {
    box-sizing: border-box;
}

body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10pt;
    line-height: 1.1;
    color: #333333;
    background-color: #ffffff;
    margin: 0;
    padding: 0;
}

/* Cabeçalho - layout exato da imagem */
.header-section {
    position: relative;
    margin-bottom: 1.2cm;
    padding-bottom: 0.3cm;
    border-bottom: 1px solid #e0e0e0;
    min-height: 90px;
}

.logo-container {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 120px;
    height: 60px;
}

.elp-logo {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

.main-title {
    font-size: 18pt;
    font-weight: bold;
    color: #333333;
    text-align: center;
    margin: 0;
    padding-top: 20px;
    white-space: nowrap;
}

.date-info {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    font-size: 10pt;
    color: #666666;
    white-space: nowrap;
}

/* Seções com fundo cinza - proporções exatas da imagem */
.report-section,
.dados-section,
.observacoes-section,
.assinaturas-section {
    background-color: #f8f8f8;
    border: 1px solid #d0d0d0;
    margin-bottom: 6px;
    padding: 0;
    break-inside: avoid;
}

/* Assinaturas na primeira página - garante espaçamento adequado */
.first-page-signatures {
    margin-top: 15px;
}

.section-header {
    background-color: #e0e0e0;
    font-weight: bold;
    font-size: 10pt;
    color: #333333;
    padding: 6px 10px;
    border-bottom: 1px solid #d0d0d0;
    margin: 0;
}

/* Seção Relatório */
.report-content {
    padding: 10px;
}

.report-label {
    font-size: 10pt;
    color: #333333;
    margin-bottom: 3px;
}

.report-number {
    font-size: 12pt;
    font-weight: bold;
    color: #333333;
}

/* Dados Gerais - Tabela */
.dados-table {
    width: 100%;
    display: table;
    border-collapse: collapse;
}

.dados-row {
    display: table-row;
    width: 100%;
}

.dados-cell {
    display: table-cell;
    width: 33.33%;
    padding: 6px 10px;
    border-right: 1px solid #d0d0d0;
    vertical-align: top;
}

.dados-cell:last-child {
    border-right: none;
}

.header-row .dados-cell {
    font-weight: bold;
    font-size: 9pt;
    background-color: #e0e0e0;
    color: #333333;
}

.value-row .dados-cell {
    font-size: 9pt;
    background-color: #f8f8f8;
    color: #333333;
    min-height: 32px;
}

/* Itens Observados - proporções da imagem */
.observacoes-content {
    padding: 10px;
}

.obs-text {
    font-size: 9pt;
    color: #333333;
    margin: 0 0 4px 0;
}

/* Quebra de página */
.page-break-before {
    page-break-before: always;
    break-before: page;
}

/* Layout geral de imagens */
img {
    display: block;
    max-width: 100%;
    height: auto;
}

figure {
    page-break-inside: avoid;
    break-inside: avoid;
    margin: 0;
    padding: 0;
}

/* PRIMEIRA PÁGINA: 2 FOTOS LADO A LADO (GRID 1x2) ABAIXO DE "ITENS OBSERVADOS" */
.first-page-photos-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6mm;
    margin-top: 6mm;
    page-break-inside: avoid;
    width: 100%;
}

.first-photo-item {
    page-break-inside: avoid;
    display: flex;
    flex-direction: column;
}

.first-photo-img {
    width: 100%;
    height: auto;
    max-height: 60mm;
    object-fit: contain;
    display: block;
    border: 1px solid #e0e0e0;
}

.photo-placeholder-first {
    width: 100%;
    height: 60mm;
    background-color: #f5f5f5;
    border: 2px dashed #ccc;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #999;
    font-size: 10pt;
    font-style: italic;
}

.first-photo-caption {
    font-size: 8pt;
    color: #333;
    margin-top: 2mm;
    text-align: left;
    font-family: Arial, Helvetica, sans-serif;
}

/* DEMAIS PÁGINAS - GRID 2x2 (4 imagens por página) */
.grid-photos-page {
    padding: 3mm 0;
}

/* Forçar quebra APENAS se não for a última página de fotos */
.grid-photos-page:not(.last-batch) {
    page-break-after: always;
}

/* Permite que a última página quebre se não houver espaço para as assinaturas */
.grid-photos-page.last-batch {
    /* page-break-after: avoid; Removido para evitar corte das assinaturas */
}

.photos-grid-2x2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 6mm;
    width: 100%;
    height: auto;
    margin-bottom: 8mm;
}

.grid-photo-item {
    page-break-inside: avoid;
    display: flex;
    flex-direction: column;
}

.grid-photo-img {
    width: 100%;
    height: auto;
    max-height: 60mm;
    object-fit: contain;
    display: block;
    border: 1px solid #e0e0e0;
}

.photo-placeholder-grid {
    width: 100%;
    height: 60mm;
    background-color: #f5f5f5;
    border: 2px dashed #ccc;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #999;
    font-size: 9pt;
    font-style: italic;
}

.grid-photo-caption {
    font-size: 8pt;
    color: #333;
    margin-top: 2mm;
    text-align: left;
    font-family: Arial, Helvetica, sans-serif;
    line-height: 1.2;
}

/* Assinaturas - Tabela */
.assinaturas-table {
    width: 100%;
    display: table;
    border-collapse: collapse;
}

.assin-row {
    display: table-row;
    width: 100%;
}

.assin-cell {
    display: table-cell;
    width: 33.33%;
    padding: 6px 10px;
    border-right: 1px solid #d0d0d0;
    vertical-align: top;
}

.assin-cell:last-child {
    border-right: none;
}

.header-row .assin-cell {
    font-weight: bold;
    font-size: 9pt;
    background-color: #e0e0e0;
    color: #333333;
}

.value-row .assin-cell {
    font-size: 9pt;
    background-color: #f8f8f8;
    color: #333333;
    min-height: 40px;
    padding: 8px 10px;
}

/* Rodapé - proporções exatas da imagem */
.footer-section {
    position: running(footer);
    width: 100%;
    padding: 0cm 0cm 0cm 0cm;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    background: transparent;
    border-top: 1px solid #e0e0e0;
}

.footer-left {
    display: flex;
    align-items: flex-start;
    gap: 8px;
}

.footer-logo {
    width: 50px;
    height: 25px;
    flex-shrink: 0;
    object-fit: contain;
}

.company-info {
    font-size: 8pt;
    color: #666666;
    line-height: 1.1;
}

.company-name {
    font-weight: bold;
    color: #333333;
    margin-bottom: 1px;
}

.company-info a {
    color: #4A90E2;
    text-decoration: none;
}

.footer-right {
    text-align: right;
}

.generated-info {
    font-size: 8pt;
    color: #666666;
}

.produttivo {
    color: #4A90E2;
    font-weight: bold;
}

/* ASSINATURAS INLINE - Aparecem após o último grid de fotos */
.assinaturas-inline {
    margin-top: 8mm;
    margin-bottom: 30mm;
    page-break-inside: avoid;
    break-inside: avoid;
}

/* Ajuste de altura da seção de assinaturas para garantir visibilidade */
.assinaturas-section {
    min-height: 35mm;
}

/* Quebras de página - evitar quebra dentro de seções */
.report-section,
.dados-section,
.observacoes-section,
.assinaturas-section {
    break-inside: avoid;
    page-break-inside: avoid;
}

/* Garantir que cada grade de fotos force quebra de página */
.grid-page {
    page-break-after: always;
}

/* Garantir que a primeira página de fotos quebre antes */
.pdf-images {
    page-break-before: always;
}
        """