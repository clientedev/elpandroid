import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalProjetos } from '../database/db';

const StorageAccessFramework =
  (LegacyFileSystem as any)?.StorageAccessFramework ||
  (FileSystem as any)?.StorageAccessFramework;

// Chaves de armazenamento do Storage Access Framework (SAF)
export const KEY_SAF_DIRECTORY_URI = '@obraflow_saf_directory_uri';
export const KEY_SAF_IMAGENS_URI = '@obraflow_saf_imagens_uri';
export const KEY_SAF_RELATORIOS_URI = '@obraflow_saf_relatorios_uri';

export const APP_FILES_ROOT_NAME = 'ELP_Arquivos';

// Caminho de fallback interno seguro
const INTERNAL_DOC_DIR = `${(FileSystem as any).documentDirectory || ''}`;
const INTERNAL_ROOT = `${INTERNAL_DOC_DIR}${APP_FILES_ROOT_NAME}/`;
const INTERNAL_IMAGENS = `${INTERNAL_ROOT}Imagens/`;
const INTERNAL_RELATORIOS = `${INTERNAL_ROOT}Relatorios/`;

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

export interface StorageConfig {
  isConfigured: boolean;
  directoryUri: string | null;
  directoryName: string;
  imagensUri: string | null;
  relatoriosUri: string | null;
  totalImagensCount: number;
  totalRelatoriosCount: number;
}

/**
 * Sanitiza o nome de pasta/arquivo para ser 100% compatível com Android.
 */
export function cleanFolderName(name?: string, fallback = 'Obra_Geral'): string {
  if (!name || !name.trim()) return fallback;
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || fallback;
}

/**
 * Extrai um nome legível a partir de um URI do Storage Access Framework.
 */
export function formatDirectoryDisplayName(uri: string | null): string {
  if (!uri) return 'Armazenamento Padrão do App';
  try {
    const decoded = decodeURIComponent(uri);
    const parts = decoded.split(':');
    if (parts.length > 1) {
      return parts[parts.length - 1] || 'Pasta Selecionada';
    }
    const slashParts = decoded.split('/');
    return slashParts[slashParts.length - 1] || 'Pasta Selecionada';
  } catch {
    return 'Pasta Selecionada';
  }
}

/**
 * Solicita ao usuário para selecionar o diretório onde deseja salvar os arquivos.
 * Imediatamente após a permissão concedida, cria as duas pastas:
 * 1. "Imagens"
 * 2. "Relatórios"
 */
/**
 * Solicita ao usuário para selecionar o diretório onde deseja salvar os arquivos.
 * Imediatamente após a permissão concedida, cria as duas pastas:
 * 1. "Imagens"
 * 2. "Relatórios"
 */
