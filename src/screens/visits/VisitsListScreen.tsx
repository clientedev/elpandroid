import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput, ScrollView 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { getLocalVisitas, getLocalRelatorios, saveLocalVisita, addToSyncQueue } from '../../database/db';
import { Visita, Relatorio } from '../../types';
import { Colors, Shadows } from '../../theme/colors';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { syncService } from '../../services/syncService';

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

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface DayCell {
  dayNum: number;
  dateStr: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  visits: Visita[];
}

export const VisitsListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [filteredVisitas, setFilteredVisitas] = useState<Visita[]>([]);
  const [selectedFilter, setSelectedFilter] = useState('Todas');
  const [scopeFilter, setScopeFilter] = useState<'minhas' | 'equipe'>('minhas');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Calendar States
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => {
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }, [today]);

  const [calYear, setCalYear] = useState<number>(today.getFullYear());
  const [calMonth, setCalMonth] = useState<number>(today.getMonth());
  const [selectedDayStr, setSelectedDayStr] = useState<string>(todayStr);

  const applyFilters = useCallback((data: Visita[], filter: string, search: string, scope: 'minhas' | 'equipe' = scopeFilter) => {
    let list = data;

    // Filtro individual por usuário logado
    if (scope === 'minhas' && user) {
      const myName = (user.nome_completo || user.username || '').trim().toLowerCase();
      list = list.filter(v => {
        const matchId = v.responsavel_id && user.id && v.responsavel_id === user.id;
        const respName = (v.responsavel_nome || '').toLowerCase();
        const matchName = myName && respName.includes(myName);
        const matchPessoal = v.is_pessoal && v.criado_por === user.id;
        return matchId || matchName || matchPessoal;
      });
    }

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
  }, [scopeFilter, user]);

  const loadVisitasAndAutoCheck = useCallback(async () => {
    try {
      const data = await getLocalVisitas().catch(() => []);
      const rels = await getLocalRelatorios().catch(() => []);

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

      if (isOnline) {
        syncService.syncAll().then(async () => {
          const freshData = await getLocalVisitas().catch(() => []);
          setVisitas(freshData);
          applyFilters(freshData, selectedFilter, searchQuery);
        }).catch(() => null);
      }
    } catch (e) {
      console.warn('Erro ao carregar visitas:', e);
    }
  }, [selectedFilter, searchQuery, applyFilters, isOnline]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadVisitasAndAutoCheck();
    });
    loadVisitasAndAutoCheck();
    return unsubscribe;
  }, [navigation, loadVisitasAndAutoCheck]);

  const handleFilter = (filter: string) => {
    setSelectedFilter(filter);
    applyFilters(visitas, filter, searchQuery, scopeFilter);
  };

  const handleScope = (scope: 'minhas' | 'equipe') => {
    setScopeFilter(scope);
    applyFilters(visitas, selectedFilter, searchQuery, scope);
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    applyFilters(visitas, selectedFilter, text, scopeFilter);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (isOnline) {
      await syncService.syncAll().catch(() => null);
    }
    await loadVisitasAndAutoCheck();
    setRefreshing(false);
  };

  // Calendar Navigation
  const handlePrevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(prev => prev - 1);
    } else {
      setCalMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(prev => prev + 1);
    } else {
      setCalMonth(prev => prev + 1);
    }
  };

  const handleGoToday = () => {
    const nowD = new Date();
    setCalYear(nowD.getFullYear());
    setCalMonth(nowD.getMonth());
    setSelectedDayStr(todayStr);
  };

  // Compute Calendar Grid
  const calendarCells = useMemo<DayCell[]>(() => {
    const cells: DayCell[] = [];
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay(); // 0 is Sunday
    const daysInPrevMonth = new Date(calYear, calMonth, 0).getDate();

    // Previous month padding
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const m = calMonth === 0 ? 12 : calMonth;
      const y = calMonth === 0 ? calYear - 1 : calYear;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNum: d,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDayStr,
        visits: [],
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayVisits = filteredVisitas.filter(v => v.data_inicio && v.data_inicio.startsWith(dateStr));
      cells.push({
        dayNum: d,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDayStr,
        visits: dayVisits,
      });
    }

    // Next month padding to fill a complete 7-column grid
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const m = calMonth === 11 ? 1 : calMonth + 2;
      const y = calMonth === 11 ? calYear + 1 : calYear;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNum: d,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDayStr,
        visits: [],
      });
    }

    return cells;
  }, [calYear, calMonth, todayStr, selectedDayStr, filteredVisitas]);

  // Selected Day Visits
  const selectedDayVisits = useMemo(() => {
    return filteredVisitas.filter(v => v.data_inicio && v.data_inicio.startsWith(selectedDayStr));
  }, [filteredVisitas, selectedDayStr]);

  // Format Selected Day for Title
  const formattedSelectedDay = useMemo(() => {
    try {
      const parts = selectedDayStr.split('-');
      if (parts.length === 3) {
        const d = parts[2];
        const mIdx = parseInt(parts[1], 10) - 1;
        const y = parts[0];
        return `${d} de ${MONTH_NAMES[mIdx]} de ${y}`;
      }
    } catch {}
    return selectedDayStr;
  }, [selectedDayStr]);

  // Render a Single Visit Card
  const renderVisitCard = (item: Visita) => {
    const dateObj = new Date(item.data_inicio);
    const dateStr = dateObj.toLocaleDateString('pt-BR');
    const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const teamTheme = getTeamTheme(item.responsavel_nome);

    const displayNum = item.numero 
      ? (item.numero.startsWith('VIS-') ? item.numero.replace('VIS-', 'VISIT-') : item.numero) 
      : 'VISIT-0001';

    return (
      <TouchableOpacity 
        key={item.id.toString()}
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
                <Text style={styles.numText}>{displayNum}</Text>
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

              {item.participantes_detalhes && item.participantes_detalhes.length > 0 ? (
                <View style={styles.participantsBadge}>
                  <Ionicons name="people" size={11} color="#64748B" />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#475569' }}>
                    +{item.participantes_detalhes.length}
                  </Text>
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
  };

  return (
    <View style={styles.container}>
      <Header 
        title="Agenda de Visitas" 
        subtitle={`${filteredVisitas.length} ${scopeFilter === 'minhas' ? 'visitas para você' : 'visitas na equipe'}`}
        rightAction={
          <TouchableOpacity 
            style={styles.addBtn}
            onPress={() => navigation.navigate('VisitFormScreen', { initialDate: selectedDayStr })}
          >
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />
      <OfflineBanner />

      {/* Top Controls: Scope (Minhas/Equipe) + View Mode (Lista/Calendário) */}
      <View style={styles.controlsContainer}>
        {/* Scope Selector */}
        <View style={styles.scopeRow}>
          <TouchableOpacity 
            style={[styles.scopeBtn, scopeFilter === 'minhas' && styles.scopeBtnActive]}
            onPress={() => handleScope('minhas')}
            activeOpacity={0.8}
          >
            <Ionicons name="person" size={13} color={scopeFilter === 'minhas' ? '#FFFFFF' : Colors.primary} />
            <Text style={[styles.scopeBtnText, scopeFilter === 'minhas' && styles.scopeBtnTextActive]}>
              Minhas Visitas
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.scopeBtn, scopeFilter === 'equipe' && styles.scopeBtnActive]}
            onPress={() => handleScope('equipe')}
            activeOpacity={0.8}
          >
            <Ionicons name="people" size={14} color={scopeFilter === 'equipe' ? '#FFFFFF' : Colors.textMuted} />
            <Text style={[styles.scopeBtnText, scopeFilter === 'equipe' && styles.scopeBtnTextActive]}>
              Toda a Equipe
            </Text>
          </TouchableOpacity>
        </View>

        {/* View Mode Toggle */}
        <View style={styles.viewModeRow}>
          <TouchableOpacity 
            style={[styles.viewModeBtn, viewMode === 'list' && styles.viewModeBtnActive]}
            onPress={() => setViewMode('list')}
            activeOpacity={0.8}
          >
            <Ionicons name="list" size={14} color={viewMode === 'list' ? '#FFFFFF' : Colors.primary} />
            <Text style={[styles.viewModeBtnText, viewMode === 'list' && styles.viewModeBtnTextActive]}>
              Lista
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.viewModeBtn, viewMode === 'calendar' && styles.viewModeBtnActive]}
            onPress={() => setViewMode('calendar')}
            activeOpacity={0.8}
          >
            <Ionicons name="calendar" size={14} color={viewMode === 'calendar' ? '#FFFFFF' : Colors.primary} />
            <Text style={[styles.viewModeBtnText, viewMode === 'calendar' && styles.viewModeBtnTextActive]}>
              Calendário
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Substring Search Bar (available in list view) */}
      {viewMode === 'list' && (
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
      )}

      {/* Status Filter Chips */}
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

      {/* VIEW MODE 1: LIST VIEW */}
      {viewMode === 'list' ? (
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
          renderItem={({ item }) => renderVisitCard(item)}
        />
      ) : (
        /* VIEW MODE 2: CALENDAR VIEW */
        <ScrollView 
          style={styles.calendarScrollView}
          contentContainerStyle={styles.calendarScrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        >
          {/* Calendar Box */}
          <View style={styles.calendarCard}>
            {/* Calendar Month Header */}
            <View style={styles.calNavHeader}>
              <TouchableOpacity style={styles.calNavBtn} onPress={handlePrevMonth} activeOpacity={0.7}>
                <Ionicons name="chevron-back" size={20} color={Colors.text} />
              </TouchableOpacity>

              <View style={styles.calMonthTitleContainer}>
                <Text style={styles.calMonthTitleText}>
                  {MONTH_NAMES[calMonth]} {calYear}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity style={styles.todayBtn} onPress={handleGoToday} activeOpacity={0.8}>
                  <Text style={styles.todayBtnText}>Hoje</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.calNavBtn} onPress={handleNextMonth} activeOpacity={0.7}>
                  <Ionicons name="chevron-forward" size={20} color={Colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Week Days Header */}
            <View style={styles.weekDaysRow}>
              {WEEK_DAYS.map((wd, idx) => (
                <View key={wd} style={styles.weekDayCell}>
                  <Text style={[styles.weekDayText, (idx === 0 || idx === 6) && styles.weekDayTextWeekend]}>
                    {wd}
                  </Text>
                </View>
              ))}
            </View>

            {/* Month Days Grid */}
            <View style={styles.daysGrid}>
              {calendarCells.map((cell, idx) => {
                const hasVisits = cell.visits && cell.visits.length > 0;
                return (
                  <TouchableOpacity
                    key={`${cell.dateStr}_${idx}`}
                    style={[
                      styles.dayCell,
                      !cell.isCurrentMonth && styles.dayCellOutside,
                      cell.isSelected && styles.dayCellSelected,
                      cell.isToday && !cell.isSelected && styles.dayCellToday,
                    ]}
                    onPress={() => setSelectedDayStr(cell.dateStr)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.dayNumberBadge,
                      cell.isToday && !cell.isSelected && styles.dayNumberBadgeToday,
                      cell.isSelected && styles.dayNumberBadgeSelected,
                    ]}>
                      <Text style={[
                        styles.dayNumberText,
                        !cell.isCurrentMonth && styles.dayNumberTextOutside,
                        cell.isToday && !cell.isSelected && styles.dayNumberTextToday,
                        cell.isSelected && styles.dayNumberTextSelected,
                      ]}>
                        {cell.dayNum}
                      </Text>
                    </View>

                    {/* Exibição dos Agendamentos Dentro do Dia */}
                    {hasVisits ? (
                      <View style={styles.cellVisitsContainer}>
                        {cell.visits.slice(0, 2).map((v, i) => {
                          const teamTheme = getTeamTheme(v.responsavel_nome);
                          const title = v.projeto_nome || v.projeto_outros || 'Visita';
                          const dateObj = new Date(v.data_inicio);
                          const timeStr = !isNaN(dateObj.getTime())
                            ? dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                            : '';

                          return (
                            <View 
                              key={`${v.id}_${i}`} 
                              style={[
                                styles.cellVisitPill, 
                                { backgroundColor: cell.isSelected ? 'rgba(255, 255, 255, 0.3)' : teamTheme.bg }
                              ]}
                            >
                              <Text 
                                style={[
                                  styles.cellVisitText,
                                  { color: cell.isSelected ? '#FFFFFF' : teamTheme.text }
                                ]}
                                numberOfLines={1}
                              >
                                {timeStr ? `${timeStr} ` : ''}{title}
                              </Text>
                            </View>
                          );
                        })}
                        {cell.visits.length > 2 && (
                          <View style={styles.cellMoreContainer}>
                            <Text style={[styles.cellMoreText, cell.isSelected && { color: '#FFFFFF' }]}>
                              +{cell.visits.length - 2} mais
                            </Text>
                          </View>
                        )}
                      </View>
                    ) : (
                      <View style={styles.cellEmptySpacer} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Selected Day Agenda Header */}
          <View style={styles.selectedDayHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.selectedDayIconContainer}>
                <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
              </View>
              <View>
                <Text style={styles.selectedDayTitle}>{formattedSelectedDay}</Text>
                <Text style={styles.selectedDaySubtitle}>
                  {selectedDayVisits.length} {selectedDayVisits.length === 1 ? 'visita programada' : 'visitas programadas'}
                </Text>
              </View>
            </View>

            <TouchableOpacity 
              style={styles.addVisitDayBtn}
              onPress={() => navigation.navigate('VisitFormScreen', { initialDate: selectedDayStr })}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.addVisitDayBtnText}>Agendar</Text>
            </TouchableOpacity>
          </View>

          {/* Cards for Selected Day */}
          {selectedDayVisits.length > 0 ? (
            <View style={{ marginTop: 8 }}>
              {selectedDayVisits.map(v => renderVisitCard(v))}
            </View>
          ) : (
            <View style={styles.emptyDayContainer}>
              <Ionicons name="sunny-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyDayTitle}>Dia Livre</Text>
              <Text style={styles.emptyDaySub}>
                Nenhuma visita técnica agendada para {formattedSelectedDay}.
              </Text>
              <TouchableOpacity 
                style={styles.emptyDayActionBtn}
                onPress={() => navigation.navigate('VisitFormScreen', { initialDate: selectedDayStr })}
                activeOpacity={0.8}
              >
                <Ionicons name="calendar" size={16} color={Colors.primary} />
                <Text style={styles.emptyDayActionText}>Agendar Visita neste Dia</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
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
  controlsContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  scopeRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  scopeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 8,
  },
  scopeBtnActive: {
    backgroundColor: Colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  scopeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  scopeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  viewModeRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    padding: 3,
    gap: 4,
  },
  viewModeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    borderRadius: 6,
  },
  viewModeBtnActive: {
    backgroundColor: Colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  viewModeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  viewModeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
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
    flexWrap: 'wrap',
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
  participantsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
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

  // Calendar Specific Styles
  calendarScrollView: {
    flex: 1,
  },
  calendarScrollContent: {
    padding: 16,
    paddingTop: 4,
    paddingBottom: 40,
  },
  calendarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
    marginBottom: 16,
  },
  calNavHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  calNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  calMonthTitleContainer: {
    alignItems: 'center',
  },
  calMonthTitleText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
  },
  todayBtn: {
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  todayBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  weekDaysRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekDayText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  weekDayTextWeekend: {
    color: '#94A3B8',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: 8,
  },
  dayCell: {
    width: `${100 / 7}%`,
    minHeight: 68,
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderRadius: 8,
    marginVertical: 1,
    paddingVertical: 3,
    paddingHorizontal: 1,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
  },
  dayCellOutside: {
    opacity: 0.35,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  dayCellSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: 'rgba(37, 99, 235, 0.05)',
  },
  dayNumberBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  dayNumberBadgeToday: {
    backgroundColor: Colors.primary,
  },
  dayNumberBadgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  dayNumberText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
  },
  dayNumberTextOutside: {
    color: '#94A3B8',
  },
  dayNumberTextToday: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  dayNumberTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  cellVisitsContainer: {
    width: '100%',
    paddingHorizontal: 1,
    gap: 2,
  },
  cellVisitPill: {
    borderRadius: 3,
    paddingHorizontal: 2,
    paddingVertical: 1.5,
    marginVertical: 0.5,
    overflow: 'hidden',
  },
  cellVisitText: {
    fontSize: 8,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  cellMoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0.5,
  },
  cellMoreText: {
    fontSize: 7.5,
    fontWeight: '800',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 9,
  },
  cellEmptySpacer: {
    height: 4,
  },
  selectedDayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  selectedDayIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedDayTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.text,
  },
  selectedDaySubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  addVisitDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addVisitDayBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyDayContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  emptyDayTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 8,
  },
  emptyDaySub: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  emptyDayActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  emptyDayActionText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.primary,
  },
});
