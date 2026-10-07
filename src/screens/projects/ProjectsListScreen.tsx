import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { getLocalProjetos, getLocalRelatorios } from '../../database/db';
import { Projeto, Relatorio } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

// Reference coordinate for SP / default position if user location unavailable
const DEFAULT_USER_LAT = -23.5505;
const DEFAULT_USER_LON = -46.6333;

function calculateHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export const ProjectsListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [filteredProjetos, setFilteredProjetos] = useState<Projeto[]>([]);
  const [relatoriosCounts, setRelatoriosCounts] = useState<{ [projId: number]: number }>({});
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'Ativo' | 'Não Iniciado' | 'Pausado' | 'Concluído' | 'Todos'>('Ativo');
  const [refreshing, setRefreshing] = useState(false);

  const loadProjetos = useCallback(async () => {
    try {
      const data = await getLocalProjetos();
      const allRels = await getLocalRelatorios();
      
      const counts: { [projId: number]: number } = {};
      for (const r of allRels) {
        counts[r.projeto_id] = (counts[r.projeto_id] || 0) + 1;
      }
      setRelatoriosCounts(counts);

      // Sort by GPS distance (closest first)
      const sortedByGps = [...data].sort((a, b) => {
        const distA = a.latitude && a.longitude ? calculateHaversine(DEFAULT_USER_LAT, DEFAULT_USER_LON, a.latitude, a.longitude) : 9999;
        const distB = b.latitude && b.longitude ? calculateHaversine(DEFAULT_USER_LAT, DEFAULT_USER_LON, b.latitude, b.longitude) : 9999;
        return distA - distB;
      });

      setProjetos(sortedByGps);
      filterList(sortedByGps, search, selectedStatus);
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
      result = result.filter(p => {
        if (status === 'Ativo') return p.status === 'Ativo' || !p.status;
        if (status === 'Não Iniciado') return p.status === 'Não Iniciado';
        if (status === 'Pausado') return p.status === 'Pausado';
        if (status === 'Concluído') return p.status === 'Concluído';
        return true;
      });
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

  const handleStatusFilter = (status: 'Ativo' | 'Não Iniciado' | 'Pausado' | 'Concluído' | 'Todos') => {
    setSelectedStatus(status);
    filterList(projetos, search, status);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProjetos();
    setRefreshing(false);
  };

  const getDynamicTitle = () => {
    if (selectedStatus === 'Ativo') return 'Obras Ativas';
    if (selectedStatus === 'Não Iniciado') return 'Obras Não Iniciadas';
    if (selectedStatus === 'Pausado') return 'Obras Pausadas';
    if (selectedStatus === 'Concluído') return 'Obras Concluídas';
    return 'Todas as Obras';
  };

  return (
    <View style={styles.container}>
      {/* Cabeçalho dinâmico com ícone de prédio (Seção 15.4) */}
      <Header 
        title={getDynamicTitle()} 
        subtitle={`${filteredProjetos.length} obras nesta categoria`}
        rightAction={
          <TouchableOpacity 
            style={styles.addBtn}
            onPress={() => navigation.navigate('ProjectFormScreen')}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />
      <OfflineBanner />

      {/* 4 Botões Estilizados em Grade 2x2 por Status (Seção 15.4 do Manual) */}
      <View style={styles.gridTabsContainer}>
        <View style={styles.gridTabsRow}>
          {/* 1. Ativas (Verde) */}
          <TouchableOpacity
            style={[
              styles.gridTabBtn,
              styles.gridTabAtivas,
              selectedStatus === 'Ativo' && styles.gridTabAtivasActive
            ]}
            onPress={() => handleStatusFilter('Ativo')}
            activeOpacity={0.7}
          >
            <Ionicons 
              name="checkmark-circle" 
              size={18} 
              color={selectedStatus === 'Ativo' ? '#FFFFFF' : '#059669'} 
            />
            <Text style={[
              styles.gridTabText,
              selectedStatus === 'Ativo' ? styles.gridTabTextActive : { color: '#059669' }
            ]}>
              Ativas
            </Text>
          </TouchableOpacity>

          {/* 2. Não Iniciadas (Cinza Escuro) */}
          <TouchableOpacity
            style={[
              styles.gridTabBtn,
              styles.gridTabNaoIniciadas,
              selectedStatus === 'Não Iniciado' && styles.gridTabNaoIniciadasActive
            ]}
            onPress={() => handleStatusFilter('Não Iniciado')}
            activeOpacity={0.7}
          >
            <Ionicons 
              name="time" 
              size={18} 
              color={selectedStatus === 'Não Iniciado' ? '#FFFFFF' : '#475569'} 
            />
            <Text style={[
              styles.gridTabText,
              selectedStatus === 'Não Iniciado' ? styles.gridTabTextActive : { color: '#475569' }
            ]}>
              Não iniciadas
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.gridTabsRow}>
          {/* 3. Pausadas (Amarelo Alaranjado) */}
          <TouchableOpacity
            style={[
              styles.gridTabBtn,
              styles.gridTabPausadas,
              selectedStatus === 'Pausado' && styles.gridTabPausadasActive
            ]}
            onPress={() => handleStatusFilter('Pausado')}
            activeOpacity={0.7}
          >
            <Ionicons 
              name="pause-circle" 
              size={18} 
              color={selectedStatus === 'Pausado' ? '#FFFFFF' : '#D97706'} 
            />
            <Text style={[
              styles.gridTabText,
              selectedStatus === 'Pausado' ? styles.gridTabTextActive : { color: '#D97706' }
            ]}>
              Pausadas
            </Text>
          </TouchableOpacity>

          {/* 4. Concluídas (Azul Profundo) */}
          <TouchableOpacity
            style={[
              styles.gridTabBtn,
              styles.gridTabConcluidas,
              selectedStatus === 'Concluído' && styles.gridTabConcluidasActive
            ]}
            onPress={() => handleStatusFilter('Concluído')}
            activeOpacity={0.7}
          >
            <Ionicons 
              name="flag" 
              size={18} 
              color={selectedStatus === 'Concluído' ? '#FFFFFF' : '#1E3A8A'} 
            />
            <Text style={[
              styles.gridTabText,
              selectedStatus === 'Concluído' ? styles.gridTabTextActive : { color: '#1E3A8A' }
            ]}>
              Concluídas
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Barra de Busca Rápida (Seção 15.4) */}
      <View style={styles.searchContainer}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="🔍 Digite o nome, número ou construtora da obra..."
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

      {/* Grid de Cards de Obras (Design Clicável - Seção 15.4) */}
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
        renderItem={({ item }) => {
          const distanceKm = item.latitude && item.longitude 
            ? calculateHaversine(DEFAULT_USER_LAT, DEFAULT_USER_LON, item.latitude, item.longitude) 
            : 1.2;
          const totalRels = relatoriosCounts[item.id] || 0;

          return (
            <TouchableOpacity 
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('ProjectDetailScreen', { projectId: item.id })}
            >
              {/* Topo do Card: Nome em negrito, código único e construtora */}
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.nome}</Text>
                  <Text style={styles.cardConstrutora}>
                    <Ionicons name="business" size={13} color="#64748B" /> {item.construtora}
                  </Text>
                </View>

                <View style={styles.headerRight}>
                  <View style={styles.numBadge}>
                    <Text style={styles.numText}>{item.numero}</Text>
                  </View>
                  <SyncStatusBadge status={item.sync_status} />
                </View>
              </View>

              {/* Tag de Proximidade GPS (Seção 15.4) */}
              <View style={styles.gpsBadgeRow}>
                <View style={styles.gpsDistanceBadge}>
                  <Text style={styles.gpsDistanceText}>
                    📍 A {distanceKm} km de você
                  </Text>
                </View>

                <View style={[
                  styles.statusTag, 
                  item.status === 'Ativo' ? styles.statusActive : 
                  item.status === 'Pausado' ? styles.statusPausado :
                  item.status === 'Não Iniciado' ? styles.statusNaoIniciado : styles.statusDone
                ]}>
                  <Text style={styles.statusTagText}>{item.status || 'Ativo'}</Text>
                </View>
              </View>

              {/* Corpo do Card: Responsável, e-mail e contador de relatórios */}
              <View style={styles.cardBody}>
                <View style={styles.cardInfoRow}>
                  <Ionicons name="person-outline" size={14} color="#64748B" />
                  <Text style={styles.cardInfoText}>
                    Responsável: <Text style={styles.boldText}>{item.nome_funcionario}</Text>
                  </Text>
                </View>

                <View style={styles.cardInfoRow}>
                  <Ionicons name="mail-outline" size={14} color="#64748B" />
                  <Text style={styles.cardInfoText} numberOfLines={1}>
                    {item.email_principal}
                  </Text>
                </View>
              </View>

              {/* Rodapé do Card com contador de relatórios emitidos */}
              <View style={styles.cardFooter}>
                <View style={styles.relatoriosCountBox}>
                  <Ionicons name="document-text-outline" size={14} color={Colors.primary} />
                  <Text style={styles.relatoriosCountText}>
                    {totalRels} {totalRels === 1 ? 'relatório emitido' : 'relatórios emitidos'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
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
  gridTabsContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  gridTabsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  gridTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    gap: 6,
  },
  gridTabAtivas: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  gridTabAtivasActive: {
    backgroundColor: '#059669',
    ...Shadows.md,
  },
  gridTabNaoIniciadas: {
    borderColor: '#475569',
    backgroundColor: '#F8FAFC',
  },
  gridTabNaoIniciadasActive: {
    backgroundColor: '#475569',
    ...Shadows.md,
  },
  gridTabPausadas: {
    borderColor: '#D97706',
    backgroundColor: '#FFFBEB',
  },
  gridTabPausadasActive: {
    backgroundColor: '#D97706',
    ...Shadows.md,
  },
  gridTabConcluidas: {
    borderColor: '#1E3A8A',
    backgroundColor: '#EFF6FF',
  },
  gridTabConcluidasActive: {
    backgroundColor: '#1E3A8A',
    ...Shadows.md,
  },
  gridTabText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  gridTabTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
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
    alignItems: 'flex-start',
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
  gpsBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 6,
  },
  gpsDistanceBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  gpsDistanceText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
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
    backgroundColor: '#E0E7FF',
  },
  statusPausado: {
    backgroundColor: '#FEF3C7',
  },
  statusNaoIniciado: {
    backgroundColor: '#F1F5F9',
  },
  statusTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E293B',
  },
  cardBody: {
    gap: 4,
    marginVertical: 6,
  },
  cardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardInfoText: {
    fontSize: 12,
    color: '#64748B',
  },
  boldText: {
    fontWeight: 'bold',
    color: '#1E293B',
  },
  relatoriosCountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  relatoriosCountText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
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
