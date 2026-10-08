import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { getLocalProjetos } from '../database/db';

export const APP_FILES_ROOT_NAME = 'ELP_Arquivos';

// Caminhos físicos no dispositivo
const ANDROID_DOCS_ROOT = 'file:///storage/emulated/0/Documents/ELP_Arquivos/';
const ANDROID_SDCARD_ROOT = 'file:///storage/emulated/0/ELP_Arquivos/';
const INTERNAL_ROOT = `${(FileSystem as any).documentDirectory || ''}${APP_FILES_ROOT_NAME}/`;

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
 * Retorna as raízes disponíveis para armazenamento.
 * Prioriza a pasta pública Documents no Android para que o usuário veja
 * a pasta no app de Gerenciador de Arquivos do celular e no PC via USB.
 */
export async function getTargetRootDirectories(): Promise<string[]> {
  const roots: string[] = [];

  if (Platform.OS === 'android') {
    // 1. Documents público do Android
    try {
      const info = await FileSystem.getInfoAsync(ANDROID_DOCS_ROOT);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(ANDROID_DOCS_ROOT, { intermediates: true });
      }
      roots.push(ANDROID_DOCS_ROOT);
    } catch {
      // 2. Fallback na raiz do armazenamento compartilhado
      try {
        const info = await FileSystem.getInfoAsync(ANDROID_SDCARD_ROOT);
        if (!info.exists) {
          await FileSystem.makeDirectoryAsync(ANDROID_SDCARD_ROOT, { intermediates: true });
        }
        roots.push(ANDROID_SDCARD_ROOT);
      } catch {}
    }
  }

  // 3. Raiz interna segura do aplicativo
  try {
    const info = await FileSystem.getInfoAsync(INTERNAL_ROOT);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(INTERNAL_ROOT, { intermediates: true });
    }
    roots.push(INTERNAL_ROOT);
  } catch {}

  return roots.length > 0 ? roots : [INTERNAL_ROOT];
}

/**
 * Obtém o diretório raiz preferencial do aplicativo.
 */
export async function getAppFilesRootDir(): Promise<string> {
  const roots = await getTargetRootDirectories();
  return roots[0] || INTERNAL_ROOT;
}

/**
 * Regra Obrigatória: Criou obra -> Criou pasta!
 * Garante que para a obra indicada, existam fisicamente no celular:
 * 1. Pasta principal da obra: ELP_Arquivos/[Nome_ou_Codigo_da_Obra]/
 * 2. Subpasta: Imagens/
 * 3. Subpasta: Relatorios_Aprovados_PDF/
 */
export async function ensureProjectFolders(projectName: string, projectCode?: string): Promise<{
  projectDir: string;
  imagensDir: string;
  pdfsDir: string;
}> {
  if (!projectName || !projectName.trim()) {
    projectName = 'Obra_Geral';
  }

  const folderName = projectCode 
    ? cleanFolderName(`${projectCode}_${projectName}`)
    : cleanFolderName(projectName);

  const roots = await getTargetRootDirectories();
  let primaryProjectDir = '';
  let primaryImagensDir = '';
  let primaryPdfsDir = '';

  for (let i = 0; i < roots.length; i++) {
    const root = roots[i];
    const projectDir = `${root}${folderName}/`;
    const imagensDir = `${projectDir}Imagens/`;
    const pdfsDir = `${projectDir}Relatorios_Aprovados_PDF/`;

    if (i === 0) {
      primaryProjectDir = projectDir;
      primaryImagensDir = imagensDir;
      primaryPdfsDir = pdfsDir;
    }

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
      console.warn(`[appFilesService] Erro ao criar pastas da obra "${folderName}" em ${root}:`, err);
    }
  }

  return { 
    projectDir: primaryProjectDir || `${INTERNAL_ROOT}${folderName}/`, 
    imagensDir: primaryImagensDir || `${INTERNAL_ROOT}${folderName}/Imagens/`, 
    pdfsDir: primaryPdfsDir || `${INTERNAL_ROOT}${folderName}/Relatorios_Aprovados_PDF/` 
  };
}

/**
 * Garante as pastas locais para TODAS as obras cadastradas no SQLite.
 * Chamada na inicialização do app para garantir que todas as obras
 * existentes já tenham suas pastas físicas criadas imediatamente.
 */
