import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { getLocalRelatorios } from '../../database/db';
import { Relatorio } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

export const ReportsListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [filteredRelatorios, setFilteredRelatorios] = useState<Relatorio[]>([]);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('Todos');
  const [refreshing, setRefreshing] = useState(false);

  const loadRelatorios = useCallback(async () => {
    try {
      const data = await getLocalRelatorios();
      setRelatorios(data);
      filterReports(data, search, selectedStatus);
    } catch (e) {
      console.warn('Erro ao carregar relatórios:', e);
    }
  }, [search, selectedStatus]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadRelatorios();
    });
    loadRelatorios();
    return unsubscribe;
  }, [navigation, loadRelatorios]);

  function filterReports(data: Relatorio[], text: string, status: string) {
    let result = data;
    if (status !== 'Todos') {
      result = result.filter(r => r.status === status);
    }
    if (text.trim()) {
      const q = text.toLowerCase();
      result = result.filter(r =>
        r.titulo.toLowerCase().includes(q) ||
        r.numero.toLowerCase().includes(q) ||
        (r.projeto_nome && r.projeto_nome.toLowerCase().includes(q))
      );
    }
    setFilteredRelatorios(result);
  }

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
    await loadRelatorios();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <Header 
        title="Relatórios Pendentes" 
        subtitle={`${filteredRelatorios.length} relatórios registrados`}
        rightAction={
          <TouchableOpacity 
            style={styles.addBtn}
            onPress={() => navigation.navigate('ReportFormScreen')}
          >
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />
      <OfflineBanner />

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por título, obra ou número..."
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
            <Text style={styles.emptySub}>Toque no botão + para iniciar uma nova vistoria técnica.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => {
              if (item.status === 'em_andamento') {
                navigation.navigate('ReportFormScreen', { reportId: item.id });
              } else {
                navigation.navigate('ReportDetailScreen', { reportId: item.id });
              }
            }}
          >
            <View style={styles.cardHeader}>
              <View style={styles.badgeRow}>
                {item.numero && item.numero.startsWith('REL-') ? (
                  <View style={styles.numBadge}>
                    <Text style={styles.numText}>{item.numero}</Text>
                  </View>
                ) : (
                  <View style={[styles.numBadge, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={[styles.numText, { color: '#B45309' }]}>
                      {item.uuid ? `PENDENTE • ${item.uuid.substring(0, 6)}` : 'OFFLINE'}
                    </Text>
                  </View>
                )}
                <SyncStatusBadge status={item.sync_status} />

              </View>
              <Text style={styles.dateText}>
                {item.data_relatorio ? new Date(item.data_relatorio).toLocaleDateString('pt-BR') : ''}
              </Text>
            </View>

            <Text style={styles.cardTitle}>{item.titulo}</Text>
            <Text style={styles.cardSub}>{item.projeto_nome || 'Obra não especificada'}</Text>

            <View style={styles.cardFooter}>
              <View style={[
                styles.statusTag, 
                item.status === 'Aprovado' ? styles.statusApproved : 
                item.status === 'Aguardando Aprovação' ? styles.statusWaiting : styles.statusProgress
              ]}>
                <Text style={styles.statusTagText}>
                  {item.status === 'em_andamento' ? '📝 Rascunho (Editar)' : item.status}
                </Text>
              </View>

              <View style={styles.photosIndicator}>
                <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
              </View>
            </View>
          </TouchableOpacity>
        )}
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
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  numBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  numText: { color: Colors.primary, fontWeight: 'bold', fontSize: 12 },
  dateText: { fontSize: 11, color: Colors.textMuted },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text, marginBottom: 4 },
  cardSub: { fontSize: 13, color: Colors.textSecondary, marginBottom: 10 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  statusTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusApproved: { backgroundColor: '#D1FAE5' },
  statusWaiting: { backgroundColor: '#FEF3C7' },
  statusProgress: { backgroundColor: '#EFF6FF' },
  statusTagText: { fontSize: 11, fontWeight: '600', color: '#1E293B' },
  photosIndicator: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  photosCount: { fontSize: 12, color: Colors.textSecondary },
  emptyContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text, marginTop: 12 },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
});
