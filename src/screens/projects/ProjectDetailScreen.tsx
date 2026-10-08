import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, TextInput, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { 
  getLocalProjetoById, getLocalRelatorios, getLocalVisitas, getLocalLembretes, 
  saveLocalProjeto, addToSyncQueue, getLocalContatos, saveLocalContato,
  deleteLocalProjetoCascade, getLocalChecklistTemplate, getChecklistProgressoObra
} from '../../database/db';

const DEFAULT_OBRA_CHECKLIST = [
  'Execução de Chapisco e Aderência',
  'Aplicação de Emboço Técnico',
  'Instalação de Telas de Reforço',
  'Juntas de Movimentação e Dessolidarização',
  'Tratamento de Peitoris e Pingadeiras',
  'Regularização de Superfície',
  'Assentamento de Revestimento Cerâmico/Pastilha',
  'Aplicação de Rejunte Técnico',
  'Vedação Perimétrica de Esquadrias',
  'Lavagem e Limpeza Final da Fachada',
];
import { Projeto, Relatorio, Visita, Lembrete, Contato } from '../../types';
import { Colors, Shadows } from '../../theme/colors';
import { useNetwork } from '../../contexts/NetworkContext';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../services/api';

export const ProjectDetailScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { projectId } = route.params;
  const { user: currentUser } = useAuth();
  const { isOnline, triggerSync } = useNetwork();

  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'relatorios' | 'visitas' | 'lembretes'>('info');
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  const [contatos, setContatos] = useState<Contato[]>([]);

  // Modais de ações do topo
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showEmailsModal, setShowEmailsModal] = useState(false);
  const [novoEmailNome, setNovoEmailNome] = useState('');
  const [novoEmailEndereco, setNovoEmailEndereco] = useState('');

  // Exclusão de Obra pelo Master com contagem regressiva
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteCountdown, setDeleteCountdown] = useState(5);
  const [isDeleting, setIsDeleting] = useState(false);

  const isMasterOrAdmin = Boolean(
    currentUser?.is_master || currentUser?.username === 'admin'
  );

  const isReportCreationBlocked = Boolean(
    projeto?.status && ['Não Iniciado', 'Concluído', 'Pausado', 'Cancelado'].includes(projeto.status)
  );

  // Progresso do Checklist da Obra (Real e cumulativo)
  const [checklistStats, setChecklistStats] = useState<{
    total: number;
    validados: number;
    percent: number;
    itens: Array<{
      ordem: number;
      texto: string;
      aprovado: boolean;
      relatorioNumero?: string;
      dataAprovacao?: string;
      observacao?: string;
    }>;
  }>({ total: 0, validados: 0, percent: 0, itens: [] });
  const [showChecklistDetails, setShowChecklistDetails] = useState(false);

  useEffect(() => {
    loadDetails();
  }, [projectId]);

  async function loadDetails() {
    try {
      const p = await getLocalProjetoById(projectId);
      setProjeto(p);
      const r = await getLocalRelatorios(projectId);
      r.sort((a, b) => {
        const timeA = new Date(a.updated_at || a.data_criacao_local || a.data_relatorio || 0).getTime();
        const timeB = new Date(b.updated_at || b.data_criacao_local || b.data_relatorio || 0).getTime();
        if (timeB !== timeA) return timeB - timeA;
        return (b.id || 0) - (a.id || 0);
      });
      setRelatorios(r);
      const v = await getLocalVisitas(projectId);
      setVisitas(v);
      const l = await getLocalLembretes(projectId, false);
      setLembretes(l);
      const c = await getLocalContatos(projectId);
      setContatos(c);

      // Carrega o template e histórico cumulativo de checklist da obra
      const [template, progressoObra] = await Promise.all([
        getLocalChecklistTemplate(),
        getChecklistProgressoObra(projectId),
      ]);

      const baseItems: Array<{ id?: number; item: string; ordem: number }> = template.length > 0 
        ? template.map((t, idx) => ({ id: t.id, item: t.item, ordem: t.ordem || idx + 1 }))
        : DEFAULT_OBRA_CHECKLIST.map((texto, idx) => ({ id: idx + 1, item: texto, ordem: idx + 1 }));

      const aprovacoesMap = new Map<string, { aprovado: boolean; relatorioNumero?: string; dataAprovacao?: string; obs?: string }>();

      // 1. Considera registros de checklist_obra_progresso
      for (const po of progressoObra) {
        if (po.aprovado) {
          aprovacoesMap.set(po.item_texto.trim().toLowerCase(), {
            aprovado: true,
            relatorioNumero: po.aprovado_em_relatorio_numero || undefined,
            dataAprovacao: po.data_aprovacao || undefined,
            obs: po.observacao || undefined,
          });
        }
      }

      // 2. Considera relatórios salvos da obra que contenham checklist aprovado
      for (const rel of r) {
        const rawChecklist = (rel as any).checklist;
        if (rawChecklist) {
          try {
            const parsed = typeof rawChecklist === 'string' ? JSON.parse(rawChecklist) : rawChecklist;
            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                if (item && item.checked && item.item) {
                  const key = String(item.item).trim().toLowerCase();
                  if (!aprovacoesMap.has(key)) {
                    aprovacoesMap.set(key, {
                      aprovado: true,
                      relatorioNumero: rel.numero || undefined,
                      dataAprovacao: rel.data_relatorio || rel.created_at || undefined,
                      obs: item.observacao || undefined,
                    });
                  }
                }
              }
            }
          } catch {}
        }
      }

      const listaFinal = baseItems.map((base: { id?: number; item: string; ordem: number }, idx: number) => {
        const info = aprovacoesMap.get(base.item.trim().toLowerCase());
        return {
          ordem: idx + 1,
          texto: base.item,
          aprovado: Boolean(info?.aprovado),
          relatorioNumero: info?.relatorioNumero,
          dataAprovacao: info?.dataAprovacao,
          observacao: info?.obs,
        };
      });

      const total = listaFinal.length;
      const validados = listaFinal.filter((i: { aprovado: boolean }) => i.aprovado).length;
      const percent = total > 0 ? Math.round((validados / total) * 100) : 0;

      setChecklistStats({ total, validados, percent, itens: listaFinal });
    } catch (e) {
      console.warn('Erro ao carregar detalhes:', e);
    }
  }

  async function handleUpdateStatus(newStatus: string) {
    if (!projeto) return;
    try {
      const updatedProj: Projeto = { ...projeto, status: newStatus, sync_status: 'pending' };
      await saveLocalProjeto(updatedProj, 'pending');
      await addToSyncQueue('projeto', projeto.id, 'update_status', `/api/projetos/${projeto.id}/status`, 'PUT', { status: newStatus });
      if (isOnline) triggerSync();
      setProjeto(updatedProj);
      setShowStatusModal(false);
      Alert.alert('Status Atualizado', `A obra agora está com status "${newStatus}".`);
    } catch (err: any) {
      Alert.alert('Erro', err.message);
    }
  }

  async function handleAddClienteEmail() {
    if (!novoEmailNome.trim() || !novoEmailEndereco.trim()) {
      Alert.alert('Campos Obrigatórios', 'Informe o nome e o e-mail do destinatário.');
      return;
    }

    try {
      const newContact: Contato = {
        id: Date.now(),
        nome: novoEmailNome.trim(),
        email: novoEmailEndereco.trim(),
        projeto_id: projectId,
        sync_status: 'pending',
      };
      await saveLocalContato(newContact, 'pending');
      await addToSyncQueue('contato', newContact.id, 'create', '/api/contatos', 'POST', newContact);
      if (isOnline) triggerSync();

      setNovoEmailNome('');
      setNovoEmailEndereco('');
      const updated = await getLocalContatos(projectId);
      setContatos(updated);
      Alert.alert('Sucesso', 'E-mail do cliente cadastrado para envio automático de laudos!');
    } catch (err: any) {
      Alert.alert('Erro', err.message);
    }
  }

  // Timer decrescente de segurança para exclusão pelo Master
  useEffect(() => {
    let timer: any = null;
    if (showDeleteModal && deleteCountdown > 0) {
      timer = setInterval(() => {
        setDeleteCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [showDeleteModal, deleteCountdown]);

  function handleOpenDeleteModal() {
    setDeleteCountdown(5);
    setShowDeleteModal(true);
  }

  async function handleConfirmDelete() {
    if (!projeto) return;
    setIsDeleting(true);
    try {
      if (isOnline) {
        try {
          await apiClient.axios.delete(`/api/projetos/${projeto.id}`);
        } catch (apiErr: any) {
          console.warn('Aviso ao excluir no servidor:', apiErr);
          if (apiErr.response?.data?.error) {
            throw new Error(apiErr.response.data.error);
          }
        }
      }
      // Cascata completa no banco SQLite local
      await deleteLocalProjetoCascade(projeto.id);
      setShowDeleteModal(false);
      Alert.alert(
        'Obra Excluída',
        `A obra "${projeto.nome}" e todos os relatórios, fotos, visitas e dados relacionados foram apagados com sucesso.`,
        [
          { 
            text: 'OK', 
            onPress: () => {
              if (isOnline) triggerSync();
              navigation.goBack();
            } 
          }
        ]
      );
    } catch (err: any) {
      Alert.alert('Erro ao Excluir', err.message || 'Falha ao excluir a obra.');
    } finally {
      setIsDeleting(false);
    }
  }

  if (!projeto) {
    return (
      <View style={styles.container}>
        <Header title="Detalhes da Obra" showBack onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Text style={{ color: '#64748B' }}>Carregando dados da obra...</Text>
        </View>
      </View>
    );
  }

  const statusBg = 
    projeto.status === 'Ativo' ? '#10B981' :
    projeto.status === 'Pausado' ? '#F59E0B' :
    projeto.status === 'Não Iniciado' ? '#64748B' : '#2563EB';

  return (
    <View style={styles.container}>
      {/* Top Header - O botão de editar foi movido para o rodapé por regra estrita de UX */}
      <Header 
        title={projeto.numero} 
        subtitle={projeto.nome}
        showBack 
        onBack={() => navigation.goBack()}
      />
      <OfflineBanner />

      {/* 1. Indicador Visual de Status em Faixa Superior (Seção 15.6) */}
      <View style={[styles.statusBarBanner, { backgroundColor: statusBg }]}>
        <Ionicons 
          name={
            projeto.status === 'Ativo' ? 'checkmark-circle' :
            projeto.status === 'Pausado' ? 'pause-circle' :
            projeto.status === 'Não Iniciado' ? 'time' : 'flag'
          } 
          size={16} 
          color="#FFFFFF" 
        />
        <Text style={styles.statusBarBannerText}>
          Obra com Status: {projeto.status || 'Ativo'}
        </Text>
      </View>

      {/* 2. Linha de Título e Ações Rápidas do Topo (Seção 15.6) */}
      <View style={styles.topActionsContainer}>
        {/* Botão Verde: E-mails do Cliente */}
        <TouchableOpacity 
          style={styles.topBtnGreen}
          onPress={() => setShowEmailsModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="mail" size={16} color="#FFFFFF" />
          <Text style={styles.topBtnGreenText}>E-mails Cliente</Text>
        </TouchableOpacity>

        {/* Botão Amarelo: Alterar Status */}
        <TouchableOpacity 
          style={styles.topBtnYellow}
          onPress={() => setShowStatusModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="swap-horizontal" size={16} color="#FFFFFF" />
          <Text style={styles.topBtnYellowText}>Alterar Status</Text>
        </TouchableOpacity>

        {/* Botão Azul Principal: Criar Relatório (CTA Mobile de destaque) */}
        <TouchableOpacity 
          style={[styles.topBtnBlue, isReportCreationBlocked && { opacity: 0.6 }]}
          onPress={() => {
            if (isReportCreationBlocked) {
              Alert.alert('Obra Bloqueada', `Não é possível criar relatórios para obras com status "${projeto.status}".`);
              return;
            }
            navigation.navigate('ReportFormScreen', { preSelectedProjectId: projeto.id });
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="document-text" size={16} color="#FFFFFF" />
          <Text style={styles.topBtnBlueText}>Criar Relatório</Text>
        </TouchableOpacity>
      </View>

      {/* Abas de Navegação */}
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

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {activeTab === 'info' && (
          <View>
            {/* 3. Bloco Superior de Informações (Contratuais e Estatísticas) */}
            <View style={styles.infoCard}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardSectionTitle}>Informações Contratuais da Obra</Text>
                <SyncStatusBadge status={projeto.sync_status} />
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Nome da Construtora:</Text>
                <Text style={styles.infoValue}>{projeto.construtora}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Nome da Edificação:</Text>
                <Text style={styles.infoValue}>{projeto.nome}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Código de Identificação:</Text>
                <Text style={styles.infoValue}>{projeto.numero}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Tipo de Obra:</Text>
                <Text style={styles.infoValue}>{projeto.tipo_obra}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Endereço Completo:</Text>
                <Text style={styles.infoValue}>{projeto.endereco || 'Não informado'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Engenheiro Coordenador:</Text>
                <Text style={styles.infoValue}>{projeto.nome_funcionario}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>E-mail Oficial:</Text>
                <Text style={styles.infoValue}>{projeto.email_principal}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Numeração Inicial:</Text>
                <Text style={styles.infoValue}>{projeto.numeracao_inicial || 1}</Text>
              </View>
            </View>

            {/* 4. Painel de Especificações Técnicas de Fachada (Design Roxo #6f42c1 - Seção 15.6) */}
            <View style={styles.purpleSpecsCard}>
              <View style={styles.purpleCardHeader}>
                <Ionicons name="construct" size={18} color="#6f42c1" />
                <Text style={styles.purpleCardTitle}>Ficha Técnica de Fachada & Materiais</Text>
              </View>

              <View style={styles.specBox}>
                <Text style={styles.specLabel}>Elementos Construtivos de Base:</Text>
                <Text style={styles.specContent}>{projeto.elementos_construtivos_base || 'Não especificado'}</Text>
              </View>

              <View style={styles.specBox}>
                <Text style={styles.specLabel}>Chapisco Colante / Alvenaria:</Text>
                <Text style={styles.specContent}>
                  {projeto.especificacao_chapisco_colante || projeto.especificacao_chapisco_alvenaria || 'Padrão memorial'}
                </Text>
              </View>

              <View style={styles.specBox}>
                <Text style={styles.specLabel}>Argamassa de Emboço & Aplicação:</Text>
                <Text style={styles.specContent}>
                  {projeto.especificacao_argamassa_emboco || 'Não especificado'}
                  {projeto.forma_aplicacao_argamassa ? ` (${projeto.forma_aplicacao_argamassa})` : ''}
                </Text>
              </View>

              <View style={styles.specBox}>
                <Text style={styles.specLabel}>Acabamento de Peitoris e Muretas:</Text>
                <Text style={styles.specContent}>
                  {projeto.acabamento_peitoris || projeto.acabamento_muretas || 'Não especificado'}
                </Text>
              </View>

              <View style={styles.specBox}>
                <Text style={styles.specLabel}>Frisos, Cores e Caimento de Abas:</Text>
                <Text style={styles.specContent}>
                  {projeto.definicao_frisos_cor || projeto.definicao_face_inferior_abas || 'Conforme projeto executivo'}
                </Text>
              </View>

              {projeto.observacoes_projeto_fachada ? (
                <View style={styles.specBox}>
                  <Text style={styles.specLabel}>Observações Gerais da Consultoria:</Text>
                  <Text style={styles.specContent}>{projeto.observacoes_projeto_fachada}</Text>
                </View>
              ) : null}
            </View>

            {/* 5. Painel Real de Progresso do Checklist */}
            <View style={styles.infoCard}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <Ionicons name="checkbox-outline" size={18} color="#2563EB" />
                  <Text style={styles.cardSectionTitle}>Progresso do Checklist da Obra</Text>
                </View>
                <View style={[
                  styles.checklistPercentBadge,
                  checklistStats.percent === 100 
                    ? styles.badgeAllDone 
                    : checklistStats.percent > 0 
                    ? styles.badgeInProgress 
                    : styles.badgeNone
                ]}>
                  <Text style={[
                    styles.checklistPercentText,
                    checklistStats.percent === 100 
                      ? styles.badgeAllDoneText 
                      : checklistStats.percent > 0 
                      ? styles.badgeInProgressText 
                      : styles.badgeNoneText
                  ]}>
                    {checklistStats.percent}% Concluído
                  </Text>
                </View>
              </View>

              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${Math.max(4, checklistStats.percent)}%` }]} />
              </View>

              <Text style={styles.checklistHint}>
                {checklistStats.validados} de {checklistStats.total} etapas técnicas validadas em relatórios desta obra.
              </Text>

              {/* Botão para Expandir/Recolher Detalhes das Etapas */}
              <TouchableOpacity
                style={styles.btnToggleChecklistDetails}
                activeOpacity={0.7}
                onPress={() => setShowChecklistDetails(prev => !prev)}
              >
                <Text style={styles.btnToggleChecklistDetailsText}>
                  {showChecklistDetails ? 'Ocultar Etapas Técnicas' : 'Ver Detalhes das Etapas'}
                </Text>
                <Ionicons
                  name={showChecklistDetails ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color="#2563EB"
                />
              </TouchableOpacity>

              {/* Lista Detalhada das Etapas */}
              {showChecklistDetails && (
                <View style={styles.checklistDetailsContainer}>
                  {checklistStats.itens.map((item) => (
                    <View key={item.ordem} style={styles.checkItemRow}>
                      <View style={[
                        styles.checkStatusIcon,
                        item.aprovado ? styles.checkIconApproved : styles.checkIconPending
                      ]}>
                        <Ionicons
                          name={item.aprovado ? 'checkmark-circle' : 'time-outline'}
                          size={18}
                          color={item.aprovado ? '#10B981' : '#94A3B8'}
                        />
                      </View>
                      <View style={styles.checkItemTextCol}>
                        <Text style={[
                          styles.checkItemTitle,
                          item.aprovado && styles.checkItemTitleApproved
                        ]}>
                          {item.ordem}. {item.texto}
                        </Text>
                        <Text style={styles.checkItemMeta}>
                          {item.aprovado
                            ? `Validado ${item.relatorioNumero ? `no Relatório #${item.relatorioNumero}` : ''}${item.dataAprovacao ? ` em ${new Date(item.dataAprovacao).toLocaleDateString('pt-BR')}` : ''}`
                            : 'Pendente de validação em campo'}
                        </Text>
                        {item.observacao ? (
                          <Text style={styles.checkItemObs}>Obs: {item.observacao}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Aviso se obra estiver bloqueada */}
            {isReportCreationBlocked ? (
              <View style={styles.blockedStatusBox}>
                <Ionicons name="alert-circle-outline" size={20} color="#D97706" />
                <Text style={styles.blockedStatusText}>
                  Criação de novos relatórios desabilitada: esta obra está com status "{projeto.status}".
                </Text>
              </View>
            ) : null}

            {/* Ações de Campo */}
            <View style={styles.actionRow}>
              <TouchableOpacity 
                style={[styles.btnAction, { backgroundColor: '#7C3AED' }]}
                onPress={() => navigation.navigate('VisitFormScreen', { preSelectedProjectId: projeto.id })}
              >
                <Ionicons name="calendar-outline" size={18} color="#FFFFFF" />
                <Text style={styles.btnActionText}>Agendar Visita</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[
                  styles.btnAction, 
                  { backgroundColor: isReportCreationBlocked ? '#94A3B8' : Colors.primary }
                ]}
                onPress={() => {
                  if (isReportCreationBlocked) {
                    Alert.alert(
                      'Ação Bloqueada', 
                      `Não é possível criar relatórios para obras com status "${projeto.status}".`
                    );
                    return;
                  }
                  navigation.navigate('ReportFormScreen', { preSelectedProjectId: projeto.id });
                }}
                disabled={isReportCreationBlocked}
              >
                <Ionicons name="document-text-outline" size={18} color="#FFFFFF" />
                <Text style={styles.btnActionText}>Novo Relatório</Text>
              </TouchableOpacity>
            </View>

            {/* 7. Botão de Edição da Obra no Rodapé (Regra Estrita de UX da Seção 15.6) */}
            <TouchableOpacity 
              style={styles.editObraFooterBtn}
              onPress={() => navigation.navigate('ProjectFormScreen', { project: projeto })}
              activeOpacity={0.8}
            >
              <Ionicons name="create-outline" size={18} color="#2563EB" />
              <Text style={styles.editObraFooterBtnText}>Editar Dados da Obra</Text>
            </TouchableOpacity>

            {/* 8. Botão de Exclusão da Obra - Exclusivo para Usuário Master com Cascata e Contagem */}
            {isMasterOrAdmin && (
              <TouchableOpacity 
                style={styles.deleteObraFooterBtn}
                onPress={handleOpenDeleteModal}
                activeOpacity={0.8}
              >
                <View style={styles.masterBadgeIcon}>
                  <Ionicons name="star" size={11} color="#DC2626" />
                </View>
                <Ionicons name="trash-outline" size={17} color="#DC2626" />
                <Text style={styles.deleteObraFooterBtnText}>Excluir Obra (Acesso Master)</Text>
              </TouchableOpacity>
            )}
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
                  <View style={styles.subFooter}>
                    <Text style={styles.subDate}>
                      {r.data_relatorio ? new Date(r.data_relatorio).toLocaleDateString('pt-BR') : ''}
                    </Text>
                    <Text style={[styles.statusTagText, { color: Colors.primary, fontWeight: 'bold' }]}>
                      {r.status}
                    </Text>
                  </View>
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
                <Text style={styles.emptyText}>Nenhuma visita agendada para esta obra.</Text>
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
                  <Text style={styles.subTitle}>{v.responsavel_nome}</Text>
                  <Text style={styles.subDate}>
                    {new Date(v.data_inicio).toLocaleDateString('pt-BR')} às {new Date(v.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
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

      {/* Modal: Alterar Status da Obra (Seção 15.6) */}
      <Modal visible={showStatusModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Alterar Status da Obra</Text>
              <TouchableOpacity onPress={() => setShowStatusModal(false)}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 10, marginVertical: 14 }}>
              {[
                { st: 'Ativo', cor: '#10B981', desc: 'Em andamento com vistorias regulares' },
                { st: 'Não Iniciado', cor: '#64748B', desc: 'Aguardando ordem de serviço' },
                { st: 'Pausado', cor: '#F59E0B', desc: 'Paralisada temporariamente' },
                { st: 'Concluído', cor: '#2563EB', desc: 'Edificação finalizada e entregue' },
              ].map((item) => (
                <TouchableOpacity
                  key={item.st}
                  style={[styles.statusOptionBtn, { borderLeftColor: item.cor, borderLeftWidth: 5 }]}
                  onPress={() => handleUpdateStatus(item.st)}
                >
                  <View>
                    <Text style={[styles.statusOptionTitle, { color: item.cor }]}>{item.st}</Text>
                    <Text style={styles.statusOptionDesc}>{item.desc}</Text>
                  </View>
                  {projeto.status === item.st && (
                    <Ionicons name="checkmark-circle" size={20} color={item.cor} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Gerenciar E-mails do Cliente (Seção 15.6) */}
      <Modal visible={showEmailsModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>E-mails para Envio de Relatórios</Text>
              <TouchableOpacity onPress={() => setShowEmailsModal(false)}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubHint}>
              Os destinatários cadastrados abaixo recebem automaticamente o PDF oficial por e-mail assim que o laudo for aprovado.
            </Text>

            <View style={styles.newEmailForm}>
              <TextInput
                style={styles.modalInput}
                placeholder="Nome do contato (Ex: Eng. Roberto)"
                value={novoEmailNome}
                onChangeText={setNovoEmailNome}
              />
              <TextInput
                style={styles.modalInput}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="E-mail (Ex: roberto@construtora.com)"
                value={novoEmailEndereco}
                onChangeText={setNovoEmailEndereco}
              />
              <TouchableOpacity style={styles.addEmailBtn} onPress={handleAddClienteEmail}>
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.addEmailBtnText}>Adicionar Contato</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
              {contatos.length === 0 ? (
                <Text style={styles.emptyContactsText}>
                  Nenhum e-mail adicional cadastrado. O relatório será enviado apenas para {projeto.email_principal}.
                </Text>
              ) : (
                contatos.map(c => (
                  <View key={c.id} style={styles.contactRow}>
                    <Ionicons name="mail-outline" size={16} color="#0284C7" />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.contactName}>{c.nome}</Text>
                      <Text style={styles.contactEmail}>{c.email}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal: Exclusão de Obra com Contagem Regressiva de Confirmação (Master) */}
      <Modal 
        visible={showDeleteModal} 
        animationType="fade" 
        transparent 
        onRequestClose={() => !isDeleting && setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModalBox}>
            {/* Header de Alerta Destrutivo */}
            <View style={styles.deleteModalHeader}>
              <View style={styles.deleteWarningIconCircle}>
                <Ionicons name="warning" size={32} color="#DC2626" />
              </View>
              <Text style={styles.deleteModalTitle}>Excluir Obra Definitivamente</Text>
              <View style={styles.masterPill}>
                <Ionicons name="star" size={12} color="#DC2626" />
                <Text style={styles.masterPillText}>PRIVILÉGIO MASTER • AÇÃO IRREVERSÍVEL</Text>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300, marginVertical: 12 }}>
              <Text style={styles.deleteWarningDescription}>
                Você está prestes a excluir permanentemente a obra <Text style={{ fontWeight: 'bold', color: '#0F172A' }}>"{projeto.nome}" ({projeto.numero})</Text>.
              </Text>

              <View style={styles.deleteImpactCard}>
                <Text style={styles.deleteImpactTitle}>
                  ⚠️ Ao confirmar, todos os dados vinculados serão APAGADOS:
                </Text>
                <View style={styles.deleteImpactItem}>
                  <Ionicons name="document-text" size={14} color="#DC2626" />
                  <Text style={styles.deleteImpactText}>{relatorios.length} Relatórios técnicos e todas as fotos registradas</Text>
                </View>
                <View style={styles.deleteImpactItem}>
                  <Ionicons name="calendar" size={14} color="#DC2626" />
                  <Text style={styles.deleteImpactText}>{visitas.length} Visitas técnicas e agendamentos</Text>
                </View>
                <View style={styles.deleteImpactItem}>
                  <Ionicons name="notifications" size={14} color="#DC2626" />
                  <Text style={styles.deleteImpactText}>{lembretes.length} Lembretes e anotações ativas</Text>
                </View>
                <View style={styles.deleteImpactItem}>
                  <Ionicons name="mail" size={14} color="#DC2626" />
                  <Text style={styles.deleteImpactText}>{contatos.length} E-mails e contatos cadastrados</Text>
                </View>
                <View style={styles.deleteImpactItem}>
                  <Ionicons name="server" size={14} color="#DC2626" />
                  <Text style={styles.deleteImpactText}>Categorias personalizadas e checklists técnicos</Text>
                </View>
              </View>
            </ScrollView>

            {/* Caixa da Contagem Regressiva de Segurança */}
            <View style={styles.countdownContainer}>
              {deleteCountdown > 0 ? (
                <View style={styles.countdownActiveRow}>
                  <View style={styles.countdownBadge}>
                    <Text style={styles.countdownNumber}>{deleteCountdown}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.countdownWarningText}>
                      Aguarde <Text style={{ fontWeight: 'bold', color: '#DC2626' }}>{deleteCountdown} segundo{deleteCountdown > 1 ? 's' : ''}</Text> para desbloquear a confirmação de segurança.
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.countdownUnlockedRow}>
                  <Ionicons name="shield-checkmark" size={20} color="#16A34A" />
                  <Text style={styles.countdownUnlockedText}>
                    Tempo de segurança cumprido. A confirmação foi liberada.
                  </Text>
                </View>
              )}
            </View>

            {/* Botões de Ação */}
            <View style={styles.deleteActionButtons}>
              <TouchableOpacity 
                style={styles.cancelDeleteBtn} 
                onPress={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                <Text style={styles.cancelDeleteBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[
                  styles.confirmDeleteBtn, 
                  (deleteCountdown > 0 || isDeleting) && styles.confirmDeleteBtnDisabled
                ]} 
                onPress={handleConfirmDelete}
                disabled={deleteCountdown > 0 || isDeleting}
                activeOpacity={0.8}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="trash" size={16} color="#FFFFFF" />
                    <Text style={styles.confirmDeleteBtnText}>
                      {deleteCountdown > 0 ? `Aguarde (${deleteCountdown}s)` : 'Confirmar e Excluir'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  statusBarBanner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBarBannerText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  topActionsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  topBtnGreen: {
    flex: 1,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 8,
    ...Shadows.sm,
  },
  topBtnGreenText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  topBtnYellow: {
    flex: 1,
    backgroundColor: '#D97706',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 8,
    ...Shadows.sm,
  },
  topBtnYellowText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  topBtnBlue: {
    flex: 1.2,
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 8,
    ...Shadows.sm,
  },
  topBtnBlueText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
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

  // Ficha de Fachada com Borda e Design Roxo (#6f42c1)
  purpleSpecsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 5,
    borderLeftColor: '#6f42c1',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  purpleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3E8FF',
  },
  purpleCardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#6f42c1',
  },
  specBox: {
    marginTop: 8,
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
    marginTop: 3,
    lineHeight: 18,
  },

  // Progresso do Checklist
  checklistPercentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeAllDone: {
    backgroundColor: '#DCFCE7',
  },
  badgeAllDoneText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeInProgress: {
    backgroundColor: '#EFF6FF',
  },
  badgeInProgressText: {
    color: '#1E40AF',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeNone: {
    backgroundColor: '#F1F5F9',
  },
  badgeNoneText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  checklistPercentText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 4,
  },
  checklistHint: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  btnToggleChecklistDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  btnToggleChecklistDetailsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  checklistDetailsContainer: {
    marginTop: 8,
    gap: 8,
  },
  checkItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  checkStatusIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkIconApproved: {
    backgroundColor: '#DCFCE7',
  },
  checkIconPending: {
    backgroundColor: '#F1F5F9',
  },
  checkItemTextCol: {
    flex: 1,
  },
  checkItemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  checkItemTitleApproved: {
    color: '#0F172A',
  },
  checkItemMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  checkItemObs: {
    fontSize: 11,
    color: '#475569',
    fontStyle: 'italic',
    marginTop: 2,
  },

  blockedStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  blockedStatusText: {
    fontSize: 13,
    color: '#92400E',
    flex: 1,
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

  // Botão Editar Obra no Rodapé (Seção 15.6)
  editObraFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 4,
    marginBottom: 12,
  },
  editObraFooterBtnText: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: 'bold',
  },

  subItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  subHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  subNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  subTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
  },
  subDate: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  subFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  emptyCard: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 8,
  },

  // Modais
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    maxHeight: '80%',
    ...Shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  modalSubHint: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
    marginBottom: 12,
    lineHeight: 16,
  },
  statusOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusOptionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  statusOptionDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  newEmailForm: {
    gap: 8,
    marginBottom: 14,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    color: '#0F172A',
  },
  addEmailBtn: {
    backgroundColor: '#0284C7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    paddingVertical: 10,
  },
  addEmailBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  emptyContactsText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 14,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  contactName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  contactEmail: {
    fontSize: 11,
    color: '#64748B',
  },
  statusTagText: {
    fontSize: 11,
    color: '#1E293B',
  },
  // Master Delete Button & Modal Styles
  deleteObraFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 10,
  },
  deleteObraFooterBtnText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: 'bold',
  },
  masterBadgeIcon: {
    backgroundColor: '#FEE2E2',
    padding: 3,
    borderRadius: 4,
  },
  deleteModalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '92%',
    maxWidth: 440,
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
    ...Shadows.lg,
  },
  deleteModalHeader: {
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FEE2E2',
  },
  deleteWarningIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  deleteModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#DC2626',
    textAlign: 'center',
  },
  masterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
  },
  masterPillText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#DC2626',
    letterSpacing: 0.5,
  },
  deleteWarningDescription: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 10,
  },
  deleteImpactCard: {
    backgroundColor: '#FFF1F2',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FECDD3',
    gap: 6,
  },
  deleteImpactTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#9F1239',
    marginBottom: 4,
  },
  deleteImpactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  deleteImpactText: {
    fontSize: 11,
    color: '#881337',
    fontWeight: '500',
    flex: 1,
  },
  countdownContainer: {
    marginVertical: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  countdownActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  countdownBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEE2E2',
    borderWidth: 2,
    borderColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  countdownWarningText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  countdownUnlockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  countdownUnlockedText: {
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '600',
  },
  deleteActionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  cancelDeleteBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelDeleteBtnText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  confirmDeleteBtn: {
    flex: 1.5,
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...Shadows.sm,
  },
  confirmDeleteBtnDisabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.6,
  },
  confirmDeleteBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
});
