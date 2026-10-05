import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { getLocalProjetos } from '../../database/db';
import { Projeto } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

export const ProjectsListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [filteredProjetos, setFilteredProjetos] = useState<Projeto[]>([]);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('Todos');
  const [refreshing, setRefreshing] = useState(false);

  const loadProjetos = useCallback(async () => {
    try {
      const data = await getLocalProjetos();
      setProjetos(data);
      filterList(data, search, selectedStatus);
    } catch (e) {
      console.warn('Erro ao carregar projetos:', e);
    }
  }, [search, selectedStatus]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadProjetos();
    });
    loadProjetos();
    return unsubscribe;
  }, [navigation, loadProjetos]);

  function filterList(data: Projeto[], text: string, status: string) {
    let result = data;
    if (status !== 'Todos') {
      result = result.filter(p => p.status === status);
    }
    if (text.trim()) {
      const q = text.toLowerCase();
      result = result.filter(p => 
        p.nome.toLowerCase().includes(q) ||
        p.numero.toLowerCase().includes(q) ||
        p.construtora.toLowerCase().includes(q) ||
        (p.endereco && p.endereco.toLowerCase().includes(q))
      );
    }
    setFilteredProjetos(result);
  }

  const handleSearch = (text: string) => {
    setSearch(text);
    filterList(projetos, text, selectedStatus);
  };

  const handleStatusFilter = (status: string) => {
    setSelectedStatus(status);
    filterList(projetos, search, status);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProjetos();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <Header 
        title="Obras & Projetos" 
        subtitle={`${filteredProjetos.length} obras cadastradas`}
        rightAction={
          <TouchableOpacity 
            style={styles.addBtn}
            onPress={() => navigation.navigate('ProjectFormScreen')}
          >
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />
      <OfflineBanner />

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por obra, construtora, número..."
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

      {/* Status Filters */}
      <View style={styles.filterRow}>
        {['Todos', 'Ativo', 'Concluído', 'Cancelado'].map(st => (
          <TouchableOpacity
            key={st}
            style={[styles.filterChip, selectedStatus === st && styles.filterChipActive]}
            onPress={() => handleStatusFilter(st)}
          >
            <Text style={[styles.filterText, selectedStatus === st && styles.filterTextActive]}>
              {st}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Projects List */}
      <FlatList
        data={filteredProjetos}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="business-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Nenhuma obra encontrada</Text>
            <Text style={styles.emptySub}>Toque no botão + acima para cadastrar uma nova obra no aplicativo.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('ProjectDetailScreen', { projectId: item.id })}
          >
            <View style={styles.cardHeader}>
              <View style={styles.numBadge}>
                <Text style={styles.numText}>{item.numero}</Text>
              </View>
              <View style={styles.headerRight}>
                <SyncStatusBadge status={item.sync_status} />
                <View style={[
                  styles.statusTag, 
                  item.status === 'Ativo' ? styles.statusActive : styles.statusDone
                ]}>
                  <Text style={styles.statusTagText}>{item.status}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.cardTitle}>{item.nome}</Text>
            <Text style={styles.cardConstrutora}>
              <Ionicons name="briefcase-outline" size={13} color={Colors.textSecondary} /> {item.construtora}
            </Text>

            {item.endereco ? (
              <Text style={styles.cardAddress} numberOfLines={1}>
                <Ionicons name="location-outline" size={13} color={Colors.textSecondary} /> {item.endereco}
              </Text>
            ) : null}

            <View style={styles.cardFooter}>
              <Text style={styles.footerText}>
                Responsável: <Text style={styles.bold}>{item.nome_funcionario}</Text>
              </Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  addBtn: {
    backgroundColor: Colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
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
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    paddingTop: 4,
  },
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
  numBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  numText: {
    color: Colors.primary,
    fontWeight: 'bold',
    fontSize: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusActive: {
    backgroundColor: '#D1FAE5',
  },
  statusDone: {
    backgroundColor: '#F1F5F9',
  },
  statusTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E293B',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  cardConstrutora: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  cardAddress: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  footerText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  bold: {
    fontWeight: 'bold',
    color: Colors.text,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
});
