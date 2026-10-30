import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
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
const INTERNAL_OBRAS = `${INTERNAL_ROOT}Obras/`;

export interface FileItem {
  name: string;
  uri: string;
  size?: number;
  modificationTime?: number;
  isDirectory?: boolean;
  obraName?: string;
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
    const slashParts = decoded.split('/');
    const lastPart = slashParts[slashParts.length - 1];
    if (lastPart && lastPart.includes(':')) {
      const colParts = lastPart.split(':');
      return colParts[colParts.length - 1] || lastPart;
    }
    return lastPart || 'Pasta Selecionada';
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
  const directoryUri = await AsyncStorage.getItem(KEY_SAF_DIRECTORY_URI);
  const imagensUri = await AsyncStorage.getItem(KEY_SAF_IMAGENS_URI);
  const relatoriosUri = await AsyncStorage.getItem(KEY_SAF_RELATORIOS_URI);

  const { imagens, relatorios } = await getStoredPhysicalFiles();

  return {
    isConfigured: Boolean(directoryUri),
    directoryUri,
    directoryName: formatDirectoryDisplayName(directoryUri),
    imagensUri,
    relatoriosUri,
    totalImagensCount: imagens.length,
    totalRelatoriosCount: relatorios.length,
  };
}

/**
 * Retorna todos os arquivos reais salvos fisicamente nas pastas Imagens e Relatórios.
 */
export async function getStoredPhysicalFiles(): Promise<{
  imagens: FileItem[];
  relatorios: FileItem[];
}> {
  await ensureInternalDirs();

  const imagensMap = new Map<string, FileItem>();
  const relatoriosMap = new Map<string, FileItem>();

  // 1. Lê arquivos locais internos (garantia offline e exibição imediata)
  try {
    const imgInfo = await FileSystem.getInfoAsync(INTERNAL_IMAGENS);
    if (imgInfo.exists) {
      const files = await FileSystem.readDirectoryAsync(INTERNAL_IMAGENS);
      for (const f of files) {
        const fUri = `${INTERNAL_IMAGENS}${f}`;
        const fStat = await FileSystem.getInfoAsync(fUri);
        imagensMap.set(f.toLowerCase(), {
          name: f,
          uri: fUri,
          size: (fStat as any).size || 0,
        });
      }
    }
  } catch (errIntImgs) {
    console.warn('[appFilesService] Leitura de imagens internas:', errIntImgs);
  }

  try {
    const relInfo = await FileSystem.getInfoAsync(INTERNAL_RELATORIOS);
    if (relInfo.exists) {
      const files = await FileSystem.readDirectoryAsync(INTERNAL_RELATORIOS);
      for (const f of files) {
        const fUri = `${INTERNAL_RELATORIOS}${f}`;
        const fStat = await FileSystem.getInfoAsync(fUri);
        relatoriosMap.set(f.toLowerCase(), {
          name: f,
          uri: fUri,
          size: (fStat as any).size || 0,
        });
      }
    }
  } catch (errIntRels) {
    console.warn('[appFilesService] Leitura de relatórios internos:', errIntRels);
  }

  // 1b. Lê arquivos salvos nas pastas de cada obra (Obras/<Obra>/Imagens e /Relatorios)
  try {
    const obrasInfo = await FileSystem.getInfoAsync(INTERNAL_OBRAS);
    if (obrasInfo.exists) {
      const obraFolders = await FileSystem.readDirectoryAsync(INTERNAL_OBRAS);
      for (const folder of obraFolders) {
        const imgs = await listInternalFiles(`${INTERNAL_OBRAS}${folder}/Imagens/`);
        for (const f of imgs) imagensMap.set(`${folder}/${f.name}`.toLowerCase(), { ...f, obraName: folder });
        const pdfs = await listInternalFiles(`${INTERNAL_OBRAS}${folder}/Relatorios/`);
        for (const f of pdfs) relatoriosMap.set(`${folder}/${f.name}`.toLowerCase(), { ...f, obraName: folder });
      }
    }
  } catch (errObras) {
    console.warn('[appFilesService] Leitura das pastas das obras:', errObras);
  }

  // 2. Lê arquivos do SAF (diretório público escolhido pelo usuário)
  if (Platform.OS === 'android') {
    const imagensUri = await AsyncStorage.getItem(KEY_SAF_IMAGENS_URI);
    const relatoriosUri = await AsyncStorage.getItem(KEY_SAF_RELATORIOS_URI);

    if (imagensUri) {
      try {
        const entries = await StorageAccessFramework.readDirectoryAsync(imagensUri);
        for (const uri of entries) {
          const name = formatDirectoryDisplayName(uri);
          const key = name.toLowerCase();
          if (!imagensMap.has(key)) {
            imagensMap.set(key, { name, uri });
          }
        }
      } catch (e) {
        console.warn('[appFilesService] Erro ao ler imagens do SAF:', e);
      }
    }

    if (relatoriosUri) {
      try {
        const entries = await StorageAccessFramework.readDirectoryAsync(relatoriosUri);
        for (const uri of entries) {
          const name = formatDirectoryDisplayName(uri);
          const key = name.toLowerCase();
          if (!relatoriosMap.has(key)) {
            relatoriosMap.set(key, { name, uri });
          }
        }
      } catch (e) {
        console.warn('[appFilesService] Erro ao ler relatórios do SAF:', e);
      }
    }
  }

  return {
    imagens: Array.from(imagensMap.values()),
    relatorios: Array.from(relatoriosMap.values()),
  };
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
 * Lista os arquivos (não diretórios) de uma pasta interna.
 */
async function listInternalFiles(dir: string): Promise<FileItem[]> {
  const out: FileItem[] = [];
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return out;
    const names = await FileSystem.readDirectoryAsync(dir);
    for (const f of names) {
      const fUri = `${dir}${f}`;
      const fStat: any = await FileSystem.getInfoAsync(fUri);
      if (fStat?.isDirectory) continue;
      out.push({
        name: f,
        uri: fUri,
        size: fStat?.size || 0,
        modificationTime: fStat?.modificationTime,
      });
    }
  } catch (e) {
    console.warn('[appFilesService] Falha ao listar pasta:', dir, e);
  }
  return out;
}