export async function requestAppStorageDirectory(): Promise<{
  success: boolean;
  directoryUri?: string;
  imagensUri?: string;
  relatoriosUri?: string;
}> {
  if (Platform.OS !== 'android') {
    return { success: true };
  }

  try {
    // 1. Verifica se a API do SAF está disponível
    if (!StorageAccessFramework || typeof StorageAccessFramework.requestDirectoryPermissionsAsync !== 'function') {
      Alert.alert(
        'Armazenamento do App',
        'O seletor nativo de diretórios não está disponível neste dispositivo. O app continuará salvando os arquivos no armazenamento interno com segurança.'
      );
      return { success: false };
    }

    // 2. Abre a interface nativa do Android para o usuário escolher o diretório
    const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();

    if (!permissions.granted || !permissions.directoryUri) {
      return { success: false };
    }

    const rootDirUri = permissions.directoryUri;

    // 2. Verifica se as pastas Imagens e Relatórios já existem no diretório selecionado
    let imagensUri: string | null = null;
    let relatoriosUri: string | null = null;

    try {
      const existingEntries = await StorageAccessFramework.readDirectoryAsync(rootDirUri);
      for (const entry of existingEntries) {
        const decoded = decodeURIComponent(entry);
        if (
          decoded.endsWith('/Imagens') ||
          decoded.endsWith('%2FImagens') ||
          decoded.toLowerCase().endsWith('imagens')
        ) {
          imagensUri = entry;
        } else if (
          decoded.endsWith('/Relatórios') ||
          decoded.endsWith('/Relatorios') ||
          decoded.endsWith('%2FRelat%C3%B3rios') ||
          decoded.endsWith('%2FRelatorios') ||
          decoded.toLowerCase().endsWith('relatorios') ||
          decoded.toLowerCase().endsWith('relatórios')
        ) {
          relatoriosUri = entry;
        }
      }
    } catch (readErr) {
      console.warn('[appFilesService] Leitura inicial de SAF:', readErr);
    }

    // 3. Cria a pasta "Imagens" se ainda não existir
    if (!imagensUri) {
      try {
        imagensUri = await StorageAccessFramework.makeDirectoryAsync(rootDirUri, 'Imagens');
      } catch (e) {
        console.warn('[appFilesService] Erro ao criar pasta Imagens:', e);
      }
    }

    // 4. Cria a pasta "Relatórios" se ainda não existir
    if (!relatoriosUri) {
      try {
        relatoriosUri = await StorageAccessFramework.makeDirectoryAsync(rootDirUri, 'Relatórios');
      } catch {
        try {
          relatoriosUri = await StorageAccessFramework.makeDirectoryAsync(rootDirUri, 'Relatorios');
        } catch (e2) {
          console.warn('[appFilesService] Erro ao criar pasta Relatórios:', e2);
        }
      }
    }

    // 5. Persiste as referências no AsyncStorage
    await AsyncStorage.setItem(KEY_SAF_DIRECTORY_URI, rootDirUri);
    if (imagensUri) await AsyncStorage.setItem(KEY_SAF_IMAGENS_URI, imagensUri);
    if (relatoriosUri) await AsyncStorage.setItem(KEY_SAF_RELATORIOS_URI, relatoriosUri);

    console.log('[appFilesService] ✅ Diretório SAF configurado com sucesso com Imagens e Relatórios.');
    return {
      success: true,
      directoryUri: rootDirUri,
      imagensUri: imagensUri || undefined,
      relatoriosUri: relatoriosUri || undefined,
    };
  } catch (err: any) {
    console.error('[appFilesService] Falha ao solicitar diretório SAF:', err);
    Alert.alert('Erro ao Selecionar Pasta', err?.message || 'Falha ao acessar permissões do diretório.');
    return { success: false };
  }
}

/**
 * Pergunta ao usuário de forma amigável para escolher a pasta de armazenamento caso ainda não esteja configurada.
 */
