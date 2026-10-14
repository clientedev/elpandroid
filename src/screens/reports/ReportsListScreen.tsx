import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl, Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { getLocalRelatorios, getLocalRelatoriosExpress } from '../../database/db';
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
      const data = await getLocalRelatorios().catch(e => {
        console.warn('Erro ao carregar relatórios locais:', e);
        return [];
      });
      const expData = await getLocalRelatoriosExpress().catch(e => {
        console.warn('Erro ao carregar relatórios express locais:', e);
        return [];
      });

      const expressAdapted: Relatorio[] = (expData || []).map(exp => ({
        id: exp.id,
        numero: exp.numero,
        titulo: exp.titulo || 'Relatório Express de Visita',
        projeto_id: 0,
        projeto_nome: exp.obra_nome || 'Obra Express',
        projeto_construtora: exp.obra_construtora,
        autor_id: exp.autor_id || 1,
        autor_nome: exp.autor_nome || 'Fiscal',
        data_relatorio: exp.data_relatorio,
        data_criacao_local: exp.data_relatorio,
        status: exp.status as any,
        sync_status: exp.sync_status as any,
        fotos_count: exp.fotos_count || 0,
        observacoes_finais: exp.observacoes_finais,
        is_express: true,
      }));
      const combined = [...(data || []), ...expressAdapted];
      setRelatorios(combined);
      const activeStatus = route?.params?.filterStatus || selectedStatus;
      filterReports(combined, search, activeStatus);

      if (isOnline) {
        syncService.syncAll().then(async () => {
          const fresh = await getLocalRelatorios().catch(() => []);
          const freshExp = await getLocalRelatoriosExpress().catch(() => []);
          const freshExpAdapted: Relatorio[] = (freshExp || []).map(exp => ({
            id: exp.id,
            numero: exp.numero,
            titulo: exp.titulo || 'Relatório Express de Visita',
            projeto_id: 0,
            projeto_nome: exp.obra_nome || 'Obra Express',
            projeto_construtora: exp.obra_construtora,
            autor_id: exp.autor_id || 1,
            autor_nome: exp.autor_nome || 'Fiscal',
            data_relatorio: exp.data_relatorio,
            data_criacao_local: exp.data_relatorio,
            status: exp.status as any,
            sync_status: exp.sync_status as any,
            fotos_count: exp.fotos_count || 0,
            observacoes_finais: exp.observacoes_finais,
            is_express: true,
          }));
          const freshCombined = [...(fresh || []), ...freshExpAdapted];
          setRelatorios(freshCombined);
          filterReports(freshCombined, search, activeStatus);
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

  // Contadores dinâmicos para as abas minimalistas
  const countTotal = relatorios.length;
  const countAprovacao = relatorios.filter(r => r.status === 'Aguardando Aprovação').length;
  const countAprovados = relatorios.filter(r => r.status === 'Aprovado').length;
  const countRascunhos = relatorios.filter(r => r.status === 'em_andamento' || r.status === 'preenchimento' || !r.status).length;
  const countRejeitados = relatorios.filter(r => r.status === 'Rejeitado').length;

  const filterTabs = [
    { key: 'Todos', label: 'Todos', count: countTotal },
    { key: 'Aguardando Aprovação', label: 'Aguardando', count: countAprovacao },
    { key: 'em_andamento', label: 'Rascunhos', count: countRascunhos },
    { key: 'Aprovado', label: 'Aprovados', count: countAprovados },
    { key: 'Rejeitado', label: 'Rejeitados', count: countRejeitados },
  ];

  return (
    <View style={styles.container}>
      <Header 
        title="Relatórios" 
        subtitle={`${filteredRelatorios.length} de ${relatorios.length} ${relatorios.length === 1 ? 'relatório' : 'relatórios'}`}
        rightAction={
          <TouchableOpacity 
            style={styles.addBtn}
            onPress={() => navigation.navigate('ReportFormScreen')}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />

      {/* Busca Rápida Minimalista */}
      <View style={styles.searchContainer}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={16} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por obra, título ou número..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={handleSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => handleSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Segmento de Filtros Minimalista com Contadores */}
      <View style={styles.filterSection}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {filterTabs.map(tab => {
            const isActive = selectedStatus === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => handleStatusFilter(tab.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                  {tab.label}
                </Text>
                <View style={[styles.filterCountBadge, isActive && styles.filterCountBadgeActive]}>
                  <Text style={[styles.filterCountText, isActive && styles.filterCountTextActive]}>
                    {tab.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Lista de Relatórios */}
      <FlatList
        data={filteredRelatorios}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="document-text-outline" size={32} color="#94A3B8" />
            </View>
            <Text style={styles.emptyTitle}>Nenhum relatório encontrado</Text>
            <Text style={styles.emptySub}>
              {selectedStatus !== 'Todos'
                ? `Não há relatórios com o filtro "${selectedStatus}".`
                : 'Você ainda não possui relatórios criados.'}
            </Text>
            {selectedStatus !== 'Todos' ? (
              <TouchableOpacity 
                style={styles.emptyResetBtn} 
                onPress={() => handleStatusFilter('Todos')}
              >
                <Ionicons name="filter-outline" size={14} color="#2563EB" />
                <Text style={styles.emptyResetBtnText}>Limpar Filtro</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={styles.emptyCreateBtn} 
                onPress={() => navigation.navigate('ReportFormScreen')}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.emptyCreateBtnText}>Novo Relatório</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const isDraft = item.status === 'em_andamento' || item.status === 'preenchimento' || !item.status;
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
                  if ((item as any).is_express) {
                    navigation.navigate('ReportDetailScreen', { reportId: item.id });
                  } else {
                    navigation.navigate('ReportFormScreen', { reportId: item.id });
                  }
                } else {
                  navigation.navigate('ReportDetailScreen', { reportId: item.id });
                }
              }}
            >
              {/* Linha Superior: Identificador / Status e Data */}
              <View style={styles.cardTopRow}>
                <View style={styles.cardTopLeft}>
                  <View style={[styles.codeBadge, isDraft && styles.codeBadgeDraft, (item as any).is_express && { backgroundColor: '#FDF4FF', borderColor: '#F0ABFC' }]}>
                    <Text style={[styles.codeBadgeText, isDraft && styles.codeBadgeTextDraft, (item as any).is_express && { color: '#A21CAF' }]}>
                      {(item as any).is_express ? `⚡ ${item.numero}` : (hasOfficialNum ? item.numero : 'RASCUNHO')}
                    </Text>
                  </View>
                  <View style={[
                    styles.statusPill, 
                    item.status === 'Aprovado' ? styles.statusApproved : 
                    item.status === 'Aguardando Aprovação' ? styles.statusWaiting : 
                    item.status === 'Rejeitado' ? styles.statusRejected : styles.statusDraft
                  ]}>
                    <View style={[
                      styles.statusDot,
                      item.status === 'Aprovado' ? { backgroundColor: '#10B981' } :
                      item.status === 'Aguardando Aprovação' ? { backgroundColor: '#F59E0B' } :
                      item.status === 'Rejeitado' ? { backgroundColor: '#EF4444' } : { backgroundColor: '#64748B' }
                    ]} />
                    <Text style={[
                      styles.statusPillText,
                      item.status === 'Aprovado' ? { color: '#065F46' } :
                      item.status === 'Aguardando Aprovação' ? { color: '#92400E' } :
                      item.status === 'Rejeitado' ? { color: '#991B1B' } : { color: '#475569' }
                    ]}>
                      {isDraft ? 'Em aberto' : item.status}
                    </Text>
                  </View>
                </View>
                {dateStr ? (
                  <Text style={styles.cardDate}>{dateStr}</Text>
                ) : null}
              </View>

              {/* Título Principal */}
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.titulo || 'Relatório de Visita'}
              </Text>
              
              {/* Rodapé do Card: Obra e Indicadores */}
              <View style={styles.cardBottomRow}>
                <View style={styles.projectInfo}>
                  <Ionicons name="business" size={13} color="#94A3B8" />
                  <Text style={styles.projectText} numberOfLines={1}>
                    {item.projeto_nome || 'Obra não especificada'}
                  </Text>
                </View>

                <View style={styles.cardMetaRight}>
                  {photoCount > 0 && (
                    <View style={styles.photoBadge}>
                      <Ionicons name="camera" size={12} color="#64748B" />
                      <Text style={styles.photoCountText}>{photoCount}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={15} color="#CBD5E1" />
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
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  addBtn: {
    backgroundColor: Colors.primary,
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: { 
    paddingHorizontal: 16, 
    paddingTop: 10,
    paddingBottom: 6,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 13.5, color: '#1E293B' },
  
  // Seção de Filtros Minimalista
  filterSection: {
    paddingVertical: 6,
  },
  filterScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: { 
    backgroundColor: '#1E293B', 
    borderColor: '#1E293B',
  },
  filterText: { 
    fontSize: 12, 
    fontWeight: '600', 
    color: '#64748B',
  },
  filterTextActive: { 
    color: '#FFFFFF',
  },
  filterCountBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  filterCountBadgeActive: {
    backgroundColor: '#334155',
  },
  filterCountText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  filterCountTextActive: {
    color: '#F8FAFC',
  },

  // Lista & Cards Minimalistas
  listContent: { 
    paddingHorizontal: 16, 
    paddingTop: 4, 
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  codeBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  codeBadgeDraft: {
    backgroundColor: '#F1F5F9',
  },
  codeBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#2563EB',
    letterSpacing: 0.2,
  },
  codeBadgeTextDraft: {
    color: '#64748B',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusApproved: { backgroundColor: '#ECFDF5' },
  statusWaiting: { backgroundColor: '#FFFBEB' },
  statusRejected: { backgroundColor: '#FEF2F2' },
  statusDraft: { backgroundColor: '#F8FAFC' },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  cardDate: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  cardTitle: { 
    fontSize: 14.5, 
    fontWeight: '700', 
    color: '#0F172A', 
    lineHeight: 19,
    marginBottom: 8,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  projectInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    marginRight: 8,
  },
  projectText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  cardMetaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  photoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  photoCountText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },

  // Empty State
  emptyContainer: { 
    padding: 36, 
    alignItems: 'center', 
    justifyContent: 'center',
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { 
    fontSize: 15, 
    fontWeight: '700', 
    color: '#1E293B', 
    marginBottom: 4,
  },
  emptySub: { 
    fontSize: 12.5, 
    color: '#64748B', 
    textAlign: 'center', 
    marginBottom: 16,
    lineHeight: 18,
  },
  emptyResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  emptyResetBtnText: {
    color: '#2563EB',
    fontWeight: '600',
    fontSize: 12.5,
  },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  emptyCreateBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12.5,
  },
});

