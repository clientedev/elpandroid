import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

export interface CapturedPhoto {
  uri: string;
  base64?: string;
}

const docDir = (FileSystem as any).documentDirectory || '';
const ROOT_DIR_NAME = 'ELP RELATORIOS';

/**
 * Caminhos públicos no Android onde o usuário consegue ver pelo "Meus Arquivos" ou "Galeria"
 */
const PUBLIC_ANDROID_DIRS = [
  'file:///storage/emulated/0/Pictures/',
  'file:///storage/emulated/0/Documents/',
  'file:///sdcard/Pictures/',
];

/**
 * Garante a criação da pasta principal 'ELP RELATORIOS' e a subpasta com o nome da respectiva Obra
 */
export async function ensureObraDirectory(projectName?: string): Promise<string> {
  if (!docDir) return '';

  const cleanDocDir = docDir.endsWith('/') ? docDir : `${docDir}/`;
  const rootDir = `${cleanDocDir}${ROOT_DIR_NAME}/`;

  try {
    const rootInfo = await (FileSystem as any).getInfoAsync(rootDir);
    if (!rootInfo.exists) {
      await (FileSystem as any).makeDirectoryAsync(rootDir, { intermediates: true });
    }
  } catch (e) {
    console.warn(`Erro ao criar pasta raiz ${ROOT_DIR_NAME}:`, e);
  }

  // Sanitizar nome do projeto para evitar caracteres inválidos no sistema de arquivos
  const safeProject = (projectName || 'Obra Geral')
    .replace(/[\/\\?%*:|"<>]/g, '_')
    .trim() || 'Obra Geral';

  const obraDir = `${rootDir}${safeProject}/`;
  try {
    const obraInfo = await (FileSystem as any).getInfoAsync(obraDir);
    if (!obraInfo.exists) {
      await (FileSystem as any).makeDirectoryAsync(obraDir, { intermediates: true });
    }
  } catch (e) {
    console.warn(`Erro ao criar pasta da obra ${safeProject}:`, e);
  }

  return obraDir;
}

/**
 * Espelha a foto na pasta pública do celular (Pictures/ELP RELATORIOS/<Obra>/) para visualização imediata nos Arquivos
 */
export async function mirrorToPublicFolder(sourceUri: string, projectName?: string, filename?: string): Promise<void> {
  if (Platform.OS !== 'android' || !sourceUri) return;

  const safeProject = (projectName || 'Obra Geral')
    .replace(/[\/\\?%*:|"<>]/g, '_')
    .trim() || 'Obra Geral';

  const fname = filename || `foto_${Date.now()}.jpg`;

  for (const basePath of PUBLIC_ANDROID_DIRS) {
    try {
      const publicObraDir = `${basePath}${ROOT_DIR_NAME}/${safeProject}/`;
      const dirInfo = await (FileSystem as any).getInfoAsync(publicObraDir);
      if (!dirInfo.exists) {
        await (FileSystem as any).makeDirectoryAsync(publicObraDir, { intermediates: true });
      }
      const publicDestUri = `${publicObraDir}${fname}`;
      await (FileSystem as any).copyAsync({
        from: sourceUri,
        to: publicDestUri,
      });
      // Se copiou com sucesso em um dos diretórios públicos, conclui
      break;
    } catch (e) {
      // Ignora silenciosamente e tenta o próximo caminho
    }
  }
}

/**
 * Utilitário seguro para ler arquivo local como string Base64
 */
export async function readPhotoBase64(uri: string): Promise<string | undefined> {
  if (!uri) return undefined;
  try {
    let safeUri = uri;
    if (safeUri.startsWith('/')) {
      safeUri = `file://${safeUri}`;
    }

    const encoding = (FileSystem as any).EncodingType?.Base64 || 'base64';
    const content = await (FileSystem as any).readAsStringAsync(safeUri, {
      encoding: encoding,
    });
    return content || undefined;
  } catch (err) {
    console.warn('[imageService] Erro ao ler base64 de uri:', uri, err);
    return undefined;
  }
}

export async function takePhoto(projectName?: string): Promise<CapturedPhoto | null> {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alert('Permissão para câmera é necessária para registrar fotos de obras.');
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      base64: true,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const dir = await ensureObraDirectory(projectName);
      
      if (dir) {
        const timestamp = Date.now();
        const rand = Math.floor(100 + Math.random() * 900);
        const filename = `foto_${timestamp}_${rand}.jpg`;
        const permanentUri = `${dir}${filename}`;

        try {
          await (FileSystem as any).copyAsync({
            from: asset.uri,
            to: permanentUri,
          });
          // Espelha para a pasta pública acessível pelo app Meus Arquivos / Galeria do celular
          mirrorToPublicFolder(permanentUri, projectName, filename).catch(() => {});
          return {
            uri: permanentUri,
            base64: asset.base64 || undefined,
          };
        } catch (copyErr) {
          console.warn('Fallback para cache uri:', copyErr);
        }
      }

      return {
        uri: asset.uri,
        base64: asset.base64 || undefined,
      };
    }
    return null;
  } catch (error) {
    console.error('Erro ao tirar foto:', error);
    return null;
  }
}

export async function pickImage(projectName?: string): Promise<CapturedPhoto | null> {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Permissão para galeria é necessária para anexar fotos de obras.');
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      base64: true,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const dir = await ensureObraDirectory(projectName);

      if (dir) {
        const timestamp = Date.now();
        const rand = Math.floor(100 + Math.random() * 900);
        const filename = `foto_${timestamp}_${rand}.jpg`;
        const permanentUri = `${dir}${filename}`;

        try {
          await (FileSystem as any).copyAsync({
            from: asset.uri,
            to: permanentUri,
          });
          // Espelha para a pasta pública acessível pelo app Meus Arquivos / Galeria do celular
          mirrorToPublicFolder(permanentUri, projectName, filename).catch(() => {});
          return {
            uri: permanentUri,
            base64: asset.base64 || undefined,
          };
        } catch (copyErr) {
          console.warn('Fallback para cache uri:', copyErr);
        }
      }

      return {
        uri: asset.uri,
        base64: asset.base64 || undefined,
      };
    }
    return null;
  } catch (error) {
    console.error('Erro ao selecionar foto:', error);
    return null;
  }
}
