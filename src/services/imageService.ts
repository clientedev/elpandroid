import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveImageToProjectFolder, promptSelectStorageDirectory } from './appFilesService';

export interface CapturedPhoto {
  uri: string;
  base64?: string;
  filename?: string;
}

export type PhotoDirectoryType = 'dcim' | 'pictures' | 'documents' | 'app_internal' | 'custom';

export interface PhotoDirectoryConfig {
  type: PhotoDirectoryType;
  label: string;
  subfolder: string;
  customPath?: string;
}

const STORAGE_KEY_PHOTO_DIR = '@elp_custom_photo_directory_v1';

export const DEFAULT_PHOTO_DIR_CONFIG: PhotoDirectoryConfig = {
  type: 'dcim',
  label: 'DCIM / ELP_Obras (Recomendado para Galeria e Câmera)',
  subfolder: 'ELP_Obras',
};

// ─── Constantes de pastas ───────────────────────────────────────────────────
const ROOT_ALBUM = 'ELP';                           // Pasta raiz na galeria
const DCIM_ROOT  = 'file:///storage/emulated/0/DCIM/';   // Android DCIM público
const PICS_ROOT  = 'file:///storage/emulated/0/Pictures/'; // Android Pictures
const DOCS_ROOT  = 'file:///storage/emulated/0/Documents/'; // Android Documents
const docDir     = (FileSystem as any).documentDirectory || '';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Obtém a configuração salva ou o padrão */
export async function getPhotoDirectoryConfig(): Promise<PhotoDirectoryConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_PHOTO_DIR);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[imageService] Erro ao ler configuração de diretório:', e);
  }
  return DEFAULT_PHOTO_DIR_CONFIG;
}

/** Salva a nova configuração de diretório escolhida pelo usuário */
export async function savePhotoDirectoryConfig(config: PhotoDirectoryConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_PHOTO_DIR, JSON.stringify(config));
  } catch (e) {
    console.warn('[imageService] Erro ao salvar configuração de diretório:', e);
  }
}

