import { Alert, Platform, AppState, AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './api';
import { syncService } from './syncService';

export interface UpdateInfo {
  available: boolean;
  isOta: boolean;
  version?: string;
  deployId?: string;
  notes?: string;
  downloadUrl?: string;
}

const LAST_DEPLOY_KEY = 'elp_last_seen_deploy_id';
const DISMISSED_DEPLOY_KEY = 'elp_dismissed_deploy_id';

function isVersionGreater(v1: string, v2: string): boolean {
  try {
    const p1 = (v1 || '').replace(/[^0-9.]/g, '').split('.').map(n => parseInt(n, 10) || 0);
    const p2 = (v2 || '').replace(/[^0-9.]/g, '').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const a = p1[i] || 0;
      const b = p2[i] || 0;
      if (a > b) return true;
      if (a < b) return false;
    }
  } catch {
    // fallback
  }
  return false;
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
   * Register a custom UI prompt callback (e.g. UpdateModal)
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
      '1.0.3'
    );
  }

  /**
   * Check for deployed updates (via Railway deploy endpoint and OTA)
   * @param manual - true if triggered manually by user button click
   */
  public async checkForUpdate(manual = false): Promise<UpdateInfo> {
    if (this.isChecking) {
      return { available: false, isOta: false };
    }

    this.isChecking = true;
    this.lastCheckTime = Date.now();

    try {
      // 1. Check Expo Updates (OTA deploy check if configured)
      if (Updates.isEnabled && !__DEV__) {
        try {
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            const info: UpdateInfo = {
              available: true,
              isOta: true,
              version: this.getCurrentVersion(),
              notes: 'Nova versão publicada via deploy no Railway.',
            };
            this.notifyUpdateAvailable(info);
            return info;
          }
        } catch (otaErr) {
          console.log('[UpdateService] OTA check note:', otaErr);
        }
      }

      // 2. Check Railway Backend Deploy & App Version
      try {
        const res = await apiClient.axios.get('/api/app-version', { timeout: 6000 });
        if (res.data) {
          const serverVersion = String(res.data.version || '1.0.3');
          const currentVersion = this.getCurrentVersion();
          const serverDeployId = String(res.data.deployId || res.data.buildTime || serverVersion);
          
          const lastSeenDeployId = await AsyncStorage.getItem(LAST_DEPLOY_KEY);
          const dismissedDeployId = await AsyncStorage.getItem(DISMISSED_DEPLOY_KEY);
          
          // First install on device: initialize last seen deploy ID so we don't nag immediately
          if (!lastSeenDeployId) {
            await AsyncStorage.setItem(LAST_DEPLOY_KEY, serverDeployId);
          }

          // A genuinely new deploy is detected if:
          // 1. The server deploy ID changed from what we previously saw, and has not been dismissed
          // 2. OR server has a strictly higher semver version than the installed app
          const isNewDeploy = Boolean(
            lastSeenDeployId && 
            lastSeenDeployId !== serverDeployId && 
            dismissedDeployId !== serverDeployId
          );
          const hasHigherVersion = isVersionGreater(serverVersion, currentVersion);

          // Prompt if manual check, newer version available, or new un-dismissed deploy
          const shouldPrompt = manual || hasHigherVersion || isNewDeploy;

          if (shouldPrompt) {
            const info: UpdateInfo = {
              available: true,
              isOta: false,
              version: serverVersion,
              deployId: serverDeployId,
              notes: res.data.notes || 'Atualização recente sincronizada no Railway.',
              downloadUrl: res.data.downloadUrl || 'https://elpandroid-production.up.railway.app/download/ELP.apk',
            };
            this.notifyUpdateAvailable(info);
            return info;
          }
        }
      } catch (backendErr) {
        console.warn('[UpdateService] Backend check notice:', backendErr);
      }

      if (manual) {
        Alert.alert(
          'ELP Atualizado',
          `O aplicativo já está na versão mais recente (${this.getCurrentVersion()}) e sincronizado com o Railway.`
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
          { 
            text: 'Mais tarde', 
            style: 'cancel',
            onPress: () => this.dismissUpdate(info),
          },
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
   * Record dismissal of an update so the prompt does not keep repeating
   */
  public async dismissUpdate(info?: UpdateInfo | null): Promise<void> {
    try {
      const deployId = info?.deployId;
      if (deployId) {
        await AsyncStorage.setItem(LAST_DEPLOY_KEY, deployId);
        await AsyncStorage.setItem(DISMISSED_DEPLOY_KEY, deployId);
      }
    } catch (e) {
      console.warn('Error saving dismissed update state:', e);
    }
  }

  /**
   * Apply the update and restart/reload or open APK download and sync data
   */
  public async applyUpdate(info: UpdateInfo): Promise<boolean> {
    if (this.isUpdating) return false;
    this.isUpdating = true;

    try {
      // Record this deploy so we don't prompt repeatedly for this deploy ID
      if (info.deployId) {
        await AsyncStorage.setItem(LAST_DEPLOY_KEY, info.deployId);
        await AsyncStorage.setItem(DISMISSED_DEPLOY_KEY, info.deployId);
      }

      // Sync local database tables with Railway immediately
      try {
        await syncService.syncAll(false);
      } catch (syncErr) {
        console.warn('[UpdateService] Pre-update sync notice:', syncErr);
      }

      if (info.isOta && Updates.isEnabled) {
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
        return true;
      } else if (info.downloadUrl) {
        const { Linking } = require('react-native');
        await Linking.openURL(info.downloadUrl);
        return true;
      } else {
        Alert.alert(
          'Atualização Concluída',
          'O aplicativo foi sincronizado com sucesso com o Railway.'
        );
        return true;
      }
    } catch (error: any) {
      console.error('[UpdateService] Failed to apply update:', error);
      Alert.alert(
        'Erro na Atualização',
        'Não foi possível aplicar a atualização. Tente novamente mais tarde.'
      );
      return false;
    } finally {
      this.isUpdating = false;
    }
  }
}

export const updateService = new UpdateService();
