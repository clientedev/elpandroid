import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  RefreshControl, Alert, Image, Modal, Switch 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { 
  getLocalProjetos, getLocalVisitas, getLocalRelatorios, 
  saveLocalProjeto, saveLocalVisita, saveLocalRelatorio 
} from '../../database/db';
import { Projeto, Visita, Relatorio } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

const WIDGETS_CONFIG_KEY = '@elp_dashboard_widgets_v2';

export interface DashboardWidgetsConfig {
  showHero: boolean;
  showBadges: boolean;
  showObrasAtivas: boolean;
  showRelatoriosPendentes: boolean;
  showVisitasAgendadas: boolean;
  showRelatoriosRascunho: boolean;
  showAcoesRapidas: boolean;
  showRelatoriosRecentes: boolean;
  showProximasVisitas: boolean;
}

export type DashboardSectionId = 'hero' | 'badges' | 'approverAlert' | 'stats' | 'quickActions' | 'recentReports' | 'upcomingVisits';

const DEFAULT_SECTIONS_ORDER: DashboardSectionId[] = [
  'hero',
  'badges',
  'approverAlert',
  'stats',
  'quickActions',
  'recentReports',
  'upcomingVisits'
];

const SECTION_METAS: Record<DashboardSectionId, { title: string; icon: keyof typeof Ionicons.glyphMap; desc: string }> = {
  hero: { title: 'Logo & Banner Principal', icon: 'image-outline', desc: 'Identidade visual da ELP' },
  badges: { title: 'Identificação do Usuário', icon: 'person-circle-outline', desc: 'Nome e empresa do engenheiro' },
  approverAlert: { title: 'Aviso de Aprovações', icon: 'alert-circle-outline', desc: 'Card para engenheiros aprovadores' },
  stats: { title: 'Painel de Indicadores', icon: 'grid-outline', desc: 'Contadores de obras e relatórios' },
  quickActions: { title: 'Ações Rápidas no Canteiro', icon: 'flash-outline', desc: 'Novo Relatório, Obra, Visita' },
  recentReports: { title: 'Relatórios Recentes', icon: 'document-text-outline', desc: 'Lista dos relatórios mais recentes' },
  upcomingVisits: { title: 'Próximas Visitas', icon: 'calendar-outline', desc: 'Agenda de vistorias' },
};

const SECTIONS_ORDER_KEY = '@elp_dashboard_sections_order_v2';

