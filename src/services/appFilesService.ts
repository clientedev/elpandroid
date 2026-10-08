import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { getLocalProjetos } from '../database/db';

export const APP_FILES_ROOT_NAME = 'ELP_Arquivos';

export interface FileItem {
  name: string;
  uri: string;
  size?: number;
  modificationTime?: number;
  isDirectory?: boolean;
}

export interface ProjectFolderSummary {
  projectName: string;
  projectDir: string;
  imagensDir: string;
  pdfsDir: string;
  imagens: FileItem[];
  pdfs: FileItem[];
  totalFiles: number;
  totalSize: number;
}

/**
 * Sanitiza o nome de pasta para ser 100% compatível com sistemas de arquivos Android.
 */
export function cleanFolderName(name?: string, fallback = 'Obra_Geral'): string {
  if (!name || !name.trim()) return fallback;
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || fallback;
}

/**
 * Obtém ou cria o diretório raiz local do aplicativo para arquivos.
 * Sempre garantido permissão de leitura/escrita no dispositivo.
 */
export async function getAppFilesRootDir(): Promise<string> {
  const baseDir = (FileSystem as any).documentDirectory || '';
  const rootPath = `${baseDir}${APP_FILES_ROOT_NAME}/`;
  try {
    const info = await FileSystem.getInfoAsync(rootPath);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(rootPath, { intermediates: true });
    }
  } catch (e) {
    console.warn('[appFilesService] Erro ao garantir diretório raiz:', e);
  }
  return rootPath;
}

/**
 * Regra: Criou obra -> Criou pasta!
 * Garante que a pasta da obra e suas duas subpastas existam:
 * 1. Imagens/
 * 2. Relatorios_Aprovados_PDF/
 */
export async function ensureProjectFolders(projectName: string, projectCode?: string): Promise<{
  projectDir: string;
  imagensDir: string;
  pdfsDir: string;
}> {
  const root = await getAppFilesRootDir();
  const folderName = projectCode 
    ? cleanFolderName(`${projectCode}_${projectName}`)
    : cleanFolderName(projectName);

  const projectDir = `${root}${folderName}/`;
  const imagensDir = `${projectDir}Imagens/`;
  const pdfsDir = `${projectDir}Relatorios_Aprovados_PDF/`;

  try {
    const projInfo = await FileSystem.getInfoAsync(projectDir);
    if (!projInfo.exists) {
      await FileSystem.makeDirectoryAsync(projectDir, { intermediates: true });
    }

    const imgInfo = await FileSystem.getInfoAsync(imagensDir);
    if (!imgInfo.exists) {
      await FileSystem.makeDirectoryAsync(imagensDir, { intermediates: true });
    }

    const pdfInfo = await FileSystem.getInfoAsync(pdfsDir);
    if (!pdfInfo.exists) {
      await FileSystem.makeDirectoryAsync(pdfsDir, { intermediates: true });
    }
  } catch (err) {
    console.warn(`[appFilesService] Erro ao criar pastas da obra "${projectName}":`, err);
  }

  return { projectDir, imagensDir, pdfsDir };
}

/**
 * Garante as pastas locais para todas as obras registradas no banco SQLite.
 */
export async function ensureAllProjectsFolders(): Promise<void> {
  try {
    const projetos = await getLocalProjetos('Todos');
    for (const p of projetos) {
      if (p.nome) {
        await ensureProjectFolders(p.nome, (p as any).codigo || p.numero);
      }
    }
  } catch (e) {
    console.warn('[appFilesService] Erro ao garantir pastas de todas as obras:', e);
  }
}

/**
 * Salva uma foto tirada ou importada diretamente na subpasta Imagens da obra correspondente.
 */
