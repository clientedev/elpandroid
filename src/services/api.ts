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

  constructor() {
    this.instance = axios.create({
      baseURL: this.currentBaseUrl,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    this.init();
  }

  async init() {
    try {
      // Clean up legacy custom URLs to guarantee fixed production URL
      await AsyncStorage.removeItem(API_URL_KEY);
      this.sessionCookie = await SecureStore.getItemAsync(AUTH_COOKIE_KEY);
    } catch (e) {
      console.warn('Error loading stored auth session:', e);
    }

    // Interceptor to add cookie and mobile user headers
    this.instance.interceptors.request.use(async (config) => {
      if (this.sessionCookie) {
        config.headers.Cookie = this.sessionCookie;
      }
      try {
        const storedUser = await AsyncStorage.getItem('obraflow_current_user');
        if (storedUser) {
          const user = JSON.parse(storedUser);
          if (user?.id) config.headers['X-User-Id'] = String(user.id);
          if (user?.username) config.headers['X-Username'] = user.username;
          if (user?.is_master || user?.username?.toLowerCase() === 'admin') {
            config.headers['X-Is-Master'] = 'true';
          }
        }
      } catch {}
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
}

export const apiClient = new ApiClient();
