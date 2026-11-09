import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, 
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { Colors, Shadows } from '../../theme/colors';

const REMEMBER_KEY = '@elp_remember_login';

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const { isOnline } = useNetwork();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    AsyncStorage.getItem(REMEMBER_KEY).then(val => {
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
      setErrorMessage('Por favor, informe seu usuário e senha.');
      return;
    }

    setErrorMessage('');
    setLoading(true);

    try {
      if (rememberMe) {
        await AsyncStorage.setItem(REMEMBER_KEY, JSON.stringify({ username, password }));
      } else {
        await AsyncStorage.removeItem(REMEMBER_KEY);
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

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView 
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top Header / Branding */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Image 
              source={require('../../../assets/logo.png')} 
              style={styles.logoImage} 
              resizeMode="contain" 
            />
          </View>
          <Text style={styles.brandTitle}>ELP ENGENHARIA</Text>
          <Text style={styles.brandSubtitle}>Sistema Integrado de Gestão & Diagnóstico de Obras</Text>

          {/* Status de Conexão Clean */}
          <View style={[styles.networkPill, isOnline ? styles.onlinePill : styles.offlinePill]}>
            <View style={[styles.pillDot, isOnline ? styles.onlineDot : styles.offlineDot]} />
            <Text style={[styles.pillText, isOnline ? styles.onlineText : styles.offlineText]}>
              {isOnline ? 'Nuvem Conectada' : 'Modo Offline Ativo'}
            </Text>
          </View>
        </View>

        {/* Card de Login Clean & Profissional */}
        <View style={styles.card}>
          <View style={styles.cardHeaderArea}>
            <View style={styles.iconCircle}>
              <Ionicons name="shield-checkmark" size={26} color="#0891B2" />
            </View>
            <Text style={styles.cardTitle}>Acesso Corporativo</Text>
            <Text style={styles.cardSubtitle}>Entre com suas credenciais para continuar</Text>
          </View>

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={Colors.danger} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Campo Usuário */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Usuário ou E-mail</Text>
            <View style={styles.inputWrapper}>
              <Ionicons 
                name="person-outline" 
                size={20} 
                color={Colors.textMuted} 
                style={styles.inputIcon} 
              />
              <TextInput
                style={styles.input}
                placeholder="Digite seu usuário ou e-mail"
                placeholderTextColor={Colors.textMuted}
                value={username}
                onChangeText={setUsername}
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
              {username.length > 0 && (
                <TouchableOpacity onPress={() => setUsername('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Campo Senha com Botão de Revelar Senha */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Senha de Acesso</Text>
            <View style={styles.inputWrapper}>
              <Ionicons 
                name="lock-closed-outline" 
                size={20} 
                color={Colors.textMuted} 
                style={styles.inputIcon} 
              />
              <TextInput
                ref={passwordRef}
                style={styles.input}
                placeholder="Digite sua senha"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
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
                onPress={() => setShowPassword(!showPassword)} 
                style={styles.eyeButton}
                activeOpacity={0.7}
                accessibilityLabel={showPassword ? "Ocultar senha" : "Ver senha"}
              >
                <Ionicons 
                  name={showPassword ? "eye-off-outline" : "eye-outline"} 
                  size={21} 
                  color={showPassword ? Colors.primary : Colors.textSecondary} 
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Linha Permanecer Conectado */}
          <View style={styles.rememberRow}>
            <TouchableOpacity 
              style={styles.rememberCheckboxRow}
              onPress={() => setRememberMe(!rememberMe)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkboxContainer, rememberMe && styles.checkboxContainerChecked]}>
                {rememberMe && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
              </View>
              <Text style={styles.rememberText}>Permanecer conectado</Text>
            </TouchableOpacity>
          </View>

          {/* Botão Entrar */}
          <TouchableOpacity 
            style={[styles.submitButton, loading && styles.submitButtonDisabled]} 
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Text style={styles.submitText}>Entrar no Sistema</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>

          {/* Selo de Segurança e Servidor */}
          <View style={styles.fixedServerBox}>
            <Ionicons name="shield-checkmark-outline" size={15} color="#10B981" />
            <Text style={styles.fixedServerText}>
              Ambiente Criptografado & Protegido
            </Text>
          </View>
        </View>

        {/* Rodapé Corporativo */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            ObraFlow • Sistema Corporativo Android
          </Text>
          <Text style={styles.footerSubtext}>
            ELP Consultoria e Engenharia Diagnóstica
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B132B',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 26,
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: '#1C2541',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#3A506B',
    ...Shadows.md,
  },
  logoImage: {
    width: 46,
    height: 46,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  brandSubtitle: {
    fontSize: 12.5,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  networkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 12,
  },
  onlinePill: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  offlinePill: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  onlineDot: {
    backgroundColor: '#10B981',
  },
  offlineDot: {
    backgroundColor: '#F59E0B',
  },
  pillText: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  onlineText: {
    color: '#10B981',
  },
  offlineText: {
    color: '#F59E0B',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 26,
    ...Shadows.lg,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardHeaderArea: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 3,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: '#DC2626',
    fontSize: 12.5,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
  },
  inputWrapperFocused: {
    borderColor: '#0284C7',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: '100%',
    paddingVertical: 0,
    fontSize: 14.5,
    color: '#0F172A',
    fontWeight: '500',
  },
  eyeButton: {
    padding: 6,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    marginTop: 2,
  },
  rememberCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxContainer: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxContainerChecked: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  rememberText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  forgotText: {
    fontSize: 12.5,
    color: '#0284C7',
    fontWeight: '700',
  },
  submitButton: {
    backgroundColor: '#0284C7',
    height: 50,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.65,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  fixedServerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  fixedServerText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
    gap: 2,
  },
  footerText: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  footerSubtext: {
    fontSize: 10.5,
    color: '#64748B',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(11, 19, 43, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 22,
    ...Shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 18,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalCancelText: {
    color: '#64748B',
    fontWeight: '700',
    fontSize: 13,
  },
  modalConfirmBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
});