/**
 * Localiza (ou cria) uma subpasta com o nome informado dentro de um diretório SAF.
 */
async function findOrCreateSafDir(parentUri: string, name: string): Promise<string | null> {
  try {
    const entries: string[] = await StorageAccessFramework.readDirectoryAsync(parentUri);
    const target = name.toLowerCase();
    for (const entry of entries) {
      const decoded = decodeURIComponent(entry);
      const last = decoded.split('/').pop() || '';
      const lastName = (last.includes(':') ? last.split(':').pop() : last) || last;
      if (lastName.toLowerCase() === target) return entry;
    }
  } catch {}
  try {
    return await StorageAccessFramework.makeDirectoryAsync(parentUri, name);
  } catch {
    return null;
  }
}

/**
 * Retorna (criando se necessário) a subpasta SAF "<raiz>/<Obra>/<sub>" escolhida pelo usuário.
 */
async function getSafObraSubfolder(obraFolder: string, sub: 'Imagens' | 'Relatorios'): Promise<string | null> {
  const cacheKey = `@obraflow_saf_obra_${obraFolder}_${sub}`;
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      try {
        await StorageAccessFramework.readDirectoryAsync(cached);
        return cached;
      } catch {
        await AsyncStorage.removeItem(cacheKey);
      }
    }
    const rootDirUri = await AsyncStorage.getItem(KEY_SAF_DIRECTORY_URI);
    if (!rootDirUri) return null;
    const obraUri = await findOrCreateSafDir(rootDirUri, obraFolder);
    if (!obraUri) return null;
    const subUri = await findOrCreateSafDir(obraUri, sub);
    if (subUri) await AsyncStorage.setItem(cacheKey, subUri);
    return subUri;
  } catch (e) {
    console.warn('[appFilesService] Falha ao obter subpasta SAF da obra:', e);
    return null;
  }
}

