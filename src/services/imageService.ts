import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

export interface CapturedPhoto {
  uri: string;
  base64?: string;
}

const docDir = (FileSystem as any).documentDirectory || '';
const ROOT_DIR_NAME = 'ELP RELATORIOS';

/**
 * Caminhos públicos no Android onde o usuário consegue ver pelo "Meus Arquivos" ou "Gerenciador de Arquivos"
 */
const PUBLIC_ANDROID_DIRS = [
  'file:///storage/emulated/0/DCIM/',
  'file:///storage/emulated/0/Pictures/',
  'file:///storage/emulated/0/Documents/',
  'file:///sdcard/Pictures/',
];

/**
 * Garante a criação da pasta principal 'ELP RELATORIOS' e a subpasta com o nome da respectiva Obra
 * no armazenamento permanente do aplicativo.
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
    console.warn(`[imageService] Erro ao criar pasta raiz ${ROOT_DIR_NAME}:`, e);
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
    console.warn(`[imageService] Erro ao criar pasta da obra ${safeProject}:`, e);
  }

  return obraDir;
}

/**
 * Salva a foto diretamente na Galeria Nativa do dispositivo (Álbum / MediaStore),
 * criando os Álbuns na Galeria do celular:
 * 1) Álbum específico da Obra: 'ELP - <Nome da Obra>'
 * 2) Álbum geral: 'ELP RELATORIOS'
 * Isto garante que ao abrir a Galeria nativa (Samsung, Motorola, Xiaomi, etc.),
 * as fotos aparecem organizadas na aba de Álbuns em suas respectivas pastas.
 */
export async function savePhotoToDeviceGallery(
  photoUri: string,
  projectName?: string
): Promise<any> {
  if (Platform.OS === 'web' || !photoUri) return null;

  try {
    // Solicita permissão para acessar e salvar na galeria do dispositivo
    const permissions = await MediaLibrary.requestPermissionsAsync();
    if (permissions.status !== 'granted') {
      console.warn('[imageService] Permissão para salvar na galeria não concedida pelo usuário.');
      return null;
    }

    // 1. Cria o asset no MediaStore do Android / Galeria Nativa
    const asset = await MediaLibrary.createAssetAsync(photoUri);
    if (!asset) return null;

    const safeProject = (projectName || 'Obra Geral')
      .replace(/[\/\\?%*:|"<>]/g, '_')
      .trim() || 'Obra Geral';

    const obraAlbumName = safeProject !== 'Obra Geral' ? `ELP - ${safeProject}` : 'ELP RELATORIOS';

    // 2. Adiciona ao álbum da Obra na Galeria
    try {
      let obraAlbum = await MediaLibrary.getAlbumAsync(obraAlbumName);
      if (!obraAlbum) {
        obraAlbum = await MediaLibrary.createAlbumAsync(obraAlbumName, asset, false);
      } else {
        await MediaLibrary.addAssetsToAlbumAsync([asset], obraAlbum, false);
      }
    } catch (albumErr) {
      console.warn(`[imageService] Erro ao vincular foto ao álbum ${obraAlbumName}:`, albumErr);
    }

    // 3. Garante também presença no álbum principal 'ELP RELATORIOS'
    if (obraAlbumName !== 'ELP RELATORIOS') {
      try {
        let generalAlbum = await MediaLibrary.getAlbumAsync('ELP RELATORIOS');
        if (!generalAlbum) {
          await MediaLibrary.createAlbumAsync('ELP RELATORIOS', asset, false);
        } else {
          await MediaLibrary.addAssetsToAlbumAsync([asset], generalAlbum, false);
        }
      } catch (genErr) {
        console.warn('[imageService] Erro ao vincular foto ao álbum geral ELP RELATORIOS:', genErr);
      }
    }

    return asset;
  } catch (err) {
    console.error('[imageService] Erro ao salvar foto no álbum da galeria:', err);
    return null;
  }
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
      // Tenta o próximo diretório público
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

          // 1. Salva imediatamente no Álbum da Galeria Nativa do Dispositivo (com pasta da obra)
          savePhotoToDeviceGallery(permanentUri, projectName).catch(galleryErr => {
            console.warn('[imageService] Erro em segundo plano ao salvar na galeria:', galleryErr);
          });

          // 2. Espelha para as pastas públicas do sistema de arquivos
          mirrorToPublicFolder(permanentUri, projectName, filename).catch(() => {});

          return {
            uri: permanentUri,
            base64: asset.base64 || undefined,
          };
        } catch (copyErr) {
          console.warn('Fallback para cache uri:', copyErr);
        }
      }

      // Se não conseguiu salvar no diretório permanente, tenta salvar o original na galeria
      savePhotoToDeviceGallery(asset.uri, projectName).catch(() => {});

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

          // Salva no Álbum da Galeria se for nova foto importada para a obra
          savePhotoToDeviceGallery(permanentUri, projectName).catch(() => {});
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
