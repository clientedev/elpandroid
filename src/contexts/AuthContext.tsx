import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';
import { apiClient } from '../services/api';
import { saveLocalUser } from '../database/db';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';
import { syncService } from '../services/syncService';

interface AuthContextData {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  updateUser: (user: User) => Promise<void>;
  sessionMessage: string | null;
}

const OFFLINE_CRED_KEY = 'elp_offline_cred';

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  useEffect(() => {
    // Token recusado pelo servidor (expirado, senha trocada, usuário desativado) → volta ao login
    apiClient.onUnauthorized(() => {
      forceLogout('Sua sessão expirou. Entre novamente.').catch(() => null);
    });
    loadCachedUser();
    return () => apiClient.onUnauthorized(null);
  }, []);

  async function loadCachedUser() {
    try {
      const cached = await AsyncStorage.getItem('obraflow_current_user');
      const token = await apiClient.getAuthToken();
      if (cached && token) {
        const parsed = JSON.parse(cached);
        setUser(parsed);
        apiClient.setMobileUser(parsed);
        // Atualiza o perfil (permissões podem ter mudado no painel) e sincroniza
        refreshProfile(parsed).catch(() => null);
        syncService.syncAll().catch(() => null);
      } else if (cached && !token) {
        // Instalação vinda de versão antiga (sem token): precisa entrar de novo uma vez
        setSessionMessage('Por segurança, entre novamente com seu usuário e senha.');
      }
    } catch (e) {
      console.warn('Error loading cached user:', e);
    } finally {
      setLoading(false);
    }
  }

  async function refreshProfile(base: User) {
    const res = await apiClient.axios.get('/api/current-user');
    if (res?.data?.id) {
      const merged: User = { ...base, ...res.data };
      if (merged.ativo === false) {
        await forceLogout('Seu usuário foi desativado.');
        return;
      }
      setUser(merged);
      apiClient.setMobileUser(merged);
      await AsyncStorage.setItem('obraflow_current_user', JSON.stringify(merged));
      await saveLocalUser(merged);
    }
  }

  async function forceLogout(message: string) {
    setSessionMessage(message);
    await logout();
  }

  async function login(username: string, password: string): Promise<{ success: boolean; message?: string }> {
    const uname = username.trim();
    if (!uname || !password) {
      return { success: false, message: 'Informe usuário e senha.' };
    }
    try {
      const net = await NetInfo.fetch();
      const isOnline = Boolean(net.isConnected && net.isInternetReachable !== false);

      if (isOnline) {
        const res = await apiClient.axios.post('/api/login', {
          username: uname,
          password,
          remember_me: true,
        }).catch(err => err.response);

        if (res && res.status === 200 && res.data?.success && res.data?.user && res.data?.token) {
          const userData: User = res.data.user;

          // Outro usuário neste aparelho: não reaproveita a sessão do anterior
          const previousRaw = await AsyncStorage.getItem('obraflow_current_user');
          const previous = previousRaw ? JSON.parse(previousRaw) : null;
          if (previous && previous.id !== userData.id) {
            await apiClient.clearSession();
          }

          await apiClient.setAuthToken(res.data.token);
          await SecureStore.setItemAsync(OFFLINE_CRED_KEY, JSON.stringify({ u: uname.toLowerCase(), p: password, id: userData.id }));
          setUser(userData);
          setSessionMessage(null);
          apiClient.setMobileUser(userData);
          await AsyncStorage.setItem('obraflow_current_user', JSON.stringify(userData));
          await saveLocalUser(userData);
          syncService.syncAll().catch(() => null);
          return { success: true };
        }

        if (res && (res.status === 401 || res.status === 400)) {
          return { success: false, message: res.data?.message || 'Usuário ou senha incorretos.' };
        }
        if (res && res.status >= 500) {
          return { success: false, message: 'O servidor está com problema no momento. Tente novamente em instantes.' };
        }
      }

      // Sem internet: só entra quem já fez login online neste aparelho, com a mesma senha
      const cached = await AsyncStorage.getItem('obraflow_current_user');
      const credRaw = await SecureStore.getItemAsync(OFFLINE_CRED_KEY);
      const token = await apiClient.getAuthToken();
      if (cached && credRaw && token) {
        const cred = JSON.parse(credRaw);
        const parsed: User = JSON.parse(cached);
        if (cred.u === uname.toLowerCase() && cred.p === password && cred.id === parsed.id) {
          setUser(parsed);
          setSessionMessage(null);
          apiClient.setMobileUser(parsed);
          return { success: true, message: 'Autenticado em modo offline.' };
        }
        return { success: false, message: 'Usuário ou senha incorretos.' };
      }

      return {
        success: false,
        message: isOnline
          ? 'Não foi possível conectar ao servidor. Tente novamente.'
          : 'Sem internet. O primeiro acesso neste aparelho precisa ser feito online.',
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro ao realizar login.' };
    }
  }

  async function logout() {
    setUser(null);
    apiClient.setMobileUser(null);
    await AsyncStorage.removeItem('obraflow_current_user');
    await SecureStore.deleteItemAsync(OFFLINE_CRED_KEY);
    await apiClient.clearSession();
  }

  async function updateUser(updated: User) {
    setUser(updated);
    apiClient.setMobileUser(updated);
    await AsyncStorage.setItem('obraflow_current_user', JSON.stringify(updated));
    await saveLocalUser(updated);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser, sessionMessage }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
