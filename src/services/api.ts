import axios, { AxiosInstance } from 'axios';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL_KEY = 'obraflow_api_base_url';
const AUTH_COOKIE_KEY = 'obraflow_auth_cookie';
const USER_SESSION_KEY = 'obraflow_user_session';

// Default base URL - Railway backend or fallback
export const DEFAULT_API_URL = 'http://10.0.2.2:5000'; // 10.0.2.2 is Android emulator localhost

class ApiClient {
  private instance: AxiosInstance;
  private currentBaseUrl: string = DEFAULT_API_URL;
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
      const storedUrl = await AsyncStorage.getItem(API_URL_KEY);
      if (storedUrl) {
        this.currentBaseUrl = storedUrl;
        this.instance.defaults.baseURL = storedUrl;
      }
      this.sessionCookie = await SecureStore.getItemAsync(AUTH_COOKIE_KEY);
    } catch (e) {
      console.warn('Error loading stored API config:', e);
    }

    // Interceptor to add cookie header
    this.instance.interceptors.request.use((config) => {
      if (this.sessionCookie) {
        config.headers.Cookie = this.sessionCookie;
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
  }

  async setBaseUrl(url: string): Promise<void> {
    const formatted = url.trim().replace(/\/+$/, '');
    this.currentBaseUrl = formatted;
    this.instance.defaults.baseURL = formatted;
    await AsyncStorage.setItem(API_URL_KEY, formatted);
  }

  getBaseUrl(): string {
    return this.currentBaseUrl;
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
