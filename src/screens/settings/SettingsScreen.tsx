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
  Modal,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { updateService } from '../../services/updateService';
import { apiClient, DEFAULT_API_URL } from '../../services/api';
import {
  getLocalProjetos,
  getLocalVisitas,
  getLocalRelatorios,
  getPendingSyncQueue,
} from '../../database/db';
import { Colors } from '../../theme/colors';

const WIDGETS_CONFIG_KEY = '@elp_dashboard_widgets_v2';
const APP_PREFS_KEY = '@elp_app_preferences';

interface AppPreferences {
  compressPhotos: boolean;
  autoSync: boolean;
  highQualityUpload: boolean;
}

const DEFAULT_WIDGETS = {
  showHero: true,
  showBadges: true,
  showObrasAtivas: true,
  showRelatoriosPendentes: true,
  showVisitasAgendadas: true,
  showRelatoriosRascunho: true,
  showAcoesRapidas: true,
  showRelatoriosRecentes: true,
  showProximasVisitas: true,
};

const DEFAULT_PREFS: AppPreferences = {
  compressPhotos: true,
  autoSync: true,
  highQualityUpload: false,
};

export const SettingsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, logout } = useAuth();
  const { isOnline, pendingCount, triggerSync } = useNetwork();

  const [stats, setStats] = useState({
    projetos: 0,
    visitas: 0,
    relatorios: 0,
    queue: 0,
  });
  const [loadingSync, setLoadingSync] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  // Status de Comunicação Site <-> APK
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    tested: boolean;
    success: boolean;
    latencyMs?: number;
    message?: string;
    server?: string;
  }>({
    tested: false,
    success: false,
  });

  // Modal de Preferências do App
  const [showPrefsModal, setShowPrefsModal] = useState(false);
  const [widgetsConfig, setWidgetsConfig] = useState(DEFAULT_WIDGETS);
  const [appPrefs, setAppPrefs] = useState<AppPreferences>(DEFAULT_PREFS);

  // Modal de Visão de Usuários (Desenvolvedor)
  const [showDevModal, setShowDevModal] = useState(false);
  const [loadingDevUsers, setLoadingDevUsers] = useState(false);
  const [devUsersList, setDevUsersList] = useState<any[]>([]);

  const isDevUser = Boolean(
    user?.is_developer ||
    user?.cargo?.toLowerCase() === 'desenvolvedor' ||
    user?.username?.toLowerCase() === 'desenvolvedor'
  );

  const isMasterUser = Boolean(
    user?.is_master ||
    user?.cargo?.toLowerCase() === 'master' ||
    user?.cargo?.toLowerCase() === 'administrador'
  );

  useEffect(() => {
    loadDiagnostics();
    loadPreferences();
    testServerConnection(false);
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

  async function loadPreferences() {
    try {
      const savedWidgets = await AsyncStorage.getItem(WIDGETS_CONFIG_KEY);
      if (savedWidgets) {
        setWidgetsConfig({ ...DEFAULT_WIDGETS, ...JSON.parse(savedWidgets) });
      }
      const savedPrefs = await AsyncStorage.getItem(APP_PREFS_KEY);
      if (savedPrefs) {
        setAppPrefs({ ...DEFAULT_PREFS, ...JSON.parse(savedPrefs) });
      }
    } catch (e) {
      console.warn('Erro ao carregar preferências:', e);
    }
  }

  async function savePreferences() {
    try {
      await AsyncStorage.setItem(WIDGETS_CONFIG_KEY, JSON.stringify(widgetsConfig));
      await AsyncStorage.setItem(APP_PREFS_KEY, JSON.stringify(appPrefs));
      setShowPrefsModal(false);
      Alert.alert('Preferências Salvas', 'Os ajustes do aplicativo foram atualizados com sucesso!');
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível salvar as preferências.');
    }
  }

  async function resetPreferences() {
    setWidgetsConfig(DEFAULT_WIDGETS);
    setAppPrefs(DEFAULT_PREFS);
    try {
      await AsyncStorage.removeItem(WIDGETS_CONFIG_KEY);
      await AsyncStorage.removeItem(APP_PREFS_KEY);
      Alert.alert('Restaurado', 'As preferências foram redefinidas para o padrão.');
    } catch (e) {}
  }

  async function testServerConnection(showAlert: boolean = true) {
    setTestingConnection(true);
    try {
      const result = await apiClient.testConnection();
      setConnectionStatus({
        tested: true,
        success: result.success,
        latencyMs: result.latencyMs,
        message: result.message,
        server: result.server,
      });
      if (showAlert) {
        if (result.success) {
          Alert.alert(
            'Comunicação OK! ✅',
            `O aplicativo está se comunicando perfeitamente com o site.\n\nServidor: ${result.server || 'Railway'}\nLatência: ${result.latencyMs} ms\nStatus: Conectado e Sincronizado`
          );
        } else {
          Alert.alert(
            'Aviso de Conexão ⚠️',
            `Não foi possível obter resposta do servidor.\nMotivo: ${result.message}`
          );
        }
      }
    } catch (err: any) {
      setConnectionStatus({
        tested: true,
        success: false,
        message: err.message || 'Falha na requisição.',
      });
      if (showAlert) {
        Alert.alert('Erro de Conexão', 'Não foi possível se comunicar com o site.');
      }
    } finally {
      setTestingConnection(false);
    }
  }

  async function loadDeveloperUsersView() {
    setLoadingDevUsers(true);
    setShowDevModal(true);
    try {
      const res = await apiClient.axios.get('/api/developer/usuarios-visao');
      if (res.data && res.data.usuarios) {
        setDevUsersList(res.data.usuarios);
      }
    } catch (e: any) {
      console.warn('Erro ao carregar visão dos usuários:', e);
      Alert.alert('Aviso', 'Não foi possível carregar a visão completa de usuários.');
    } finally {
      setLoadingDevUsers(false);
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
      await updateService.checkForUpdate(true);
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
          <Text style={styles.headerSubtitle}>Gerencie o app, modelos, preferências e sincronização</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* User Card */}
        <View style={styles.userCard}>
          <View style={[styles.avatarWrap, isDevUser ? styles.avatarDev : null]}>
            <Text style={styles.avatarText}>
              {user?.username?.substring(0, 2).toUpperCase() || 'OF'}
            </Text>
          </View>
          <View style={styles.userTextWrap}>
            <View style={styles.userNameRow}>
              <Text style={styles.userName}>{user?.nome_completo || user?.username || 'Usuário'}</Text>
              {isDevUser ? (
                <View style={styles.devBadge}>
                  <Ionicons name="code-slash" size={11} color="#FFFFFF" />
                  <Text style={styles.devBadgeText}>DEV</Text>
                </View>
              ) : isMasterUser ? (
                <View style={styles.masterBadge}>
                  <Ionicons name="shield-checkmark" size={11} color="#FFFFFF" />
                  <Text style={styles.masterBadgeText}>MASTER</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.userEmail}>{user?.email || 'Sem e-mail cadastrado'}</Text>
            <Text style={styles.userRole}>
              {user?.cargo || (isDevUser ? 'Desenvolvedor' : isMasterUser ? 'Administrador Geral' : 'Engenheiro / Vistoriador')}
            </Text>
          </View>
        </View>

        {/* SEÇÃO 1: COMUNICAÇÃO DO SITE COM O APK */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>COMUNICAÇÃO SITE & APLICATIVO</Text>
        </View>

        <View style={styles.connectionCard}>
          <View style={styles.connectionHeader}>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: !isOnline
                      ? '#DC2626'
                      : connectionStatus.success
                      ? '#16A34A'
                      : '#F59E0B',
                  },
                ]}
              />
              <Text style={styles.connectionStatusTitle}>
                {!isOnline
                  ? 'Celular Sem Internet'
                  : connectionStatus.success
                  ? 'Site e APK Conectados'
                  : connectionStatus.tested
                  ? 'Conexão Instável'
                  : 'Verificando Comunicação...'}
              </Text>
            </View>

            {connectionStatus.latencyMs !== undefined && connectionStatus.success ? (
              <View style={styles.latencyBadge}>
                <Ionicons name="speedometer-outline" size={12} color="#16A34A" />
                <Text style={styles.latencyText}>{connectionStatus.latencyMs} ms</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.connectionDetailsBox}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Servidor Backend:</Text>
              <Text style={styles.detailValue} numberOfLines={1}>
                {DEFAULT_API_URL.replace('https://', '')}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Sincronização em Nuvem:</Text>
              <Text style={[styles.detailValue, { color: isOnline ? '#16A34A' : '#DC2626' }]}>
                {isOnline ? 'Ativa em Tempo Real' : 'Pendente (Modo Offline)'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.testConnectionBtn}
            activeOpacity={0.8}
            onPress={() => testServerConnection(true)}
            disabled={testingConnection}
          >
            {testingConnection ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <>
                <Ionicons name="pulse-outline" size={16} color="#2563EB" />
                <Text style={styles.testConnectionBtnText}>Testar Comunicação com o Site</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* SEÇÃO 2: PREFERÊNCIAS DO APLICATIVO */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>PREFERÊNCIAS DO APLICATIVO</Text>
        </View>

        {/* Botão Preferências de Exibição & Widgets */}
        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.7}
          onPress={() => setShowPrefsModal(true)}
        >
          <View style={[styles.menuIconWrap, { backgroundColor: '#EEF2FF' }]}>
            <Ionicons name="options-outline" size={22} color="#4F46E5" />
          </View>
          <View style={styles.menuTextWrap}>
            <Text style={styles.menuTitle}>Preferências de Exibição & Widgets</Text>
            <Text style={styles.menuSubtitle}>
              Configurar cartões do painel, atalhos do canteiro e otimização de fotos
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        {/* Botão Visitantes e Acompanhantes Frequentes */}
        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('VisitorsSettingsScreen')}
        >
          <View style={[styles.menuIconWrap, { backgroundColor: '#E0F2FE' }]}>
            <Ionicons name="people-outline" size={22} color="#0284C7" />
          </View>
          <View style={styles.menuTextWrap}>
            <Text style={styles.menuTitle}>Visitantes & Acompanhantes</Text>
            <Text style={styles.menuSubtitle}>
              Cadastro de engenheiros parceiros e acompanhantes frequentes nas vistorias
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        {/* SEÇÃO 3: MODELOS E ENGENHARIA */}
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

        {/* SEÇÃO 4: ARMAZENAMENTO E ALERTAS */}
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

        {/* SEÇÃO 5: ADMINISTRAÇÃO & DESENVOLVEDOR */}
        {(isMasterUser || isDevUser) && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {isDevUser ? 'PAINEL DO DESENVOLVEDOR' : 'ADMINISTRAÇÃO'}
              </Text>
            </View>

            {/* Visão de Todos os Usuários (Exclusivo Desenvolvedor / Master) */}
            <TouchableOpacity
              style={[styles.menuItem, isDevUser ? styles.devMenuItem : null]}
              activeOpacity={0.7}
              onPress={loadDeveloperUsersView}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="eye-outline" size={22} color="#DC2626" />
              </View>
              <View style={styles.menuTextWrap}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.menuTitle}>Visão de Todos os Usuários</Text>
                  <View style={styles.devMiniBadge}>
                    <Text style={styles.devMiniBadgeText}>DEV VISÃO TOTAL</Text>
                  </View>
                </View>
                <Text style={styles.menuSubtitle}>
                  Ver tudo o que cada usuário vê, acessa e gerencia no sistema
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>

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

        {/* SEÇÃO 6: SINCRONIZAÇÃO E DADOS */}
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
            <Text style={styles.menuSubtitle}>
              Versão {updateService.getCurrentVersion() || '1.0.21'} • Build de Produção
            </Text>
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

      {/* MODAL 1: PREFERÊNCIAS DO APLICATIVO */}
      <Modal visible={showPrefsModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Ajustes de Preferências</Text>
                <Text style={styles.modalSubtitle}>Personalize a experiência do aplicativo</Text>
              </View>
              <TouchableOpacity onPress={() => setShowPrefsModal(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.prefGroupTitle}>ITENS DO PAINEL PRINCIPAL (DASHBOARD)</Text>

              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <Text style={styles.switchTitle}>Logo & Identidade da Obra</Text>
                  <Text style={styles.switchDesc}>Exibir cabeçalho visual e identidade da construtora</Text>
                </View>
                <Switch
                  value={widgetsConfig.showHero}
                  onValueChange={(val) => setWidgetsConfig((prev) => ({ ...prev, showHero: val }))}
                  trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                  thumbColor={widgetsConfig.showHero ? '#2563EB' : '#F1F5F9'}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <Text style={styles.switchTitle}>Identificação do Vistoriador</Text>
                  <Text style={styles.switchDesc}>Mostrar cartão com nome, cargo e badge</Text>
                </View>
                <Switch
                  value={widgetsConfig.showBadges}
                  onValueChange={(val) => setWidgetsConfig((prev) => ({ ...prev, showBadges: val }))}
                  trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                  thumbColor={widgetsConfig.showBadges ? '#2563EB' : '#F1F5F9'}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <Text style={styles.switchTitle}>Ações Rápidas no Canteiro</Text>
                  <Text style={styles.switchDesc}>Botões Novo Relatório, Obra e Visita no topo</Text>
                </View>
                <Switch
                  value={widgetsConfig.showAcoesRapidas}
                  onValueChange={(val) => setWidgetsConfig((prev) => ({ ...prev, showAcoesRapidas: val }))}
                  trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                  thumbColor={widgetsConfig.showAcoesRapidas ? '#2563EB' : '#F1F5F9'}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <Text style={styles.switchTitle}>Contador de Obras Ativas</Text>
                  <Text style={styles.switchDesc}>Card estatístico de obras em acompanhamento</Text>
                </View>
                <Switch
                  value={widgetsConfig.showObrasAtivas}
                  onValueChange={(val) => setWidgetsConfig((prev) => ({ ...prev, showObrasAtivas: val }))}
                  trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                  thumbColor={widgetsConfig.showObrasAtivas ? '#2563EB' : '#F1F5F9'}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <Text style={styles.switchTitle}>Relatórios Pendentes</Text>
                  <Text style={styles.switchDesc}>Card com total de laudos aguardando envio ou aprovação</Text>
                </View>
                <Switch
                  value={widgetsConfig.showRelatoriosPendentes}
                  onValueChange={(val) => setWidgetsConfig((prev) => ({ ...prev, showRelatoriosPendentes: val }))}
                  trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                  thumbColor={widgetsConfig.showRelatoriosPendentes ? '#2563EB' : '#F1F5F9'}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <Text style={styles.switchTitle}>Agenda de Vistorias</Text>
                  <Text style={styles.switchDesc}>Contador de visitas técnicas agendadas</Text>
                </View>
                <Switch
                  value={widgetsConfig.showVisitasAgendadas}
                  onValueChange={(val) => setWidgetsConfig((prev) => ({ ...prev, showVisitasAgendadas: val }))}
                  trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                  thumbColor={widgetsConfig.showVisitasAgendadas ? '#2563EB' : '#F1F5F9'}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <Text style={styles.switchTitle}>Lista de Relatórios Recentes</Text>
                  <Text style={styles.switchDesc}>Apresentar lista com os últimos laudos criados</Text>
                </View>
                <Switch
                  value={widgetsConfig.showRelatoriosRecentes}
                  onValueChange={(val) => setWidgetsConfig((prev) => ({ ...prev, showRelatoriosRecentes: val }))}
                  trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                  thumbColor={widgetsConfig.showRelatoriosRecentes ? '#2563EB' : '#F1F5F9'}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <Text style={styles.switchTitle}>Lista de Próximas Visitas</Text>
                  <Text style={styles.switchDesc}>Apresentar lista de compromissos da semana</Text>
                </View>
                <Switch
                  value={widgetsConfig.showProximasVisitas}
                  onValueChange={(val) => setWidgetsConfig((prev) => ({ ...prev, showProximasVisitas: val }))}
                  trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                  thumbColor={widgetsConfig.showProximasVisitas ? '#2563EB' : '#F1F5F9'}
                />
              </View>

              <Text style={[styles.prefGroupTitle, { marginTop: 20 }]}>OPERAÇÃO E FOTOS EM CAMPO</Text>

              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <Text style={styles.switchTitle}>Compressão Inteligente de Fotos</Text>
                  <Text style={styles.switchDesc}>Reduz tempo de upload em 3G/4G mantendo nitidez técnica</Text>
                </View>
                <Switch
                  value={appPrefs.compressPhotos}
                  onValueChange={(val) => setAppPrefs((prev) => ({ ...prev, compressPhotos: val }))}
                  trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                  thumbColor={appPrefs.compressPhotos ? '#2563EB' : '#F1F5F9'}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <Text style={styles.switchTitle}>Auto-Sincronização Contínua</Text>
                  <Text style={styles.switchDesc}>Envia alterações automaticamente em segundo plano</Text>
                </View>
                <Switch
                  value={appPrefs.autoSync}
                  onValueChange={(val) => setAppPrefs((prev) => ({ ...prev, autoSync: val }))}
                  trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                  thumbColor={appPrefs.autoSync ? '#2563EB' : '#F1F5F9'}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.resetBtn} onPress={resetPreferences}>
                <Text style={styles.resetBtnText}>Restaurar Padrão</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.savePrefsBtn} onPress={savePreferences}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.savePrefsBtnText}>Salvar Preferências</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: VISÃO DE TODOS OS USUÁRIOS (EXCLUSIVO DESENVOLVEDOR) */}
      <Modal visible={showDevModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { height: '88%' }]}>
            <View style={[styles.modalHeader, { backgroundColor: '#1E293B' }]}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.modalTitle, { color: '#FFFFFF' }]}>Visão Global de Usuários</Text>
                  <View style={styles.devMiniBadge}>
                    <Text style={styles.devMiniBadgeText}>DESENVOLVEDOR</Text>
                  </View>
                </View>
                <Text style={[styles.modalSubtitle, { color: '#94A3B8' }]}>
                  Veja o que cada usuário vê, acessa e emite no sistema
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowDevModal(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {loadingDevUsers ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={{ marginTop: 12, color: '#64748B', fontSize: 14 }}>
                  Carregando visão de todos os usuários...
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <Text style={styles.prefGroupTitle}>
                  USUÁRIOS ATIVOS CADASTRADOS ({devUsersList.length})
                </Text>

                {devUsersList.map((u: any) => (
                  <View key={u.id} style={styles.devUserCard}>
                    <View style={styles.devUserCardHeader}>
                      <View style={styles.devUserAvatar}>
                        <Text style={styles.devUserAvatarText}>
                          {u.nome_completo?.substring(0, 2).toUpperCase() || u.username?.substring(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.devUserName}>{u.nome_completo || u.username}</Text>
                        <Text style={styles.devUserEmail}>{u.email}</Text>
                        <Text style={styles.devUserCargo}>{u.cargo}</Text>
                      </View>
                      {u.is_developer ? (
                        <View style={[styles.devMiniBadge, { backgroundColor: '#DC2626' }]}>
                          <Text style={styles.devMiniBadgeText}>DEV</Text>
                        </View>
                      ) : u.is_master ? (
                        <View style={[styles.devMiniBadge, { backgroundColor: '#2563EB' }]}>
                          <Text style={styles.devMiniBadgeText}>MASTER</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Totais do Usuário */}
                    <View style={styles.devUserStatsRow}>
                      <View style={styles.devUserStatItem}>
                        <Text style={styles.devUserStatVal}>{u.totais?.obras || 0}</Text>
                        <Text style={styles.devUserStatLbl}>Obras</Text>
                      </View>
                      <View style={styles.devUserStatItem}>
                        <Text style={styles.devUserStatVal}>{u.totais?.relatorios || 0}</Text>
                        <Text style={styles.devUserStatLbl}>Relatórios</Text>
                      </View>
                      <View style={styles.devUserStatItem}>
                        <Text style={styles.devUserStatVal}>{u.totais?.visitas || 0}</Text>
                        <Text style={styles.devUserStatLbl}>Visitas</Text>
                      </View>
                    </View>

                    {/* Permissões */}
                    <View style={styles.devUserPermsBox}>
                      <Text style={styles.devUserPermsTitle}>O que este usuário pode acessar:</Text>
                      {u.permissoes?.map((p: string, pIdx: number) => (
                        <View key={pIdx} style={styles.devPermItem}>
                          <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                          <Text style={styles.devPermText}>{p}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.savePrefsBtn, { flex: 1 }]}
                onPress={() => setShowDevModal(false)}
              >
                <Text style={styles.savePrefsBtnText}>Fechar Visão Global</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  avatarDev: {
    backgroundColor: '#DC2626',
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
  devBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  devBadgeText: {
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
    marginTop: 14,
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
  devMenuItem: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
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
  devMiniBadge: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  devMiniBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  connectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  connectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  connectionStatusTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  latencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  latencyText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },
  connectionDetailsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  detailValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E293B',
  },
  testConnectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  testConnectionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
  },
  prefGroupTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  switchTextWrap: {
    flex: 1,
    marginRight: 16,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  switchDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 10,
  },
  resetBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  savePrefsBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 12,
    gap: 6,
  },
  savePrefsBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  devUserCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
  },
  devUserCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  devUserAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  devUserAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  devUserName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  devUserEmail: {
    fontSize: 11,
    color: '#64748B',
  },
  devUserCargo: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563EB',
    marginTop: 1,
  },
  devUserStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  devUserStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  devUserStatVal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  devUserStatLbl: {
    fontSize: 10,
    color: '#64748B',
  },
  devUserPermsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  devUserPermsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 2,
  },
  devPermItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  devPermText: {
    fontSize: 11,
    color: '#475569',
  },
});
