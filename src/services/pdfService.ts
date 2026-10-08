import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Relatorio, FotoRelatorio, RelatorioExpress } from '../types';
import { ELP_LOGO_BASE64 } from './logoBase64';
import { saveApprovedPdfToProjectFolder } from './appFilesService';

export async function generateReportPDF(
  relatorio: Relatorio | RelatorioExpress,
  fotos: FotoRelatorio[] = []
): Promise<string> {
  const isExpress = 'obra_nome' in relatorio;
  const obraNome = isExpress ? (relatorio as RelatorioExpress).obra_nome : ((relatorio as Relatorio).projeto_nome || 'Obra');
  const numero = relatorio.numero;
  const data = relatorio.data_relatorio ? new Date(relatorio.data_relatorio).toLocaleDateString('pt-BR') : '';

  // Deduplica fotos para garantir que nenhuma foto seja renderizada 2x no PDF
  const uniqueFotos: FotoRelatorio[] = [];
  const seenFp = new Set<string>();
  for (const f of fotos) {
    const fp = (f.filename && f.filename.length > 3) ? f.filename
      : (f.uri_local && !f.uri_local.startsWith('http') ? f.uri_local.split('/').pop() : null)
      || (f.base64 && f.base64.length > 50 ? f.base64.substring(0, 80) : null)
      || (f.url ? f.url.split('/').pop() : null)
      || `ordem_${f.ordem}_${f.id}`;
    if (fp && seenFp.has(fp)) continue;
    if (fp) seenFp.add(fp);
    uniqueFotos.push(f);
  }

  let photosHtml = '';
  if (uniqueFotos.length > 0) {
    photosHtml = `
      <div class="section-title">REGISTRO FOTOGRÁFICO (${uniqueFotos.length} fotos)</div>
      <div class="photos-grid">
        ${uniqueFotos.map((f, i) => {
          const imgSrc = (f.base64 && f.base64.length > 50)
            ? (f.base64.startsWith('data:') ? f.base64 : `data:image/jpeg;base64,${f.base64}`)
            : (f.uri_local || f.url || '');
          return `
          <div class="photo-card">
            <div class="photo-container">
              <img src="${imgSrc}" class="photo-img" />
            </div>
            <div class="photo-caption">
              <strong>Foto ${i + 1}:</strong> ${f.legenda || f.titulo || 'Sem legenda'}
              ${f.local ? `<br/><span style="color:#64748B;">Local: ${f.local}</span>` : ''}
            </div>
          </div>
        `;
        }).join('')}
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
        .header-table {
          width: 100%;
          border-bottom: 3px solid #1E3A8A;
          padding-bottom: 12px;
          margin-bottom: 18px;
        }
        .header-logo-cell {
          width: 140px;
          vertical-align: middle;
        }
        .header-logo {
          width: 140px;
          height: 60px;
          max-width: 140px;
          max-height: 60px;
          object-fit: contain;
          display: block;
        }
        .header-text-cell {
          vertical-align: middle;
          padding-left: 12px;
        }
        .header-title {
          font-size: 20px;
          font-weight: 800;
          color: #1E3A8A;
          letter-spacing: 0.5px;
        }
        .header-subtitle {
          font-size: 13px;
          font-weight: 600;
          color: #334155;
          margin-top: 2px;
        }
        .header-meta-cell {
          text-align: right;
          vertical-align: middle;
          width: 130px;
        }
        .header-meta {
          font-size: 12px;
          color: #64748B;
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
      <table class="header-table" cellpadding="0" cellspacing="0">
        <tr>
          <td class="header-logo-cell">
            <img src="${ELP_LOGO_BASE64}" width="140" height="60" style="width:140px; height:60px; max-width:140px; max-height:60px; object-fit:contain; display:block;" alt="ELP Engenharia" />
          </td>
          <td class="header-text-cell">
            <div class="header-title">ELP ENGENHARIA</div>
            <div class="header-subtitle">
              ${relatorio.titulo} (${numero})
            </div>
          </td>
          <td class="header-meta-cell">
            <div class="header-meta"><strong>Data:</strong> ${data}</div>
            <div style="margin-top: 4px;"><span class="status-badge">${relatorio.status}</span></div>
          </td>
        </tr>
      </table>

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
        <table style="width: 100%; border: none;">
          <tr>
            <td style="text-align: left; font-size: 10px; color: #94A3B8;">
              ELP Engenharia &amp; Consultoria &bull; Sistema Integrado de Obras
            </td>
            <td style="text-align: right; font-size: 10px; color: #94A3B8;">
              Gerado em ${new Date().toLocaleDateString('pt-BR')}
            </td>
          </tr>
        </table>
      </div>
    </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });

  // Se o relatório estiver aprovado (ou ao gerar laudo da obra), salva permanentemente na subpasta Relatorios_Aprovados_PDF
  if (obraNome && (relatorio.status === 'Aprovado' || (relatorio as any).status === 'aprovado')) {
    saveApprovedPdfToProjectFolder(obraNome, numero, uri).catch(err =>
      console.warn('[pdfService] Erro ao salvar PDF aprovado na pasta da obra:', err)
    );
  }

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