/**
 * SALVAMENTO DE IMAGEM:
 * Salva a foto na pasta da própria Obra: <ELP_Arquivos>/Obras/<Obra>/Imagens/
 * (e, quando o usuário vinculou uma pasta do aparelho, em <pasta>/<Obra>/Imagens/).
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

  const { imagensDir } = await ensureProjectFolders(projectName);

  // 1. Salva na pasta da obra (offline e exibição imediata)
  const internalDest = `${imagensDir}${safeFilename}`;
  try {
    const existing = await FileSystem.getInfoAsync(internalDest);
    if (!existing.exists) {
      await FileSystem.copyAsync({ from: sourceUri, to: internalDest });
    }
  } catch (errCopy) {
    console.warn('[appFilesService] Cópia interna de imagem:', errCopy);
  }

  // 2. Salva em background no diretório SAF público do usuário (pasta da obra)
  if (Platform.OS === 'android') {
    (async () => {
      try {
        let targetDir = await getSafObraSubfolder(cleanObra, 'Imagens');
        let targetName = safeFilename;
        if (!targetDir) {
          targetDir = await AsyncStorage.getItem(KEY_SAF_IMAGENS_URI);
          targetName = `${cleanObra}_${safeFilename}`;
        }
        if (!targetDir) return;

        const base64 = await FileSystem.readAsStringAsync(internalDest, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const targetFileUri = await StorageAccessFramework.createFileAsync(targetDir, targetName, 'image/jpeg');
        await FileSystem.writeAsStringAsync(targetFileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        console.log(`[appFilesService] ✅ Imagem salva na pasta da obra via SAF: ${targetFileUri}`);
      } catch (safErr) {
        console.warn('[appFilesService] Erro ao gravar foto via SAF:', safErr);
      }
    })().catch(() => null);
  }

  // SEMPRE retorna a URI do arquivo local (file://...) para exibição imediata e offline-first
  return internalDest || sourceUri;
}

/**
 * SALVAMENTO DE RELATÓRIO PDF:
 * Salva o PDF na pasta da própria Obra: <ELP_Arquivos>/Obras/<Obra>/Relatorios/
 * (e, quando o usuário vinculou uma pasta do aparelho, em <pasta>/<Obra>/Relatorios/).
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

  const { pdfsDir } = await ensureProjectFolders(projectName);

  // 1. Salva na pasta da obra (sobrescreve a versão anterior do mesmo relatório)
  const internalDest = `${pdfsDir}${filename}`;
  try {
    await FileSystem.deleteAsync(internalDest, { idempotent: true });
    await FileSystem.copyAsync({ from: sourcePdfUri, to: internalDest });
  } catch (errCopy) {
    console.warn('[appFilesService] Cópia interna de PDF:', errCopy);
  }

  // 2. Salva no diretório SAF público do usuário (pasta da obra)
  if (Platform.OS === 'android') {
    try {
      let targetDir = await getSafObraSubfolder(cleanObra, 'Relatorios');
      if (!targetDir) {
        targetDir = await AsyncStorage.getItem(KEY_SAF_RELATORIOS_URI);
      }
      if (targetDir) {
        const base64Pdf = await FileSystem.readAsStringAsync(sourcePdfUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const targetFileUri = await StorageAccessFramework.createFileAsync(targetDir, filename, 'application/pdf');
        await FileSystem.writeAsStringAsync(targetFileUri, base64Pdf, {
          encoding: FileSystem.EncodingType.Base64,
        });
        console.log(`[appFilesService] ✅ PDF salvo na pasta da obra via SAF: ${targetFileUri}`);
        return internalDest || targetFileUri;
      }
    } catch (safErr) {
      console.warn('[appFilesService] Erro ao gravar PDF via SAF:', safErr);
    }
  }

  return internalDest || sourcePdfUri;
}

/**
 * Garante pastas da obra: <ELP_Arquivos>/Obras/<Obra>/{Imagens,Relatorios}/
 */
export async function ensureProjectFolders(projectName: string, projectCode?: string): Promise<{
  projectDir: string;
  imagensDir: string;
  pdfsDir: string;
}> {
  await ensureInternalDirs();
  const folderName = cleanFolderName(projectName);
  const pDir = `${INTERNAL_OBRAS}${folderName}/`;
  const iDir = `${pDir}Imagens/`;
  const rDir = `${pDir}Relatorios/`;

  try {
    for (const d of [pDir, iDir, rDir]) {
      const info = await FileSystem.getInfoAsync(d);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(d, { intermediates: true });
      }
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
 * Retorna o resumo das pastas de obras cadastradas (arquivos lidos direto da pasta de cada obra).
 */
export async function getProjectsFoldersSummary(): Promise<ProjectFolderSummary[]> {
  const projetos = await getLocalProjetos('Todos');
  const { imagens: legacyImgs, relatorios: legacyRels } = await getStoredPhysicalFiles();
  const summaries: ProjectFolderSummary[] = [];

  for (const p of projetos) {
    const cleanName = cleanFolderName(p.nome, 'Obra');
    const { projectDir, imagensDir, pdfsDir } = await ensureProjectFolders(p.nome, (p as any).codigo || p.numero);

    const projImgs = await listInternalFiles(imagensDir);
    const projPdfs = await listInternalFiles(pdfsDir);

    // Arquivos legados (salvos antes na pasta global) que pertencem a esta obra
    const known = new Set([...projImgs, ...projPdfs].map(f => f.name.toLowerCase()));
    for (const img of legacyImgs) {
      if (img.obraName) continue;
      if (img.name.toLowerCase().includes(cleanName.toLowerCase()) && !known.has(img.name.toLowerCase())) {
        projImgs.push(img);
      }
    }
    for (const pdf of legacyRels) {
      if (pdf.obraName) continue;
      const matches =
        pdf.name.toLowerCase().includes(cleanName.toLowerCase()) ||
        (p.numero && pdf.name.toLowerCase().includes(cleanFolderName(p.numero).toLowerCase()));
      if (matches && !known.has(pdf.name.toLowerCase())) {
        projPdfs.push(pdf);
      }
    }

    let totalSize = 0;
    projImgs.forEach(i => totalSize += (i.size || 0));
    projPdfs.forEach(r => totalSize += (r.size || 0));

    summaries.push({
      projectName: p.nome,
      projectDir,
      imagensDir,
      pdfsDir,
      imagens: projImgs,
      pdfs: projPdfs,
      totalFiles: projImgs.length + projPdfs.length,
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
