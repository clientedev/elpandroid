import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, 
  Alert, ActivityIndicator, Image, Modal, FlatList, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { apiClient, DEFAULT_API_URL } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { updateService } from '../../services/updateService';
import { notificationService } from '../../services/notificationService';
import { 
  getLocalProjetos, getLocalVisitas, getLocalRelatorios, 
  getPendingSyncQueue, getLocalLegendas, saveLocalLegenda, 
  deleteLocalLegenda, addToSyncQueue 
} from '../../database/db';
import { 
  getProjectsFoldersSummary, ProjectFolderSummary, openRootFolderExternally, 
  viewOrShareFile, getAppFilesRootDir, FileItem 
} from '../../services/appFilesService';
import { LegendaPredefinida } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

const CATEGORIAS_PADRAO = [
  'Todas', 'Geral', 'Fachada', 'Estrutura', 
  'Alvenaria', 'Impermeabilização', 'Pintura', 'Acabamentos'
];

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

  // Legendas state
  const [legendas, setLegendas] = useState<LegendaPredefinida[]>([]);
  const [selectedCategoria, setSelectedCategoria] = useState('Todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [novaLegendaTexto, setNovaLegendaTexto] = useState('');
  const [novaLegendaCategoria, setNovaLegendaCategoria] = useState('Fachada');

  // Preferences
  const [saveInDedicatedFolder, setSaveInDedicatedFolder] = useState(true);
  const [highQualityPhotos, setHighQualityPhotos] = useState(true);

  // Arquivos do App (Estrutura Local: 1 Pasta por Obra > Imagens e Relatorios_Aprovados_PDF)
  const [showAppFilesModal, setShowAppFilesModal] = useState(false);
  const [projectSummaries, setProjectSummaries] = useState<ProjectFolderSummary[]>([]);
  const [loadingAppFiles, setLoadingAppFiles] = useState(false);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [expandedSubfolder, setExpandedSubfolder] = useState<string | null>(null);
  const [appFilesRootDir, setAppFilesRootDir] = useState<string>('');

  // Notificações no Celular
  const [hasNotificationPermission, setHasNotificationPermission] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);

  useEffect(() => {
    loadDiagnostics();
    loadLegendas();
    checkNotificationStatus();
    loadAppFiles();
  }, [pendingCount, selectedCategoria]);

  async function loadAppFiles() {
    setLoadingAppFiles(true);
    try {
      const root = await getAppFilesRootDir();
      setAppFilesRootDir(root);
      const summaries = await getProjectsFoldersSummary();
      setProjectSummaries(summaries);
    } catch (err) {
      console.warn('Erro ao carregar arquivos do app:', err);
    } finally {
      setLoadingAppFiles(false);
    }
  }

  function formatFileSize(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function checkNotificationStatus() {
    const granted = await notificationService.checkPermission();
    setHasNotificationPermission(granted);
  }

  async function handleToggleNotificationPermission() {
    const granted = await notificationService.requestPermission();
    setHasNotificationPermission(granted);
    if (!granted) {
      Alert.alert(
        'Permissão de Notificação',
        'As notificações estão desativadas no Android. Deseja abrir as configurações do celular para ativá-las?',
        [
          { text: 'Agora Não', style: 'cancel' },
          { text: 'Abrir Configurações', onPress: () => notificationService.openSettings() }
        ]
      );
    } else {
      Alert.alert('Notificações Ativas', 'Permissão confirmada com sucesso no Android.');
    }
  }

  async function handleTestNotification() {
    setTestingNotification(true);
    try {
      const granted = await notificationService.sendTestNotification();
      setHasNotificationPermission(granted);
    } finally {
      setTestingNotification(false);
    }
  }

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

  async function loadLegendas() {
    try {
      const data = await getLocalLegendas(selectedCategoria);
      setLegendas(data);
    } catch (e) {
      console.warn('Erro ao carregar legendas:', e);
    }
  }

  async function handleAddLegenda() {
    if (!novaLegendaTexto.trim()) {
      Alert.alert('Atenção', 'Informe o texto da legenda.');
      return;
    }

    try {
      const newId = Date.now();
      await saveLocalLegenda({
        id: newId,
        categoria: novaLegendaCategoria,
        texto: novaLegendaTexto.trim(),
        ordem: legendas.length,
      });

      // Queue sync to Railway server
      await addToSyncQueue(
        'legenda',
        newId,
        'create',
        '/api/legendas',
        'POST',
        { id: newId, categoria: novaLegendaCategoria, texto: novaLegendaTexto.trim() }
      );

      if (isOnline) triggerSync();

      setNovaLegendaTexto('');
      setShowAddModal(false);
      await loadLegendas();
      Alert.alert('Sucesso', 'Nova legenda pré-definida adicionada com sucesso!');
    } catch (e: any) {
      Alert.alert('Erro ao Adicionar', e.message);
    }
  }

  async function handleDeleteLegenda(id: number, texto: string) {
    Alert.alert(
      'Excluir Legenda',
      `Deseja excluir a legenda "${texto}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLocalLegenda(id);
              await addToSyncQueue(
                'legenda',
                id,
                'delete',
                `/api/legendas/${id}`,
                'DELETE',
                {}
              );
              if (isOnline) triggerSync();
              await loadLegendas();
            } catch (err: any) {
              Alert.alert('Erro ao excluir', err.message);
            }
          },
        },
      ]
    );
  }

  async function handleManualSync() {
    setLoadingSync(true);
    try {
      const res = await triggerSync();
      await loadDiagnostics();
      await loadLegendas();
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

  const filteredLegendas = legendas.filter(l => 
    searchQuery.trim() === '' || l.texto.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <Header title="Ajustes & Configurações" />
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
              <Text style={styles.userRole}>{user?.cargo || 'Engenheiro / Técnico em Campo'}</Text>
              <Text style={styles.userEmail}>{user?.email}</Text>
            </View>
          </View>
        </View>

        {/* Gestão de Usuários (Exclusivo Admin / Master) */}
        {(user?.is_master || user?.username === 'admin') && (
          <TouchableOpacity 
            style={[styles.card, styles.adminCard]}
            onPress={() => navigation.navigate('UserManagementScreen')}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={styles.adminIconBox}>
                  <Ionicons name="people" size={24} color="#7C3AED" />
                </View>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.adminCardTitle}>Gestão de Usuários</Text>
                    <View style={styles.adminBadge}>
                      <Text style={styles.adminBadgeText}>Admin/Master</Text>
                    </View>
                  </View>
                  <Text style={styles.adminCardSub}>Cadastre usuários e configure permissões no app</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#7C3AED" />
            </View>
          </TouchableOpacity>
        )}

        {/* ================= NOTIFICAÇÕES NO CELULAR ================= */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="notifications-outline" size={22} color={Colors.primary} />
              <Text style={styles.cardTitle}>Notificações no Celular</Text>
            </View>
            <View style={[
              styles.notifBadge, 
              hasNotificationPermission ? styles.notifBadgeActive : styles.notifBadgePending
            ]}>
              <Ionicons 
                name={hasNotificationPermission ? "checkmark-circle" : "alert-circle"} 
                size={12} 
                color={hasNotificationPermission ? "#059669" : "#D97706"} 
              />
              <Text style={[
                styles.notifBadgeText,
                hasNotificationPermission ? styles.notifBadgeTextActive : styles.notifBadgeTextPending
              ]}>
                {hasNotificationPermission ? 'Ativada no Celular' : 'Pendente de Ativação'}
              </Text>
            </View>
          </View>

          <Text style={styles.notifDescription}>
            Receba avisos instantâneos com vibração e banner na tela sobre laudos aprovados, relatórios criados, vistorias agendadas e status da sincronização.
          </Text>

          <View style={styles.notifActionsRow}>
            <TouchableOpacity 
              style={[
                styles.notifBtnPermission, 
                hasNotificationPermission && styles.notifBtnPermissionGranted
              ]}
              onPress={handleToggleNotificationPermission}
              activeOpacity={0.8}
            >
              <Ionicons 
                name={hasNotificationPermission ? "settings-outline" : "notifications-circle"} 
                size={17} 
                color={hasNotificationPermission ? "#0F766E" : "#FFFFFF"} 
              />
              <Text style={[
                styles.notifBtnPermissionText,
                hasNotificationPermission && styles.notifBtnPermissionTextGranted
              ]}>
                {hasNotificationPermission ? 'Ajustar no Aparelho' : 'Ativar no Celular'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.notifBtnTest}
              onPress={handleTestNotification}
              disabled={testingNotification}
              activeOpacity={0.8}
            >
              {testingNotification ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <>
                  <Ionicons name="paper-plane-outline" size={16} color="#2563EB" />
                  <Text style={styles.notifBtnTestText}>Testar Agora</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ================= GESTÃO DE LEGENDAS ================= */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="list-circle-outline" size={22} color={Colors.primary} />
              <Text style={styles.cardTitle}>Ajuste de Legendas Técnicas</Text>
            </View>
            <TouchableOpacity 
              style={styles.addLegendaBtn} 
              onPress={() => setShowAddModal(true)}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.addLegendaBtnText}>Nova Legenda</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.desc}>
            Cadastre e edite legendas pré-definidas para agilizar o preenchimento de fotos nos relatórios:
          </Text>

          {/* Search Input */}
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar legenda por texto..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Category Filter Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {CATEGORIAS_PADRAO.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryChip,
                  selectedCategoria === cat && styles.categoryChipActive,
                ]}
                onPress={() => setSelectedCategoria(cat)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    selectedCategoria === cat && styles.categoryChipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Legendas List */}
          <View style={styles.legendasContainer}>
            {filteredLegendas.length === 0 ? (
              <Text style={styles.emptyLegendasText}>
                Nenhuma legenda encontrada nesta categoria. Toque em "+ Nova Legenda" para cadastrar.
              </Text>
            ) : (
              filteredLegendas.map(item => (
                <View key={item.id} style={styles.legendaRow}>
                  <View style={styles.legendaInfo}>
                    <View style={styles.legendaCategoryBadge}>
                      <Text style={styles.legendaCategoryText}>{item.categoria}</Text>
                    </View>
                    <Text style={styles.legendaItemText}>{item.texto}</Text>
                  </View>
                  <TouchableOpacity 
                    onPress={() => handleDeleteLegenda(item.id, item.texto)}
                    style={styles.deleteLegendaBtn}
                  >
                    <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </View>

        {/* ================= ARQUIVOS DO APP ================= */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="folder-open" size={22} color={Colors.primary} />
              <Text style={styles.cardTitle}>Arquivos do App</Text>
            </View>
            <View style={styles.appFilesBadge}>
              <Text style={styles.appFilesBadgeText}>Salvo Localmente</Text>
            </View>
          </View>

          <Text style={styles.desc}>
            Todos os arquivos são guardados localmente no dispositivo. Para cada obra criada, existe uma pasta dedicada contendo duas subpastas: <Text style={{ fontWeight: '700' }}>Imagens</Text> e <Text style={{ fontWeight: '700' }}>Relatórios Aprovados em PDF</Text>.
          </Text>

          <View style={styles.appFilesPathBox}>
            <Ionicons name="phone-portrait-outline" size={16} color="#0284C7" />
            <Text style={styles.appFilesPathText} numberOfLines={1}>
              {appFilesRootDir ? appFilesRootDir.replace('file://', '') : 'Armazenamento Interno/ELP_Arquivos/'}
            </Text>
          </View>

          <View style={{ gap: 10, marginTop: 14 }}>
            {/* Botão 1: Exibir Pastas por Obra */}
            <TouchableOpacity 
              style={styles.openAppFilesExplorerBtn}
              onPress={() => {
                loadAppFiles();
                setShowAppFilesModal(true);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="folder" size={18} color="#FFFFFF" />
              <Text style={styles.openAppFilesExplorerText}>
                Exibir Pastas das Obras ({projectSummaries.length} {projectSummaries.length === 1 ? 'obra' : 'obras'})
              </Text>
            </TouchableOpacity>

            {/* Botão 2: Abrir externamente no Gerenciador de Arquivos do celular */}
            <TouchableOpacity 
              style={styles.openExternalExplorerBtn}
              onPress={openRootFolderExternally}
              activeOpacity={0.8}
            >
              <Ionicons name="open-outline" size={18} color={Colors.primary} />
              <Text style={styles.openExternalExplorerText}>Abrir no Gerenciador de Arquivos do Celular</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ================= SYNC CONTROLS ================= */}
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
                  {isOnline ? 'Online' : 'Offline'}
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

        {/* ================= BANCO LOCAL (SQLITE) ================= */}
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
              <Text style={styles.diagLabel}>Visitas</Text>
            </View>
            <View style={styles.diagItem}>
              <Text style={styles.diagValue}>{stats.relatorios}</Text>
              <Text style={styles.diagLabel}>Relatórios</Text>
            </View>
            <View style={styles.diagItem}>
              <Text style={styles.diagValue}>{stats.queue}</Text>
              <Text style={styles.diagLabel}>Fila Sync</Text>
            </View>
          </View>
        </View>

        {/* ================= BACKEND URL (FIXED) ================= */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="server-outline" size={20} color={Colors.primary} />
            <Text style={styles.cardTitle}>Servidor Backend & Nuvem</Text>
          </View>
          <Text style={styles.desc}>Serviço backend oficial configurado para este dispositivo:</Text>
          <View style={styles.fixedUrlBox}>
            <Ionicons name="shield-checkmark" size={18} color={Colors.success} />
            <Text style={styles.fixedUrlText}>{DEFAULT_API_URL}</Text>
          </View>
        </View>

        {/* ================= ATUALIZAÇÕES ================= */}
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
              <Text style={styles.appVersionText}>Versão: v{updateService.getCurrentVersion()}</Text>
            </View>
          </View>

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

      {/* Modal Nova Legenda */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cadastrar Nova Legenda</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Categoria da Legenda:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {['Fachada', 'Estrutura', 'Alvenaria', 'Impermeabilização', 'Pintura', 'Geral'].map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.categoryChip, novaLegendaCategoria === c && styles.categoryChipActive]}
                  onPress={() => setNovaLegendaCategoria(c)}
                >
                  <Text style={[styles.categoryChipText, novaLegendaCategoria === c && styles.categoryChipTextActive]}>
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.modalLabel}>Texto Técnico da Legenda:</Text>
            <TextInput
              style={styles.modalInput}
              multiline
              placeholder="Ex: Fissura diagonal na alvenaria por movimentação térmica"
              value={novaLegendaTexto}
              onChangeText={setNovaLegendaTexto}
            />

            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleAddLegenda}>
              <Text style={styles.modalSaveBtnText}>Salvar Legenda</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal de Arquivos do App (Pastas das Obras, Imagens e Relatórios Aprovados) */}
      <Modal visible={showAppFilesModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '92%', height: '88%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="folder-open" size={22} color={Colors.primary} />
                <View>
                  <Text style={styles.modalTitle}>Arquivos do App</Text>
                  <Text style={{ fontSize: 11, color: Colors.textSecondary }}>
                    1 Pasta por Obra • Imagens e Laudos PDF
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowAppFilesModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Botão no topo do Modal para acesso externo ao gerenciador do aparelho */}
            <TouchableOpacity 
              style={styles.modalExternalTopBtn}
              onPress={openRootFolderExternally}
              activeOpacity={0.8}
            >
              <Ionicons name="open-outline" size={17} color="#FFFFFF" />
              <Text style={styles.modalExternalTopBtnText}>Abrir no Gerenciador de Arquivos do Celular</Text>
            </TouchableOpacity>

            {loadingAppFiles ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={{ marginTop: 12, fontSize: 13, color: Colors.textSecondary }}>
                  Carregando pastas e arquivos salvos...
                </Text>
              </View>
            ) : projectSummaries.length === 0 ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                <Ionicons name="folder-open-outline" size={48} color="#CBD5E1" />
                <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.text, marginTop: 12 }}>
                  Nenhuma Obra com Pasta Criada
                </Text>
                <Text style={{ fontSize: 12, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 }}>
                  Ao cadastrar ou sincronizar uma obra, a pasta local e suas subpastas serão geradas automaticamente.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, marginTop: 8 }}>
                <Text style={{ fontSize: 12, color: Colors.textSecondary, marginBottom: 10 }}>
                  Toque em uma obra para visualizar as subpastas <Text style={{ fontWeight: '600' }}>Imagens</Text> e <Text style={{ fontWeight: '600' }}>Relatórios Aprovados em PDF</Text>:
                </Text>

                {projectSummaries.map((summary) => {
                  const isExpanded = expandedProject === summary.projectName;
                  const isImagensOpen = expandedSubfolder === `${summary.projectName}_imagens`;
                  const isPdfsOpen = expandedSubfolder === `${summary.projectName}_pdfs`;

                  return (
                    <View key={summary.projectName} style={styles.projectFolderCard}>
                      {/* Linha da Pasta da Obra */}
                      <TouchableOpacity 
                        style={styles.projectFolderHeader}
                        onPress={() => setExpandedProject(isExpanded ? null : summary.projectName)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.projectFolderIconBox}>
                          <Ionicons name={isExpanded ? "folder-open" : "folder"} size={22} color="#0284C7" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.projectFolderName} numberOfLines={1}>
                            {summary.projectName}
                          </Text>
                          <Text style={styles.projectFolderStats}>
                            {summary.imagens.length} foto(s) • {summary.pdfs.length} PDF(s) • {formatFileSize(summary.totalSize)}
                          </Text>
                        </View>
                        <Ionicons 
                          name={isExpanded ? "chevron-up" : "chevron-down"} 
                          size={20} 
                          color="#64748B" 
                        />
                      </TouchableOpacity>

                      {/* Conteúdo Expandido da Obra: As 2 Subpastas */}
                      {isExpanded && (
                        <View style={styles.subfoldersContainer}>
                          {/* 1. Subpasta Imagens */}
                          <View style={styles.subfolderBlock}>
                            <TouchableOpacity 
                              style={styles.subfolderHeader}
                              onPress={() => setExpandedSubfolder(isImagensOpen ? null : `${summary.projectName}_imagens`)}
                              activeOpacity={0.7}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Ionicons name="images" size={18} color="#D97706" />
                                <Text style={styles.subfolderTitle}>Imagens</Text>
                                <View style={styles.fileCountPill}>
                                  <Text style={styles.fileCountPillText}>{summary.imagens.length}</Text>
                                </View>
                              </View>
                              <Ionicons 
                                name={isImagensOpen ? "chevron-up" : "chevron-down"} 
                                size={16} 
                                color="#64748B" 
                              />
                            </TouchableOpacity>

                            {isImagensOpen && (
                              <View style={styles.filesList}>
                                {summary.imagens.length === 0 ? (
                                  <Text style={styles.emptyFilesText}>Nenhuma imagem salva ainda nesta obra.</Text>
                                ) : (
                                  summary.imagens.map((file) => (
                                    <TouchableOpacity 
                                      key={file.uri} 
                                      style={styles.fileItemRow}
                                      onPress={() => viewOrShareFile(file.uri, 'image/jpeg')}
                                      activeOpacity={0.7}
                                    >
                                      <Ionicons name="image-outline" size={16} color="#0284C7" />
                                      <View style={{ flex: 1 }}>
                                        <Text style={styles.fileNameText} numberOfLines={1}>{file.name}</Text>
                                        <Text style={styles.fileSizeText}>{formatFileSize(file.size)}</Text>
                                      </View>
                                      <Ionicons name="eye-outline" size={16} color="#64748B" />
                                    </TouchableOpacity>
                                  ))
                                )}
                              </View>
                            )}
                          </View>

                          {/* 2. Subpasta Relatórios Aprovados em PDF */}
                          <View style={styles.subfolderBlock}>
                            <TouchableOpacity 
                              style={styles.subfolderHeader}
                              onPress={() => setExpandedSubfolder(isPdfsOpen ? null : `${summary.projectName}_pdfs`)}
                              activeOpacity={0.7}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Ionicons name="document-text" size={18} color="#DC2626" />
                                <Text style={styles.subfolderTitle}>Relatórios Aprovados em PDF</Text>
                                <View style={[styles.fileCountPill, { backgroundColor: '#FEE2E2' }]}>
                                  <Text style={[styles.fileCountPillText, { color: '#DC2626' }]}>
                                    {summary.pdfs.length}
                                  </Text>
                                </View>
                              </View>
                              <Ionicons 
                                name={isPdfsOpen ? "chevron-up" : "chevron-down"} 
                                size={16} 
                                color="#64748B" 
                              />
                            </TouchableOpacity>

                            {isPdfsOpen && (
                              <View style={styles.filesList}>
                                {summary.pdfs.length === 0 ? (
                                  <Text style={styles.emptyFilesText}>Nenhum relatório PDF aprovado nesta obra.</Text>
                                ) : (
                                  summary.pdfs.map((file) => (
                                    <TouchableOpacity 
                                      key={file.uri} 
                                      style={styles.fileItemRow}
                                      onPress={() => viewOrShareFile(file.uri, 'application/pdf')}
                                      activeOpacity={0.7}
                                    >
                                      <Ionicons name="document-text-outline" size={16} color="#DC2626" />
                                      <View style={{ flex: 1 }}>
                                        <Text style={styles.fileNameText} numberOfLines={1}>{file.name}</Text>
                                        <Text style={styles.fileSizeText}>{formatFileSize(file.size)}</Text>
                                      </View>
                                      <Ionicons name="share-outline" size={16} color="#64748B" />
                                    </TouchableOpacity>
                                  ))
                                )}
                              </View>
                            )}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity 
              style={[styles.modalSaveBtn, { marginTop: 12 }]} 
              onPress={() => setShowAppFilesModal(false)}
            >
              <Text style={styles.modalSaveBtnText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text },
  desc: { fontSize: 13, color: Colors.textSecondary, marginBottom: 12, lineHeight: 18 },
  userHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 18 },
  userName: { fontSize: 16, fontWeight: 'bold', color: Colors.text },
  userRole: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  userEmail: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  addLegendaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addLegendaBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
    marginBottom: 10,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
  },
  chipRow: { flexDirection: 'row', marginBottom: 12 },
  categoryChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryChipText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  legendasContainer: {
    gap: 8,
  },
  emptyLegendasText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  legendaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  legendaInfo: {
    flex: 1,
    marginRight: 8,
  },
  legendaCategoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  legendaCategoryText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0369A1',
  },
  legendaItemText: {
    fontSize: 13,
    color: Colors.text,
    lineHeight: 17,
  },
  deleteLegendaBtn: {
    padding: 6,
  },
  settingToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  settingToggleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  settingToggleSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  syncStatusBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  statusLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel: { fontSize: 13, color: Colors.textSecondary },
  statusValue: { fontSize: 13, fontWeight: 'bold', color: Colors.text },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  pillOnline: { backgroundColor: '#DCFCE7' },
  pillOffline: { backgroundColor: '#FEF3C7' },
  pillText: { fontSize: 11, fontWeight: 'bold' },
  pillTextOnline: { color: '#166534' },
  pillTextOffline: { color: '#92400E' },
  syncNowBtn: {
    backgroundColor: Colors.primary,
    height: 44,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  syncNowText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  diagGrid: { flexDirection: 'row', gap: 8 },
  diagItem: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  diagValue: { fontSize: 18, fontWeight: 'bold', color: Colors.primary },
  diagLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  fixedUrlBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    padding: 10,
    borderRadius: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  fixedUrlText: { fontSize: 13, color: '#166534', fontWeight: '600' },
  appInfoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  settingsLogo: { width: 36, height: 36 },
  appNameText: { fontSize: 14, fontWeight: 'bold', color: Colors.text },
  appVersionText: { fontSize: 12, color: Colors.textSecondary },
  checkUpdateBtn: {
    backgroundColor: '#0F172A',
    height: 40,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  checkUpdateBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 8,
  },
  logoutText: { color: Colors.danger, fontWeight: 'bold', fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 10,
    height: 70,
    fontSize: 13,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalSaveBtn: {
    backgroundColor: Colors.primary,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  adminCard: {
    borderColor: '#C4B5FD',
    backgroundColor: '#FAF5FF',
  },
  adminIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminCardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#5B21B6',
  },
  adminBadge: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  adminBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  adminCardSub: {
    fontSize: 12,
    color: '#6D28D9',
    marginTop: 2,
  },
  // Notificações no Celular
  notifBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  notifBadgeActive: {
    backgroundColor: '#ECFDF5',
  },
  notifBadgePending: {
    backgroundColor: '#FFFBEB',
  },
  notifBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  notifBadgeTextActive: {
    color: '#059669',
  },
  notifBadgeTextPending: {
    color: '#D97706',
  },
  notifDescription: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 12,
  },
  notifActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  notifBtnPermission: {
    flex: 1.3,
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    ...Shadows.sm,
  },
  notifBtnPermissionGranted: {
    backgroundColor: '#CCFBF1',
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  notifBtnPermissionText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  notifBtnPermissionTextGranted: {
    color: '#0F766E',
  },
  notifBtnTest: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  notifBtnTestText: {
    color: '#2563EB',
    fontWeight: 'bold',
    fontSize: 12,
  },
  photoDirContainer: {
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginBottom: 16,
  },
  photoDirHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  photoDirIconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoDirTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0369A1',
  },
  photoDirValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    marginTop: 2,
  },
  photoDirDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
    marginBottom: 12,
  },
  chooseDirBtn: {
    backgroundColor: '#0284C7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
    ...Shadows.sm,
  },
  chooseDirBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  dirOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  dirOptionRowSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  dirOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dirOptionIconSelected: {
    backgroundColor: '#2563EB',
  },
  dirOptionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.text,
  },
  dirOptionTitleSelected: {
    color: '#1D4ED8',
  },
  dirOptionDesc: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  modalInputSingle: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    color: Colors.text,
  },
  // Estilos de Arquivos do App
  appFilesBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  appFilesBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
  },
  appFilesPathBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  appFilesPathText: {
    fontSize: 11,
    color: '#475569',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flex: 1,
  },
  openAppFilesExplorerBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    ...Shadows.sm,
  },
  openAppFilesExplorerText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  openExternalExplorerBtn: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  openExternalExplorerText: {
    color: Colors.primary,
    fontWeight: 'bold',
    fontSize: 13,
  },
  modalExternalTopBtn: {
    backgroundColor: '#0284C7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 10,
    marginBottom: 6,
    ...Shadows.sm,
  },
  modalExternalTopBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  projectFolderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
    overflow: 'hidden',
  },
  projectFolderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    backgroundColor: '#F8FAFC',
  },
  projectFolderIconBox: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectFolderName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  projectFolderStats: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  subfoldersContainer: {
    padding: 10,
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  subfolderBlock: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  subfolderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
  },
  subfolderTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  fileCountPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  fileCountPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
  },
  filesList: {
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  emptyFilesText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
    padding: 4,
  },
  fileItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    gap: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  fileNameText: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: '500',
  },
  fileSizeText: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
});

