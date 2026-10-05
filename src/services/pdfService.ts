import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Relatorio, FotoRelatorio, RelatorioExpress } from '../types';

export async function generateReportPDF(
  relatorio: Relatorio | RelatorioExpress,
  fotos: FotoRelatorio[] = []
): Promise<string> {
  const isExpress = 'obra_nome' in relatorio;
  const obraNome = isExpress ? (relatorio as RelatorioExpress).obra_nome : ((relatorio as Relatorio).projeto_nome || 'Obra');
  const numero = relatorio.numero;
  const data = relatorio.data_relatorio ? new Date(relatorio.data_relatorio).toLocaleDateString('pt-BR') : '';

  let photosHtml = '';
  if (fotos && fotos.length > 0) {
    photosHtml = `
      <div class="section-title">REGISTRO FOTOGRÁFICO (${fotos.length} fotos)</div>
      <div class="photos-grid">
        ${fotos.map((f, i) => `
          <div class="photo-card">
            <div class="photo-container">
              <img src="${f.uri_local || f.url || ''}" class="photo-img" />
            </div>
            <div class="photo-caption">
              <strong>Foto ${i + 1}:</strong> ${f.legenda || f.titulo || 'Sem legenda'}
              ${f.local ? `<br/><span style="color:#64748B;">Local: ${f.local}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Relatório ${numero}</title>
      <style>
        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          color: #0F172A;
          margin: 20px;
          line-height: 1.5;
        }
        .header {
          display: flex;
          justify-content: space-between;
          border-bottom: 3px solid #2563EB;
          padding-bottom: 12px;
          margin-bottom: 20px;
        }
        .header-title {
          font-size: 22px;
          font-weight: bold;
          color: #1E3A8A;
        }
        .header-meta {
          font-size: 13px;
          color: #64748B;
          text-align: right;
        }
        .section-title {
          font-size: 14px;
          font-weight: bold;
          text-transform: uppercase;
          background: #F1F5F9;
          color: #1E293B;
          padding: 6px 10px;
          border-left: 4px solid #2563EB;
          margin-top: 18px;
          margin-bottom: 10px;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          font-size: 13px;
          margin-bottom: 10px;
        }
        .info-item strong {
          color: #475569;
        }
        .text-box {
          font-size: 13px;
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 6px;
          padding: 10px;
          margin-bottom: 10px;
          white-space: pre-wrap;
        }
        .photos-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          page-break-inside: auto;
        }
        .photo-card {
          border: 1px solid #E2E8F0;
          border-radius: 6px;
          padding: 8px;
          background: #FFFFFF;
          page-break-inside: avoid;
        }
        .photo-container {
          width: 100%;
          height: 220px;
          background: #F1F5F9;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border-radius: 4px;
        }
        .photo-img {
          max-width: 100%;
          max-height: 220px;
          object-fit: cover;
        }
        .photo-caption {
          font-size: 11px;
          margin-top: 6px;
          color: #334155;
        }
        .footer {
          margin-top: 30px;
          border-top: 1px solid #E2E8F0;
          padding-top: 10px;
          font-size: 11px;
          color: #94A3B8;
          text-align: center;
        }
        .status-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: bold;
          background: #EFF6FF;
          color: #2563EB;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="header-title">OBRAFLOW - RELATÓRIO TÉCNICO</div>
          <div style="font-size: 14px; font-weight: 600; color: #334155; margin-top: 4px;">
            ${relatorio.titulo} (${numero})
          </div>
        </div>
        <div class="header-meta">
          <div><strong>Data:</strong> ${data}</div>
          <div style="margin-top: 4px;"><span class="status-badge">${relatorio.status}</span></div>
        </div>
      </div>

      <div class="section-title">DADOS DA OBRA & VISITA</div>
      <div class="info-grid">
        <div class="info-item"><strong>Obra / Projeto:</strong> ${obraNome}</div>
        <div class="info-item"><strong>Autor:</strong> ${relatorio.autor_nome || 'Técnico Responsável'}</div>
        <div class="info-item"><strong>Local:</strong> ${relatorio.local || 'Não informado'}</div>
        <div class="info-item"><strong>Categoria:</strong> ${relatorio.categoria || 'Geral'}</div>
      </div>

      ${relatorio.descricao ? `
        <div class="section-title">DESCRIÇÃO DA VISITA / SERVIÇOS</div>
        <div class="text-box">${relatorio.descricao}</div>
      ` : ''}

      ${relatorio.observacoes_finais ? `
        <div class="section-title">OBSERVAÇÕES FINAIS & RECOMENDAÇÕES</div>
        <div class="text-box">${relatorio.observacoes_finais}</div>
      ` : ''}

      ${photosHtml}

      <div class="footer">
        Documento gerado pelo ObraFlow Android - Sistema de Gestão Técnica de Obras
      </div>
    </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}

export async function shareReportPDF(pdfUri: string): Promise<void> {
  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(pdfUri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Compartilhar Relatório em PDF',
      UTI: 'com.adobe.pdf',
    });
  } else {
    alert('Compartilhamento não disponível neste dispositivo.');
  }
}
