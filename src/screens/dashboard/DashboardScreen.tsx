import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  RefreshControl, FlatList 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { StatCard } from '../../components/StatCard';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { 
  getLocalProjetos, getLocalVisitas, getLocalRelatorios, 
  getLocalLembretes, saveLocalProjeto, saveLocalVisita, saveLocalRelatorio 
} from '../../database/db';
import { Projeto, Visita, Relatorio } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

export const DashboardScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const { isOnline, triggerSync, pendingCount, syncState } = useNetwork();

  const [refreshing, setRefreshing] = useState(false);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [lembretesCount, setLembretesCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const p = await getLocalProjetos();
      const v = await getLocalVisitas();
      const r = await getLocalRelatorios();
      const l = await getLocalLembretes();

      // If database is completely empty on fresh install, seed initial sample data
      if (p.length === 0) {
        const sampleProj: Projeto = {
          id: 1,
          numero: 'OBR-2026-001',
          nome: 'Residencial Alphaville Horizon',
          tipo_obra: 'Edifício Residencial',
          construtora: 'Construtora Monteiro & Associados',
          nome_funcionario: 'Eng. Gabriel Eduardo',
          responsavel_id: user?.id || 1,
          email_principal: 'engenharia@monteiro.com.br',
          endereco: 'Av. das Nações, 1500 - Alphaville',
          status: 'Ativo',
          elementos_construtivos_base: 'Estrutura em concreto armado convencional',
          especificacao_chapisco_colante: 'Argamassa colante AC-III para fachada externa',
          especificacao_argamassa_emboco: 'Traço 1:1:6 com aditivo impermeabilizante',
          sync_status: 'synced',
        };
        await saveLocalProjeto(sampleProj);

        const sampleVisita: Visita = {
          id: 1,
          numero: 'VIS-001',
          projeto_id: 1,
          projeto_nome: 'Residencial Alphaville Horizon',
          responsavel_id: user?.id || 1,
          responsavel_nome: user?.username || 'Gabriel Eduardo',
          data_inicio: new Date().toISOString(),
          data_fim: new Date(Date.now() + 7200000).toISOString(),
          status: 'Agendada',
          observacoes: 'Inspeção de aderência de reboco e conferência de prumo',
          sync_status: 'synced',
        };
        await saveLocalVisita(sampleVisita);

        const sampleRel: Relatorio = {
          id: 1,
          numero: 'REL-001',
          titulo: 'Vistoria Técnica de Fachada - Etapa 2',
          projeto_id: 1,
          projeto_nome: 'Residencial Alphaville Horizon',
          autor_id: user?.id || 1,
          autor_nome: user?.username || 'Gabriel Eduardo',
          data_relatorio: new Date().toISOString(),
          status: 'Aguardando Aprovação',
          descricao: 'Verificação do ensaio de percussão nas pastilhas cerâmicas e juntas de dilatação.',
          observacoes_finais: 'Recomenda-se tratamento imediato dos pontos demarcados no 5º pavimento.',
          sync_status: 'synced',
        };
        await saveLocalRelatorio(sampleRel);

        setProjetos([sampleProj]);
        setVisitas([sampleVisita]);
        setRelatorios([sampleRel]);
      } else {
        setProjetos(p);
        setVisitas(v);
        setRelatorios(r);
        setLembretesCount(l.length);
      }
    } catch (err) {
      console.warn('Erro ao carregar dados do SQLite:', err);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (isOnline) {
      await triggerSync();
    }
    await loadData();
    setRefreshing(false);
  };

  const obrasAtivas = projetos.filter(p => p.status === 'Ativo').length;
  const relatoriosPendentes = relatorios.filter(r => r.status === 'Aguardando Aprovação' || r.status === 'em_andamento').length;

  return (
    <View style={styles.container}>
      <Header 
        title="ELP" 
        subtitle={`Olá, ${user?.username || 'Engenheiro'}`}
        rightAction={
          <TouchableOpacity 
            style={styles.headerSyncBtn} 
            onPress={() => triggerSync()}
            disabled={syncState === 'syncing'}
          >
            <Ionicons 
              name={syncState === 'syncing' ? "sync" : "cloud-done-outline"} 
              size={22} 
              color={Colors.primary} 
            />
          </TouchableOpacity>
        }
      />
      <OfflineBanner />

      <ScrollView 
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
      >
        {/* KPI Grid */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Visão Geral</Text>
          <Text style={styles.sectionBadge}>
            {isOnline ? 'Sincronizado' : 'Offline'}
          </Text>
        </View>

        <View style={styles.statsRow}>
          <StatCard
            title="Obras Ativas"
            value={obrasAtivas}
            icon="business-outline"
            color={Colors.primary}
            bgColor={Colors.primaryBackground}
            onPress={() => navigation.navigate('ObrasTab')}
          />
          <StatCard
            title="Visitas Agendadas"
            value={visitas.length}
            icon="calendar-outline"
            color="#8B5CF6"
            bgColor="#F3E8FF"
            onPress={() => navigation.navigate('VisitasTab')}
          />
        </View>

        <View style={styles.statsRow}>
          <StatCard
            title="Relatórios Pendentes"
            value={relatoriosPendentes}
            icon="document-text-outline"
            color="#F59E0B"
            bgColor="#FEF3C7"
            onPress={() => navigation.navigate('RelatoriosTab')}
          />
          <StatCard
            title="Lembretes Ativos"
            value={lembretesCount}
            icon="notifications-outline"
            color="#EC4899"
            bgColor="#FCE7F3"
            onPress={() => navigation.navigate('LembretesScreen')}
          />
        </View>

        {/* Quick Action Buttons */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Ações Rápidas no Canteiro</Text>
        </View>

        <View style={styles.actionsGrid}>
          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: '#2563EB' }]}
            onPress={() => navigation.navigate('ReportFormScreen')}
          >
            <Ionicons name="document-attach" size={24} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Novo Relatório</Text>
            <Text style={styles.actionBtnSub}>Vistoria de Obra</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: '#059669' }]}
            onPress={() => navigation.navigate('ExpressReportsScreen')}
          >
            <Ionicons name="flash" size={24} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Relatório Express</Text>
            <Text style={styles.actionBtnSub}>Criação Instantânea</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: '#7C3AED' }]}
            onPress={() => navigation.navigate('VisitFormScreen')}
          >
            <Ionicons name="calendar" size={24} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Agendar Visita</Text>
            <Text style={styles.actionBtnSub}>Calendário Técnico</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: '#D97706' }]}
            onPress={() => navigation.navigate('ProjectFormScreen')}
          >
            <Ionicons name="add-circle" size={24} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Cadastrar Obra</Text>
            <Text style={styles.actionBtnSub}>Novo Projeto</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Relatórios */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Últimos Relatórios Técnicos</Text>
          <TouchableOpacity onPress={() => navigation.navigate('RelatoriosTab')}>
            <Text style={styles.seeAllText}>Ver todos</Text>
          </TouchableOpacity>
        </View>

        {relatorios.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="document-text-outline" size={36} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Nenhum relatório registrado ainda.</Text>
          </View>
        ) : (
          relatorios.slice(0, 3).map((item) => (
            <TouchableOpacity 
              key={item.id} 
              style={styles.listItemCard}
              onPress={() => navigation.navigate('ReportDetailScreen', { reportId: item.id })}
            >
              <View style={styles.itemHeader}>
                <View style={styles.itemTitleRow}>
                  <Text style={styles.itemNumber}>{item.numero}</Text>
                  <SyncStatusBadge status={item.sync_status} />
                </View>
                <Text style={styles.itemDate}>
                  {item.data_relatorio ? new Date(item.data_relatorio).toLocaleDateString('pt-BR') : ''}
                </Text>
              </View>

              <Text style={styles.itemTitle}>{item.titulo}</Text>
              <Text style={styles.itemSubtitle}>{item.projeto_nome || 'Obra não informada'}</Text>

              <View style={styles.itemFooter}>
                <View style={[
                  styles.statusPill, 
                  item.status === 'Aprovado' ? styles.statusApproved : 
                  item.status === 'Aguardando Aprovação' ? styles.statusWaiting : styles.statusProgress
                ]}>
                  <Text style={styles.statusPillText}>{item.status}</Text>
                </View>

                <View style={styles.photosIndicator}>
                  <Ionicons name="images-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.photosCount}>{item.fotos_count || 0} fotos</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* Recent Visitas */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Próximas Visitas</Text>
          <TouchableOpacity onPress={() => navigation.navigate('VisitasTab')}>
            <Text style={styles.seeAllText}>Ver todas</Text>
          </TouchableOpacity>
        </View>

        {visitas.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={36} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Nenhuma visita agendada.</Text>
          </View>
        ) : (
          visitas.slice(0, 3).map((item) => (
            <TouchableOpacity 
              key={item.id} 
              style={styles.listItemCard}
              onPress={() => navigation.navigate('VisitDetailScreen', { visitId: item.id })}
            >
              <View style={styles.itemHeader}>
                <Text style={styles.itemNumber}>{item.numero}</Text>
                <SyncStatusBadge status={item.sync_status} />
              </View>
              <Text style={styles.itemTitle}>{item.projeto_nome || item.projeto_outros || 'Visita'}</Text>
              <Text style={styles.itemSubtitle}>
                Data: {new Date(item.data_inicio).toLocaleDateString('pt-BR')} • {new Date(item.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    padding: 16,
  },
  headerSyncBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: Colors.primaryBackground,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
  },
  sectionBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  seeAllText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionBtn: {
    width: '48%',
    borderRadius: 14,
    padding: 16,
    ...Shadows.md,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 8,
  },
  actionBtnSub: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 11,
    marginTop: 2,
  },
  listItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  itemDate: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.text,
  },
  itemSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusApproved: {
    backgroundColor: '#D1FAE5',
  },
  statusWaiting: {
    backgroundColor: '#FEF3C7',
  },
  statusProgress: {
    backgroundColor: '#EFF6FF',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E293B',
  },
  photosIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  photosCount: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 8,
  },
});
