import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { updateService } from '../../services/updateService';
import {
  getLocalProjetos,
  getLocalVisitas,
  getLocalRelatorios,
  getPendingSyncQueue,
} from '../../database/db';
import { Colors } from '../../theme/colors';

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
      const [projs, vis, rels, queue] = await Promise.all([
        getLocalProjetos(),
        getLocalVisitas(),
        getLocalRelatorios(),
        getPendingSyncQueue(),
      ]);
      setStats({
        projetos: projs.length,
        visitas: vis.length,
        relatorios: rels.length,
        queue: queue.length,
      });
    } catch (err) {
      console.warn('Erro ao carregar diagnósticos:', err);
    }
  }

  async function handleManualSync() {
    if (!isOnline) {
      Alert.alert('Offline', 'Conecte-se à internet para sincronizar dados.');
      return;
    }
    setLoadingSync(true);
    try {
      await triggerSync();
      await loadDiagnostics();
      Alert.alert('Sucesso', 'Sincronização concluída com sucesso!');
    } catch (err) {
      Alert.alert('Erro', 'Falha ao sincronizar dados.');
    } finally {
      setLoadingSync(false);
    }
  }

  async function handleCheckUpdate() {
    setCheckingUpdates(true);
    try {
      const updateInfo = await updateService.checkForUpdate(true);
      if (updateInfo.available) {
        Alert.alert(
          'Atualização Disponível',
          `Nova versão ${updateInfo.version || ''} encontrada. Deseja atualizar agora?`,
          [
            { text: 'Mais tarde', style: 'cancel' },
            {
              text: 'Atualizar',
              onPress: () => updateService.applyUpdate(updateInfo),
            },
          ]
        );
      } else {
        Alert.alert('App Atualizado', 'Você está utilizando a versão mais recente do ObraFlow.');
      }
    } catch (e) {
      Alert.alert('Aviso', 'Não foi possível verificar atualizações no momento.');
    } finally {
      setCheckingUpdates(false);
    }
  }

  function handleLogout() {
    Alert.alert('Sair da Conta', 'Tem certeza de que deseja desconectar deste aparelho?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Ajustes e Configurações</Text>
          <Text style={styles.headerSubtitle}>Gerencie o app, modelos e sincronização</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* User Card */}
        <View style={styles.userCard}>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>
              {user?.username?.substring(0, 2).toUpperCase() || 'OF'}
            </Text>
          </View>
          <View style={styles.userTextWrap}>
            <View style={styles.userNameRow}>
              <Text style={styles.userName}>{user?.username || 'Usuário'}</Text>
              {user?.is_master ? (
                <View style={styles.masterBadge}>
                  <Ionicons name="shield-checkmark" size={12} color="#FFFFFF" />
                  <Text style={styles.masterBadgeText}>MASTER</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.userEmail}>{user?.email || 'Sem e-mail cadastrado'}</Text>
            <Text style={styles.userRole}>
              {user?.cargo || (user?.is_master ? 'Administrador Geral' : 'Engenheiro / Vistoriador')}
            </Text>
          </View>
        </View>

        {/* SEÇÃO 1: MODELOS E ENGENHARIA */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>MODELOS E FORMULÁRIOS</Text>
        </View>

        {/* Botão Personalizar Checklist */}
        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('ChecklistCustomizerScreen')}
        >
          <View style={[styles.menuIconWrap, { backgroundColor: '#EFF6FF' }]}>
            <Ionicons name="checkbox-outline" size={22} color="#2563EB" />
          </View>
          <View style={styles.menuTextWrap}>
            <Text style={styles.menuTitle}>Personalizar Checklist</Text>
            <Text style={styles.menuSubtitle}>
              Configurar etapas técnicas, reordenar e incluir novos itens
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        {/* Botão Legendas Técnicas */}
        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('LegendSettingsScreen')}
        >
          <View style={[styles.menuIconWrap, { backgroundColor: '#F0FDF4' }]}>
            <Ionicons name="text-outline" size={22} color="#16A34A" />
          </View>
          <View style={styles.menuTextWrap}>
            <Text style={styles.menuTitle}>Legendas Técnicas</Text>
            <Text style={styles.menuSubtitle}>
              Biblioteca de termos, anomalias e descrições pré-definidas
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        {/* SEÇÃO 2: ARMAZENAMENTO E ALERTAS */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>DISPOSITIVO E ARQUIVOS</Text>
        </View>

        {/* Botão Arquivos do App */}
        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('AppFilesScreen')}
        >
          <View style={[styles.menuIconWrap, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="folder-open-outline" size={22} color="#D97706" />
          </View>
          <View style={styles.menuTextWrap}>
            <Text style={styles.menuTitle}>Arquivos do App</Text>
            <Text style={styles.menuSubtitle}>
              Pastas locais das obras, fotos e relatórios aprovados em PDF
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        {/* Botão Notificações */}
        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('NotificationsSettingsScreen')}
        >
          <View style={[styles.menuIconWrap, { backgroundColor: '#F5F3FF' }]}>
            <Ionicons name="notifications-outline" size={22} color="#7C3AED" />
          </View>
          <View style={styles.menuTextWrap}>
            <Text style={styles.menuTitle}>Notificações</Text>
            <Text style={styles.menuSubtitle}>
              Alertas no celular, teste de som e avisos de vistorias
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        {/* SEÇÃO 3: ADMINISTRAÇÃO */}
        {(user?.is_master || user?.cargo?.toLowerCase() === 'master' || user?.cargo?.toLowerCase() === 'administrador') && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>ADMINISTRAÇÃO</Text>
            </View>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('UserManagementScreen')}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="people-outline" size={22} color="#2563EB" />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuTitle}>Gestão de Usuários</Text>
                <Text style={styles.menuSubtitle}>
                  Controle de membros da equipe, cargos e permissões
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </>
        )}

        {/* SEÇÃO 4: SINCRONIZAÇÃO E DADOS */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>DADOS E SINCRONIZAÇÃO</Text>
        </View>

        {/* Card de Estatísticas Offline */}
        <View style={styles.syncCard}>
          <View style={styles.syncCardHeader}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: isOnline ? '#16A34A' : '#DC2626' }]} />
              <Text style={styles.statusText}>{isOnline ? 'Conectado à Internet' : 'Modo Offline'}</Text>
            </View>
            {pendingCount > 0 && (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>{pendingCount} pendente(s)</Text>
              </View>
            )}
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats.projetos}</Text>
              <Text style={styles.statLabel}>Obras</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats.visitas}</Text>
              <Text style={styles.statLabel}>Visitas</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats.relatorios}</Text>
              <Text style={styles.statLabel}>Relatórios</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats.queue}</Text>
              <Text style={styles.statLabel}>Fila Sync</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.syncButton, !isOnline && styles.syncButtonDisabled]}
            disabled={!isOnline || loadingSync}
            onPress={handleManualSync}
          >
            {loadingSync ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="sync-outline" size={18} color="#FFFFFF" />
                <Text style={styles.syncButtonText}>Sincronizar com o Servidor Agora</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Botão Verificar Atualizações */}
        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.7}
          onPress={handleCheckUpdate}
          disabled={checkingUpdates}
        >
          <View style={[styles.menuIconWrap, { backgroundColor: '#F1F5F9' }]}>
            <Ionicons name="cloud-download-outline" size={22} color="#475569" />
          </View>
          <View style={styles.menuTextWrap}>
            <Text style={styles.menuTitle}>Verificar Atualizações</Text>
            <Text style={styles.menuSubtitle}>Versão 2.4.0 • Build de Produção</Text>
          </View>
          {checkingUpdates ? (
            <ActivityIndicator size="small" color="#2563EB" />
          ) : (
            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          )}
        </TouchableOpacity>

        {/* Botão Sair da Conta */}
        <TouchableOpacity style={styles.logoutBtn} activeOpacity={0.8} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#DC2626" />
          <Text style={styles.logoutBtnText}>Sair da Conta</Text>
        </TouchableOpacity>

        <View style={styles.versionFooter}>
          <Text style={styles.versionText}>ObraFlow Mobile • Solução Especializada para Engenharia</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  userTextWrap: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  masterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  masterBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  userEmail: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  userRole: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
    marginTop: 4,
  },
  sectionHeader: {
    marginBottom: 8,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  menuIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  menuSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  syncCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  syncCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  pendingBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: 10,
    borderRadius: 8,
    marginHorizontal: 3,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  syncButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  syncButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
    gap: 8,
  },
  logoutBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC2626',
  },
  versionFooter: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 10,
  },
  versionText: {
    fontSize: 12,
    color: '#94A3B8',
  },
});