export async function promptSelectStorageDirectory(force: boolean = false): Promise<{
  success: boolean;
  directoryUri?: string;
}> {
  if (Platform.OS !== 'android') return { success: true };

  const currentDir = await AsyncStorage.getItem(KEY_SAF_DIRECTORY_URI);
  if (currentDir && !force) {
    return { success: true, directoryUri: currentDir };
  }

  return new Promise((resolve) => {
    Alert.alert(
      'Pasta de Armazenamento do ObraFlow',
      'Escolha uma pasta no seu celular onde os arquivos serão salvos. O app criará automaticamente as pastas "Imagens" e "Relatórios" dentro dela.',
      [
        {
          text: 'Mais tarde',
          style: 'cancel',
          onPress: () => resolve({ success: false }),
        },
        {
          text: 'Selecionar Pasta',
          onPress: async () => {
            const res = await requestAppStorageDirectory();
            resolve(res);
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve({ success: false }) }
    );
  });
}

/**
 * Obtém a configuração atual de armazenamento e contagem de arquivos.
 */
export async function getStorageConfig(): Promise<StorageConfig> {
  let directoryUri = await AsyncStorage.getItem(KEY_SAF_DIRECTORY_URI);
  let imagensUri = await AsyncStorage.getItem(KEY_SAF_IMAGENS_URI);
  let relatoriosUri = await AsyncStorage.getItem(KEY_SAF_RELATORIOS_URI);

  let totalImagensCount = 0;
  let totalRelatoriosCount = 0;

  if (directoryUri && Platform.OS === 'android') {
    if (imagensUri) {
      try {
        const imgs = await StorageAccessFramework.readDirectoryAsync(imagensUri);
        totalImagensCount = imgs.length;
      } catch {}
    }
    if (relatoriosUri) {
      try {
        const rels = await StorageAccessFramework.readDirectoryAsync(relatoriosUri);
        totalRelatoriosCount = rels.length;
      } catch {}
    }
  } else {
    // Contagem no diretório interno de fallback
    try {
      const imgInfo = await FileSystem.getInfoAsync(INTERNAL_IMAGENS);
      if (imgInfo.exists) {
        const list = await FileSystem.readDirectoryAsync(INTERNAL_IMAGENS);
        totalImagensCount = list.length;
      }
      const relInfo = await FileSystem.getInfoAsync(INTERNAL_RELATORIOS);
      if (relInfo.exists) {
        const list = await FileSystem.readDirectoryAsync(INTERNAL_RELATORIOS);
        totalRelatoriosCount = list.length;
      }
    } catch {}
  }

  return {
    isConfigured: Boolean(directoryUri),
    directoryUri,
    directoryName: formatDirectoryDisplayName(directoryUri),
    imagensUri,
    relatoriosUri,
    totalImagensCount,
    totalRelatoriosCount,
  };
}

/**
 * Retorna todos os arquivos reais salvos fisicamente nas pastas Imagens e Relatórios.
 */
export async function getStoredPhysicalFiles(): Promise<{
  imagens: FileItem[];
  relatorios: FileItem[];
}> {
  const imagens: FileItem[] = [];
  const relatorios: FileItem[] = [];

  const imagensUri = await AsyncStorage.getItem(KEY_SAF_IMAGENS_URI);
  const relatoriosUri = await AsyncStorage.getItem(KEY_SAF_RELATORIOS_URI);

  if (Platform.OS === 'android' && imagensUri) {
    try {
      const entries = await StorageAccessFramework.readDirectoryAsync(imagensUri);
      for (const uri of entries) {
        const name = formatDirectoryDisplayName(uri);
        imagens.push({ name, uri });
      }
    } catch (e) {
      console.warn('[appFilesService] Erro ao ler imagens do SAF:', e);
    }
  }

  if (Platform.OS === 'android' && relatoriosUri) {
    try {
      const entries = await StorageAccessFramework.readDirectoryAsync(relatoriosUri);
      for (const uri of entries) {
        const name = formatDirectoryDisplayName(uri);
        relatorios.push({ name, uri });
      }
    } catch (e) {
      console.warn('[appFilesService] Erro ao ler relatórios do SAF:', e);
    }
  }

  // Se o SAF estiver vazio ou não configurado, lê também os internos
  if (imagens.length === 0) {
    try {
      const info = await FileSystem.getInfoAsync(INTERNAL_IMAGENS);
      if (info.exists) {
        const files = await FileSystem.readDirectoryAsync(INTERNAL_IMAGENS);
        for (const f of files) {
          const fUri = `${INTERNAL_IMAGENS}${f}`;
          imagens.push({ name: f, uri: fUri });
        }
      }
    } catch {}
  }

  if (relatorios.length === 0) {
    try {
      const info = await FileSystem.getInfoAsync(INTERNAL_RELATORIOS);
      if (info.exists) {
        const files = await FileSystem.readDirectoryAsync(INTERNAL_RELATORIOS);
        for (const f of files) {
          const fUri = `${INTERNAL_RELATORIOS}${f}`;
          relatorios.push({ name: f, uri: fUri });
        }
      }
    } catch {}
  }

  return { imagens, relatorios };
}

/**
 * Garante que as pastas internas de fallback existam.
 */
async function ensureInternalDirs(): Promise<void> {
  try {
    const infoRoot = await FileSystem.getInfoAsync(INTERNAL_ROOT);
    if (!infoRoot.exists) {
      await FileSystem.makeDirectoryAsync(INTERNAL_ROOT, { intermediates: true });
    }
    const infoImgs = await FileSystem.getInfoAsync(INTERNAL_IMAGENS);
    if (!infoImgs.exists) {
      await FileSystem.makeDirectoryAsync(INTERNAL_IMAGENS, { intermediates: true });
    }
    const infoRels = await FileSystem.getInfoAsync(INTERNAL_RELATORIOS);
    if (!infoRels.exists) {
      await FileSystem.makeDirectoryAsync(INTERNAL_RELATORIOS, { intermediates: true });
    }
  } catch {}
}

/**
 * SALVAMENTO DE IMAGEM:
 * Salva a foto tirada/selecionada na pasta "Imagens" do diretório escolhido pelo usuário.
 */
export async function saveImageToProjectFolder(
  projectName: string,
  sourceUri: string,
  suggestedFilename?: string
): Promise<string> {
  const cleanObra = cleanFolderName(projectName, 'Obra_Geral');
  const timestamp = Date.now();
  const filename = suggestedFilename || `FOTO_${cleanObra}_${timestamp}.jpg`;
  const safeFilename = cleanFolderName(filename, `FOTO_${timestamp}.jpg`);

  await ensureInternalDirs();

  // 1. Salva na pasta interna do app para garantir exibição imediata e offline
  const internalDest = `${INTERNAL_IMAGENS}${cleanObra}_${safeFilename}`;
  try {
    await FileSystem.copyAsync({ from: sourceUri, to: internalDest });
  } catch (errCopy) {
    console.warn('[appFilesService] Cópia interna de imagem:', errCopy);
  }

  // 2. Salva no diretório SAF público do usuário (pasta "Imagens")
  if (Platform.OS === 'android') {
    try {
      let imagensUri = await AsyncStorage.getItem(KEY_SAF_IMAGENS_URI);

      // Se ainda não tiver imagensUri mas tiver directoryUri, tenta recriar/obter a pasta Imagens
      if (!imagensUri) {
        const rootDirUri = await AsyncStorage.getItem(KEY_SAF_DIRECTORY_URI);
        if (rootDirUri) {
          try {
            imagensUri = await StorageAccessFramework.makeDirectoryAsync(rootDirUri, 'Imagens');
            if (imagensUri) await AsyncStorage.setItem(KEY_SAF_IMAGENS_URI, imagensUri);
          } catch {}
        }
      }

      if (imagensUri) {
        // Lê o conteúdo da foto em Base64
        const base64 = await FileSystem.readAsStringAsync(sourceUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Cria o arquivo físico na pasta Imagens escolhida pelo usuário
        const targetFileUri = await StorageAccessFramework.createFileAsync(
          imagensUri,
          `${cleanObra}_${safeFilename}`,
          'image/jpeg'
        );

        // Grava o arquivo físico
        await FileSystem.writeAsStringAsync(targetFileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        console.log(`[appFilesService] ✅ Imagem salva fisicamente na pasta Imagens via SAF: ${targetFileUri}`);
        return targetFileUri;
      }
    } catch (safErr) {
      console.warn('[appFilesService] Erro ao gravar foto via SAF na pasta Imagens:', safErr);
    }
  }

  return internalDest || sourceUri;
}

/**
 * SALVAMENTO DE RELATÓRIO PDF:
 * Salva o relatório PDF na pasta "Relatórios" do diretório escolhido pelo usuário.
 */
export async function saveApprovedPdfToProjectFolder(
  projectName: string,
  reportNumero: string,
  sourcePdfUri: string
): Promise<string> {
  const cleanObra = cleanFolderName(projectName, 'Obra_Geral');
  const cleanNum = cleanFolderName(reportNumero || `REL_${Date.now()}`);
  const baseName = `REL_${cleanObra}_${cleanNum}`;
  const filename = baseName.toLowerCase().endsWith('.pdf') ? baseName : `${baseName}.pdf`;

  await ensureInternalDirs();

  // 1. Salva na pasta interna do app
  const internalDest = `${INTERNAL_RELATORIOS}${filename}`;
  try {
    await FileSystem.copyAsync({ from: sourcePdfUri, to: internalDest });
  } catch (errCopy) {
    console.warn('[appFilesService] Cópia interna de PDF:', errCopy);
  }

  // 2. Salva no diretório SAF público do usuário (pasta "Relatórios")
  if (Platform.OS === 'android') {
    try {
      let relatoriosUri = await AsyncStorage.getItem(KEY_SAF_RELATORIOS_URI);

      // Se ainda não tiver relatoriosUri mas tiver directoryUri, tenta recriar/obter a pasta Relatórios
      if (!relatoriosUri) {
        const rootDirUri = await AsyncStorage.getItem(KEY_SAF_DIRECTORY_URI);
        if (rootDirUri) {
          try {
            relatoriosUri = await StorageAccessFramework.makeDirectoryAsync(rootDirUri, 'Relatórios');
          } catch {
            try {
              relatoriosUri = await StorageAccessFramework.makeDirectoryAsync(rootDirUri, 'Relatorios');
            } catch {}
          }
          if (relatoriosUri) await AsyncStorage.setItem(KEY_SAF_RELATORIOS_URI, relatoriosUri);
        }
      }

      if (relatoriosUri) {
        // Lê o PDF em Base64
        const base64Pdf = await FileSystem.readAsStringAsync(sourcePdfUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Cria o arquivo físico na pasta Relatórios escolhida pelo usuário
        const targetFileUri = await StorageAccessFramework.createFileAsync(
          relatoriosUri,
          filename,
          'application/pdf'
        );

        // Grava o arquivo físico
        await FileSystem.writeAsStringAsync(targetFileUri, base64Pdf, {
          encoding: FileSystem.EncodingType.Base64,
        });

        console.log(`[appFilesService] ✅ PDF salvo fisicamente na pasta Relatórios via SAF: ${targetFileUri}`);
        return targetFileUri;
      }
    } catch (safErr) {
      console.warn('[appFilesService] Erro ao gravar PDF via SAF na pasta Relatórios:', safErr);
    }
  }

  return internalDest || sourcePdfUri;
}

/**
 * Garante pastas das obras e inicialização de diretórios
 */
export async function ensureProjectFolders(projectName: string, projectCode?: string): Promise<{
  projectDir: string;
  imagensDir: string;
  pdfsDir: string;
}> {
  await ensureInternalDirs();
  const folderName = cleanFolderName(projectName);
  const pDir = `${INTERNAL_ROOT}${folderName}/`;
  const iDir = `${pDir}Imagens/`;
  const rDir = `${pDir}Relatorios_Aprovados_PDF/`;

  try {
    const info = await FileSystem.getInfoAsync(pDir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(pDir, { intermediates: true });
    }
    const infoImg = await FileSystem.getInfoAsync(iDir);
    if (!infoImg.exists) {
      await FileSystem.makeDirectoryAsync(iDir, { intermediates: true });
    }
    const infoPdf = await FileSystem.getInfoAsync(rDir);
    if (!infoPdf.exists) {
      await FileSystem.makeDirectoryAsync(rDir, { intermediates: true });
    }
  } catch {}

  return { projectDir: pDir, imagensDir: iDir, pdfsDir: rDir };
}

/**
 * Garante que todas as obras no SQLite tenham suas pastas internas criadas.
 */
export async function ensureAllProjectsFolders(): Promise<void> {
  try {
    await ensureInternalDirs();
    const projetos = await getLocalProjetos('Todos');
    for (const p of projetos) {
      if (p.nome) {
        await ensureProjectFolders(p.nome, (p as any).codigo || p.numero);
      }
    }
  } catch (e) {
    console.warn('[appFilesService] Erro ao garantir pastas das obras:', e);
  }
}

/**
 * Retorna o resumo das pastas de obras cadastradas.
 */
export async function getProjectsFoldersSummary(): Promise<ProjectFolderSummary[]> {
  await ensureAllProjectsFolders();
  const projetos = await getLocalProjetos('Todos');
  const summaries: ProjectFolderSummary[] = [];

  for (const p of projetos) {
    const { projectDir, imagensDir, pdfsDir } = await ensureProjectFolders(p.nome, (p as any).codigo || p.numero);
    const imagens: FileItem[] = [];
    const pdfs: FileItem[] = [];
    let totalSize = 0;

    try {
      const imgFiles = await FileSystem.readDirectoryAsync(imagensDir);
      for (const f of imgFiles) {
        const fUri = `${imagensDir}${f}`;
        const fInfo = await FileSystem.getInfoAsync(fUri);
        const size = (fInfo as any).size || 0;
        totalSize += size;
        imagens.push({ name: f, uri: fUri, size });
      }
    } catch {}

    try {
      const pdfFiles = await FileSystem.readDirectoryAsync(pdfsDir);
      for (const f of pdfFiles) {
        const fUri = `${pdfsDir}${f}`;
        const fInfo = await FileSystem.getInfoAsync(fUri);
        const size = (fInfo as any).size || 0;
        totalSize += size;
        pdfs.push({ name: f, uri: fUri, size });
      }
    } catch {}

    summaries.push({
      projectName: p.nome,
      projectDir,
      imagensDir,
      pdfsDir,
      imagens,
      pdfs,
      totalFiles: imagens.length + pdfs.length,
      totalSize,
    });
  }

  return summaries;
}

/**
 * Retorna o caminho legível da raiz de arquivos
 */
export async function getAppFilesRootDir(): Promise<string> {
  const dirUri = await AsyncStorage.getItem(KEY_SAF_DIRECTORY_URI);
  if (dirUri) {
    return formatDirectoryDisplayName(dirUri);
  }
  return 'Armazenamento Interno (ELP_Arquivos)';
}

/**
 * Abre o gerenciador de arquivos do celular no diretório configurado.
 */
export async function openRootFolderExternally(): Promise<void> {
  const dirUri = await AsyncStorage.getItem(KEY_SAF_DIRECTORY_URI);

  if (Platform.OS === 'android') {
    if (dirUri) {
      try {
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: dirUri,
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        });
        return;
      } catch (e1) {
        console.log('[appFilesService] Intent VIEW falhou:', e1);
      }
    }

    try {
      await IntentLauncher.startActivityAsync('android.intent.action.OPEN_DOCUMENT_TREE', {
        flags: 1,
      });
      return;
    } catch (e2) {}
  }

  Alert.alert(
    'Arquivos do ObraFlow',
    'As pastas "Imagens" e "Relatórios" estão salvas no seu aparelho. Você pode acessá-las pelo app "Meus Arquivos" ou "Files".'
  );
}

/**
 * Abre ou compartilha um arquivo específico
 */
export async function viewOrShareFile(fileUri: string, mimeType?: string): Promise<void> {
  try {
    const isAvail = await Sharing.isAvailableAsync();
    if (isAvail) {
      await Sharing.shareAsync(fileUri, {
        mimeType: mimeType || (fileUri.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        dialogTitle: 'Visualizar / Compartilhar Arquivo',
      });
    } else {
      Alert.alert('Arquivo', `Caminho do arquivo:\n${fileUri}`);
    }
  } catch (err: any) {
    Alert.alert('Erro ao abrir arquivo', err?.message || 'Falha ao processar arquivo.');
  }
}