const DEFAULT_CONFIG: DashboardWidgetsConfig = {
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

export const DashboardScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const { isOnline, triggerSync, syncState } = useNetwork();

  const [refreshing, setRefreshing] = useState(false);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [widgetsConfig, setWidgetsConfig] = useState<DashboardWidgetsConfig>(DEFAULT_CONFIG);
  const [sectionsOrder, setSectionsOrder] = useState<DashboardSectionId[]>(DEFAULT_SECTIONS_ORDER);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Load custom user widgets configuration and section order
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(WIDGETS_CONFIG_KEY);
        if (saved) {
          setWidgetsConfig({ ...DEFAULT_CONFIG, ...JSON.parse(saved) });
        }
        const savedOrder = await AsyncStorage.getItem(SECTIONS_ORDER_KEY);
        if (savedOrder) {
          const parsed = JSON.parse(savedOrder);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSectionsOrder(parsed);
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar configuracoes do dashboard:', err);
      }
    })();
  }, []);

  async function updateWidgetConfig<K extends keyof DashboardWidgetsConfig>(key: K, value: boolean) {
    const updated = { ...widgetsConfig, [key]: value };
    setWidgetsConfig(updated);
    try {
      await AsyncStorage.setItem(WIDGETS_CONFIG_KEY, JSON.stringify(updated));
    } catch (err) {
      console.warn('Erro ao salvar configuracao do widget:', err);
    }
  }

  function moveSectionUp(index: number) {
    if (index <= 0) return;
    const newOrder = [...sectionsOrder];
    const temp = newOrder[index - 1];
    newOrder[index - 1] = newOrder[index];
    newOrder[index] = temp;
    setSectionsOrder(newOrder);
    AsyncStorage.setItem(SECTIONS_ORDER_KEY, JSON.stringify(newOrder)).catch(() => {});
  }

  function moveSectionDown(index: number) {
    if (index >= sectionsOrder.length - 1) return;
    const newOrder = [...sectionsOrder];
    const temp = newOrder[index + 1];
    newOrder[index + 1] = newOrder[index];
    newOrder[index] = temp;
    setSectionsOrder(newOrder);
    AsyncStorage.setItem(SECTIONS_ORDER_KEY, JSON.stringify(newOrder)).catch(() => {});
  }

  async function resetWidgetConfig() {
    setWidgetsConfig(DEFAULT_CONFIG);
    setSectionsOrder(DEFAULT_SECTIONS_ORDER);
    try {
      await AsyncStorage.removeItem(WIDGETS_CONFIG_KEY);
      await AsyncStorage.removeItem(SECTIONS_ORDER_KEY);
    } catch {}
  }


  const loadData = useCallback(async () => {
    try {
      const p = await getLocalProjetos();
      const v = await getLocalVisitas();
      const r = await getLocalRelatorios();

      if (p.length === 0) {
        const sampleProj: Projeto = {
          id: 1,
          numero: 'OBR-2026-001',
          nome: 'Residencial Alphaville Horizon',
          tipo_obra: 'Edifício Residencial',
          construtora: 'Construtora Monteiro & Associados',
          nome_funcionario: 'Eng. Gabriel Eduardo',
          responsavel_id: user?.id || 1,
          email_principal: 'engenharia@monteiro.com.br',
          endereco: 'Av. das Nações, 1500 - Alphaville',
          status: 'Ativo',
          elementos_construtivos_base: 'Estrutura em concreto armado convencional',
          especificacao_chapisco_colante: 'Argamassa colante AC-III para fachada externa',
          especificacao_argamassa_emboco: 'Traço 1:1:6 com aditivo impermeabilizante',
          sync_status: 'synced',
        };
        await saveLocalProjeto(sampleProj);

        const sampleVisita: Visita = {
          id: 1,
          numero: 'VIS-001',
          projeto_id: 1,
          projeto_nome: 'Residencial Alphaville Horizon',
          responsavel_id: user?.id || 1,
          responsavel_nome: user?.username || 'Gabriel Eduardo',
          data_inicio: new Date().toISOString(),
          data_fim: new Date(Date.now() + 7200000).toISOString(),
          status: 'Agendada',
          observacoes: 'Inspeção de aderência de reboco e conferência de prumo',
          sync_status: 'synced',
        };
        await saveLocalVisita(sampleVisita);

        const sampleRel: Relatorio = {
          id: 1,
          numero: 'REL-001',
          titulo: 'Vistoria Técnica de Fachada - Etapa 2',
          projeto_id: 1,
          projeto_nome: 'Residencial Alphaville Horizon',
          autor_id: user?.id || 1,
          autor_nome: user?.username || 'Gabriel Eduardo',
          data_relatorio: new Date().toISOString(),
          status: 'Aguardando Aprovação',
          descricao: 'Verificação do ensaio de percussão nas pastilhas cerâmicas e juntas de dilatação.',
          observacoes_finais: 'Recomenda-se tratamento imediato dos pontos demarcados no 5º pavimento.',
          sync_status: 'synced',
        };
        await saveLocalRelatorio(sampleRel);

        setProjetos([sampleProj]);
        setVisitas([sampleVisita]);
        setRelatorios([sampleRel]);
      } else {
        setProjetos(p);
        setVisitas(v);
        setRelatorios(r);
      }
    } catch (err) {
      console.warn('Erro ao carregar dados do SQLite:', err);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (isOnline) {
      await triggerSync();
    }
    await loadData();
    setRefreshing(false);
  };

  const obrasAtivas = projetos.filter(p => p.status === 'Ativo').length;
  const relatoriosPendentes = relatorios.filter(r => r.status === 'Aguardando Aprovação').length;
  const visitasAgendadas = visitas.filter(v => v.status === 'Agendada' || v.status === 'Confirmada').length || visitas.length;
  const relatoriosRascunho = relatorios.filter(r => r.status === 'em_andamento' || r.status === 'preenchimento' || r.status === 'Rascunho' || !r.status).length;
  const relatoriosAprovados = relatorios.filter(r => r.status === 'Aprovado').length;

  const isApprover = Boolean(user?.is_master || (user as any)?.is_aprovador || user?.is_aprovador_express);
  const isMasterOrAdmin = Boolean(user?.is_master || user?.username === 'admin');

  const [modalTab, setModalTab] = useState<'order' | 'visibility'>('order');

  function renderDashboardSection(sectionId: DashboardSectionId) {
    switch (sectionId) {
      case 'hero':
        if (!widgetsConfig.showHero) return null;
        return (
          <View key="hero" style={styles.heroCard}>
            <View style={styles.heroLeft}>
              <Image 
                source={require('../../../assets/logo.png')} 
                style={styles.heroLogo} 
                resizeMode="contain" 
              />
              <View style={styles.heroTextContainer}>
                <Text style={styles.heroGreeting}>
                  Olá, {(user as any)?.nome_completo || user?.username || 'Engenheiro'}!
                </Text>
                <Text style={styles.heroDateText}>
                  {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </View>
            </View>

            <TouchableOpacity 
              style={styles.customizeShortcutBtn} 
              onPress={() => setShowConfigModal(true)}
            >
              <Ionicons name="sparkles" size={14} color="#2563EB" />
              <Text style={styles.customizeShortcutText}>Editar</Text>
            </TouchableOpacity>
          </View>
        );

      case 'badges':
        if (!widgetsConfig.showBadges) return null;
        return (
          <View key="badges" style={styles.userBadgeBar}>
            <View style={styles.badgePrimary}>
              <Ionicons name="person" size={14} color="#FFFFFF" />
              <Text style={styles.badgeTextWhite} numberOfLines={1}>
                {(user as any)?.nome_completo || user?.username || 'Engenheiro Responsável'}
              </Text>
            </View>
            <View style={styles.badgeCyan}>
              <Ionicons name="business" size={14} color="#FFFFFF" />
              <Text style={styles.badgeTextWhite} numberOfLines={1}>
                {(user as any)?.empresa || 'ELP Consultoria'}
              </Text>
            </View>
          </View>
        );

      case 'approverAlert':
        if (!isApprover || relatoriosPendentes === 0) return null;
        return (
          <TouchableOpacity 
            key="approverAlert"
            style={styles.approverAlertBanner}
            onPress={() => navigation.navigate('PendentesTab')}
            activeOpacity={0.8}
          >
            <View style={styles.approverAlertLeft}>
              <Ionicons name="alert-circle" size={24} color="#D97706" />
              <View style={{ flex: 1 }}>
                <Text style={styles.approverAlertTitle}>Relatórios Pendentes de Aprovação</Text>
                <Text style={styles.approverAlertSub}>
                  Existem {relatoriosPendentes} relatório(s) aguardando sua revisão e carimbo técnico.
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#D97706" />
          </TouchableOpacity>
        );

      case 'stats':
        const showAnyStat = widgetsConfig.showObrasAtivas || widgetsConfig.showRelatoriosPendentes || widgetsConfig.showVisitasAgendadas || widgetsConfig.showRelatoriosRascunho;
        if (!showAnyStat) return null;
        return (
          <View key="stats">
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="trending-up" size={20} color="#4E73DF" />
                <Text style={styles.sectionTitle}>Métricas Rápidas</Text>
              </View>
              <View style={styles.onlinePill}>
                <View style={[styles.dot, isOnline ? styles.onlineDot : styles.offlineDot]} />
                <Text style={styles.onlinePillText}>{isOnline ? 'Online (Railway)' : 'Offline (Local)'}</Text>
              </View>
            </View>

            {/* 4 Cards Coloridos em Grade (Seção 15.3 do Manual) */}
            <View style={styles.cardsGrid}>
              {/* 1. Obras Ativas (Verde) */}
              <TouchableOpacity 
                style={[styles.webCard, { borderLeftColor: '#10B981', borderLeftWidth: 4 }]} 
                onPress={() => navigation.navigate('ObrasTab')}
                activeOpacity={0.7}
              >
                <View style={styles.cardContent}>
                  <Text style={[styles.cardLabel, { color: '#059669' }]}>OBRAS ATIVAS</Text>
                  <Text style={[styles.cardValue, { color: '#065F46' }]}>{obrasAtivas}</Text>
                </View>
                <Ionicons name="business" size={36} color="#A7F3D0" />
              </TouchableOpacity>

              {/* 2. Visitas Agendadas (Azul) */}
              <TouchableOpacity 
                style={[styles.webCard, { borderLeftColor: '#2563EB', borderLeftWidth: 4 }]} 
                onPress={() => navigation.navigate('VisitasTab')}
                activeOpacity={0.7}
              >
                <View style={styles.cardContent}>
                  <Text style={[styles.cardLabel, { color: '#2563EB' }]}>VISITAS AGENDADAS</Text>
                  <Text style={[styles.cardValue, { color: '#1E3A8A' }]}>{visitasAgendadas}</Text>
                </View>
                <Ionicons name="calendar" size={36} color="#BFDBFE" />
              </TouchableOpacity>

              {/* 3. Relatórios em Preenchimento (Amarelo) */}
              <TouchableOpacity 
                style={[styles.webCard, { borderLeftColor: '#F59E0B', borderLeftWidth: 4 }]} 
                onPress={() => navigation.navigate('PendentesTab')}
                activeOpacity={0.7}
              >
                <View style={styles.cardContent}>
                  <Text style={[styles.cardLabel, { color: '#D97706' }]}>EM PREENCHIMENTO</Text>
                  <Text style={[styles.cardValue, { color: '#92400E' }]}>{relatoriosRascunho}</Text>
                </View>
                <Ionicons name="document-text" size={36} color="#FDE68A" />
              </TouchableOpacity>

              {/* 4. Relatórios Aprovados (Ciano) */}
              <TouchableOpacity 
                style={[styles.webCard, { borderLeftColor: '#06B6D4', borderLeftWidth: 4 }]} 
                onPress={() => navigation.navigate('PendentesTab')}
                activeOpacity={0.7}
              >
                <View style={styles.cardContent}>
                  <Text style={[styles.cardLabel, { color: '#0891B2' }]}>RELATÓRIOS APROVADOS</Text>
                  <Text style={[styles.cardValue, { color: '#155E75' }]}>{relatoriosAprovados}</Text>
                </View>
                <Ionicons name="checkmark-done-circle" size={36} color="#BAE6FD" />
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'quickActions':
        if (!widgetsConfig.showAcoesRapidas) return null;
        return (
          <View key="quickActions">
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="flash-outline" size={18} color="#2563EB" />
                <Text style={styles.sectionTitle}>Ações Rápidas no Canteiro</Text>
              </View>
            </View>

            {/* Três Botões Largos em Destaque (Seção 15.3 do Manual) */}
            <View style={styles.prominentActionsRow}>
              {/* [+ Nova Visita] - Botão Outline Azul */}
              <TouchableOpacity 
                style={styles.btnOutlineBlue}
                onPress={() => navigation.navigate('VisitFormScreen')}
                activeOpacity={0.8}
              >
                <Ionicons name="calendar-outline" size={20} color="#2563EB" />
                <Text style={styles.btnOutlineBlueText}>+ Nova Visita</Text>
              </TouchableOpacity>

              {/* [+ Novo Relatório de Obra] - Botão Sólido Azul */}
              <TouchableOpacity 
                style={styles.btnSolidBlue}
                onPress={() => navigation.navigate('ReportFormScreen')}
                activeOpacity={0.8}
              >
                <Ionicons name="add-circle" size={20} color="#FFFFFF" />
                <Text style={styles.btnSolidBlueText}>+ Novo Relatório</Text>
              </TouchableOpacity>

              {/* [⚡ Relatório Express] - Botão Amarelo com Raio */}
              <TouchableOpacity 
                style={styles.btnYellowExpress}
                onPress={() => navigation.navigate('ExpressReportsScreen')}
                activeOpacity={0.8}
              >
                <Ionicons name="flash" size={20} color="#FFFFFF" />
                <Text style={styles.btnYellowExpressText}>⚡ Relatório Express</Text>
              </TouchableOpacity>
            </View>

            {/* Ações Complementares */}
            <View style={styles.secondaryActionsRow}>
              <TouchableOpacity 
                style={styles.secondaryActionChip}
                onPress={() => navigation.navigate('ProjectFormScreen')}
              >
                <Ionicons name="business-outline" size={16} color="#475569" />
                <Text style={styles.secondaryActionText}>Cadastrar Obra</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.secondaryActionChip}
                onPress={() => navigation.navigate('ExpensesScreen')}
              >
                <Ionicons name="receipt-outline" size={16} color="#475569" />
                <Text style={styles.secondaryActionText}>Reembolsos</Text>
              </TouchableOpacity>

              {isMasterOrAdmin && (
                <TouchableOpacity 
                  style={styles.secondaryActionChip}
                  onPress={() => navigation.navigate('UserManagementScreen')}
                >
                  <Ionicons name="people-outline" size={16} color="#475569" />
                  <Text style={styles.secondaryActionText}>Usuários</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );

      case 'recentReports':
        if (!widgetsConfig.showRelatoriosRecentes) return null;
        return (
          <View key="recentReports">
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="document-text-outline" size={18} color={Colors.text} />
                <Text style={styles.sectionTitle}>Relatórios Recentes</Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('PendentesTab')}>
                <Text style={styles.seeAllText}>Ver todos</Text>
              </TouchableOpacity>
            </View>

            {relatorios.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="document-text-outline" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Nenhum relatório recente</Text>
              </View>
            ) : (
              relatorios.slice(0, 4).map((rel) => {
                const isWaiting = rel.status === 'Aguardando Aprovação';
                const isApproved = rel.status === 'Aprovado';
                const isRejected = rel.status === 'Rejeitado';

                return (
                  <View key={rel.id} style={styles.webListItemCard}>
                    <View style={styles.webItemLeft}>
                      <View style={styles.webItemHeaderRow}>
                        <Text style={styles.webItemNumero}>{rel.numero}</Text>
                        <SyncStatusBadge status={rel.sync_status} />
                      </View>
                      <Text style={styles.webItemProject} numberOfLines={1}>
                        {rel.projeto_nome || 'Obra não informada'}
                      </Text>
                      <View style={styles.statusPillContainer}>
                        <View style={[
                          styles.webStatusBadge,
                          isApproved ? styles.badgeApproved :
                          isRejected ? styles.badgeRejected :
                          isWaiting ? styles.badgeWaiting : styles.badgeDraft
                        ]}>
                          <Text style={[
                            styles.webStatusText,
                            isApproved ? styles.textApproved :
                            isRejected ? styles.textRejected :
                            isWaiting ? styles.textWaiting : styles.textDraft
                          ]}>
                            {rel.status === 'em_andamento' ? 'Rascunho' : (rel.status || 'Rascunho')}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.webItemRight}>
                      <Text style={styles.webItemDate}>
                        {rel.data_relatorio ? new Date(rel.data_relatorio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : 'Sem data'}
                      </Text>

                      {isWaiting && isApprover ? (
                        <TouchableOpacity 
                          style={styles.reviewBtn}
                          onPress={() => navigation.navigate('ReportDetailScreen', { reportId: rel.id })}
                        >
                          <Ionicons name="checkmark-done" size={14} color="#D97706" />
                          <Text style={styles.reviewBtnText}>Revisar</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity 
                          style={styles.viewBtn}
                          onPress={() => navigation.navigate('ReportDetailScreen', { reportId: rel.id })}
                        >
                          <Ionicons name="eye-outline" size={14} color={Colors.primary} />
                          <Text style={styles.viewBtnText}>Ver</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        );

      case 'upcomingVisits':
        if (!widgetsConfig.showProximasVisitas) return null;
        return (
          <View key="upcomingVisits">
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="calendar-outline" size={18} color={Colors.text} />
                <Text style={styles.sectionTitle}>Próximas Visitas</Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('VisitasTab')}>
                <Text style={styles.seeAllText}>Ver todas</Text>
              </TouchableOpacity>
            </View>

            {visitas.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="calendar-outline" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Nenhuma visita agendada.</Text>
              </View>
            ) : (
              visitas.slice(0, 3).map((item) => (
                <TouchableOpacity 
                  key={item.id} 
                  style={styles.webListItemCard}
                  onPress={() => navigation.navigate('VisitDetailScreen', { visitId: item.id })}
                >
                  <View style={styles.webItemLeft}>
                    <View style={styles.webItemHeaderRow}>
                      <Text style={styles.webItemNumero}>{item.numero}</Text>
                      <SyncStatusBadge status={item.sync_status} />
                    </View>
                    <Text style={styles.webItemProject} numberOfLines={1}>
                      {item.projeto_nome || item.projeto_outros || 'Visita Técnica'}
                    </Text>
                    <Text style={styles.visitaTimeText}>
                      {new Date(item.data_inicio).toLocaleDateString('pt-BR')} às {new Date(item.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>

                  <View style={styles.webItemRight}>
                    <View style={[styles.webStatusBadge, styles.badgeSuccess, { marginBottom: 6 }]}>
                      <Text style={[styles.webStatusText, styles.textSuccess]}>{item.status}</Text>
                    </View>

                    {item.projeto_id ? (
                      <TouchableOpacity 
                        style={styles.iniciarRelatorioBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          navigation.navigate('ReportFormScreen', {
                            preSelectedProjectId: item.projeto_id,
                            preSelectedVisitId: item.id
                          });
                        }}
                      >
                        <Ionicons name="document-text-outline" size={13} color="#FFFFFF" />
                        <Text style={styles.iniciarRelatorioBtnText}>Iniciar Relatório</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        );

      default:
        return null;
    }
  }

  return (
    <View style={styles.container}>
      {/* Top Header matching Web System */}
      <Header 
        title="Dashboard ELP" 
        subtitle="Acompanhamento de Obras & Vistorias"
        rightAction={
          <View style={styles.headerActionsRow}>
            <TouchableOpacity 
              style={styles.headerBtn} 
              onPress={() => setShowConfigModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="options-outline" size={20} color="#334155" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.headerBtn, styles.headerSyncBtn]} 
              onPress={async () => {
                const res = await triggerSync();
                Alert.alert(res.success ? 'Sincronização Concluída' : 'Aviso', res.message);
                await loadData();
              }}
              disabled={syncState === 'syncing'}
            >
              <Ionicons 
                name={syncState === 'syncing' ? "sync" : "cloud-done-outline"} 
                size={20} 
                color={Colors.primary} 
              />
            </TouchableOpacity>
          </View>
        }
      />
      <OfflineBanner />

      <ScrollView 
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
      >
        {/* Renderiza as seções seguindo rigorosamente a ordem escolhida pelo usuário */}
        {sectionsOrder.map(secId => renderDashboardSection(secId))}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* MODAL: PERSONALIZAR TELA INICIAL (DASHBOARD) COM REORDENAÇÃO */}
      <Modal visible={showConfigModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="options" size={20} color={Colors.primary} />
                <Text style={styles.modalTitle}>Personalizar Tela Inicial</Text>
              </View>
              <TouchableOpacity onPress={() => setShowConfigModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Abas do Modal: Organizar Ordem vs Exibir/Ocultar */}
            <View style={{ flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 8, padding: 3, marginBottom: 12 }}>
              <TouchableOpacity 
                style={[
                  { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 },
                  modalTab === 'order' && { backgroundColor: '#FFFFFF', elevation: 2 }
                ]}
                onPress={() => setModalTab('order')}
              >
                <Ionicons name="reorder-four" size={16} color={modalTab === 'order' ? Colors.primary : '#64748B'} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: modalTab === 'order' ? Colors.primary : '#64748B' }}>
                  Organizar Ordem
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[
                  { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 },
                  modalTab === 'visibility' && { backgroundColor: '#FFFFFF', elevation: 2 }
                ]}
                onPress={() => setModalTab('visibility')}
              >
                <Ionicons name="eye-outline" size={16} color={modalTab === 'visibility' ? Colors.primary : '#64748B'} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: modalTab === 'visibility' ? Colors.primary : '#64748B' }}>
                  Exibir / Ocultar
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {modalTab === 'order' ? (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 6 }}>
                    Toque nas setas ▲ e ▼ para reposicionar onde quer que cada seção apareça na tela inicial:
                  </Text>
                  {sectionsOrder.map((secId, index) => {
                    const meta = SECTION_METAS[secId];
                    if (!meta) return null;
                    return (
                      <View 
                        key={secId} 
                        style={{ 
                          flexDirection: 'row', 
                          alignItems: 'center', 
                          justifyContent: 'space-between',
                          backgroundColor: '#F8FAFC',
                          borderRadius: 8,
                          padding: 10,
                          borderWidth: 1,
                          borderColor: '#E2E8F0'
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                          <View style={{ 
                            width: 24, 
                            height: 24, 
                            borderRadius: 12, 
                            backgroundColor: '#E0E7FF', 
                            alignItems: 'center', 
                            justifyContent: 'center' 
                          }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#3730A3' }}>{index + 1}º</Text>
                          </View>
                          <Ionicons name={meta.icon} size={18} color="#2563EB" />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B' }}>{meta.title}</Text>
                            <Text style={{ fontSize: 11, color: '#64748B' }} numberOfLines={1}>{meta.desc}</Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          <TouchableOpacity 
                            style={[
                              { backgroundColor: '#E2E8F0', padding: 6, borderRadius: 6 },
                              index === 0 && { opacity: 0.3 }
                            ]}
                            onPress={() => moveSectionUp(index)}
                            disabled={index === 0}
                          >
                            <Ionicons name="arrow-up" size={16} color="#0F172A" />
                          </TouchableOpacity>

                          <TouchableOpacity 
                            style={[
                              { backgroundColor: '#E2E8F0', padding: 6, borderRadius: 6 },
                              index === sectionsOrder.length - 1 && { opacity: 0.3 }
                            ]}
                            onPress={() => moveSectionDown(index)}
                            disabled={index === sectionsOrder.length - 1}
                          >
                            <Ionicons name="arrow-down" size={16} color="#0F172A" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View>
                  <View style={styles.toggleRow}>
                    <View style={styles.toggleLabelBox}>
                      <Text style={styles.toggleTitle}>Logo & Identidade Visual (Hero)</Text>
                      <Text style={styles.toggleDesc}>Banner superior com logo da ELP e slogan</Text>
                    </View>
                    <Switch
                      value={widgetsConfig.showHero}
                      onValueChange={v => updateWidgetConfig('showHero', v)}
                      trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                      thumbColor={widgetsConfig.showHero ? '#2563EB' : '#F1F5F9'}
                    />
                  </View>

                  <View style={styles.toggleRow}>
                    <View style={styles.toggleLabelBox}>
                      <Text style={styles.toggleTitle}>Badges de Usuário / Empresa</Text>
                      <Text style={styles.toggleDesc}>Identificação do engenheiro e consultoria</Text>
                    </View>
                    <Switch
                      value={widgetsConfig.showBadges}
                      onValueChange={v => updateWidgetConfig('showBadges', v)}
                      trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                      thumbColor={widgetsConfig.showBadges ? '#2563EB' : '#F1F5F9'}
                    />
                  </View>

                  <View style={styles.toggleRow}>
                    <View style={styles.toggleLabelBox}>
                      <Text style={styles.toggleTitle}>🏗️ Card: Obras Ativas</Text>
                      <Text style={styles.toggleDesc}>Contador de empreendimentos ativos</Text>
                    </View>
                    <Switch
                      value={widgetsConfig.showObrasAtivas}
                      onValueChange={v => updateWidgetConfig('showObrasAtivas', v)}
                      trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                      thumbColor={widgetsConfig.showObrasAtivas ? '#2563EB' : '#F1F5F9'}
                    />
                  </View>

                  <View style={styles.toggleRow}>
                    <View style={styles.toggleLabelBox}>
                      <Text style={styles.toggleTitle}>📋 Card: Relatórios Pendentes</Text>
                      <Text style={styles.toggleDesc}>Vistorias aguardando aprovação técnica</Text>
                    </View>
                    <Switch
                      value={widgetsConfig.showRelatoriosPendentes}
                      onValueChange={v => updateWidgetConfig('showRelatoriosPendentes', v)}
                      trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                      thumbColor={widgetsConfig.showRelatoriosPendentes ? '#2563EB' : '#F1F5F9'}
                    />
                  </View>

                  <View style={styles.toggleRow}>
                    <View style={styles.toggleLabelBox}>
                      <Text style={styles.toggleTitle}>🗓️ Card: Visitas Agendadas</Text>
                      <Text style={styles.toggleDesc}>Agendamentos futuros na agenda</Text>
                    </View>
                    <Switch
                      value={widgetsConfig.showVisitasAgendadas}
                      onValueChange={v => updateWidgetConfig('showVisitasAgendadas', v)}
                      trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                      thumbColor={widgetsConfig.showVisitasAgendadas ? '#2563EB' : '#F1F5F9'}
                    />
                  </View>

                  <View style={styles.toggleRow}>
                    <View style={styles.toggleLabelBox}>
                      <Text style={styles.toggleTitle}>📝 Card: Em Rascunho</Text>
                      <Text style={styles.toggleDesc}>Relatórios em preenchimento local</Text>
                    </View>
                    <Switch
                      value={widgetsConfig.showRelatoriosRascunho}
                      onValueChange={v => updateWidgetConfig('showRelatoriosRascunho', v)}
                      trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                      thumbColor={widgetsConfig.showRelatoriosRascunho ? '#2563EB' : '#F1F5F9'}
                    />
                  </View>

                  <View style={styles.toggleRow}>
                    <View style={styles.toggleLabelBox}>
                      <Text style={styles.toggleTitle}>⚡ Ações Rápidas no Canteiro</Text>
                      <Text style={styles.toggleDesc}>Botões de Novo Relatório, Express, Visita, Obra</Text>
                    </View>
                    <Switch
                      value={widgetsConfig.showAcoesRapidas}
                      onValueChange={v => updateWidgetConfig('showAcoesRapidas', v)}
                      trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                      thumbColor={widgetsConfig.showAcoesRapidas ? '#2563EB' : '#F1F5F9'}
                    />
                  </View>

                  <View style={styles.toggleRow}>
                    <View style={styles.toggleLabelBox}>
                      <Text style={styles.toggleTitle}>📄 Relatórios Recentes</Text>
                      <Text style={styles.toggleDesc}>Lista resumida dos últimos relatórios</Text>
                    </View>
                    <Switch
                      value={widgetsConfig.showRelatoriosRecentes}
                      onValueChange={v => updateWidgetConfig('showRelatoriosRecentes', v)}
                      trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                      thumbColor={widgetsConfig.showRelatoriosRecentes ? '#2563EB' : '#F1F5F9'}
                    />
                  </View>

                  <View style={styles.toggleRow}>
                    <View style={styles.toggleLabelBox}>
                      <Text style={styles.toggleTitle}>📅 Próximas Visitas</Text>
                      <Text style={styles.toggleDesc}>Lista com as próximas vistorias agendadas</Text>
                    </View>
                    <Switch
                      value={widgetsConfig.showProximasVisitas}
                      onValueChange={v => updateWidgetConfig('showProximasVisitas', v)}
                      trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                      thumbColor={widgetsConfig.showProximasVisitas ? '#2563EB' : '#F1F5F9'}
                    />
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.resetBtn} onPress={resetWidgetConfig}>
                <Text style={styles.resetBtnText}>Restaurar Padrão</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.doneBtn} onPress={() => setShowConfigModal(false)}>
                <Text style={styles.doneBtnText}>Salvar Preferências</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scroll: {
    padding: 16,
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  headerSyncBtn: {
    backgroundColor: '#EFF6FF',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  heroLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  heroLogo: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  heroTextContainer: {
    flex: 1,
  },
  heroCompany: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  heroSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  heroGreeting: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  heroDateText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  prominentActionsRow: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 10,
  },
  btnOutlineBlue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    ...Shadows.sm,
  },
  btnOutlineBlueText: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: 'bold',
  },
  btnSolidBlue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 13,
    ...Shadows.sm,
  },
  btnSolidBlueText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  btnYellowExpress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#D97706',
    borderRadius: 10,
    paddingVertical: 12,
    ...Shadows.sm,
  },
  btnYellowExpressText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  secondaryActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  secondaryActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  iniciarRelatorioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2563EB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  iniciarRelatorioBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  customizeShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  customizeShortcutText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563EB',
  },
  userBadgeBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  badgePrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    ...Shadows.sm,
  },
  badgeCyan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0891B2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    ...Shadows.sm,
  },
  badgeTextWhite: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  approverAlertBanner: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    ...Shadows.sm,
  },
  approverAlertLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  approverAlertTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#92400E',
  },
  approverAlertSub: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  onlineDot: {
    backgroundColor: '#10B981',
  },
  offlineDot: {
    backgroundColor: '#F59E0B',
  },
  onlinePillText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  seeAllText: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '600',
  },
  cardsGrid: {
    gap: 12,
    marginBottom: 6,
  },
  webCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  borderPrimary: {
    borderLeftWidth: 5,
    borderLeftColor: '#4E73DF',
  },
  borderInfo: {
    borderLeftWidth: 5,
    borderLeftColor: '#36B9CC',
  },
  borderSuccess: {
    borderLeftWidth: 5,
    borderLeftColor: '#1CC88A',
  },
  borderWarning: {
    borderLeftWidth: 5,
    borderLeftColor: '#F6C23E',
  },
  cardContent: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionBtn: {
    width: '48%',
    borderRadius: 12,
    padding: 14,
    ...Shadows.sm,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 6,
  },
  actionBtnSub: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    marginTop: 2,
  },
  webListItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  webItemLeft: {
    flex: 1,
    marginRight: 10,
  },
  webItemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  webItemNumero: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  webItemProject: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 6,
  },
  visitaTimeText: {
    fontSize: 11,
    color: '#64748B',
  },
  statusPillContainer: {
    flexDirection: 'row',
  },
  webStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeApproved: {
    backgroundColor: '#DCFCE7',
  },
  badgeRejected: {
    backgroundColor: '#FEE2E2',
  },
  badgeWaiting: {
    backgroundColor: '#FEF3C7',
  },
  badgeDraft: {
    backgroundColor: '#F1F5F9',
  },
  badgeSuccess: {
    backgroundColor: '#DCFCE7',
  },
  webStatusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  textApproved: {
    color: '#166534',
  },
  textRejected: {
    color: '#991B1B',
  },
  textWaiting: {
    color: '#B45309',
  },
  textDraft: {
    color: '#475569',
  },
  textSuccess: {
    color: '#166534',
  },
  webItemRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  webItemDate: {
    fontSize: 11,
    color: '#94A3B8',
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#2563EB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  viewBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#D97706',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FFFBEB',
  },
  reviewBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#D97706',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 8,
  },
  // Customization Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 16,
    lineHeight: 18,
  },
  modalScroll: {
    maxHeight: 380,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  toggleLabelBox: {
    flex: 1,
    marginRight: 12,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  toggleDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  resetBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtnText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  doneBtn: {
    flex: 1.5,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
