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
      '1.0.5'
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
              notes: 'Nova versão publicada na nuvem.',
            };
            this.notifyUpdateAvailable(info);
            return info;
          }
        } catch (otaErr) {
          console.log('[UpdateService] OTA check note:', otaErr);
        }
      }

      let serverData: any = null;

      // 2. Check Backend Deploy & App Version
      try {
        const res = await apiClient.axios.get('/api/app-version', { timeout: 10000 });
        if (res.data && res.data.version) {
          serverData = res.data;
        }
      } catch (backendErr) {
        console.warn('[UpdateService] Backend check notice (tentando fallback GitHub):', backendErr);
      }

      // Fallback: consulta direta via GitHub CDN caso Railway esteja instável ou bloqueado por DNS da rede
      if (!serverData) {
        try {
          const ghRes = await fetch('https://raw.githubusercontent.com/clientedev/elpandroid/main/app.json', {
            headers: { 'Cache-Control': 'no-cache' }
          }).then(r => r.json());
          if (ghRes?.expo?.version) {
            serverData = {
              version: ghRes.expo.version,
              versionCode: ghRes.expo.android?.versionCode,
              appName: 'ELP',
              notes: 'Atualização recente sincronizada no repositório.',
              downloadUrl: 'https://github.com/clientedev/elpandroid/raw/main/ELP.apk',
            };
          }
        } catch (ghErr) {
          console.warn('[UpdateService] GitHub fallback check notice:', ghErr);
        }
      }

      if (serverData) {
        const serverVersion = String(serverData.version || '1.0.3');
        const currentVersion = this.getCurrentVersion();
        const serverDeployId = String(serverData.deployId || serverData.buildTime || serverVersion);
        const serverVersionCode = Number(serverData.versionCode || 0);
        const currentVersionCode = Number(Constants.expoConfig?.android?.versionCode ?? 11);

        const hasHigherVersion = isVersionGreater(serverVersion, currentVersion) || (serverVersionCode > currentVersionCode);

        if (serverDeployId) {
          await AsyncStorage.setItem(LAST_DEPLOY_KEY, serverDeployId);
        }

        // Dispara notificação se houver nova versão real disponível
        if (hasHigherVersion) {
          const info: UpdateInfo = {
            available: true,
            isOta: false,
            version: serverVersion,
            deployId: serverDeployId,
            notes: serverData.notes || 'Atualização recente sincronizada na nuvem.',
            downloadUrl: serverData.downloadUrl || 'https://elpandroid-production.up.railway.app/download/ELP.apk',
          };
          this.notifyUpdateAvailable(info);
          return info;
        }

        if (manual) {
          Alert.alert(
            'ELP Atualizado',
            `O aplicativo já está na versão mais recente (${currentVersion}) e sincronizado com a nuvem.`
          );
        }

        return { available: false, isOta: false };
      }

      if (manual) {
        Alert.alert(
          'Falha na Verificação',
          'Não foi possível conectar ao servidor de atualizações. Verifique se a rede Wi-Fi está bloqueando a conexão e tente pelos dados móveis (4G/5G).'
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
          'O aplicativo foi sincronizado com sucesso com a nuvem.'
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
