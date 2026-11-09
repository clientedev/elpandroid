import axios, { AxiosInstance } from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL_KEY = 'obraflow_api_base_url';
const AUTH_COOKIE_KEY = 'obraflow_auth_cookie';
const USER_SESSION_KEY = 'obraflow_user_session';
export const AUTH_TOKEN_KEY = 'elp_auth_token';

// Default fixed base URL - Railway production backend (fixed & unconfigurable)
export const DEFAULT_API_URL = 'https://elpandroid-production.up.railway.app';

class ApiClient {
  private instance: AxiosInstance;
  private readonly currentBaseUrl: string = DEFAULT_API_URL;
  private sessionCookie: string | null = null;
  private currentMobileUser: any = null;
  private authToken: string | null = null;
  private unauthorizedHandler: (() => void) | null = null;

  constructor() {
    this.instance = axios.create({
      baseURL: this.currentBaseUrl,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Interceptor to add cookie and mobile user headers (synchronous for maximum reliability)
    this.instance.interceptors.request.use((config) => {
      if (this.sessionCookie) {
        config.headers.Cookie = this.sessionCookie;
      }
      // Identificação SOMENTE pelo token assinado do servidor (nada de X-User-Id / X-Is-Master)
      if (this.authToken) {
        config.headers.Authorization = `Bearer ${this.authToken}`;
      }
      return config;
    });

    // Interceptor to capture set-cookie header
    this.instance.interceptors.response.use(
      async (response) => {
        const setCookie = response.headers['set-cookie'];
        if (setCookie && Array.isArray(setCookie) && setCookie.length > 0) {
          const cookieVal = setCookie.join('; ');
          this.sessionCookie = cookieVal;
          await SecureStore.setItemAsync(AUTH_COOKIE_KEY, cookieVal);
        }
        return response;
      },
      (error) => {
        const status = error?.response?.status;
        const authRequired = error?.response?.data?.auth_required;
        if (status === 401 && authRequired && this.authToken && this.unauthorizedHandler) {
          this.unauthorizedHandler();
        }
        return Promise.reject(error);
      }
    );

    this.init();
  }

  async init() {
    try {
      // Clean up legacy custom URLs to guarantee fixed production URL
      await AsyncStorage.removeItem(API_URL_KEY);
      this.sessionCookie = await SecureStore.getItemAsync(AUTH_COOKIE_KEY);
      this.authToken = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      const rawUser = await AsyncStorage.getItem('obraflow_current_user');
      if (rawUser) {
        this.currentMobileUser = JSON.parse(rawUser);
      }
    } catch (e) {
      console.warn('Error loading stored auth session:', e);
    }
  }

  public setMobileUser(user: any) {
    this.currentMobileUser = user;
  }

  async setAuthToken(token: string | null): Promise<void> {
    this.authToken = token;
    if (token) await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  }

  async getAuthToken(): Promise<string | null> {
    if (!this.authToken) this.authToken = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
    return this.authToken;
  }

  /** Chamado quando o servidor recusa o token (expirado, senha trocada, usuário desativado) */
  onUnauthorized(handler: (() => void) | null) {
    this.unauthorizedHandler = handler;
  }

  async setBaseUrl(_url: string): Promise<void> {
    // Backend URL is permanently fixed to production Railway
    this.instance.defaults.baseURL = DEFAULT_API_URL;
  }

  getBaseUrl(): string {
    return DEFAULT_API_URL;
  }

  async clearSession(): Promise<void> {
    this.sessionCookie = null;
    this.authToken = null;
    await SecureStore.deleteItemAsync(AUTH_COOKIE_KEY);
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
    await AsyncStorage.removeItem(USER_SESSION_KEY);
  }

  get axios(): AxiosInstance {
    return this.instance;
  }

  get<T = any>(url: string, config?: any): Promise<any> {
    return this.instance.get<T>(url, config);
  }

  post<T = any>(url: string, data?: any, config?: any): Promise<any> {
    return this.instance.post<T>(url, data, config);
  }

  put<T = any>(url: string, data?: any, config?: any): Promise<any> {
    return this.instance.put<T>(url, data, config);
  }

  async testConnection(): Promise<{
    success: boolean;
    latencyMs: number;
    message: string;
    server?: string;
    timestamp?: string;
    databaseConnected?: boolean;
    apkVersion?: string;
  }> {
    const start = Date.now();
    try {
      const res = await this.instance.get('/api/ping', { timeout: 8000 });
      const latencyMs = Date.now() - start;
      if (res.status === 200 && res.data) {
        return {
          success: true,
          latencyMs,
          message: res.data.message || 'Comunicação com o site funcionando!',
          server: res.data.server || 'Railway',
          timestamp: res.data.timestamp,
          databaseConnected: res.data.database_connected,
          apkVersion: res.data.apk_version,
        };
      }
      return {
        success: false,
        latencyMs,
        message: `Servidor retornou HTTP ${res.status}`,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      return {
        success: false,
        latencyMs,
        message: err.message || 'Falha ao conectar com o site.',
      };
    }
  }

  delete<T = any>(url: string, config?: any): Promise<any> {
    return this.instance.delete<T>(url, config);
  }
}

export const apiClient = new ApiClient();
