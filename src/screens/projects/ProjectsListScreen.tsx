import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl, ScrollView, Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { getLocalProjetos, getLocalRelatorios, getLocalUsers } from '../../database/db';
import { Projeto, Relatorio, User } from '../../types';
import { Colors, Shadows } from '../../theme/colors';
import { useNetwork } from '../../contexts/NetworkContext';
import { syncService } from '../../services/syncService';

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
  const { isOnline } = useNetwork();
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [filteredProjetos, setFilteredProjetos] = useState<Projeto[]>([]);
  const [relatoriosCounts, setRelatoriosCounts] = useState<{ [projId: number]: number }>({});
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'Ativo' | 'Não Iniciado' | 'Pausado' | 'Concluído' | 'Todos'>('Ativo');
  const [refreshing, setRefreshing] = useState(false);

  // Estados de Localização Real GPS & Ordenação por Proximidade
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'loading' | 'available' | 'denied' | 'disabled'>('loading');
  const [sortByProximity, setSortByProximity] = useState(false);

  // Estados de Busca Avançada (Status, Tipo de Obra, Construtora, Funcionário, Responsável)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filterTipo, setFilterTipo] = useState('');
  const [filterConstrutora, setFilterConstrutora] = useState('');
  const [filterFuncionario, setFilterFuncionario] = useState('');
  const [filterResponsavel, setFilterResponsavel] = useState('');

  const refreshUserLocation = useCallback(async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationStatus('denied');
        setUserCoords(null);
        return null;
      }
      const hasServices = await Location.hasServicesEnabledAsync();
      if (!hasServices) {
        setLocationStatus('disabled');
        setUserCoords(null);
        return null;
      }
      // Timeout seguro de 3.5s para nunca travar a renderização do app
      const locPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500));
      const loc = await Promise.race([locPromise, timeoutPromise]);
      if (!loc || !loc.coords) {
        setLocationStatus('available');
        return null;
      }
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setUserCoords(coords);
      setLocationStatus('available');
      return coords;
    } catch (err) {
      console.warn('Erro ao obter localização do usuário:', err);
      setLocationStatus('disabled');
      setUserCoords(null);
      return null;
    }
  }, []);

  const filterList = useCallback((
    data: Projeto[],
    text: string,
    statusTab: string,
    fTipo: string,
    fConstrutora: string,
    fFuncionario: string,
    fResponsavel: string,
    uList: User[],
    currentProximitySort = sortByProximity,
    currentCoords = userCoords
  ) => {
    let result = [...data];

    // Filtro por Status
    if (statusTab !== 'Todos') {
      result = result.filter(p => {
        if (statusTab === 'Ativo') return p.status === 'Ativo' || !p.status;
        if (statusTab === 'Não Iniciado') return p.status === 'Não Iniciado';
        if (statusTab === 'Pausado') return p.status === 'Pausado';
        if (statusTab === 'Concluído') return p.status === 'Concluído';
        return true;
      });
    }

    // Busca Avançada: Tipo de Obra
    if (fTipo) {
      result = result.filter(p => (p.tipo_obra || '').trim().toLowerCase() === fTipo.trim().toLowerCase());
    }

    // Busca Avançada: Construtora
    if (fConstrutora) {
      result = result.filter(p => (p.construtora || '').trim().toLowerCase() === fConstrutora.trim().toLowerCase());
    }

    // Busca Avançada: Funcionário
    if (fFuncionario) {
      result = result.filter(p => (p.nome_funcionario || '').trim().toLowerCase() === fFuncionario.trim().toLowerCase());
    }

    // Busca Avançada: Responsável
    if (fResponsavel) {
      result = result.filter(p => {
        const respUser = uList.find(u => u.id === p.responsavel_id);
        const respNome = respUser ? (respUser.nome_completo || respUser.username) : p.nome_funcionario;
        return (respNome || '').trim().toLowerCase() === fResponsavel.trim().toLowerCase();
      });
    }

    // Busca Rápida por Texto
    if (text.trim()) {
      const q = text.toLowerCase();
      result = result.filter(p => 
        p.nome.toLowerCase().includes(q) ||
        p.numero.toLowerCase().includes(q) ||
        p.construtora.toLowerCase().includes(q) ||
        (p.endereco && p.endereco.toLowerCase().includes(q))
      );
    }

    // Ordenação por Proximidade GPS (Menor para maior distância)
    if (currentProximitySort && currentCoords) {
      result.sort((a, b) => {
        const hasA = typeof a.latitude === 'number' && typeof a.longitude === 'number' && !isNaN(a.latitude) && !isNaN(a.longitude);
        const hasB = typeof b.latitude === 'number' && typeof b.longitude === 'number' && !isNaN(b.latitude) && !isNaN(b.longitude);
        if (!hasA && !hasB) return 0;
        if (!hasA) return 1;
        if (!hasB) return -1;
        const distA = calculateHaversine(currentCoords.latitude, currentCoords.longitude, a.latitude!, a.longitude!);
        const distB = calculateHaversine(currentCoords.latitude, currentCoords.longitude, b.latitude!, b.longitude!);
        return distA - distB;
      });
    }

    setFilteredProjetos(result);
  }, [sortByProximity, userCoords]);

  const loadProjetos = useCallback(async () => {
    try {
      // 1. CARREGAMENTO INSTANTÂNEO DOS DADOS LOCAIS DO SQLITE
      const data = await getLocalProjetos();
      const allRels = await getLocalRelatorios();
      const localUsers = await getLocalUsers().catch(() => []);
      setUsers(localUsers);
      
      const counts: { [projId: number]: number } = {};
      for (const r of allRels) {
        counts[r.projeto_id] = (counts[r.projeto_id] || 0) + 1;
      }
      setRelatoriosCounts(counts);
      setProjetos(data);
      filterList(data, search, selectedStatus, filterTipo, filterConstrutora, filterFuncionario, filterResponsavel, localUsers, sortByProximity, userCoords);

      // 2. OBTENÇÃO DA LOCALIZAÇÃO REAL EM SEGUNDO PLANO
      refreshUserLocation().then(coords => {
        if (coords) {
          filterList(data, search, selectedStatus, filterTipo, filterConstrutora, filterFuncionario, filterResponsavel, localUsers, sortByProximity, coords);
        }
      }).catch(() => null);

      // 3. SINCRONIZAÇÃO EM BACKGROUND COM O SERVIDOR RAILWAY SE ESTIVER ONLINE
      if (isOnline) {
        syncService.syncAll().then(async () => {
          const freshData = await getLocalProjetos();
          const freshRels = await getLocalRelatorios();
          const freshUsers = await getLocalUsers().catch(() => []);
          setUsers(freshUsers);
          const freshCounts: { [projId: number]: number } = {};
          for (const r of freshRels) {
            freshCounts[r.projeto_id] = (freshCounts[r.projeto_id] || 0) + 1;
          }
          setRelatoriosCounts(freshCounts);
          setProjetos(freshData);
          filterList(freshData, search, selectedStatus, filterTipo, filterConstrutora, filterFuncionario, filterResponsavel, freshUsers, sortByProximity, userCoords);
        }).catch(() => null);
      }
    } catch (e) {
      console.warn('Erro ao carregar projetos:', e);
    }
  }, [search, selectedStatus, filterTipo, filterConstrutora, filterFuncionario, filterResponsavel, filterList, refreshUserLocation, sortByProximity, userCoords, isOnline]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadProjetos();
    });
    loadProjetos();
    return unsubscribe;
  }, [navigation, loadProjetos]);

  const handleSearch = (text: string) => {
    setSearch(text);
    filterList(projetos, text, selectedStatus, filterTipo, filterConstrutora, filterFuncionario, filterResponsavel, users);
  };

  const handleStatusFilter = (status: 'Ativo' | 'Não Iniciado' | 'Pausado' | 'Concluído' | 'Todos') => {
    setSelectedStatus(status);
    filterList(projetos, search, status, filterTipo, filterConstrutora, filterFuncionario, filterResponsavel, users);
  };

  const handleClearAdvancedFilters = () => {
    setFilterTipo('');
    setFilterConstrutora('');
    setFilterFuncionario('');
    setFilterResponsavel('');
    filterList(projetos, search, selectedStatus, '', '', '', '', users);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (isOnline) {
      await syncService.syncAll().catch(() => null);
    }
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

  // Listas distintas para os filtros avançados
  const tiposUnicos = Array.from(new Set(projetos.map(p => p.tipo_obra).filter(Boolean))).sort();
  const construtorasUnicas = Array.from(new Set(projetos.map(p => p.construtora).filter(Boolean))).sort();
  const funcionariosUnicos = Array.from(new Set(projetos.map(p => p.nome_funcionario).filter(Boolean))).sort();
  const responsaveisUnicos = Array.from(new Set(projetos.map(p => {
    const u = users.find(usr => usr.id === p.responsavel_id);
    return u ? (u.nome_completo || u.username) : p.nome_funcionario;
  }).filter(Boolean))).sort();

  const activeFiltersCount = (filterTipo ? 1 : 0) + 
                             (filterConstrutora ? 1 : 0) + 
                             (filterFuncionario ? 1 : 0) + 
                             (filterResponsavel ? 1 : 0);

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

      {/* Barra de Busca Rápida e Botão Busca Avançada */}
      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <View style={styles.searchWrapper}>
            <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="🔍 Nome, número ou construtora..."
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

          <TouchableOpacity 
            style={[styles.advancedSearchBtn, (showAdvanced || activeFiltersCount > 0) && styles.advancedSearchBtnActive]}
            onPress={() => setShowAdvanced(!showAdvanced)}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={showAdvanced ? "chevron-up" : "filter"} 
              size={15} 
              color={showAdvanced || activeFiltersCount > 0 ? "#FFFFFF" : "#2563EB"} 
            />
            <Text style={[styles.advancedSearchBtnText, (showAdvanced || activeFiltersCount > 0) && styles.advancedSearchBtnTextActive]}>
              Busca Avançada
            </Text>
            {activeFiltersCount > 0 && (
              <View style={styles.activeFilterBadge}>
                <Text style={styles.activeFilterBadgeText}>{activeFiltersCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Barra de Ordenação por Proximidade GPS Real */}
        <View style={styles.sortToolbarRow}>
          <TouchableOpacity 
            style={[styles.proximityBtn, sortByProximity && styles.proximityBtnActive]}
            onPress={async () => {
              const nextSort = !sortByProximity;
              if (nextSort && !userCoords) {
                const coords = await refreshUserLocation();
                if (!coords) {
                  Alert.alert(
                    'Localização Necessária',
                    'Para ordenar pela distância real, autorize a permissão de localização do aparelho e ative o GPS.'
                  );
                }
              }
              setSortByProximity(nextSort);
              filterList(projetos, search, selectedStatus, filterTipo, filterConstrutora, filterFuncionario, filterResponsavel, users, nextSort, userCoords);
            }}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={sortByProximity ? "navigate" : "navigate-outline"} 
              size={14} 
              color={sortByProximity ? "#FFFFFF" : "#0284C7"} 
            />
            <Text style={[styles.proximityBtnText, sortByProximity && styles.proximityBtnTextActive]}>
              {sortByProximity ? 'Mais Próximas de Mim' : 'Ordenar por Proximidade (GPS)'}
            </Text>
          </TouchableOpacity>

          {userCoords && (
            <View style={styles.gpsActiveIndicator}>
              <View style={styles.gpsPulseDot} />
              <Text style={styles.gpsActiveText}>GPS Ativo</Text>
            </View>
          )}
        </View>

        {/* Painel Colapsável de Filtros Avançados */}
        {showAdvanced && (
          <View style={styles.advancedFilterPanel}>
            <View style={styles.advHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="options-outline" size={16} color="#2563EB" />
                <Text style={styles.advPanelTitle}>Filtros Avançados da Obra</Text>
              </View>
              {activeFiltersCount > 0 && (
                <TouchableOpacity onPress={handleClearAdvancedFilters} style={styles.clearFiltersBtn}>
                  <Ionicons name="trash-outline" size={13} color="#DC2626" />
                  <Text style={styles.clearFiltersBtnText}>Limpar Filtros</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 1. Filtro por Status */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionLabel}>Status da Obra:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
                {(['Todos', 'Ativo', 'Não Iniciado', 'Pausado', 'Concluído'] as const).map(st => (
                  <TouchableOpacity
                    key={st}
                    style={[styles.chipBtn, selectedStatus === st && styles.chipBtnActive]}
                    onPress={() => handleStatusFilter(st)}
                  >
                    <Text style={[styles.chipText, selectedStatus === st && styles.chipTextActive]}>{st}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* 2. Filtro por Tipo de Obra */}
            {tiposUnicos.length > 0 && (
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionLabel}>Tipo de Obra:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
                  <TouchableOpacity
                    style={[styles.chipBtn, !filterTipo && styles.chipBtnActive]}
                    onPress={() => {
                      setFilterTipo('');
                      filterList(projetos, search, selectedStatus, '', filterConstrutora, filterFuncionario, filterResponsavel, users);
                    }}
                  >
                    <Text style={[styles.chipText, !filterTipo && styles.chipTextActive]}>Todos os Tipos</Text>
                  </TouchableOpacity>
                  {tiposUnicos.map(tp => (
                    <TouchableOpacity
                      key={tp}
                      style={[styles.chipBtn, filterTipo === tp && styles.chipBtnActive]}
                      onPress={() => {
                        const newVal = filterTipo === tp ? '' : tp;
                        setFilterTipo(newVal);
                        filterList(projetos, search, selectedStatus, newVal, filterConstrutora, filterFuncionario, filterResponsavel, users);
                      }}
                    >
                      <Text style={[styles.chipText, filterTipo === tp && styles.chipTextActive]}>{tp}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* 3. Filtro por Construtora */}
            {construtorasUnicas.length > 0 && (
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionLabel}>Construtora:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
                  <TouchableOpacity
                    style={[styles.chipBtn, !filterConstrutora && styles.chipBtnActive]}
                    onPress={() => {
                      setFilterConstrutora('');
                      filterList(projetos, search, selectedStatus, filterTipo, '', filterFuncionario, filterResponsavel, users);
                    }}
                  >
                    <Text style={[styles.chipText, !filterConstrutora && styles.chipTextActive]}>Todas Construtoras</Text>
                  </TouchableOpacity>
                  {construtorasUnicas.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.chipBtn, filterConstrutora === c && styles.chipBtnActive]}
                      onPress={() => {
                        const newVal = filterConstrutora === c ? '' : c;
                        setFilterConstrutora(newVal);
                        filterList(projetos, search, selectedStatus, filterTipo, newVal, filterFuncionario, filterResponsavel, users);
                      }}
                    >
                      <Text style={[styles.chipText, filterConstrutora === c && styles.chipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* 4. Filtro por Funcionário */}
            {funcionariosUnicos.length > 0 && (
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionLabel}>Funcionário:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
                  <TouchableOpacity
                    style={[styles.chipBtn, !filterFuncionario && styles.chipBtnActive]}
                    onPress={() => {
                      setFilterFuncionario('');
                      filterList(projetos, search, selectedStatus, filterTipo, filterConstrutora, '', filterResponsavel, users);
                    }}
                  >
                    <Text style={[styles.chipText, !filterFuncionario && styles.chipTextActive]}>Todos Funcionários</Text>
                  </TouchableOpacity>
                  {funcionariosUnicos.map(func => (
                    <TouchableOpacity
                      key={func}
                      style={[styles.chipBtn, filterFuncionario === func && styles.chipBtnActive]}
                      onPress={() => {
                        const newVal = filterFuncionario === func ? '' : func;
                        setFilterFuncionario(newVal);
                        filterList(projetos, search, selectedStatus, filterTipo, filterConstrutora, newVal, filterResponsavel, users);
                      }}
                    >
                      <Text style={[styles.chipText, filterFuncionario === func && styles.chipTextActive]}>{func}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* 5. Filtro por Responsável */}
            {responsaveisUnicos.length > 0 && (
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionLabel}>Responsável Técnico:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
                  <TouchableOpacity
                    style={[styles.chipBtn, !filterResponsavel && styles.chipBtnActive]}
                    onPress={() => {
                      setFilterResponsavel('');
                      filterList(projetos, search, selectedStatus, filterTipo, filterConstrutora, filterFuncionario, '', users);
                    }}
                  >
                    <Text style={[styles.chipText, !filterResponsavel && styles.chipTextActive]}>Todos Responsáveis</Text>
                  </TouchableOpacity>
                  {responsaveisUnicos.map(resp => (
                    <TouchableOpacity
                      key={resp}
                      style={[styles.chipBtn, filterResponsavel === resp && styles.chipBtnActive]}
                      onPress={() => {
                        const newVal = filterResponsavel === resp ? '' : resp;
                        setFilterResponsavel(newVal);
                        filterList(projetos, search, selectedStatus, filterTipo, filterConstrutora, filterFuncionario, newVal, users);
                      }}
                    >
                      <Text style={[styles.chipText, filterResponsavel === resp && styles.chipTextActive]}>{resp}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Contador de Obras Encontradas */}
            <View style={styles.advFooterRow}>
              <Text style={styles.advCountText}>
                {filteredProjetos.length} obra(s) encontrada(s) com os filtros atuais
              </Text>
            </View>
          </View>
        )}
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
          const hasValidCoords = typeof item.latitude === 'number' && typeof item.longitude === 'number' && !isNaN(item.latitude) && !isNaN(item.longitude);
          let distanceLabel = '';
          let isAccurateGps = false;

          if (userCoords && hasValidCoords) {
            const distKm = calculateHaversine(userCoords.latitude, userCoords.longitude, item.latitude!, item.longitude!);
            distanceLabel = `📍 A ${distKm < 1 ? Math.round(distKm * 1000) + ' m' : distKm.toFixed(1) + ' km'} de você`;
            isAccurateGps = true;
          } else if (!hasValidCoords) {
            distanceLabel = '📍 Coordenadas não cadastradas';
          } else if (locationStatus === 'denied') {
            distanceLabel = '📍 Permissão de GPS negada';
          } else {
            distanceLabel = '📍 GPS indisponível no dispositivo';
          }

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
                <View style={[styles.gpsDistanceBadge, isAccurateGps && styles.gpsDistanceBadgeAccurate]}>
                  <Text style={[styles.gpsDistanceText, isAccurateGps && styles.gpsDistanceTextAccurate]}>
                    {distanceLabel}
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchWrapper: {
    flex: 1,
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
  advancedSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#93C5FD',
    gap: 6,
  },
  advancedSearchBtnActive: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  advancedSearchBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  advancedSearchBtnTextActive: {
    color: '#FFFFFF',
  },
  activeFilterBadge: {
    backgroundColor: '#EF4444',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeFilterBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  advancedFilterPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
    ...Shadows.sm,
  },
  advHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  advPanelTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  clearFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  clearFiltersBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DC2626',
  },
  filterSection: {
    gap: 4,
  },
  filterSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  chipsScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  chipBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipBtnActive: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  chipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  advFooterRow: {
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    alignItems: 'center',
  },
  advCountText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
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
  sortToolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 2,
  },
  proximityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  proximityBtnActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  proximityBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0284C7',
  },
  proximityBtnTextActive: {
    color: '#FFFFFF',
  },
  gpsActiveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  gpsPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  gpsActiveText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#059669',
  },
  gpsDistanceBadgeAccurate: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  gpsDistanceTextAccurate: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
});