export async function saveImageToProjectFolder(
  projectName: string,
  sourceUri: string,
  suggestedFilename?: string
): Promise<string> {
  try {
    const { imagensDir } = await ensureProjectFolders(projectName);
    const filename = suggestedFilename || `foto_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
    const destUri = `${imagensDir}${cleanFolderName(filename, 'foto.jpg')}`;
    
    await FileSystem.copyAsync({
      from: sourceUri,
      to: destUri,
    });

    return destUri;
  } catch (err) {
    console.warn('[appFilesService] Erro ao salvar imagem na pasta da obra:', err);
    return sourceUri;
  }
}

/**
 * Salva um relatório PDF aprovado diretamente na subpasta Relatorios_Aprovados_PDF da obra.
 */
export async function saveApprovedPdfToProjectFolder(
  projectName: string,
  reportNumero: string,
  sourcePdfUri: string
): Promise<string> {
  try {
    const { pdfsDir } = await ensureProjectFolders(projectName);
    const cleanNum = cleanFolderName(reportNumero || `REL_${Date.now()}`);
    const filename = cleanNum.toLowerCase().endsWith('.pdf') ? cleanNum : `${cleanNum}.pdf`;
    const destUri = `${pdfsDir}${filename}`;

    await FileSystem.copyAsync({
      from: sourcePdfUri,
      to: destUri,
    });

    console.log(`[appFilesService] ✅ PDF aprovado salvo localmente: ${destUri}`);
    return destUri;
  } catch (err) {
    console.warn('[appFilesService] Erro ao salvar PDF aprovado na pasta da obra:', err);
    return sourcePdfUri;
  }
}

/**
 * Lê recursivamente todas as pastas de obras salvas localmente e seus arquivos.
 */
export async function getProjectsFoldersSummary(): Promise<ProjectFolderSummary[]> {
  const root = await getAppFilesRootDir();
  await ensureAllProjectsFolders();

  const summaries: ProjectFolderSummary[] = [];

  try {
    const dirContent = await FileSystem.readDirectoryAsync(root);
    
    for (const folderName of dirContent) {
      const projectDir = `${root}${folderName}/`;
      const projInfo = await FileSystem.getInfoAsync(projectDir);
      if (!projInfo.isDirectory) continue;

      const imagensDir = `${projectDir}Imagens/`;
      const pdfsDir = `${projectDir}Relatorios_Aprovados_PDF/`;

      const imagens: FileItem[] = [];
      const pdfs: FileItem[] = [];
      let totalSize = 0;

      // Lê subpasta Imagens
      try {
        const imgInfo = await FileSystem.getInfoAsync(imagensDir);
        if (imgInfo.exists && imgInfo.isDirectory) {
          const imgFiles = await FileSystem.readDirectoryAsync(imagensDir);
          for (const f of imgFiles) {
            const fUri = `${imagensDir}${f}`;
            const fInfo = await FileSystem.getInfoAsync(fUri);
            const size = (fInfo as any).size || 0;
            totalSize += size;
            imagens.push({
              name: f,
              uri: fUri,
              size,
              modificationTime: (fInfo as any).modificationTime,
            });
          }
        }
      } catch {}

      // Lê subpasta Relatórios Aprovados em PDF
      try {
        const pdfInfo = await FileSystem.getInfoAsync(pdfsDir);
        if (pdfInfo.exists && pdfInfo.isDirectory) {
          const pdfFiles = await FileSystem.readDirectoryAsync(pdfsDir);
          for (const f of pdfFiles) {
            const fUri = `${pdfsDir}${f}`;
            const fInfo = await FileSystem.getInfoAsync(fUri);
            const size = (fInfo as any).size || 0;
            totalSize += size;
            pdfs.push({
              name: f,
              uri: fUri,
              size,
              modificationTime: (fInfo as any).modificationTime,
            });
          }
        }
      } catch {}

      summaries.push({
        projectName: folderName.replace(/_/g, ' '),
        projectDir,
        imagensDir,
        pdfsDir,
        imagens,
        pdfs,
        totalFiles: imagens.length + pdfs.length,
        totalSize,
      });
    }
  } catch (err) {
    console.warn('[appFilesService] Erro ao listar resumo de pastas:', err);
  }

  // Ordena por nome da obra
  summaries.sort((a, b) => a.projectName.localeCompare(b.projectName));
  return summaries;
}

/**
 * Botão que leva de forma externa para a raiz dos arquivos salvos no dispositivo.
 * Utiliza o expo-intent-launcher para abrir o Gerenciador de Arquivos nativo do Android.
 */
export async function openRootFolderExternally(): Promise<void> {
  const root = await getAppFilesRootDir();
  
  if (Platform.OS === 'android') {
    try {
      const contentUri = await FileSystem.getContentUriAsync(root);
      // Tentativa 1: Abrir diretamente a pasta via ContentUri
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      });
      return;
    } catch (e1) {
      console.log('[appFilesService] Tentativa 1 (VIEW uri) falhou, tentando OPEN_DOCUMENT_TREE:', e1);
    }

    try {
      // Tentativa 2: Abrir o seletor / explorador de documentos nativo do Android
      await IntentLauncher.startActivityAsync('android.intent.action.OPEN_DOCUMENT_TREE', {
        flags: 1,
      });
      return;
    } catch (e2) {
      console.log('[appFilesService] Tentativa 2 falhou:', e2);
    }

    try {
      // Tentativa 3: Visualizador padrão de armazenamento do sistema
      await IntentLauncher.startActivityAsync('android.os.storage.action.MANAGE_STORAGE');
      return;
    } catch (e3) {
      console.log('[appFilesService] Tentativa 3 falhou:', e3);
    }
  }

  Alert.alert(
    'Raiz dos Arquivos no Dispositivo',
    `Os arquivos do aplicativo estão armazenados no seguinte caminho local:\n\n📁 ${root}\n\nVocê pode visualizá-los e gerenciá-los usando o aplicativo Meus Arquivos / Gerenciador de Arquivos do celular.`
  );
}

/**
 * Abre ou compartilha um arquivo específico externamente.
 */
export async function viewOrShareFile(fileUri: string, mimeType?: string): Promise<void> {
  try {
    const isAvail = await Sharing.isAvailableAsync();
    if (isAvail) {
      await Sharing.shareAsync(fileUri, {
        mimeType: mimeType || (fileUri.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        dialogTitle: 'Abrir Arquivo',
      });
    } else {
      Alert.alert('Arquivo', `Caminho do arquivo:\n${fileUri}`);
    }
  } catch (err: any) {
    Alert.alert('Erro ao abrir arquivo', err.message);
  }
}
