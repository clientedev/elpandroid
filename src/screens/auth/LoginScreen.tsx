import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, 
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert, Image, Modal 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { apiClient } from '../../services/api';
import { Colors, Shadows } from '../../theme/colors';

const REMEMBER_KEY = '@elp_remember_login';

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const { isOnline } = useNetwork();

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Forgot password modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotInput, setForgotInput] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

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
      setErrorMessage('Por favor, informe usuário e senha.');
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
        setErrorMessage(res.message || 'Falha na autenticação.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro inesperado.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendForgotPassword() {
    if (!forgotInput.trim()) {
      Alert.alert('Atenção', 'Informe seu e-mail ou nome de usuário.');
      return;
    }

    setForgotLoading(true);
    try {
      const res = await apiClient.axios.post('/api/forgot-password', {
        email: forgotInput.trim(),
        username: forgotInput.trim(),
      });
      setShowForgotModal(false);
      setForgotInput('');
      Alert.alert('Recuperação de Senha', res.data?.message || 'Instruções enviadas com sucesso!');
    } catch (err: any) {
      Alert.alert('Aviso', 'Se a conta existir, as instruções serão encaminhadas para o e-mail cadastrado.');
      setShowForgotModal(false);
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header Logo */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Image 
              source={require('../../../assets/logo.png')} 
              style={styles.logoImage} 
              resizeMode="contain" 
            />
          </View>
          <Text style={styles.brandTitle}>ELP</Text>
          <Text style={styles.brandSubtitle}>Sistema Integrado de Gestão de Obras</Text>

          {/* Network Pill */}
          <View style={[styles.networkPill, isOnline ? styles.onlinePill : styles.offlinePill]}>
            <View style={[styles.pillDot, isOnline ? styles.onlineDot : styles.offlineDot]} />
            <Text style={[styles.pillText, isOnline ? styles.onlineText : styles.offlineText]}>
              {isOnline ? 'Conectado à Nuvem (Railway)' : 'Modo Offline (Banco Local)'}
            </Text>
          </View>
        </View>

        {/* Card Form */}
        <View style={styles.card}>
          <View style={styles.cardHeaderArea}>
            <View style={styles.helmetCircle}>
              <Ionicons name="construct" size={28} color="#0891B2" />
            </View>
            <Text style={styles.cardTitle}>Sistema de Obras</Text>
            <Text style={styles.cardSubtitle}>ELP Consultoria e Engenharia Diagnóstica</Text>
          </View>

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={Colors.danger} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Username Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Usuário *</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Informe seu usuário corporativo"
                placeholderTextColor={Colors.textMuted}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Password Input with Eye Icon */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Senha *</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Digite sua senha de acesso"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                <Ionicons 
                  name={showPassword ? "eye-off-outline" : "eye-outline"} 
                  size={20} 
                  color={Colors.textSecondary} 
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Remember Me & Forgot Password Row */}
          <View style={styles.rememberRow}>
            <TouchableOpacity 
              style={styles.rememberCheckboxRow}
              onPress={() => setRememberMe(!rememberMe)}
            >
              <Ionicons 
                name={rememberMe ? "checkbox" : "square-outline"} 
                size={18} 
                color={rememberMe ? Colors.primary : Colors.textMuted} 
              />
              <Text style={styles.rememberText}>Lembrar-me</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowForgotModal(true)}>
              <Text style={styles.forgotText}>Esqueci minha senha</Text>
            </TouchableOpacity>
          </View>

          {/* Submit Button - 100% width py-2 fw-bold */}
          <TouchableOpacity 
            style={[styles.submitButton, loading && styles.submitButtonDisabled]} 
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.submitText}>Entrar</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>

          {/* Server Info (Fixed) */}
          <View style={styles.fixedServerBox}>
            <Ionicons name="shield-checkmark-outline" size={14} color="#10B981" />
            <Text style={styles.fixedServerText}>
              Servidor Oficial: elpandroid-production.up.railway.app
            </Text>
          </View>
        </View>

        {/* Footer info */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Aplicativo Nativo Android • Sincronização Automática com Railway PostgreSQL
          </Text>
        </View>
      </ScrollView>

      {/* Forgot Password Modal */}
      <Modal visible={showForgotModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Recuperar Senha</Text>
              <TouchableOpacity onPress={() => setShowForgotModal(false)}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              Informe seu e-mail cadastrado ou nome de usuário para receber as instruções de redefinição de senha:
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="seu.email@empresa.com.br"
              placeholderTextColor={Colors.textMuted}
              value={forgotInput}
              onChangeText={setForgotInput}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity 
                style={styles.modalCancelBtn}
                onPress={() => setShowForgotModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.modalConfirmBtn}
                onPress={handleSendForgotPassword}
                disabled={forgotLoading}
              >
                {forgotLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Enviar Instruções</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  logoImage: {
    width: 44,
    height: 44,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  brandSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
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
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  offlinePill: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
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
    fontSize: 11,
    fontWeight: '600',
  },
  onlineText: {
    color: '#10B981',
  },
  offlineText: {
    color: '#F59E0B',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    ...Shadows.lg,
  },
  cardHeaderArea: {
    alignItems: 'center',
    marginBottom: 20,
  },
  helmetCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ECFEFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0F172A',
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: Colors.danger,
    fontSize: 13,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  eyeButton: {
    padding: 4,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  rememberCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rememberText: {
    fontSize: 13,
    color: '#475569',
  },
  forgotText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: Colors.primary,
    height: 48,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Shadows.md,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
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
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    ...Shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
  },
  modalDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 14,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: Colors.text,
    marginBottom: 16,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalCancelText: {
    color: '#64748B',
    fontWeight: '600',
    fontSize: 13,
  },
  modalConfirmBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
});
