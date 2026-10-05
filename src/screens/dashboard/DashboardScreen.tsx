import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  RefreshControl, Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { 
  getLocalProjetos, getLocalVisitas, getLocalRelatorios, 
  saveLocalProjeto, saveLocalVisita, saveLocalRelatorio 
} from '../../database/db';
import { Projeto, Visita, Relatorio } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

export const DashboardScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const { isOnline, triggerSync, syncState } = useNetwork();

  const [refreshing, setRefreshing] = useState(false);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);

  const loadData = useCallback(async () => {
    try {
      const p = await getLocalProjetos();
      const v = await getLocalVisitas();
      const r = await getLocalRelatorios();

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
  const relatoriosPendentes = relatorios.filter(r => r.status === 'Aguardando Aprovação').length;
  const visitasAgendadas = visitas.filter(v => v.status === 'Agendada' || v.status === 'Confirmada').length || visitas.length;
  const relatoriosRascunho = relatorios.filter(r => r.status === 'em_andamento' || r.status === 'Rascunho' || !r.status).length;

  const isApprover = Boolean(user?.is_master || (user as any)?.is_aprovador || user?.is_aprovador_express);

  return (
    <View style={styles.container}>
      {/* Top Header matching Web System */}
      <Header 
        title="Dashboard ELP" 
        subtitle="Sistema de Visitas e Relatórios de Obras"
        rightAction={
          <TouchableOpacity 
            style={styles.headerSyncBtn} 
            onPress={async () => {
              const res = await triggerSync();
              Alert.alert(res.success ? 'Sincronização Concluída' : 'Aviso', res.message);
              await loadData();
            }}
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
        {/* User and Company Badges Bar (Identical to Web header) */}
        <View style={styles.userBadgeBar}>
          <View style={styles.badgePrimary}>
            <Ionicons name="person" size={14} color="#FFFFFF" />
            <Text style={styles.badgeTextWhite} numberOfLines={1}>
              {(user as any)?.nome_completo || user?.username || 'Engenheiro Responsável'}
            </Text>
          </View>
          <View style={styles.badgeCyan}>
            <Ionicons name="business" size={14} color="#FFFFFF" />
            <Text style={styles.badgeTextWhite} numberOfLines={1}>
              {(user as any)?.empresa || 'ELP Consultoria'}
            </Text>
          </View>
        </View>

        {/* Section Title */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="trending-up" size={20} color="#4E73DF" />
            <Text style={styles.sectionTitle}>Dashboard</Text>
          </View>
          <View style={styles.onlinePill}>
            <View style={[styles.dot, isOnline ? styles.onlineDot : styles.offlineDot]} />
            <Text style={styles.onlinePillText}>{isOnline ? 'Online (Railway)' : 'Offline (Local)'}</Text>
          </View>
        </View>

        {/* 4 Cards strictly matching Web dashboard_simple.html */}
        <View style={styles.cardsGrid}>
          {/* Card 1: Obras Ativas (#4e73df) */}
          <TouchableOpacity 
            style={[styles.webCard, styles.borderPrimary]} 
            onPress={() => navigation.navigate('ObrasTab')}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              <Text style={[styles.cardLabel, { color: '#4E73DF' }]}>🏗️ OBRAS ATIVAS</Text>
              <Text style={styles.cardValue}>{obrasAtivas}</Text>
            </View>
            <Ionicons name="business" size={38} color="#CBD5E1" />
          </TouchableOpacity>

          {/* Card 2: Relatórios Pendentes (#36b9cc) */}
          <TouchableOpacity 
            style={[styles.webCard, styles.borderInfo]} 
            onPress={() => navigation.navigate('PendentesTab')}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              <Text style={[styles.cardLabel, { color: '#0891B2' }]}>📋 RELATÓRIOS PENDENTES</Text>
              <Text style={styles.cardValue}>{relatoriosPendentes}</Text>
            </View>
            <Ionicons name="clipboard" size={38} color="#CBD5E1" />
          </TouchableOpacity>

          {/* Card 3: Visitas Agendadas (#1cc88a) */}
          <TouchableOpacity 
            style={[styles.webCard, styles.borderSuccess]} 
            onPress={() => navigation.navigate('VisitasTab')}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              <Text style={[styles.cardLabel, { color: '#059669' }]}>🗓️ VISITAS AGENDADAS</Text>
              <Text style={styles.cardValue}>{visitasAgendadas}</Text>
            </View>
            <Ionicons name="calendar" size={38} color="#CBD5E1" />
          </TouchableOpacity>

          {/* Card 4: Relatórios em Rascunho (#f6c23e) */}
          <TouchableOpacity 
            style={[styles.webCard, styles.borderWarning]} 
            onPress={() => navigation.navigate('PendentesTab')}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              <Text style={[styles.cardLabel, { color: '#D97706' }]}>📝 EM RASCUNHO</Text>
              <Text style={styles.cardValue}>{relatoriosRascunho}</Text>
            </View>
            <Ionicons name="document-text" size={38} color="#CBD5E1" />
          </TouchableOpacity>
        </View>

        {/* Quick Actions Grid */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="flash-outline" size={18} color="#2563EB" />
            <Text style={styles.sectionTitle}>Ações Rápidas no Canteiro</Text>
          </View>
        </View>

        <View style={styles.actionsGrid}>
          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: '#2563EB' }]}
            onPress={() => navigation.navigate('ReportFormScreen')}
            activeOpacity={0.8}
          >
            <Ionicons name="document-attach" size={24} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Novo Relatório</Text>
            <Text style={styles.actionBtnSub}>Vistoria Técnica</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: '#059669' }]}
            onPress={() => navigation.navigate('ExpressReportsScreen')}
            activeOpacity={0.8}
          >
            <Ionicons name="flash" size={24} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Relatório Express</Text>
            <Text style={styles.actionBtnSub}>Criação Instantânea</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: '#7C3AED' }]}
            onPress={() => navigation.navigate('VisitFormScreen')}
            activeOpacity={0.8}
          >
            <Ionicons name="calendar" size={24} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Agendar Visita</Text>
            <Text style={styles.actionBtnSub}>Programação</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: '#D97706' }]}
            onPress={() => navigation.navigate('ProjectFormScreen')}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle" size={24} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Cadastrar Obra</Text>
            <Text style={styles.actionBtnSub}>Novo Projeto</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Relatórios Section matching Web */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="document-text-outline" size={18} color={Colors.text} />
            <Text style={styles.sectionTitle}>Relatórios Recentes</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('PendentesTab')}>
            <Text style={styles.seeAllText}>Ver todos</Text>
          </TouchableOpacity>
        </View>

        {relatorios.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="document-text-outline" size={36} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Nenhum relatório recente</Text>
          </View>
        ) : (
          relatorios.slice(0, 4).map((rel) => {
            const isWaiting = rel.status === 'Aguardando Aprovação';
            const isApproved = rel.status === 'Aprovado';
            const isRejected = rel.status === 'Rejeitado';

            return (
              <View key={rel.id} style={styles.webListItemCard}>
                <View style={styles.webItemLeft}>
                  <View style={styles.webItemHeaderRow}>
                    <Text style={styles.webItemNumero}>{rel.numero}</Text>
                    <SyncStatusBadge status={rel.sync_status} />
                  </View>
                  <Text style={styles.webItemProject} numberOfLines={1}>
                    {rel.projeto_nome || 'Obra não informada'}
                  </Text>
                  <View style={styles.statusPillContainer}>
                    <View style={[
                      styles.webStatusBadge,
                      isApproved ? styles.badgeApproved :
                      isRejected ? styles.badgeRejected :
                      isWaiting ? styles.badgeWaiting : styles.badgeDraft
                    ]}>
                      <Text style={[
                        styles.webStatusText,
                        isApproved ? styles.textApproved :
                        isRejected ? styles.textRejected :
                        isWaiting ? styles.textWaiting : styles.textDraft
                      ]}>
                        {rel.status === 'em_andamento' ? 'Rascunho' : (rel.status || 'Rascunho')}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.webItemRight}>
                  <Text style={styles.webItemDate}>
                    {rel.data_relatorio ? new Date(rel.data_relatorio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : 'Sem data'}
                  </Text>

                  {isWaiting && isApprover ? (
                    <TouchableOpacity 
                      style={styles.reviewBtn}
                      onPress={() => navigation.navigate('ReportDetailScreen', { reportId: rel.id })}
                    >
                      <Ionicons name="checkmark-done" size={14} color="#D97706" />
                      <Text style={styles.reviewBtnText}>Revisar</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity 
                      style={styles.viewBtn}
                      onPress={() => navigation.navigate('ReportDetailScreen', { reportId: rel.id })}
                    >
                      <Ionicons name="eye-outline" size={14} color={Colors.primary} />
                      <Text style={styles.viewBtnText}>Ver</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}

        {/* Recent Visitas Section */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="calendar-outline" size={18} color={Colors.text} />
            <Text style={styles.sectionTitle}>Próximas Visitas</Text>
          </View>
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
              style={styles.webListItemCard}
              onPress={() => navigation.navigate('VisitDetailScreen', { visitId: item.id })}
            >
              <View style={styles.webItemLeft}>
                <View style={styles.webItemHeaderRow}>
                  <Text style={styles.webItemNumero}>{item.numero}</Text>
                  <SyncStatusBadge status={item.sync_status} />
                </View>
                <Text style={styles.webItemProject} numberOfLines={1}>
                  {item.projeto_nome || item.projeto_outros || 'Visita Técnica'}
                </Text>
                <Text style={styles.visitaTimeText}>
                  {new Date(item.data_inicio).toLocaleDateString('pt-BR')} às {new Date(item.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>

              <View style={styles.webItemRight}>
                <View style={[styles.webStatusBadge, styles.badgeSuccess]}>
                  <Text style={[styles.webStatusText, styles.textSuccess]}>{item.status}</Text>
                </View>
              </View>
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
    backgroundColor: '#F8FAFC',
  },
  scroll: {
    padding: 16,
  },
  headerSyncBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  userBadgeBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  badgePrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    ...Shadows.sm,
  },
  badgeCyan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0891B2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    ...Shadows.sm,
  },
  badgeTextWhite: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  onlineDot: {
    backgroundColor: '#10B981',
  },
  offlineDot: {
    backgroundColor: '#F59E0B',
  },
  onlinePillText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  seeAllText: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '600',
  },
  cardsGrid: {
    gap: 12,
    marginBottom: 8,
  },
  webCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  borderPrimary: {
    borderLeftWidth: 5,
    borderLeftColor: '#4E73DF',
  },
  borderInfo: {
    borderLeftWidth: 5,
    borderLeftColor: '#36B9CC',
  },
  borderSuccess: {
    borderLeftWidth: 5,
    borderLeftColor: '#1CC88A',
  },
  borderWarning: {
    borderLeftWidth: 5,
    borderLeftColor: '#F6C23E',
  },
  cardContent: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionBtn: {
    width: '48%',
    borderRadius: 12,
    padding: 14,
    ...Shadows.sm,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 6,
  },
  actionBtnSub: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    marginTop: 2,
  },
  webListItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  webItemLeft: {
    flex: 1,
    marginRight: 10,
  },
  webItemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  webItemNumero: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  webItemProject: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 6,
  },
  visitaTimeText: {
    fontSize: 11,
    color: '#64748B',
  },
  statusPillContainer: {
    flexDirection: 'row',
  },
  webStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeApproved: {
    backgroundColor: '#DCFCE7',
  },
  badgeRejected: {
    backgroundColor: '#FEE2E2',
  },
  badgeWaiting: {
    backgroundColor: '#FEF3C7',
  },
  badgeDraft: {
    backgroundColor: '#F1F5F9',
  },
  badgeSuccess: {
    backgroundColor: '#DCFCE7',
  },
  webStatusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  textApproved: {
    color: '#166534',
  },
  textRejected: {
    color: '#991B1B',
  },
  textWaiting: {
    color: '#B45309',
  },
  textDraft: {
    color: '#475569',
  },
  textSuccess: {
    color: '#166534',
  },
  webItemRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  webItemDate: {
    fontSize: 11,
    color: '#94A3B8',
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#2563EB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  viewBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#D97706',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FFFBEB',
  },
  reviewBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#D97706',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 8,
  },
});
