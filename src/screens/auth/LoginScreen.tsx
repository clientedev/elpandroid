import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';

const REMEMBER_KEY = '@elp_remember_login';
const SECURE_REMEMBER_KEY = 'elp_remember_login';

// Paleta tirada do logo ELP: grafite (E/P) + azul (L)
const C = {
  bg: '#FFFFFF',
  ink: '#121A20',      // grafite do E e do P
  brand: '#00AEEF',    // azul do L
  inkSoft: '#475569',
  muted: '#94A3B8',
  field: '#F6F8FB',
  line: '#E5E9F0',
  accent: '#0284C7',
  accentSoft: '#E0F2FE',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  warn: '#B45309',
  warnSoft: '#FFFBEB',
};

export const LoginScreen: React.FC = () => {
  const { login, sessionMessage } = useAuth();
  const { isOnline } = useNetwork();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [focused, setFocused] = useState<'user' | 'pass' | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const appVersion = Constants.expoConfig?.version ?? '';

  useEffect(() => {
    // Remove cópia antiga em texto aberto (versões <= 1.0.67) e lê do armazenamento criptografado
    AsyncStorage.removeItem(REMEMBER_KEY).catch(() => null);
    SecureStore.getItemAsync(SECURE_REMEMBER_KEY).then(val => {
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (parsed.username) setUsername(parsed.username);
          if (parsed.password) setPassword(parsed.password);
          setRememberMe(true);
        } catch {
          // ignore
        }
      }
    });
  }, []);

  async function handleLogin() {
    if (!username.trim() || !password) {
      setErrorMessage('Informe seu usuário e senha.');
      return;
    }

    setErrorMessage('');
    setLoading(true);

    try {
      if (rememberMe) {
        await SecureStore.setItemAsync(SECURE_REMEMBER_KEY, JSON.stringify({ username, password }));
      } else {
        await SecureStore.deleteItemAsync(SECURE_REMEMBER_KEY);
      }

      const res = await login(username, password);
      if (!res.success) {
        setErrorMessage(res.message || 'Usuário ou senha incorretos.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao conectar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const notice = errorMessage || sessionMessage || '';
  const noticeIsError = Boolean(errorMessage);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {/* Marca */}
          <View style={styles.brand}>
            <Image
              source={require('../../../assets/logo-wordmark.png')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="ELP"
            />
            <Text style={styles.brandSubtitle}>Engenharia diagnóstica e gestão de obras</Text>
          </View>

          {/* Aviso / erro */}
          {notice ? (
            <View style={[styles.notice, noticeIsError ? styles.noticeError : styles.noticeInfo]}>
              <Ionicons
                name={noticeIsError ? 'alert-circle' : 'information-circle'}
                size={18}
                color={noticeIsError ? C.danger : C.accent}
              />
              <Text style={[styles.noticeText, { color: noticeIsError ? C.danger : C.inkSoft }]}>
                {notice}
              </Text>
            </View>
          ) : null}

          {/* Usuário */}
          <Text style={styles.label}>Usuário ou e-mail</Text>
          <View style={[styles.field, focused === 'user' && styles.fieldFocused]}>
            <Ionicons
              name="person-outline"
              size={19}
              color={focused === 'user' ? C.accent : C.muted}
            />
            <TextInput
              style={styles.input}
              placeholder="seu.usuario ou email@empresa.com"
              placeholderTextColor={C.muted}
              value={username}
              onChangeText={t => { setUsername(t); if (errorMessage) setErrorMessage(''); }}
              onFocus={() => setFocused('user')}
              onBlur={() => setFocused(null)}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="username"
              textContentType="username"
              importantForAutofill="yes"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={!loading}
            />
            {username.length > 0 && !loading && (
              <TouchableOpacity
                onPress={() => setUsername('')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Limpar usuário"
              >
                <Ionicons name="close-circle" size={18} color={C.muted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Senha */}
          <Text style={[styles.label, { marginTop: 18 }]}>Senha</Text>
          <View style={[styles.field, focused === 'pass' && styles.fieldFocused]}>
            <Ionicons
              name="lock-closed-outline"
              size={19}
              color={focused === 'pass' ? C.accent : C.muted}
            />
            <TextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="Sua senha"
              placeholderTextColor={C.muted}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={t => { setPassword(t); if (errorMessage) setErrorMessage(''); }}
              onFocus={() => setFocused('pass')}
              onBlur={() => setFocused(null)}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              textContentType="password"
              importantForAutofill="yes"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!loading}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(v => !v)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={showPassword ? C.accent : C.muted}
              />
            </TouchableOpacity>
          </View>

          {/* Manter conectado */}
          <TouchableOpacity
            style={styles.rememberRow}
            onPress={() => setRememberMe(v => !v)}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: rememberMe }}
          >
            <View style={[styles.checkbox, rememberMe && styles.checkboxOn]}>
              {rememberMe && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
            </View>
            <Text style={styles.rememberText}>Manter conectado</Text>
          </TouchableOpacity>

          {/* Entrar */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonLoading]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.buttonText}>Entrar</Text>
            )}
          </TouchableOpacity>

          {/* Só aparece sem internet: muda o que é possível fazer */}
          {!isOnline && (
            <View style={styles.offline}>
              <Ionicons name="cloud-offline-outline" size={15} color={C.warn} />
              <Text style={styles.offlineText}>
                Offline: só entra quem já usou este aparelho.
              </Text>
            </View>
          )}
        </View>

        {/* Rodapé */}
        <View style={styles.footer}>
          <Text style={styles.footerBrand}>
            GL<Text style={styles.footerBrandAccent}>Systems</Text>
          </Text>
          {appVersion ? <Text style={styles.footerVersion}>versão {appVersion}</Text> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 56,
    paddingBottom: 24,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    flexGrow: 1,
    justifyContent: 'center',
  },

  brand: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 150,
    height: 50, // proporção do wordmark (720 x 242)
  },
  brandSubtitle: {
    marginTop: 16,
    fontSize: 14,
    color: C.inkSoft,
    letterSpacing: 0.1,
  },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  noticeError: {
    backgroundColor: C.dangerSoft,
  },
  noticeInfo: {
    backgroundColor: C.accentSoft,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },

  label: {
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
    marginBottom: 8,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 54,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: C.field,
    borderWidth: 1.5,
    borderColor: C.field,
  },
  fieldFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: C.accent,
  },
  input: {
    flex: 1,
    height: '100%',
    paddingVertical: 0,
    fontSize: 15,
    color: C.ink,
  },

  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 10,
    marginTop: 18,
    marginBottom: 26,
    paddingVertical: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxOn: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  rememberText: {
    fontSize: 14,
    color: C.inkSoft,
    fontWeight: '500',
  },

  button: {
    height: 54,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 3,
  },
  buttonLoading: {
    opacity: 0.75,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: C.warnSoft,
  },
  offlineText: {
    fontSize: 12.5,
    color: C.warn,
    fontWeight: '600',
  },

  footer: {
    alignItems: 'center',
    marginTop: 32,
    gap: 2,
  },
  footerBrand: {
    fontSize: 13,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: 0.4,
  },
  footerBrandAccent: {
    color: C.brand,
  },
  footerVersion: {
    fontSize: 11.5,
    color: C.muted,
  },
});
