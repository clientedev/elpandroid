import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, 
  Alert, ActivityIndicator, Image 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { apiClient, DEFAULT_API_URL } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { updateService } from '../../services/updateService';
import { 
  getLocalProjetos, getLocalVisitas, getLocalRelatorios, 
  getPendingSyncQueue, clearCompletedSyncQueue 
} from '../../database/db';
import { Colors, Shadows } from '../../theme/colors';

export const SettingsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, logout } = useAuth();
  const { isOnline, syncState, pendingCount, triggerSync } = useNetwork();

  const [stats, setStats] = useState({
    projetos: 0,
    visitas: 0,
    relatorios: 0,
    queue: 0,
  });
  const [loadingSync, setLoadingSync] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  useEffect(() => {
    loadDiagnostics();
  }, [pendingCount]);

  async function loadDiagnostics() {
    try {
      const p = await getLocalProjetos();
      const v = await getLocalVisitas();
      const r = await getLocalRelatorios();
      const q = await getPendingSyncQueue();
      setStats({
        projetos: p.length,
        visitas: v.length,
        relatorios: r.length,
        queue: q.length,
      });
    } catch (e) {
      console.warn('Erro ao carregar diagnósticos:', e);
    }
  }

  async function handleManualSync() {
    setLoadingSync(true);
    try {
      const res = await triggerSync();
      await loadDiagnostics();
      Alert.alert(res.success ? 'Sincronizado' : 'Aviso', res.message);
    } catch (err: any) {
      Alert.alert('Erro na Sincronização', err.message);
    } finally {
      setLoadingSync(false);
    }
  }

  async function handleCheckUpdates() {
    setCheckingUpdates(true);
    try {
      await updateService.checkForUpdate(true);
    } finally {
      setCheckingUpdates(false);
    }
  }

  async function handleLogout() {
    Alert.alert(
      'Encerrar Sessão',
      'Deseja sair da sua conta? Os dados salvos localmente no SQLite permanecerão no aparelho.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Sair', 
          style: 'destructive', 
          onPress: async () => {
            await logout();
          } 
        }
      ]
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Configurações & Sincronização" />
      <OfflineBanner />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* User Card */}
        <View style={styles.card}>
          <View style={styles.userHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.username ? user.username.substring(0, 2).toUpperCase() : 'US'}
              </Text>
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.userName}>{user?.username}</Text>
              <Text style={styles.userRole}>{user?.cargo || 'Engenheiro / Técnico'}</Text>
              <Text style={styles.userEmail}>{user?.email}</Text>
            </View>
          </View>
        </View>

        {/* Railway Backend Connection (Fixed & Unconfigurable) */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="server-outline" size={20} color={Colors.primary} />
            <Text style={styles.cardTitle}>Servidor Backend & Nuvem Railway</Text>
          </View>

          <Text style={styles.desc}>
            Serviço backend oficial de produção configurado para sincronização e relatórios:
          </Text>

          <View style={styles.fixedUrlBox}>
            <Ionicons name="shield-checkmark" size={18} color={Colors.success} />
            <Text style={styles.fixedUrlText}>{DEFAULT_API_URL}</Text>
          </View>
        </View>

        {/* Sync Controls */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="sync-outline" size={20} color={Colors.primary} />
            <Text style={styles.cardTitle}>Sincronização Bidirecional</Text>
          </View>

          <View style={styles.syncStatusBox}>
            <View style={styles.statusLine}>
              <Text style={styles.statusLabel}>Status de Conexão:</Text>
              <View style={[styles.pill, isOnline ? styles.pillOnline : styles.pillOffline]}>
                <Text style={[styles.pillText, isOnline ? styles.pillTextOnline : styles.pillTextOffline]}>
                  {isOnline ? 'Online (Railway)' : 'Offline (Local)'}
                </Text>
              </View>
            </View>

            <View style={styles.statusLine}>
              <Text style={styles.statusLabel}>Operações Pendentes de Envio:</Text>
              <Text style={[styles.statusValue, stats.queue > 0 && { color: Colors.syncPending }]}>
                {stats.queue} item(ns)
              </Text>
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.syncNowBtn, loadingSync && { opacity: 0.7 }]}
            onPress={handleManualSync}
            disabled={loadingSync}
          >
            {loadingSync ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={20} color="#FFFFFF" />
                <Text style={styles.syncNowText}>Sincronizar Agora com o Servidor</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Local Storage SQLite Diagnostics */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="file-tray-full-outline" size={20} color={Colors.primary} />
            <Text style={styles.cardTitle}>Diagnóstico do Banco Local (SQLite)</Text>
          </View>

          <View style={styles.diagGrid}>
            <View style={styles.diagItem}>
              <Text style={styles.diagValue}>{stats.projetos}</Text>
              <Text style={styles.diagLabel}>Obras Salvas</Text>
            </View>
            <View style={styles.diagItem}>
              <Text style={styles.diagValue}>{stats.visitas}</Text>
              <Text style={styles.diagLabel}>Visitas Agendadas</Text>
            </View>
            <View style={styles.diagItem}>
              <Text style={styles.diagValue}>{stats.relatorios}</Text>
              <Text style={styles.diagLabel}>Relatórios Locais</Text>
            </View>
            <View style={styles.diagItem}>
              <Text style={styles.diagValue}>{stats.queue}</Text>
              <Text style={styles.diagLabel}>Fila de Sync</Text>
            </View>
          </View>
        </View>

        {/* Updates Card */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="cloud-download-outline" size={20} color={Colors.primary} />
            <Text style={styles.cardTitle}>Atualizações & Versão</Text>
          </View>

          <View style={styles.appInfoRow}>
            <Image 
              source={require('../../../assets/logo.png')} 
              style={styles.settingsLogo} 
              resizeMode="contain" 
            />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.appNameText}>ELP Android</Text>
              <Text style={styles.appVersionText}>Versão Atual: v{updateService.getCurrentVersion()}</Text>
            </View>
          </View>

          <Text style={styles.desc}>
            Verifica se há atualizações recentes publicadas via deploy para o aplicativo.
          </Text>

          <TouchableOpacity 
            style={styles.checkUpdateBtn} 
            onPress={handleCheckUpdates}
            disabled={checkingUpdates}
          >
            {checkingUpdates ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="refresh" size={18} color="#FFFFFF" />
                <Text style={styles.checkUpdateBtnText}>Verificar Atualizações Recentes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
          <Text style={styles.logoutText}>Encerrar Sessão</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  userHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primaryBackground,
    borderWidth: 2,
    borderColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: 'bold', color: Colors.primary },
  userName: { fontSize: 18, fontWeight: 'bold', color: Colors.text },
  userRole: { fontSize: 13, color: Colors.primary, fontWeight: '600', marginTop: 1 },
  userEmail: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.text },
  desc: { fontSize: 12, color: Colors.textSecondary, marginBottom: 10, lineHeight: 16 },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: Colors.text,
    marginBottom: 10,
  },
  buttonRow: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  secondaryBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  primaryBtn: {
    flex: 2,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  primaryBtnText: { fontSize: 13, color: '#FFFFFF', fontWeight: 'bold' },
  syncStatusBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  statusLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  statusLabel: { fontSize: 13, color: Colors.textSecondary },
  statusValue: { fontSize: 13, fontWeight: 'bold', color: Colors.text },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  pillOnline: { backgroundColor: '#D1FAE5' },
  pillOffline: { backgroundColor: '#FEE2E2' },
  pillText: { fontSize: 11, fontWeight: 'bold' },
  pillTextOnline: { color: '#065F46' },
  pillTextOffline: { color: '#991B1B' },
  syncNowBtn: {
    backgroundColor: Colors.primary,
    height: 48,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  syncNowText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
  diagGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  diagItem: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    flex: 1,
    marginHorizontal: 3,
  },
  diagValue: { fontSize: 18, fontWeight: 'bold', color: Colors.primary },
  diagLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    borderRadius: 12,
    height: 50,
  },
  logoutText: { fontSize: 15, fontWeight: 'bold', color: Colors.danger },
  appInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  settingsLogo: {
    width: 48,
    height: 32,
  },
  appNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  appVersionText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  checkUpdateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    height: 46,
    marginTop: 6,
    ...Shadows.sm,
  },
  checkUpdateBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  fixedUrlBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fixedUrlText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '600',
    flex: 1,
  },
});
