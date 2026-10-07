import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { getLocalRelatorios } from '../../database/db';
import { Relatorio } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

import { useNetwork } from '../../contexts/NetworkContext';
import { syncService } from '../../services/syncService';
import { useFocusEffect } from '@react-navigation/native';

export const ReportsListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { isOnline } = useNetwork();
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [filteredRelatorios, setFilteredRelatorios] = useState<Relatorio[]>([]);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('Todos');
  const [refreshing, setRefreshing] = useState(false);

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
      filterReports(data, search, selectedStatus);

      if (isOnline) {
        syncService.syncAll().then(async () => {
          const fresh = await getLocalRelatorios();
          setRelatorios(fresh);
          filterReports(fresh, search, selectedStatus);
        }).catch(() => null);
      }
    } catch (e) {
      console.warn('Erro ao carregar relatórios:', e);
    }
  }, [search, selectedStatus, isOnline]);

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

  return (
    <View style={styles.container}>
      <Header 
        title="Relatórios" 
        subtitle={`${filteredRelatorios.length} ${filteredRelatorios.length === 1 ? 'relatório' : 'relatórios'}`}
        rightAction={
          <TouchableOpacity 
            style={styles.addBtn}
            onPress={() => navigation.navigate('ReportFormScreen')}
          >
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />

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

      {/* Filter Tabs */}
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
            <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Nenhum relatório encontrado</Text>
            <Text style={styles.emptySub}>Toque no botão + acima para iniciar um novo relatório.</Text>
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
              onPress={() => {
                if (isDraft) {
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
});
