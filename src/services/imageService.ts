import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

export interface CapturedPhoto {
  uri: string;
  base64?: string;
}

const docDir = (FileSystem as any).documentDirectory || '';
const ELP_DIR = docDir ? `${docDir}${docDir.endsWith('/') ? '' : '/'}ELP/` : '';

async function ensureElpDirectory(): Promise<string> {
  if (!ELP_DIR) return '';
  try {
    const dirInfo = await (FileSystem as any).getInfoAsync(ELP_DIR);
    if (!dirInfo.exists) {
      await (FileSystem as any).makeDirectoryAsync(ELP_DIR, { intermediates: true });
    }
  } catch (e) {
    console.warn('Erro ao criar pasta ELP:', e);
  }
  return ELP_DIR;
}

export async function takePhoto(): Promise<CapturedPhoto | null> {
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
      const dir = await ensureElpDirectory();
      
      if (dir) {
        const filename = `photo_${Date.now()}_${Math.floor(100 + Math.random() * 900)}.jpg`;
        const permanentUri = `${dir}${filename}`;

        try {
          await (FileSystem as any).copyAsync({
            from: asset.uri,
            to: permanentUri,
          });
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

export async function pickImage(): Promise<CapturedPhoto | null> {
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
      const dir = await ensureElpDirectory();

      if (dir) {
        const filename = `gallery_${Date.now()}_${Math.floor(100 + Math.random() * 900)}.jpg`;
        const permanentUri = `${dir}${filename}`;

        try {
          await (FileSystem as any).copyAsync({
            from: asset.uri,
            to: permanentUri,
          });
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
