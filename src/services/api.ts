import axios, { AxiosInstance } from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL_KEY = 'obraflow_api_base_url';
const AUTH_COOKIE_KEY = 'obraflow_auth_cookie';
const USER_SESSION_KEY = 'obraflow_user_session';

// Default fixed base URL - Railway production backend (fixed & unconfigurable)
export const DEFAULT_API_URL = 'https://elpandroid-production.up.railway.app';

class ApiClient {
  private instance: AxiosInstance;
  private readonly currentBaseUrl: string = DEFAULT_API_URL;
  private sessionCookie: string | null = null;
  private currentMobileUser: any = null;

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
      if (this.currentMobileUser) {
        if (this.currentMobileUser.id) config.headers['X-User-Id'] = String(this.currentMobileUser.id);
        if (this.currentMobileUser.username) config.headers['X-Username'] = this.currentMobileUser.username;
        if (this.currentMobileUser.is_master || this.currentMobileUser.username?.toLowerCase() === 'admin') {
          config.headers['X-Is-Master'] = 'true';
        }
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

  async setBaseUrl(_url: string): Promise<void> {
    // Backend URL is permanently fixed to production Railway
    this.instance.defaults.baseURL = DEFAULT_API_URL;
  }

  getBaseUrl(): string {
    return DEFAULT_API_URL;
  }

  async clearSession(): Promise<void> {
    this.sessionCookie = null;
    await SecureStore.deleteItemAsync(AUTH_COOKIE_KEY);
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

  delete<T = any>(url: string, config?: any): Promise<any> {
    return this.instance.delete<T>(url, config);
  }
}

export const apiClient = new ApiClient();