/** Sanitiza nome de pasta/arquivo */
function safeName(name?: string, fallback = 'Obra Geral'): string {
  return (name || fallback)
    .replace(/[\/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || fallback;
}

/** Garante que um diretório existe (cria se necessário) */
export async function ensureDir(path: string): Promise<boolean> {
  try {
    const info = await (FileSystem as any).getInfoAsync(path);
    if (!info.exists) {
      await (FileSystem as any).makeDirectoryAsync(path, { intermediates: true });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve o diretório físico final configurado pelo usuário para a obra especificada.
 * Toda foto tirada será salva nesse diretório local.
 */
export async function resolveTargetDirectory(projectName?: string): Promise<string> {
  const config = await getPhotoDirectoryConfig();
  const cleanSub = safeName(config.subfolder, 'ELP_Obras');
  const cleanObra = projectName && projectName.trim() ? safeName(projectName) : '';
  
  let basePath = '';
  if (config.type === 'dcim') {
    basePath = `${DCIM_ROOT}${cleanSub}/`;
  } else if (config.type === 'pictures') {
    basePath = `${PICS_ROOT}${cleanSub}/`;
  } else if (config.type === 'documents') {
    basePath = `${DOCS_ROOT}${cleanSub}/`;
  } else if (config.type === 'custom' && config.customPath && config.customPath.trim()) {
    let cp = config.customPath.trim();
    if (!cp.startsWith('file://')) {
      cp = `file:///storage/emulated/0/${cp.replace(/^\/+/, '')}`;
    }
    basePath = cp.endsWith('/') ? cp : `${cp}/`;
  } else {
    // app_internal
    const internal = docDir.endsWith('/') ? docDir : `${docDir}/`;
    basePath = `${internal}${cleanSub}/`;
  }

  // Se tiver obra, organiza em subpasta da obra
  const finalDir = cleanObra ? `${basePath}${cleanObra}/` : basePath;
  await ensureDir(finalDir);
  return finalDir;
}

/**
 * Cria pasta ELP/NomeObra no armazenamento interno do app (documentDirectory) como fallback seguro.
 */
export async function ensureObraDirectory(projectName?: string): Promise<string> {
  return await resolveTargetDirectory(projectName);
}

// ─── Cache de URIs para evitar duplicação ──────────────────────────────────
const savedGalleryUris = new Set<string>();

/**
 * Salva a foto na galeria nativa do dispositivo sem duplicações:
 * - Cria 1 único asset na galeria nativa
 * - Move/Organiza no álbum correspondente ("ELP - Nome da Obra" ou "ELP")
 * - Deduplica por URI para nunca salvar a mesma foto mais de uma vez
 */
export async function savePhotoToDeviceGallery(
  photoUri: string,
  projectName?: string,
  filename?: string
): Promise<any> {
  if (Platform.OS === 'web' || !photoUri) return null;

  // Evita re-salvar a mesma foto múltiplas vezes
  if (savedGalleryUris.has(photoUri)) {
    return null;
  }
  savedGalleryUris.add(photoUri);

  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[Gallery] Permissão negada para salvar na galeria.');
      return null;
    }

    const obraName  = safeName(projectName);
    const albumName = projectName && projectName.trim() ? `ELP - ${obraName}` : ROOT_ALBUM;

    // 1. Cria 1 único asset diretamente no MediaStore do dispositivo
    const asset = await MediaLibrary.createAssetAsync(photoUri);
    if (!asset) return null;

    // 2. Organiza o asset no álbum da obra na galeria (sem gerar duplicata física)
    try {
      let album = await MediaLibrary.getAlbumAsync(albumName);
      if (!album) {
        await MediaLibrary.createAlbumAsync(albumName, asset, false);
      } else {
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      }
    } catch (albumErr) {
      console.warn(`[Gallery] Erro ao vincular foto ao álbum "${albumName}":`, albumErr);
    }

    console.log(`[Gallery] ✅ Foto única salva no álbum "${albumName}" com sucesso.`);
    return asset;
  } catch (err) {
    console.error('[Gallery] Erro ao salvar foto na galeria:', err);
    return null;
  }
}

/**
 * Lê um arquivo como string Base64.
 */
export async function readPhotoBase64(uri: string): Promise<string | undefined> {
  if (!uri) return undefined;
  try {
    const safeUri = uri.startsWith('/') ? `file://${uri}` : uri;
    const encoding = (FileSystem as any).EncodingType?.Base64 || 'base64';
    const content = await (FileSystem as any).readAsStringAsync(safeUri, { encoding });
    return content || undefined;
  } catch (err) {
    console.warn('[imageService] Erro ao ler base64:', uri, err);
    return undefined;
  }
}

/**
 * Tira foto com a câmera.
 * Salva permanentemente no app (documentDirectory) e na galeria nativa do dispositivo.
 */
export async function takePhoto(projectName?: string): Promise<CapturedPhoto | null> {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alert('Permissão para câmera é necessária para registrar fotos de obras.');
      return null;
    }

    // Solicita permissão da galeria antecipadamente para evitar bloqueio no background
    try {
      await MediaLibrary.requestPermissionsAsync();
    } catch {}

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.88,
      base64: true,
      allowsEditing: false,
      exif: false,
    });

    if (result.canceled || !result.assets?.length) return null;

    const asset = result.assets[0];
    const timestamp = Date.now();
    const rand = Math.floor(100 + Math.random() * 900);
    const filename = `elp_foto_${timestamp}_${rand}.jpg`;
    const obraName = safeName(projectName);

    // 1. Salva permanentemente no dispositivo na pasta da Obra -> Imagens/
    let permanentUri = asset.uri;
    try {
      const projName = projectName && projectName.trim() ? projectName : 'Obra_Geral';
      permanentUri = await saveImageToProjectFolder(projName, asset.uri, filename);
    } catch (copyErr) {
      console.warn('[Camera] Fallback para uri original:', copyErr);
    }

    // 2. Garante Base64 em memória para persistência no SQLite
    let b64 = asset.base64 || undefined;
    if (!b64) {
      try {
        b64 = await readPhotoBase64(permanentUri);
      } catch {}
    }

    // 3. Salva na galeria nativa do dispositivo (1 cópia única, assíncrono)
    savePhotoToDeviceGallery(permanentUri, obraName, filename).catch(err =>
      console.warn('[Camera] Erro ao salvar na galeria (background):', err)
    );

    return { uri: permanentUri, base64: b64, filename };
  } catch (error) {
    console.error('[Camera] Erro ao tirar foto:', error);
    return null;
  }
}

/**
 * Seleciona foto da galeria existente.
 * Copia para o diretório permanente do app e salva referência.
 */
export async function pickImage(projectName?: string): Promise<CapturedPhoto | null> {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Permissão para galeria é necessária para anexar fotos de obras.');
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.88,
      base64: true,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.length) return null;

    const asset = result.assets[0];
    const timestamp = Date.now();
    const rand = Math.floor(100 + Math.random() * 900);
    const filename = `elp_import_${timestamp}_${rand}.jpg`;

    // Copia para a pasta da obra -> Imagens/
    let permanentUri = asset.uri;
    try {
      const projName = projectName && projectName.trim() ? projectName : 'Obra_Geral';
      permanentUri = await saveImageToProjectFolder(projName, asset.uri, filename);
    } catch (copyErr) {
      console.warn('[Gallery] Fallback para uri original:', copyErr);
    }

    return { uri: permanentUri, base64: asset.base64 || undefined, filename };
  } catch (error) {
    console.error('[Gallery] Erro ao selecionar foto:', error);
    return null;
  }
}
