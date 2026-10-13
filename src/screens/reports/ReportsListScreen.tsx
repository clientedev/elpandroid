import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl, Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { getLocalRelatorios } from '../../database/db';
import { Relatorio } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

import { useNetwork } from '../../contexts/NetworkContext';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../services/api';
import { syncService } from '../../services/syncService';
import { useFocusEffect } from '@react-navigation/native';
import { ScrollView } from 'react-native';

export const ReportsListScreen: React.FC<{ navigation: any; route?: any }> = ({ navigation, route }) => {
  const { isOnline } = useNetwork();
  const { user } = useAuth();
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [filteredRelatorios, setFilteredRelatorios] = useState<Relatorio[]>([]);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('Todos');
  const [refreshing, setRefreshing] = useState(false);

  // Escutar parâmetros de navegação (ex: vindo do Dashboard)
  useEffect(() => {
    if (route?.params?.filterStatus) {
      const target = route.params.filterStatus;
      setSelectedStatus(target);
      filterReports(relatorios, search, target);
    }
  }, [route?.params?.filterStatus]);

  function getReportTimestamp(r: Relatorio): number {
    // IDs gerados localmente em milissegundos (Date.now())
    if (r.id && r.id > 1700000000000) return r.id;

    const dates = [
      r.data_criacao_local,
      r.created_at,
      r.updated_at,
      r.data_relatorio,
      r.data_sincronizacao,
    ];
    for (const d of dates) {
      if (d && typeof d === 'string' && d.trim().length > 0) {
        const t = new Date(d).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
    }
    // Fallback proporcional ao ID do servidor
    return (r.id || 0) * 1000;
  }

  function filterReports(data: Relatorio[], text: string, status: string) {
    let result = [...data];
    if (status !== 'Todos') {
      result = result.filter(r => r.status === status);
    }
    if (text.trim()) {
      const q = text.toLowerCase();
      result = result.filter(r =>
        (r.titulo && r.titulo.toLowerCase().includes(q)) ||
        (r.numero && r.numero.toLowerCase().includes(q)) ||
        (r.projeto_nome && r.projeto_nome.toLowerCase().includes(q))
      );
    }

    // Regra Estrita: Do mais recente para o mais antigo
    result.sort((a, b) => {
      // 1. Rascunhos ativos locais no topo para fácil continuidade
      const aDraft = a.status === 'em_andamento' ? 1 : 0;
      const bDraft = b.status === 'em_andamento' ? 1 : 0;
      if (aDraft !== bDraft) return bDraft - aDraft;

      // 2. Data/hora mais recente primeiro
      const timeA = getReportTimestamp(a);
      const timeB = getReportTimestamp(b);
      if (Math.abs(timeB - timeA) > 1000) {
        return timeB - timeA;
      }

      // 3. Número sequencial de relatório decrescente (ex: REL-0005 antes de REL-0004)
      const numA = a.numero_projeto || parseInt((a.numero || '').replace(/[^0-9]/g, ''), 10) || 0;
      const numB = b.numero_projeto || parseInt((b.numero || '').replace(/[^0-9]/g, ''), 10) || 0;
      if (numB !== numA) return numB - numA;

      // 4. ID decrescente
      return (b.id || 0) - (a.id || 0);
    });

    setFilteredRelatorios(result);
  }

  const loadRelatorios = useCallback(async () => {
    try {
      const data = await getLocalRelatorios();
      setRelatorios(data);
      const activeStatus = route?.params?.filterStatus || selectedStatus;
      filterReports(data, search, activeStatus);

      if (isOnline) {
        syncService.syncAll().then(async () => {
          const fresh = await getLocalRelatorios();
          setRelatorios(fresh);
          filterReports(fresh, search, activeStatus);
        }).catch(() => null);
      }
    } catch (e) {
      console.warn('Erro ao carregar relatórios:', e);
    }
  }, [search, selectedStatus, isOnline, route?.params?.filterStatus]);

  useFocusEffect(
    useCallback(() => {
      loadRelatorios();
    }, [loadRelatorios])
  );

  const handleSearch = (text: string) => {
    setSearch(text);
    filterReports(relatorios, text, selectedStatus);
  };

  const handleStatusFilter = (status: string) => {
    if (route?.params?.filterStatus) {
      route.params.filterStatus = undefined;
    }
    setSelectedStatus(status);
    filterReports(relatorios, search, status);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (isOnline) {
      await syncService.syncAll().catch(() => null);
    }
    await loadRelatorios();
    setRefreshing(false);
  };

  const formatReportDate = (item: Relatorio) => {
    const rawDate = item.data_relatorio || item.data_criacao_local || item.created_at;
    if (!rawDate) return '';
    try {
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('pt-BR');
    } catch {
      return '';
    }
  };

  // Contadores dinâmicos para os cards de métricas
  const countAprovacao = relatorios.filter(r => r.status === 'Aguardando Aprovação').length;
  const countAprovados = relatorios.filter(r => r.status === 'Aprovado').length;
  const countRascunhos = relatorios.filter(r => r.status === 'em_andamento' || r.status === 'preenchimento' || !r.status).length;
  const countTotal = relatorios.length;

  // Informações da visão exclusiva conforme o card selecionado
  function getHeaderExclusiveInfo() {
    switch (selectedStatus) {
      case 'Aguardando Aprovação':
        return {
          title: 'Para Aprovação',
          subtitle: `${filteredRelatorios.length} ${filteredRelatorios.length === 1 ? 'relatório aguardando' : 'relatórios aguardando'} revisão técnica`,
          exclusiveLabel: 'PÁGINA EXCLUSIVA: RELATÓRIOS PARA APROVAÇÃO',
          bannerColor: '#B45309',
          bannerBg: '#FEF3C7',
          bannerBorder: '#FDE68A',
          iconName: 'hourglass-outline' as const,
          emptyTitle: 'Nenhum relatório pendente de aprovação',
          emptySub: 'Parabéns! Todos os relatórios foram revisados ou ainda estão em preenchimento.'
        };
      case 'Aprovado':
        return {
          title: 'Relatórios Aprovados',
          subtitle: `${filteredRelatorios.length} ${filteredRelatorios.length === 1 ? 'laudo técnico aprovado' : 'laudos técnicos aprovados'}`,
          exclusiveLabel: 'PÁGINA EXCLUSIVA: LAUDOS TÉCNICOS APROVADOS',
          bannerColor: '#065F46',
          bannerBg: '#D1FAE5',
          bannerBorder: '#A7F3D0',
          iconName: 'checkmark-circle' as const,
          emptyTitle: 'Nenhum relatório aprovado encontrado',
          emptySub: 'Quando um relatório for aprovado por um engenheiro responsável, ele constará aqui.'
        };
      case 'em_andamento':
        return {
          title: 'Rascunhos em Aberto',
          subtitle: `${filteredRelatorios.length} ${filteredRelatorios.length === 1 ? 'relatório em elaboração' : 'relatórios em elaboração'}`,
          exclusiveLabel: 'PÁGINA EXCLUSIVA: RASCUNHOS EM PREENCHIMENTO',
          bannerColor: '#1D4ED8',
          bannerBg: '#DBEAFE',
          bannerBorder: '#BFDBFE',
          iconName: 'document-text-outline' as const,
          emptyTitle: 'Nenhum rascunho em aberto',
          emptySub: 'Todos os relatórios iniciados foram enviados ou ainda não foram criados.'
        };
      case 'Rejeitado':
        return {
          title: 'Relatórios Rejeitados',
          subtitle: `${filteredRelatorios.length} ${filteredRelatorios.length === 1 ? 'relatório com correções solicitadas' : 'relatórios com correções solicitadas'}`,
          exclusiveLabel: 'PÁGINA EXCLUSIVA: RELATÓRIOS REJEITADOS',
          bannerColor: '#991B1B',
          bannerBg: '#FEE2E2',
          bannerBorder: '#FECACA',
          iconName: 'close-circle-outline' as const,
          emptyTitle: 'Nenhum relatório rejeitado',
          emptySub: 'Não há relatórios com pendências ou correções solicitadas.'
        };
      default:
        return {
          title: 'Relatórios',
          subtitle: `${filteredRelatorios.length} ${filteredRelatorios.length === 1 ? 'relatório disponível' : 'relatórios disponíveis'}`,
          exclusiveLabel: null,
          bannerColor: '#475569',
          bannerBg: '#F1F5F9',
          bannerBorder: '#E2E8F0',
          iconName: 'albums-outline' as const,
          emptyTitle: 'Nenhum relatório encontrado',
          emptySub: 'Toque no botão + acima para iniciar um novo relatório de visita.'
        };
    }
  }

  const exclusiveInfo = getHeaderExclusiveInfo();

  return (
    <View style={styles.container}>
      <Header 
        title={exclusiveInfo.title} 
        subtitle={exclusiveInfo.subtitle}
        rightAction={
          <TouchableOpacity 
            style={styles.addBtn}
            onPress={() => navigation.navigate('ReportFormScreen')}
          >
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />

      {/* CARDS DE NAVEGAÇÃO EXCLUSIVA DE STATUS */}
      <View style={styles.metricsContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.metricsScrollContent}
        >
          {/* Card 1: Para Aprovação */}
          <TouchableOpacity 
            style={[
              styles.metricCard,
              styles.cardApproval,
              selectedStatus === 'Aguardando Aprovação' && styles.metricCardActiveApproval
            ]}
            onPress={() => handleStatusFilter('Aguardando Aprovação')}
            activeOpacity={0.75}
          >
            <View style={styles.metricHeaderRow}>
              <View style={[styles.metricIconBox, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="hourglass" size={16} color="#D97706" />
              </View>
              {selectedStatus === 'Aguardando Aprovação' && (
                <View style={styles.activePillBadge}>
                  <Text style={styles.activePillText}>Ativo</Text>
                </View>
              )}
            </View>
            <Text style={[styles.metricCount, { color: '#B45309' }]}>{countAprovacao}</Text>
            <Text style={styles.metricLabel} numberOfLines={1}>Pra Aprovação</Text>
          </TouchableOpacity>

          {/* Card 2: Aprovados */}
          <TouchableOpacity 
            style={[
              styles.metricCard,
              styles.cardApproved,
              selectedStatus === 'Aprovado' && styles.metricCardActiveApproved
            ]}
            onPress={() => handleStatusFilter('Aprovado')}
            activeOpacity={0.75}
          >
            <View style={styles.metricHeaderRow}>
              <View style={[styles.metricIconBox, { backgroundColor: '#D1FAE5' }]}>
                <Ionicons name="checkmark-done-circle" size={16} color="#059669" />
              </View>
              {selectedStatus === 'Aprovado' && (
                <View style={[styles.activePillBadge, { backgroundColor: '#059669' }]}>
                  <Text style={styles.activePillText}>Ativo</Text>
                </View>
              )}
            </View>
            <Text style={[styles.metricCount, { color: '#065F46' }]}>{countAprovados}</Text>
            <Text style={styles.metricLabel} numberOfLines={1}>Aprovados</Text>
          </TouchableOpacity>

          {/* Card 3: Rascunhos / Em Preenchimento */}
          <TouchableOpacity 
            style={[
              styles.metricCard,
              styles.cardDraft,
              selectedStatus === 'em_andamento' && styles.metricCardActiveDraft
            ]}
            onPress={() => handleStatusFilter('em_andamento')}
            activeOpacity={0.75}
          >
            <View style={styles.metricHeaderRow}>
              <View style={[styles.metricIconBox, { backgroundColor: '#DBEAFE' }]}>
                <Ionicons name="document-text" size={16} color="#2563EB" />
              </View>
              {selectedStatus === 'em_andamento' && (
                <View style={[styles.activePillBadge, { backgroundColor: '#2563EB' }]}>
                  <Text style={styles.activePillText}>Ativo</Text>
                </View>
              )}
            </View>
            <Text style={[styles.metricCount, { color: '#1E40AF' }]}>{countRascunhos}</Text>
            <Text style={styles.metricLabel} numberOfLines={1}>Em Preenchimento</Text>
          </TouchableOpacity>

          {/* Card 4: Todos */}
          <TouchableOpacity 
            style={[
              styles.metricCard,
              styles.cardAll,
              selectedStatus === 'Todos' && styles.metricCardActiveAll
            ]}
            onPress={() => handleStatusFilter('Todos')}
            activeOpacity={0.75}
          >
            <View style={styles.metricHeaderRow}>
              <View style={[styles.metricIconBox, { backgroundColor: '#F1F5F9' }]}>
                <Ionicons name="albums-outline" size={16} color="#475569" />
              </View>
              {selectedStatus === 'Todos' && (
                <View style={[styles.activePillBadge, { backgroundColor: '#475569' }]}>
                  <Text style={styles.activePillText}>Ativo</Text>
                </View>
              )}
            </View>
            <Text style={[styles.metricCount, { color: '#334155' }]}>{countTotal}</Text>
            <Text style={styles.metricLabel} numberOfLines={1}>Todos os Relatórios</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* BANNER DE SEÇÃO EXCLUSIVA (Quando filtrado) */}
      {exclusiveInfo.exclusiveLabel && (
        <View style={[
          styles.exclusiveBannerContainer, 
          { backgroundColor: exclusiveInfo.bannerBg, borderColor: exclusiveInfo.bannerBorder }
        ]}>
          <View style={styles.exclusiveBannerLeft}>
            <Ionicons name={exclusiveInfo.iconName} size={18} color={exclusiveInfo.bannerColor} />
            <Text style={[styles.exclusiveBannerText, { color: exclusiveInfo.bannerColor }]}>
              {exclusiveInfo.exclusiveLabel}
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.exclusiveResetBtn}
            onPress={() => handleStatusFilter('Todos')}
          >
            <Text style={styles.exclusiveResetText}>Ver Todos</Text>
            <Ionicons name="close" size={14} color="#64748B" />
          </TouchableOpacity>
        </View>
      )}

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por obra, título ou número..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={handleSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Filter Tabs Chips */}
      <View style={styles.filterRow}>
        {['Todos', 'em_andamento', 'Aguardando Aprovação', 'Aprovado', 'Rejeitado'].map(st => (
          <TouchableOpacity
            key={st}
            style={[styles.filterChip, selectedStatus === st && styles.filterChipActive]}
            onPress={() => handleStatusFilter(st)}
          >
            <Text style={[styles.filterText, selectedStatus === st && styles.filterTextActive]}>
              {st === 'em_andamento' ? 'Rascunhos' : st === 'Aguardando Aprovação' ? 'Aguardando' : st}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Reports List */}
      <FlatList
        data={filteredRelatorios}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name={exclusiveInfo.iconName} size={52} color={exclusiveInfo.bannerColor || Colors.textMuted} />
            <Text style={styles.emptyTitle}>{exclusiveInfo.emptyTitle}</Text>
            <Text style={styles.emptySub}>{exclusiveInfo.emptySub}</Text>
            {selectedStatus !== 'Todos' && (
              <TouchableOpacity 
                style={styles.emptyResetBtn} 
                onPress={() => handleStatusFilter('Todos')}
              >
                <Ionicons name="albums-outline" size={16} color="#FFFFFF" />
                <Text style={styles.emptyResetBtnText}>Mostrar Todos os Relatórios</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const isDraft = item.status === 'em_andamento';
          const hasOfficialNum = item.numero && item.numero.startsWith('REL-');
          const dateStr = formatReportDate(item);
          const rawFotos = (item as any).fotos;
          const photoCount = item.fotos_count || (Array.isArray(rawFotos) ? rawFotos.length : 0);

          return (
            <TouchableOpacity 
              style={styles.card}
              activeOpacity={0.7}
              onPress={async () => {
                if (isDraft) {
                  if (isOnline) {
                    try {
                      const res = await apiClient.axios.get(`/api/relatorios/${item.id}/lock-status`, { timeout: 3000 });
                      if (res?.data?.locked && res.data.usuario_em_edicao_id !== user?.id) {
                        const editor = res.data.usuario_em_edicao_nome || 'outro usuário';
                        Alert.alert(
                          'Relatório em Preenchimento',
                          `Este relatório já está aberto e sendo preenchido no momento por:\n\n👤 ${editor}\n\nVocê não pode entrar neste relatório até que ele conclua e saia para não sobrescrever dados.`
                        );
                        return;
                      }
                    } catch {}
                  }
                  navigation.navigate('ReportFormScreen', { reportId: item.id });
                } else {
                  navigation.navigate('ReportDetailScreen', { reportId: item.id });
                }
              }}
            >
              <View style={styles.cardHeader}>
                {hasOfficialNum ? (
                  <View style={styles.numBadge}>
                    <Text style={styles.numText}>{item.numero}</Text>
                  </View>
                ) : (
                  <View style={[styles.numBadge, styles.numBadgeDraft]}>
                    <Text style={styles.numTextDraft}>Rascunho</Text>
                  </View>
                )}
                {dateStr ? (
                  <Text style={styles.dateText}>{dateStr}</Text>
                ) : null}
              </View>

              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.titulo || 'Relatório de Visita'}
              </Text>
              
              <View style={styles.projectRow}>
                <Ionicons name="business-outline" size={13} color="#64748B" />
                <Text style={styles.cardSub} numberOfLines={1}>
                  {item.projeto_nome || 'Obra não especificada'}
                </Text>
              </View>

              <View style={styles.cardFooter}>
                <View style={[
                  styles.statusTag, 
                  item.status === 'Aprovado' ? styles.statusApproved : 
                  item.status === 'Aguardando Aprovação' ? styles.statusWaiting : 
                  item.status === 'Rejeitado' ? styles.statusRejected : styles.statusDraftTag
                ]}>
                  <Text style={styles.statusTagText}>
                    {isDraft ? 'Rascunho' : item.status}
                  </Text>
                </View>

                <View style={styles.footerRight}>
                  {photoCount > 0 && (
                    <View style={styles.photosIndicator}>
                      <Ionicons name="camera-outline" size={13} color="#64748B" />
                      <Text style={styles.photosCount}>{photoCount}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  addBtn: {
    backgroundColor: Colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  searchContainer: { paddingHorizontal: 16, paddingTop: 12 },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: '#FFFFFF' },
  listContent: { padding: 16, paddingTop: 4 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  numBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 5,
  },
  numText: { color: Colors.primary, fontWeight: '700', fontSize: 11 },
  numBadgeDraft: {
    backgroundColor: '#FEF3C7',
  },
  numTextDraft: {
    color: '#B45309',
    fontWeight: '700',
    fontSize: 11,
  },
  dateText: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 4, lineHeight: 20 },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
  },
  cardSub: { fontSize: 12.5, color: '#64748B', flex: 1 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  statusTag: { paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 5 },
  statusApproved: { backgroundColor: '#DCFCE7' },
  statusWaiting: { backgroundColor: '#FEF9C3' },
  statusRejected: { backgroundColor: '#FEE2E2' },
  statusDraftTag: { backgroundColor: '#F1F5F9' },
  statusTagText: { fontSize: 11, fontWeight: '600', color: '#334155' },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  photosIndicator: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  photosCount: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  emptyContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text, marginTop: 12 },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
  metricsContainer: {
    paddingTop: 12,
    paddingBottom: 4,
  },
  metricsScrollContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  metricCard: {
    width: 145,
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  cardApproval: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  cardApproved: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  cardDraft: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  cardAll: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  metricCardActiveApproval: {
    borderColor: '#D97706',
    borderWidth: 2,
    backgroundColor: '#FEF3C7',
    ...Shadows.md,
  },
  metricCardActiveApproved: {
    borderColor: '#059669',
    borderWidth: 2,
    backgroundColor: '#D1FAE5',
    ...Shadows.md,
  },
  metricCardActiveDraft: {
    borderColor: '#2563EB',
    borderWidth: 2,
    backgroundColor: '#DBEAFE',
    ...Shadows.md,
  },
  metricCardActiveAll: {
    borderColor: '#0F172A',
    borderWidth: 2,
    backgroundColor: '#F1F5F9',
    ...Shadows.md,
  },
  metricHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metricIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePillBadge: {
    backgroundColor: '#D97706',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  activePillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  metricCount: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  exclusiveBannerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  exclusiveBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
  },
  exclusiveBannerText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
    flex: 1,
  },
  exclusiveResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  exclusiveResetText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  emptyResetBtn: {
    marginTop: 16,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    ...Shadows.sm,
  },
  emptyResetBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
