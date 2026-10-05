import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { getLocalVisitas } from '../../database/db';
import { Visita } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

export const VisitsListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [filteredVisitas, setFilteredVisitas] = useState<Visita[]>([]);
  const [selectedFilter, setSelectedFilter] = useState('Todas');
  const [refreshing, setRefreshing] = useState(false);

  const loadVisitas = useCallback(async () => {
    try {
      const data = await getLocalVisitas();
      setVisitas(data);
      filterVisitas(data, selectedFilter);
    } catch (e) {
      console.warn('Erro ao carregar visitas:', e);
    }
  }, [selectedFilter]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadVisitas();
    });
    loadVisitas();
    return unsubscribe;
  }, [navigation, loadVisitas]);

  function filterVisitas(data: Visita[], filter: string) {
    if (filter === 'Todas') {
      setFilteredVisitas(data);
    } else {
      setFilteredVisitas(data.filter(v => v.status === filter));
    }
  }

  const handleFilter = (filter: string) => {
    setSelectedFilter(filter);
    filterVisitas(visitas, filter);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadVisitas();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <Header 
        title="Agenda de Visitas" 
        subtitle={`${filteredVisitas.length} visitas registradas`}
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
            <Text style={styles.emptyTitle}>Nenhuma visita agendada</Text>
            <Text style={styles.emptySub}>Toque no botão + para agendar uma visita técnica ou compromisso.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const dateObj = new Date(item.data_inicio);
          const dateStr = dateObj.toLocaleDateString('pt-BR');
          const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

          return (
            <TouchableOpacity 
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('VisitDetailScreen', { visitId: item.id })}
            >
              <View style={styles.cardHeader}>
                <View style={styles.badgeRow}>
                  <View style={styles.numBadge}>
                    <Text style={styles.numText}>{item.numero}</Text>
                  </View>
                  {item.is_pessoal && (
                    <View style={styles.pessoalBadge}>
                      <Text style={styles.pessoalText}>Pessoal</Text>
                    </View>
                  )}
                </View>
                <SyncStatusBadge status={item.sync_status} />
              </View>

              <Text style={styles.cardTitle}>{item.projeto_nome || item.projeto_outros || 'Visita Técnica'}</Text>

              <View style={styles.dateRow}>
                <Ionicons name="time-outline" size={15} color={Colors.primary} />
                <Text style={styles.dateText}>{dateStr} às {timeStr}</Text>
              </View>

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

                <View style={styles.authorRow}>
                  <Ionicons name="person-outline" size={13} color={Colors.textSecondary} />
                  <Text style={styles.authorText}>{item.responsavel_nome || 'Responsável'}</Text>
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
    ...Shadows.sm,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  pessoalBadge: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pessoalText: {
    color: '#7C3AED',
    fontWeight: '600',
    fontSize: 11,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 6,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  notesText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 10,
    lineHeight: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusAgendada: {
    backgroundColor: '#FEF3C7',
  },
  statusRealizada: {
    backgroundColor: '#D1FAE5',
  },
  statusCancelada: {
    backgroundColor: '#FEE2E2',
  },
  statusTagText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  authorText: {
    fontSize: 12,
    color: Colors.textSecondary,
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
