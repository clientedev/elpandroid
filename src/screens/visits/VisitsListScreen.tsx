import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { getLocalVisitas, getLocalRelatorios, saveLocalVisita, addToSyncQueue } from '../../database/db';
import { Visita, Relatorio } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

// Team fixed colors per specification (Item 8.1):
// Leopoldo: Azul (#1E88E5), Mateus: Verde (#43A047), Isadora: Amarelo (#FDD835), Luciana: Laranja (#FB8C00)
const TEAM_COLORS: { [key: string]: { bg: string; text: string } } = {
  'leopoldo': { bg: '#1E88E5', text: '#FFFFFF' },
  'mateus': { bg: '#43A047', text: '#FFFFFF' },
  'isadora': { bg: '#FDD835', text: '#713F12' },
  'luciana': { bg: '#FB8C00', text: '#FFFFFF' },
};

function getTeamTheme(name?: string) {
  if (!name) return { bg: '#2563EB', text: '#FFFFFF' };
  const clean = name.trim().toLowerCase();
  for (const [key, theme] of Object.entries(TEAM_COLORS)) {
    if (clean.includes(key)) return theme;
  }
  return { bg: '#2563EB', text: '#FFFFFF' };
}

export const VisitsListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [filteredVisitas, setFilteredVisitas] = useState<Visita[]>([]);
  const [selectedFilter, setSelectedFilter] = useState('Todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const applyFilters = useCallback((data: Visita[], filter: string, search: string) => {
    let list = data;
    if (filter !== 'Todas') {
      list = list.filter(v => v.status === filter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(v => 
        (v.projeto_nome && v.projeto_nome.toLowerCase().includes(q)) ||
        (v.projeto_outros && v.projeto_outros.toLowerCase().includes(q)) ||
        (v.observacoes && v.observacoes.toLowerCase().includes(q)) ||
        (v.endereco_gps && v.endereco_gps.toLowerCase().includes(q)) ||
        (v.responsavel_nome && v.responsavel_nome.toLowerCase().includes(q))
      );
    }
    setFilteredVisitas(list);
  }, []);

  const loadVisitasAndAutoCheck = useCallback(async () => {
    try {
      const data = await getLocalVisitas();
      const rels = await getLocalRelatorios();

      // Auto-baixa da visita para 'Realizada' se houver relatório concluído no mesmo dia (Item 8.2)
      for (const v of data) {
        if (v.status === 'Agendada' && v.projeto_id) {
          const vDateStr = v.data_inicio.split('T')[0];
          const hasMatchingReport = rels.some(r => 
            r.projeto_id === v.projeto_id && 
            r.data_relatorio && 
            r.data_relatorio.startsWith(vDateStr) &&
            r.status !== 'Rejeitado'
          );
          if (hasMatchingReport) {
            v.status = 'Realizada';
            v.data_realizada = new Date().toISOString();
            await saveLocalVisita(v, 'pending');
            await addToSyncQueue('visita', v.id, 'update', `/api/visits/${v.id}`, 'PUT', v);
          }
        }
      }

      setVisitas(data);
      applyFilters(data, selectedFilter, searchQuery);
    } catch (e) {
      console.warn('Erro ao carregar visitas:', e);
    }
  }, [selectedFilter, searchQuery, applyFilters]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadVisitasAndAutoCheck();
    });
    loadVisitasAndAutoCheck();
    return unsubscribe;
  }, [navigation, loadVisitasAndAutoCheck]);

  const handleFilter = (filter: string) => {
    setSelectedFilter(filter);
    applyFilters(visitas, filter, searchQuery);
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    applyFilters(visitas, selectedFilter, text);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadVisitasAndAutoCheck();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <Header 
        title="Agenda de Visitas" 
        subtitle={`${filteredVisitas.length} visitas na equipe`}
        rightAction={
          <TouchableOpacity 
            style={styles.addBtn}
            onPress={() => navigation.navigate('VisitFormScreen')}
          >
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />
      <OfflineBanner />

      {/* Substring Search Bar (Item 8.2) */}
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por obra, endereço, responsável..."
          value={searchQuery}
          onChangeText={handleSearch}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {['Todas', 'Agendada', 'Realizada', 'Cancelada'].map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, selectedFilter === f && styles.filterChipActive]}
            onPress={() => handleFilter(f)}
          >
            <Text style={[styles.filterText, selectedFilter === f && styles.filterTextActive]}>
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredVisitas}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Nenhuma visita encontrada</Text>
            <Text style={styles.emptySub}>
              {searchQuery ? 'Nenhum resultado para a busca.' : 'Toque no botão + para agendar uma visita técnica.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const dateObj = new Date(item.data_inicio);
          const dateStr = dateObj.toLocaleDateString('pt-BR');
          const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          const teamTheme = getTeamTheme(item.responsavel_nome);

          return (
            <TouchableOpacity 
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('VisitDetailScreen', { visitId: item.id })}
            >
              {/* Member Color Stripe (Item 8.1) */}
              <View style={[styles.colorStripe, { backgroundColor: teamTheme.bg }]} />

              <View style={{ flex: 1, padding: 14 }}>
                <View style={styles.cardHeader}>
                  <View style={styles.badgeRow}>
                    <View style={styles.numBadge}>
                      <Text style={styles.numText}>{item.numero}</Text>
                    </View>
                    
                    {/* Team Member Badge */}
                    <View style={[styles.memberBadge, { backgroundColor: teamTheme.bg }]}>
                      <Text style={[styles.memberBadgeText, { color: teamTheme.text }]}>
                        {item.responsavel_nome || 'Equipe'}
                      </Text>
                    </View>

                    {item.is_pessoal ? (
                      <View style={styles.pessoalBadge}>
                        <Text style={styles.pessoalText}>Pessoal</Text>
                      </View>
                    ) : null}
                  </View>
                  <SyncStatusBadge status={item.sync_status} />
                </View>

                <Text style={styles.cardTitle}>
                  {item.projeto_nome || item.projeto_outros || 'Visita Técnica'}
                </Text>

                <View style={styles.dateRow}>
                  <Ionicons name="time-outline" size={15} color={Colors.primary} />
                  <Text style={styles.dateText}>{dateStr} às {timeStr}</Text>
                </View>

                {item.endereco_gps ? (
                  <View style={styles.addressRow}>
                    <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
                    <Text style={styles.addressText} numberOfLines={1}>{item.endereco_gps}</Text>
                  </View>
                ) : null}

                {item.observacoes ? (
                  <Text style={styles.notesText} numberOfLines={2}>
                    {item.observacoes}
                  </Text>
                ) : null}

                <View style={styles.cardFooter}>
                  <View style={[
                    styles.statusTag, 
                    item.status === 'Realizada' ? styles.statusRealizada : 
                    item.status === 'Agendada' ? styles.statusAgendada : styles.statusCancelada
                  ]}>
                    <Text style={styles.statusTagText}>{item.status}</Text>
                  </View>

                  {/* Realizar Visita Action Button (Item 8.2) */}
                  {item.projeto_id ? (
                    <TouchableOpacity 
                      style={styles.realizarVisitaBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        navigation.navigate('ProjectDetailScreen', { projectId: item.projeto_id });
                      }}
                    >
                      <Ionicons name="enter-outline" size={14} color={Colors.primary} />
                      <Text style={styles.realizarVisitaText}>Realizar Visita</Text>
                    </TouchableOpacity>
                  ) : null}
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
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
    ...Shadows.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
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
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  colorStripe: {
    width: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  numBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  numText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
  },
  memberBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  memberBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  pessoalBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pessoalText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#6D28D9',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  dateText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  addressText: {
    fontSize: 11,
    color: Colors.textSecondary,
    flex: 1,
  },
  notesText: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 8,
    lineHeight: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusAgendada: { backgroundColor: '#E0F2FE' },
  statusRealizada: { backgroundColor: '#DCFCE7' },
  statusCancelada: { backgroundColor: '#FEE2E2' },
  statusTagText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: Colors.text,
  },
  realizarVisitaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  realizarVisitaText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
});
