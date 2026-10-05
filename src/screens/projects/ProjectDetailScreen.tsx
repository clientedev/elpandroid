import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { getLocalProjetoById, getLocalRelatorios, getLocalVisitas, getLocalLembretes } from '../../database/db';
import { Projeto, Relatorio, Visita, Lembrete } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

export const ProjectDetailScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { projectId } = route.params;
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'relatorios' | 'visitas' | 'lembretes'>('info');
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);

  useEffect(() => {
    loadDetails();
  }, [projectId]);

  async function loadDetails() {
    try {
      const p = await getLocalProjetoById(projectId);
      setProjeto(p);
      const r = await getLocalRelatorios(projectId);
      setRelatorios(r);
      const v = await getLocalVisitas(projectId);
      setVisitas(v);
      const l = await getLocalLembretes(projectId, false);
      setLembretes(l);
    } catch (e) {
      console.warn('Erro ao carregar detalhes:', e);
    }
  }

  if (!projeto) {
    return (
      <View style={styles.container}>
        <Header title="Detalhes da Obra" showBack onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Text>Carregando dados da obra...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header 
        title={projeto.numero} 
        subtitle={projeto.nome}
        showBack 
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity 
            style={styles.editBtn}
            onPress={() => navigation.navigate('ProjectFormScreen', { project: projeto })}
          >
            <Ionicons name="create-outline" size={22} color={Colors.primary} />
          </TouchableOpacity>
        }
      />
      <OfflineBanner />

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'info' && styles.tabItemActive]}
          onPress={() => setActiveTab('info')}
        >
          <Text style={[styles.tabText, activeTab === 'info' && styles.tabTextActive]}>Dados Técnicos</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'relatorios' && styles.tabItemActive]}
          onPress={() => setActiveTab('relatorios')}
        >
          <Text style={[styles.tabText, activeTab === 'relatorios' && styles.tabTextActive]}>
            Relatórios ({relatorios.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'visitas' && styles.tabItemActive]}
          onPress={() => setActiveTab('visitas')}
        >
          <Text style={[styles.tabText, activeTab === 'visitas' && styles.tabTextActive]}>
            Visitas ({visitas.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'lembretes' && styles.tabItemActive]}
          onPress={() => setActiveTab('lembretes')}
        >
          <Text style={[styles.tabText, activeTab === 'lembretes' && styles.tabTextActive]}>
            Lembretes ({lembretes.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {activeTab === 'info' && (
          <View>
            {/* Main Info Card */}
            <View style={styles.infoCard}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardSectionTitle}>Informações Gerais</Text>
                <SyncStatusBadge status={projeto.sync_status} />
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Nome da Obra:</Text>
                <Text style={styles.infoValue}>{projeto.nome}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Construtora:</Text>
                <Text style={styles.infoValue}>{projeto.construtora}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Tipo de Obra:</Text>
                <Text style={styles.infoValue}>{projeto.tipo_obra}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Endereço:</Text>
                <Text style={styles.infoValue}>{projeto.endereco || 'Não informado'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Responsável Técnico:</Text>
                <Text style={styles.infoValue}>{projeto.nome_funcionario}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>E-mail de Notificações:</Text>
                <Text style={styles.infoValue}>{projeto.email_principal}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Status Atual:</Text>
                <Text style={[styles.infoValue, { color: Colors.primary, fontWeight: 'bold' }]}>
                  {projeto.status}
                </Text>
              </View>
            </View>

            {/* Technical Specifications */}
            <View style={styles.infoCard}>
              <Text style={styles.cardSectionTitle}>Especificações Técnicas da Fachada</Text>

              <View style={styles.specBox}>
                <Text style={styles.specLabel}>Elementos Construtivos de Base:</Text>
                <Text style={styles.specContent}>{projeto.elementos_construtivos_base || 'Não especificado'}</Text>
              </View>

              <View style={styles.specBox}>
                <Text style={styles.specLabel}>Chapisco Colante / Alvenaria:</Text>
                <Text style={styles.specContent}>
                  {projeto.especificacao_chapisco_colante || projeto.especificacao_chapisco_alvenaria || 'Padrão conforme memorial'}
                </Text>
              </View>

              <View style={styles.specBox}>
                <Text style={styles.specLabel}>Argamassa de Emboço / Reboco:</Text>
                <Text style={styles.specContent}>{projeto.especificacao_argamassa_emboco || 'Não especificado'}</Text>
              </View>

              <View style={styles.specBox}>
                <Text style={styles.specLabel}>Acabamento de Peitoris e Muretas:</Text>
                <Text style={styles.specContent}>
                  {projeto.acabamento_peitoris || projeto.acabamento_muretas || 'Não especificado'}
                </Text>
              </View>

              <View style={styles.specBox}>
                <Text style={styles.specLabel}>Definição de Frisos & Cor:</Text>
                <Text style={styles.specContent}>{projeto.definicao_frisos_cor || 'Conforme projeto executivo'}</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity 
                style={[styles.btnAction, { backgroundColor: Colors.primary }]}
                onPress={() => navigation.navigate('ReportFormScreen', { preSelectedProjectId: projeto.id })}
              >
                <Ionicons name="document-text-outline" size={18} color="#FFFFFF" />
                <Text style={styles.btnActionText}>Novo Relatório</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.btnAction, { backgroundColor: '#7C3AED' }]}
                onPress={() => navigation.navigate('VisitFormScreen', { preSelectedProjectId: projeto.id })}
              >
                <Ionicons name="calendar-outline" size={18} color="#FFFFFF" />
                <Text style={styles.btnActionText}>Agendar Visita</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {activeTab === 'relatorios' && (
          <View>
            {relatorios.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="document-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Nenhum relatório criado para esta obra.</Text>
              </View>
            ) : (
              relatorios.map(r => (
                <TouchableOpacity 
                  key={r.id} 
                  style={styles.subItemCard}
                  onPress={() => navigation.navigate('ReportDetailScreen', { reportId: r.id })}
                >
                  <View style={styles.subHeader}>
                    <Text style={styles.subNumber}>{r.numero}</Text>
                    <SyncStatusBadge status={r.sync_status} />
                  </View>
                  <Text style={styles.subTitle}>{r.titulo}</Text>
                  <Text style={styles.subDate}>
                    {r.data_relatorio ? new Date(r.data_relatorio).toLocaleDateString('pt-BR') : ''} • Status: {r.status}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {activeTab === 'visitas' && (
          <View>
            {visitas.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Nenhuma visita agendada nesta obra.</Text>
              </View>
            ) : (
              visitas.map(v => (
                <TouchableOpacity 
                  key={v.id} 
                  style={styles.subItemCard}
                  onPress={() => navigation.navigate('VisitDetailScreen', { visitId: v.id })}
                >
                  <View style={styles.subHeader}>
                    <Text style={styles.subNumber}>{v.numero}</Text>
                    <SyncStatusBadge status={v.sync_status} />
                  </View>
                  <Text style={styles.subTitle}>
                    {new Date(v.data_inicio).toLocaleDateString('pt-BR')} às {new Date(v.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={styles.subDate}>Responsável: {v.responsavel_nome} • {v.status}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {activeTab === 'lembretes' && (
          <View>
            {lembretes.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="notifications-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Nenhum lembrete cadastrado para esta obra.</Text>
              </View>
            ) : (
              lembretes.map(l => (
                <View key={l.id} style={styles.subItemCard}>
                  <View style={styles.subHeader}>
                    <Text style={[styles.subNumber, l.fechado && { color: Colors.textMuted }]}>
                      {l.fechado ? 'FECHADO' : 'ATIVO'}
                    </Text>
                    <SyncStatusBadge status={l.sync_status} />
                  </View>
                  <Text style={[styles.subTitle, l.fechado && { textDecorationLine: 'line-through' }]}>
                    {l.texto}
                  </Text>
                  <Text style={styles.subDate}>Criado em: {new Date(l.criado_em).toLocaleDateString('pt-BR')}</Text>
                </View>
              ))
            )}
          </View>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtn: {
    padding: 6,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  scroll: {
    padding: 16,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardSectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.text,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  infoLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  infoValue: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500',
    flex: 1.4,
    textAlign: 'right',
  },
  specBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  specLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#334155',
  },
  specContent: {
    fontSize: 13,
    color: '#475569',
    marginTop: 4,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  btnAction: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Shadows.sm,
  },
  btnActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  subItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  subNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  subTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.text,
  },
  subDate: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 8,
  },
});