export async function ensureAllProjectsFolders(): Promise<void> {
  try {
    const projetos = await getLocalProjetos('Todos');
    for (const p of projetos) {
      if (p.nome) {
        await ensureProjectFolders(p.nome, (p as any).codigo || p.numero);
      }
    }
    console.log(`[appFilesService] ✅ Pastas físicas conferidas/criadas para ${projetos.length} obras.`);
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
    const filename = suggestedFilename || `foto_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
    const safeFilename = cleanFolderName(filename, 'foto.jpg');
    const { imagensDir } = await ensureProjectFolders(projectName);
    const destUri = `${imagensDir}${safeFilename}`;
    
    await FileSystem.copyAsync({
      from: sourceUri,
      to: destUri,
    });

    // Se houver mais de uma raiz (pública e interna), copia também na raiz interna
    try {
      const internalDir = `${INTERNAL_ROOT}${cleanFolderName(projectName)}/Imagens/`;
      if (imagensDir !== internalDir) {
        const info = await FileSystem.getInfoAsync(internalDir);
        if (!info.exists) {
          await FileSystem.makeDirectoryAsync(internalDir, { intermediates: true });
        }
        await FileSystem.copyAsync({
          from: sourceUri,
          to: `${internalDir}${safeFilename}`,
        });
      }
    } catch {}

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
    const cleanNum = cleanFolderName(reportNumero || `REL_${Date.now()}`);
    const filename = cleanNum.toLowerCase().endsWith('.pdf') ? cleanNum : `${cleanNum}.pdf`;
    const { pdfsDir } = await ensureProjectFolders(projectName);
    const destUri = `${pdfsDir}${filename}`;

    await FileSystem.copyAsync({
      from: sourcePdfUri,
      to: destUri,
    });

    // Espelha no diretório interno para garantia dupla
    try {
      const internalDir = `${INTERNAL_ROOT}${cleanFolderName(projectName)}/Relatorios_Aprovados_PDF/`;
      if (pdfsDir !== internalDir) {
        const info = await FileSystem.getInfoAsync(internalDir);
        if (!info.exists) {
          await FileSystem.makeDirectoryAsync(internalDir, { intermediates: true });
        }
        await FileSystem.copyAsync({
          from: sourcePdfUri,
          to: `${internalDir}${filename}`,
        });
      }
    } catch {}

    console.log(`[appFilesService] ✅ PDF aprovado salvo localmente: ${destUri}`);
    return destUri;
  } catch (err) {
    console.warn('[appFilesService] Erro ao salvar PDF aprovado na pasta da obra:', err);
    return sourcePdfUri;
  }
}

/**
 * Lê todas as pastas de obras salvas localmente e seus arquivos.
 */
export async function getProjectsFoldersSummary(): Promise<ProjectFolderSummary[]> {
  await ensureAllProjectsFolders();
  const roots = await getTargetRootDirectories();

  const summariesMap = new Map<string, ProjectFolderSummary>();

  for (const root of roots) {
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

        const normalizedName = folderName.replace(/_/g, ' ');
        if (!summariesMap.has(normalizedName) || (imagens.length + pdfs.length) > summariesMap.get(normalizedName)!.totalFiles) {
          summariesMap.set(normalizedName, {
            projectName: normalizedName,
            projectDir,
            imagensDir,
            pdfsDir,
            imagens,
            pdfs,
            totalFiles: imagens.length + pdfs.length,
            totalSize,
          });
        }
      }
    } catch (err) {
      console.warn(`[appFilesService] Erro ao listar arquivos em ${root}:`, err);
    }
  }

  const result = Array.from(summariesMap.values());
  result.sort((a, b) => a.projectName.localeCompare(b.projectName));
  return result;
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
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      });
      return;
    } catch (e1) {
      console.log('[appFilesService] Tentativa 1 (VIEW contentUri) falhou:', e1);
    }

    try {
      // Abre o explorador de documentos do Android
      await IntentLauncher.startActivityAsync('android.intent.action.OPEN_DOCUMENT_TREE', {
        flags: 1,
      });
      return;
    } catch (e2) {
      console.log('[appFilesService] Tentativa 2 falhou:', e2);
    }

    try {
      await IntentLauncher.startActivityAsync('android.os.storage.action.MANAGE_STORAGE');
      return;
    } catch (e3) {
      console.log('[appFilesService] Tentativa 3 falhou:', e3);
    }
  }

  Alert.alert(
    'Raiz dos Arquivos no Dispositivo',
    `Os arquivos do aplicativo estão armazenados localmente no seguinte caminho:\n\n📁 ${root}\n\nVocê pode visualizá-los diretamente através do aplicativo Meus Arquivos / Gerenciador de Arquivos do celular.`
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
