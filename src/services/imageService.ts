import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

export interface CapturedPhoto {
  uri: string;
  base64?: string;
}

// ─── Constantes de pastas ───────────────────────────────────────────────────
const ROOT_ALBUM = 'ELP';                           // Pasta raiz na galeria
const DCIM_ROOT  = 'file:///storage/emulated/0/DCIM/ELP/';   // Android DCIM público
const PICS_ROOT  = 'file:///storage/emulated/0/Pictures/ELP/'; // Android Pictures fallback
const docDir     = (FileSystem as any).documentDirectory || '';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Sanitiza nome de pasta/arquivo */
function safeName(name?: string, fallback = 'Obra Geral'): string {
  return (name || fallback)
    .replace(/[\/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || fallback;
}

/** Garante que um diretório existe (cria se necessário) */
async function ensureDir(path: string): Promise<boolean> {
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
 * Cria pasta ELP/NomeObra no armazenamento interno do app (documentDirectory).
 * Usado como armazenamento permanente local para o app.
 */
export async function ensureObraDirectory(projectName?: string): Promise<string> {
  if (!docDir) return '';
  const base   = docDir.endsWith('/') ? docDir : `${docDir}/`;
  const rootDir = `${base}ELP RELATORIOS/`;
  const obraDir = `${rootDir}${safeName(projectName)}/`;
  await ensureDir(rootDir);
  await ensureDir(obraDir);
  return obraDir;
}

/**
 * Salva a foto na galeria nativa do Android/iOS com organização em pastas:
 *   Android: DCIM/ELP/<NomeObra>/  →  aparece na galeria nativa
 *   iOS: Álbum "ELP - <NomeObra>"
 *
 * Fluxo Android:
 *  1. Pede permissão MediaLibrary
 *  2. Copia o arquivo para DCIM/ELP/<NomeObra>/<filename>.jpg
 *  3. Escaneia via createAssetAsync → aparece na galeria nativa organizado
 *  4. Adiciona ao álbum "ELP - <NomeObra>" na galeria (aba Álbuns)
 *
 * Fluxo iOS:
 *  1. Cria asset diretamente do photoUri
 *  2. Adiciona ao álbum "ELP - <NomeObra>"
 */
export async function savePhotoToDeviceGallery(
  photoUri: string,
  projectName?: string,
  filename?: string
): Promise<MediaLibrary.Asset | null> {
  if (Platform.OS === 'web' || !photoUri) return null;

  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[Gallery] Permissão negada para salvar na galeria.');
      return null;
    }

    const obraName  = safeName(projectName);
    const albumName = `ELP - ${obraName}`;
    const fname     = filename || `elp_foto_${Date.now()}.jpg`;

    let assetUri = photoUri;

    // ── Android: copia para DCIM/ELP/<Obra>/ antes de criar asset ─────────
    if (Platform.OS === 'android') {
      const publicUri = await _copyToPublicAndroid(photoUri, obraName, fname);
      if (publicUri) {
        assetUri = publicUri;
      }
    }

    // Cria asset na galeria nativa
    const asset = await MediaLibrary.createAssetAsync(assetUri);
    if (!asset) return null;

    // Adiciona ao álbum da obra
    try {
      let album = await MediaLibrary.getAlbumAsync(albumName);
      if (!album) {
        album = await MediaLibrary.createAlbumAsync(albumName, asset, false);
      } else {
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      }
    } catch (albumErr) {
      console.warn(`[Gallery] Erro ao criar álbum "${albumName}":`, albumErr);
    }

    // Adiciona também ao álbum raiz "ELP"
    try {
      let rootAlbum = await MediaLibrary.getAlbumAsync(ROOT_ALBUM);
      if (!rootAlbum) {
        await MediaLibrary.createAlbumAsync(ROOT_ALBUM, asset, false);
      } else {
        await MediaLibrary.addAssetsToAlbumAsync([asset], rootAlbum, false);
      }
    } catch {}

    console.log(`[Gallery] ✅ Foto salva na galeria: álbum "${albumName}" — ${fname}`);
    return asset;
  } catch (err) {
    console.error('[Gallery] Erro ao salvar foto na galeria:', err);
    return null;
  }
}

/**
 * Copia foto para DCIM/ELP/<NomeObra>/ no Android (pasta pública visível na galeria).
 * Tenta DCIM primeiro, depois Pictures como fallback.
 * Retorna a URI pública se bem-sucedido, null caso contrário.
 */
async function _copyToPublicAndroid(
  sourceUri: string,
  obraName: string,
  filename: string
): Promise<string | null> {
  const candidates = [
    `${DCIM_ROOT}${obraName}/`,
    `${PICS_ROOT}${obraName}/`,
  ];

  for (const dirPath of candidates) {
    try {
      const ok = await ensureDir(dirPath);
      if (!ok) continue;

      const destUri = `${dirPath}${filename}`;
      await (FileSystem as any).copyAsync({ from: sourceUri, to: destUri });
      console.log(`[Gallery] Arquivo copiado para pasta pública: ${destUri}`);
      return destUri;
    } catch (e) {
      console.warn(`[Gallery] Falha ao copiar para ${dirPath}:`, e);
    }
  }
  return null;
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
 * Salva permanentemente no app (documentDirectory/ELP RELATORIOS/<Obra>/)
 * e também na galeria nativa (DCIM/ELP/<Obra>/).
 */
export async function takePhoto(projectName?: string): Promise<CapturedPhoto | null> {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alert('Permissão para câmera é necessária para registrar fotos de obras.');
      return null;
    }

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

    // 1. Salva no diretório permanente do app
    let permanentUri = asset.uri;
    try {
      const appDir = await ensureObraDirectory(projectName);
      if (appDir) {
        const dest = `${appDir}${filename}`;
        await (FileSystem as any).copyAsync({ from: asset.uri, to: dest });
        permanentUri = dest;
      }
    } catch (copyErr) {
      console.warn('[Camera] Fallback para uri original:', copyErr);
    }

    // 2. Salva na galeria nativa do dispositivo (assíncrono, não bloqueia)
    savePhotoToDeviceGallery(permanentUri, obraName, filename).catch(err =>
      console.warn('[Camera] Erro ao salvar na galeria (background):', err)
    );

    return { uri: permanentUri, base64: asset.base64 || undefined };
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

    // Copia para o diretório permanente do app
    let permanentUri = asset.uri;
    try {
      const appDir = await ensureObraDirectory(projectName);
      if (appDir) {
        const dest = `${appDir}${filename}`;
        await (FileSystem as any).copyAsync({ from: asset.uri, to: dest });
        permanentUri = dest;
      }
    } catch (copyErr) {
      console.warn('[Gallery] Fallback para uri original:', copyErr);
    }

    return { uri: permanentUri, base64: asset.base64 || undefined };
  } catch (error) {
    console.error('[Gallery] Erro ao selecionar foto:', error);
    return null;
  }
}
