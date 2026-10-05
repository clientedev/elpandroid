import { Alert, Platform, AppState, AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { apiClient } from './api';

export interface UpdateInfo {
  available: boolean;
  isOta: boolean;
  version?: string;
  notes?: string;
  downloadUrl?: string;
}

class UpdateService {
  private isChecking = false;
  private isUpdating = false;
  private updatePromptCallback: ((info: UpdateInfo) => void) | null = null;
  private lastCheckTime = 0;

  constructor() {
    this.setupAppStateListener();
  }

  /**
   * Register a custom UI prompt callback (e.g. a Modal)
   */
  public registerPromptCallback(cb: (info: UpdateInfo) => void) {
    this.updatePromptCallback = cb;
  }

  public unregisterPromptCallback() {
    this.updatePromptCallback = null;
  }

  /**
   * Listen to AppState to automatically check for updates when returning to foreground
   */
  private setupAppStateListener() {
    let currentAppState = AppState.currentState;
    AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        currentAppState.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // Debounce foreground checks (at least 60 seconds between checks)
        const now = Date.now();
        if (now - this.lastCheckTime > 60000) {
          this.checkForUpdate(false);
        }
      }
      currentAppState = nextAppState;
    });
  }

  /**
   * Get current local app version
   */
  public getCurrentVersion(): string {
    return (
      Constants.expoConfig?.version ||
      Constants.manifest2?.extra?.expoClient?.version ||
      '1.0.0'
    );
  }

  /**
   * Check for deployed updates (via expo-updates OTA or backend version endpoint)
   * @param manual - true if triggered manually by user button click
   */
  public async checkForUpdate(manual = false): Promise<UpdateInfo> {
    if (this.isChecking) {
      return { available: false, isOta: false };
    }

    this.isChecking = true;
    this.lastCheckTime = Date.now();

    try {
      // 1. Check Expo Updates (OTA deploy check)
      if (Updates.isEnabled && !__DEV__) {
        try {
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            const info: UpdateInfo = {
              available: true,
              isOta: true,
              version: this.getCurrentVersion(),
              notes: 'Nova versão publicada via deploy.',
            };
            this.notifyUpdateAvailable(info);
            return info;
          }
        } catch (otaErr) {
          console.log('[UpdateService] OTA check error:', otaErr);
        }
      }

      // 2. Check Backend Server Version / Deploy manifest (fallback/hybrid check)
      try {
        const res = await apiClient.axios.get('/api/app-version', { timeout: 5000 });
        if (res.data && res.data.version) {
          const serverVersion = res.data.version;
          const currentVersion = this.getCurrentVersion();
          
          if (serverVersion !== currentVersion) {
            const info: UpdateInfo = {
              available: true,
              isOta: false,
              version: serverVersion,
              notes: res.data.notes || 'Nova versão com melhorias e correções.',
              downloadUrl: res.data.downloadUrl,
            };
            this.notifyUpdateAvailable(info);
            return info;
          }
        }
      } catch {
        // Backend version check endpoint might not exist yet; normal
      }

      if (manual) {
        Alert.alert(
          'ELP Atualizado',
          `O aplicativo já está na versão mais recente (${this.getCurrentVersion()}). Não há novas atualizações disponíveis no momento.`
        );
      }

      return { available: false, isOta: false };
    } catch (e: any) {
      console.warn('[UpdateService] Check failed:', e);
      if (manual) {
        Alert.alert('Aviso', 'Não foi possível verificar atualizações no momento.');
      }
      return { available: false, isOta: false };
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Display the prompt "Tem uma atualização recente. Deseja atualizar?"
   */
  public notifyUpdateAvailable(info: UpdateInfo) {
    if (this.updatePromptCallback) {
      this.updatePromptCallback(info);
    } else {
      // Native Alert fallback
      Alert.alert(
        'Atualização Disponível',
        'Tem uma atualização recente. Deseja atualizar?',
        [
          { text: 'Mais tarde', style: 'cancel' },
          {
            text: 'Atualizar',
            style: 'default',
            onPress: () => this.applyUpdate(info),
          },
        ]
      );
    }
  }

  /**
   * Apply the update and restart/reload the application
   */
  public async applyUpdate(info: UpdateInfo): Promise<boolean> {
    if (this.isUpdating) return false;
    this.isUpdating = true;

    try {
      if (info.isOta && Updates.isEnabled) {
        // Fetch OTA bundle
        await Updates.fetchUpdateAsync();
        // Immediately reload into the updated version
        await Updates.reloadAsync();
        return true;
      } else if (info.downloadUrl) {
        const { Linking } = require('react-native');
        await Linking.openURL(info.downloadUrl);
        return true;
      } else {
        // If in development or no specific url, inform user
        Alert.alert(
          'Atualização Baixada',
          'O aplicativo foi atualizado com sucesso. Reinicie o aplicativo para aplicar as alterações.'
        );
        return true;
      }
    } catch (error: any) {
      console.error('[UpdateService] Failed to apply update:', error);
      Alert.alert(
        'Erro na Atualização',
        'Não foi possível baixar a atualização recente. Tente novamente mais tarde.'
      );
      return false;
    } finally {
      this.isUpdating = false;
    }
  }
}

export const updateService = new UpdateService();
