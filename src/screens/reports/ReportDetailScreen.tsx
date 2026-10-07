import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  Image, Alert, ActivityIndicator, TextInput 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { PhotoAnnotationOverlay } from '../../components/PhotoEditorModal';
import { 
  getLocalRelatorioById, getLocalFotos, updateLocalRelatorioStatus, addToSyncQueue, deleteLocalRelatorio 
} from '../../database/db';
import { generateReportPDF, shareReportPDF } from '../../services/pdfService';
import { apiClient } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { Relatorio, FotoRelatorio } from '../../types';
import { Colors, Shadows } from '../../theme/colors';


export const ReportDetailScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { reportId } = route.params;
  const { user } = useAuth();
  const { isOnline, triggerSync } = useNetwork();

  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [fotos, setFotos] = useState<FotoRelatorio[]>([]);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);

  useEffect(() => {
    loadReport();
  }, [reportId]);

  async function loadReport() {
    try {
      const r = await getLocalRelatorioById(reportId);
      setRelatorio(r);
      const f = await getLocalFotos(reportId);
      setFotos(f);
    } catch (e) {
      console.warn('Erro ao carregar relatório:', e);
    }
  }

  const isAuthor = Boolean(user && relatorio && user.id === relatorio.autor_id);
  const isMasterOrAdmin = Boolean(
    user?.is_master || 
    (user as any)?.is_admin || 
    (user as any)?.role === 'admin' || 
    (user as any)?.role === 'master' ||
    user?.username?.toLowerCase() === 'admin'
  );
  const hasApproverPrivilege = Boolean(
    isMasterOrAdmin || 
    (user as any)?.is_aprovador || 
    user?.is_aprovador_express || 
    (user as any)?.role === 'aprovador'
  );
  // Master/Admin pode aprovar qualquer relatório; Aprovador comum não pode aprovar o próprio
  const isApprover = isMasterOrAdmin || (hasApproverPrivilege && !isAuthor);


  async function handleExportPDF() {
    if (!relatorio) return;
    setLoadingPdf(true);
    try {
      const pdfUri = await generateReportPDF(relatorio, fotos);
      await shareReportPDF(pdfUri);
    } catch (err: any) {
      Alert.alert('Erro ao Gerar PDF', err.message || 'Falha ao processar PDF.');
    } finally {
      setLoadingPdf(false);
    }
  }

  async function handleApprove() {
    if (!relatorio || !isApprover) return;
    setApproving(true);
    try {
      await updateLocalRelatorioStatus(
        relatorio.id,
        'Aprovado',
        'Relatório aprovado pelo responsável',
        user?.id,
        user?.username,
        'pending'
      );
      await addToSyncQueue(
        'relatorio',
        relatorio.id,
        'approve',
        `/api/relatorios/${relatorio.id}/status`,
        'POST',
        { status: 'Aprovado', aprovador_id: user?.id }
      );
      if (isOnline) triggerSync();
      await loadReport();
      Alert.alert('Sucesso', 'Relatório aprovado com sucesso!');
    } catch (err: any) {
      Alert.alert('Erro', err.message);
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    if (!relatorio || !isApprover || !rejectComment.trim()) {
      Alert.alert('Atenção', 'Informe a justificativa da reprovação.');
      return;
    }
    setApproving(true);
    try {
      await updateLocalRelatorioStatus(
        relatorio.id,
        'Rejeitado',
        rejectComment.trim(),
        user?.id,
        user?.username,
        'pending'
      );
      await addToSyncQueue(
        'relatorio',
        relatorio.id,
        'reject',
        `/api/relatorios/${relatorio.id}/status`,
        'POST',
        { status: 'Rejeitado', comentario: rejectComment.trim(), aprovador_id: user?.id }
      );
      if (isOnline) triggerSync();
      setShowRejectBox(false);
      setRejectComment('');
      await loadReport();
      Alert.alert('Sucesso', 'Relatório reprovado com comentários de ajuste.');
    } catch (err: any) {
      Alert.alert('Erro', err.message);
    } finally {
      setApproving(false);
    }
  }

  async function handleSubmitApproval() {
    if (!relatorio) return;
    try {
      await updateLocalRelatorioStatus(
        relatorio.id,
        'Aguardando Aprovação',
        '',
        undefined,
        undefined,
        'pending'
      );
      await addToSyncQueue(
        'relatorio',
        relatorio.id,
        'submit_approval',
        `/api/relatorios/${relatorio.id}/status`,
        'POST',
        { status: 'Aguardando Aprovação' }
      );
      if (isOnline) triggerSync();
      await loadReport();
      Alert.alert('Sucesso', 'Relatório submetido para aprovação!');
    } catch (err: any) {
      Alert.alert('Erro', err.message);
    }
  }

  async function handleDeleteReport() {
    if (!relatorio || !isMasterOrAdmin) {
      Alert.alert('Acesso Negado', 'Apenas usuários Master ou Administradores têm permissão para excluir relatórios.');
      return;
    }

    Alert.alert(
      'Excluir Relatório',
      `Tem certeza que deseja excluir permanentemente o relatório ${relatorio.numero}? Esta ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              setApproving(true);
              await deleteLocalRelatorio(relatorio.id);
              if (isOnline) {
                await apiClient.axios.delete(`/api/relatorios/${relatorio.id}`, {
                  data: { user_id: user?.id, is_master: true }
                }).catch(() => null);
              } else {
                await addToSyncQueue('relatorio', relatorio.id, 'delete', `/api/relatorios/${relatorio.id}`, 'DELETE', { user_id: user?.id, is_master: true });
              }
              Alert.alert('Sucesso', 'Relatório excluído com sucesso.');
              navigation.goBack();
            } catch (delErr: any) {
              Alert.alert('Erro', delErr?.message || 'Falha ao excluir relatório.');
            } finally {
              setApproving(false);
            }
          }
        }
      ]
    );
  }


  if (!relatorio) {
    return (
      <View style={styles.container}>
        <Header title="Detalhes do Relatório" showBack onBack={() => navigation.goBack()} />
        <View style={styles.center}><Text>Carregando...</Text></View>
      </View>
    );
  }

  // Parse checklist data if available
  let parsedChecklist: any[] = [];
  if (relatorio.checklist_data) {
    try {
      parsedChecklist = typeof relatorio.checklist_data === 'string' 
        ? JSON.parse(relatorio.checklist_data) 
        : relatorio.checklist_data;
    } catch {
      parsedChecklist = [];
    }
  }

  return (
    <View style={styles.container}>
      <Header 
        title={relatorio.numero} 
        subtitle={relatorio.projeto_nome || 'Relatório'}
        showBack 
        onBack={() => navigation.goBack()} 
      />
      <OfflineBanner />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Banner do Usuário Interagindo / Visualizando */}
        <View style={styles.userPresenceCard}>
          <View style={styles.userPresenceAvatar}>
            <Text style={styles.userPresenceInitials}>
              {(user?.nome_completo || user?.username || 'U').substring(0, 2).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={styles.presenceDot} />
              <Text style={styles.presenceStatus}>Interagindo neste relatório agora</Text>
            </View>
            <Text style={styles.presenceName}>
              {user?.nome_completo || user?.username || 'Usuário Atual'}
            </Text>
            <Text style={styles.presenceRole}>
              {user?.cargo || (user?.is_master ? 'Administrador Master' : 'Responsável Técnico')}
            </Text>
          </View>
          {(relatorio.status === 'em_andamento' || relatorio.status === 'Rejeitado') && (
            <TouchableOpacity 
              style={styles.presenceEditBtn}
              onPress={() => navigation.navigate('ReportFormScreen', { reportId: relatorio.id })}
            >
              <Ionicons name="create-outline" size={15} color="#FFFFFF" />
              <Text style={styles.presenceEditBtnText}>Editar</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Main Card */}
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.reportTitle}>{relatorio.titulo}</Text>
              <Text style={styles.reportSubtitle}>{relatorio.projeto_nome}</Text>
            </View>
            <SyncStatusBadge status={relatorio.sync_status} />
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Autor da Vistoria:</Text>
            <Text style={styles.value}>{relatorio.autor_nome || 'Engenheiro Responsável'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Data da Vistoria:</Text>
            <Text style={styles.value}>
              {relatorio.data_relatorio ? new Date(relatorio.data_relatorio).toLocaleDateString('pt-BR') : ''}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Local Específico:</Text>
            <Text style={styles.value}>{relatorio.local || 'Geral na Obra'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Categoria:</Text>
            <Text style={styles.value}>{relatorio.categoria || 'Geral'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Status do Fluxo:</Text>
            <View style={[
              styles.statusPill, 
              relatorio.status === 'Aprovado' ? styles.statusApproved : 
              relatorio.status === 'Aguardando Aprovação' ? styles.statusWaiting : styles.statusProgress
            ]}>
              <Text style={styles.statusPillText}>{relatorio.status === 'em_andamento' ? 'Rascunho' : relatorio.status}</Text>
            </View>
          </View>

          {/* Dados de Auditoria e Sincronização */}
          <View style={{ backgroundColor: '#F8FAFC', borderRadius: 8, padding: 10, marginTop: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.primary, marginBottom: 6 }}>
              REGISTRO DE AUDITORIA & NUMERAÇÃO
            </Text>
            <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 2 }}>
              • <Text style={{ fontWeight: '600' }}>Número Oficial:</Text> {relatorio.numero?.startsWith('REL-') ? relatorio.numero : 'Pendente de Atribuição pelo Servidor'}
            </Text>
            {relatorio.uuid ? (
              <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 2 }}>
                • <Text style={{ fontWeight: '600' }}>UUID Local:</Text> {relatorio.uuid}
              </Text>
            ) : null}
            {relatorio.data_criacao_local ? (
              <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 2 }}>
                • <Text style={{ fontWeight: '600' }}>Criado em:</Text> {new Date(relatorio.data_criacao_local).toLocaleString('pt-BR')}
              </Text>
            ) : null}
            {relatorio.data_sincronizacao ? (
              <Text style={{ fontSize: 11, color: '#16A34A', marginBottom: 2 }}>
                • <Text style={{ fontWeight: '600' }}>Sincronizado em:</Text> {new Date(relatorio.data_sincronizacao).toLocaleString('pt-BR')}
              </Text>
            ) : (
              <Text style={{ fontSize: 11, color: '#D97706', marginBottom: 2 }}>
                • <Text style={{ fontWeight: '600' }}>Sincronização:</Text> Pendente (será enviado automaticamente quando online)
              </Text>
            )}
          </View>

          {relatorio.status === 'em_andamento' && (
            <TouchableOpacity 
              style={styles.continueDraftBtn}
              onPress={() => navigation.navigate('ReportFormScreen', { reportId: relatorio.id })}
            >
              <Ionicons name="create-outline" size={18} color="#FFFFFF" />
              <Text style={styles.continueDraftBtnText}>Continuar Preenchendo Rascunho</Text>
            </TouchableOpacity>
          )}

          {relatorio.descricao ? (
            <View style={styles.textSection}>
              <Text style={styles.sectionTitle}>Descrição Técnica:</Text>
              <Text style={styles.sectionBody}>{relatorio.descricao}</Text>
            </View>
          ) : null}

          {relatorio.observacoes_finais ? (
            <View style={styles.textSection}>
              <Text style={styles.sectionTitle}>Observações Finais & Recomendações:</Text>
              <Text style={styles.sectionBody}>{relatorio.observacoes_finais}</Text>
            </View>
          ) : null}
        </View>

        {/* Checklist Section (if any) */}
        {Array.isArray(parsedChecklist) && parsedChecklist.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>Itens Verificados no Checklist</Text>
            {parsedChecklist.map((it, idx) => (
              <View key={idx} style={styles.checklistViewItem}>
                <View style={styles.checklistCheckRow}>
                  <Ionicons 
                    name={it.checked ? "checkbox" : "square-outline"} 
                    size={20} 
                    color={it.checked ? Colors.primary : Colors.textMuted} 
                  />
                  <Text style={[styles.checklistViewText, it.checked && styles.checklistViewTextActive]}>
                    {it.item}
                  </Text>
                </View>
                {it.observacao ? (
                  <View style={styles.obsDisplayBox}>
                    <Ionicons name="chatbubble-ellipses-outline" size={14} color="#0369A1" />
                    <Text style={styles.obsDisplayText}>{it.observacao}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}

        {/* Photos in 1 per row (List Card format) */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Registro Fotográfico Sequencial ({fotos.length})</Text>

          {fotos.length === 0 ? (
            <View style={styles.emptyPhotos}>
              <Ionicons name="images-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.emptyPhotosText}>Nenhuma foto anexada neste relatório.</Text>
            </View>
          ) : (
            <View style={styles.photosList}>
              {fotos.map((item, index) => (
                <View key={item.id} style={styles.photoListCard}>
                  <View style={styles.photoCardHeader}>
                    <Text style={styles.photoSequenceTitle}>Foto {index + 1}</Text>
                    {item.local ? (
                      <View style={styles.localTag}>
                        <Ionicons name="location-outline" size={12} color="#0369A1" />
                        <Text style={styles.localTagText}>{item.local}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.photoImageContainer}>
                    {(() => {
                      let resolvedUri: string | null = null;
                      if (item.uri_local) {
                        if (item.uri_local.startsWith('file://') || item.uri_local.startsWith('content://') || item.uri_local.startsWith('http')) {
                          resolvedUri = item.uri_local;
                        } else if (item.uri_local.startsWith('/')) {
                          resolvedUri = `file://${item.uri_local}`;
                        } else {
                          resolvedUri = item.uri_local;
                        }
                      } else if (item.base64) {
                        resolvedUri = item.base64.startsWith('data:') ? item.base64 : `data:image/jpeg;base64,${item.base64}`;
                      } else if (item.url) {
                        if (item.url.startsWith('http://') || item.url.startsWith('https://')) {
                          resolvedUri = item.url;
                        } else {
                          const cleanUrl = item.url.startsWith('/') ? item.url : `/${item.url}`;
                          resolvedUri = `https://elpandroid-production.up.railway.app${cleanUrl}`;
                        }
                      }

                      return resolvedUri ? (
                        <Image 
                          source={{ uri: resolvedUri }} 
                          style={styles.photoFullImg} 
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.photoFallback}>
                          <Ionicons name="image-outline" size={42} color="#94A3B8" />
                          <Text style={styles.photoFallbackText}>Foto não disponível localmente</Text>
                        </View>
                      );
                    })()}
                    <PhotoAnnotationOverlay annotationsJson={item.anotacoes_dados} />
                  </View>

                  <View style={styles.photoCaptionBox}>
                    <Text style={styles.photoLegendaLabel}>Legenda Técnica:</Text>
                    <Text style={styles.photoLegendaText}>
                      {item.legenda || item.titulo || 'Sem legenda informada'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Approver Actions (Strictly for Approvers) */}
        {relatorio.status === 'Aguardando Aprovação' && isApprover && (
          <View style={styles.approvalSection}>
            <Text style={styles.approvalSectionTitle}>Painel de Decisão do Aprovador</Text>
            
            {showRejectBox ? (
              <View style={styles.rejectCard}>
                <Text style={styles.rejectTitle}>Motivo / Justificativa da Reprovação:</Text>
                <TextInput
                  style={styles.rejectInput}
                  multiline
                  placeholder="Descreva as correções necessárias que o técnico deve realizar..."
                  value={rejectComment}
                  onChangeText={setRejectComment}
                />
                <View style={styles.rejectActionsRow}>
                  <TouchableOpacity 
                    style={styles.cancelRejectBtn} 
                    onPress={() => setShowRejectBox(false)}
                  >
                    <Text style={styles.cancelRejectText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.confirmRejectBtn} 
                    onPress={handleReject}
                    disabled={approving}
                  >
                    <Text style={styles.confirmRejectText}>Confirmar Reprovação</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.approvalButtonsVertical}>
                {/* 1. Botão "Aprovar Relatório" (Verde sólido) */}
                <TouchableOpacity 
                  style={[styles.btnActionFull, styles.approveBtn]} 
                  onPress={handleApprove}
                  disabled={approving}
                >
                  <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.btnActionText}>Aprovar Relatório</Text>
                </TouchableOpacity>

                {/* 2. Botão "Editar Relatório" (Azul sólido - Correção técnica pontual) */}
                <TouchableOpacity 
                  style={[styles.btnActionFull, styles.editReportBtn]} 
                  onPress={() => navigation.navigate('ReportFormScreen', { reportId: relatorio.id, preSelectedProjectId: relatorio.projeto_id })}
                  disabled={approving}
                >
                  <Ionicons name="create-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.btnActionText}>Editar Relatório</Text>
                </TouchableOpacity>

                {/* 3. Botão "Reprovar com Ajustes" (Vermelho sólido) */}
                <TouchableOpacity 
                  style={[styles.btnActionFull, styles.rejectBtn]} 
                  onPress={() => setShowRejectBox(true)}
                  disabled={approving}
                >
                  <Ionicons name="close-circle-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.btnActionText}>Reprovar com Ajustes</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Lock Notice for Authors during Approval */}
        {relatorio.status === 'Aguardando Aprovação' && !isApprover && (
          <View style={styles.lockedNoticeBox}>
            <Ionicons name="hourglass-outline" size={20} color="#D97706" />
            <Text style={styles.lockedNoticeText}>
              Este relatório está em análise pela supervisão técnica. A edição está bloqueada temporariamente até a aprovação.
            </Text>
          </View>
        )}

        {/* PDF Export Button */}
        <TouchableOpacity 
          style={[styles.btn, styles.pdfBtn]} 
          onPress={handleExportPDF}
          disabled={loadingPdf}
        >
          {loadingPdf ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="share-social-outline" size={20} color="#FFFFFF" />
              <Text style={styles.btnText}>Exportar & Compartilhar PDF</Text>
            </>
          )}
        </TouchableOpacity>

        {relatorio.status === 'em_andamento' && (
          <TouchableOpacity 
            style={[styles.btn, styles.submitBtn]} 
            onPress={handleSubmitApproval}
          >
            <Ionicons name="paper-plane-outline" size={20} color="#FFFFFF" />
            <Text style={styles.btnText}>Enviar para Aprovação</Text>
          </TouchableOpacity>
        )}

        {/* Botão de Excluir: Exclusivo para Master e Admin */}
        {isMasterOrAdmin && (
          <TouchableOpacity 
            style={[styles.btn, { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5', marginTop: 12 }]} 
            onPress={handleDeleteReport}
            disabled={approving}
          >
            <Ionicons name="trash-outline" size={20} color="#DC2626" />
            <Text style={[styles.btnText, { color: '#DC2626', fontWeight: '700' }]}>
              Excluir Relatório (Privilégio Master/Admin)
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  reportTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.text },
  reportSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  cardSectionTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.text, marginBottom: 12 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  label: { fontSize: 13, color: Colors.textSecondary },
  value: { fontSize: 13, fontWeight: '600', color: Colors.text },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusPillText: { fontSize: 12, fontWeight: 'bold', color: '#FFFFFF' },
  statusApproved: { backgroundColor: '#10B981' },
  statusWaiting: { backgroundColor: '#F59E0B' },
  statusProgress: { backgroundColor: '#3B82F6' },
  textSection: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', color: Colors.text, marginBottom: 4 },
  sectionBody: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  checklistViewItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  checklistCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checklistViewText: {
    fontSize: 13,
    color: '#475569',
    flex: 1,
  },
  checklistViewTextActive: {
    fontWeight: 'bold',
    color: Colors.text,
  },
  obsDisplayBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 4,
    marginLeft: 28,
  },
  obsDisplayText: {
    fontSize: 12,
    color: '#0369A1',
    flex: 1,
  },
  emptyPhotos: { alignItems: 'center', paddingVertical: 24 },
  emptyPhotosText: { fontSize: 13, color: Colors.textMuted, marginTop: 8 },
  photosList: { gap: 16 },
  photoListCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  photoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F1F5F9',
  },
  photoSequenceTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.text,
  },
  localTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  localTagText: {
    fontSize: 11,
    color: '#0369A1',
    fontWeight: '600',
  },
  photoImageContainer: {
    width: '100%',
    height: 220,
    backgroundColor: '#F1F5F9',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    gap: 8,
  },
  photoFallbackText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  photoFullImg: {
    width: '100%',
    height: '100%',
  },
  photoCaptionBox: {
    padding: 12,
  },
  photoLegendaLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  photoLegendaText: {
    fontSize: 13,
    color: Colors.text,
  },
  approvalSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    ...Shadows.sm,
  },
  approvalSectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 12,
  },
  approvalButtonsVertical: {
    gap: 8,
  },
  btnActionFull: {
    width: '100%',
    height: 48,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Shadows.sm,
  },
  approveBtn: {
    backgroundColor: '#16A34A',
  },
  editReportBtn: {
    backgroundColor: '#0284C7',
  },
  rejectBtn: {
    backgroundColor: '#EF4444',
  },
  btnActionText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  rejectCard: {
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  rejectTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#991B1B',
    marginBottom: 6,
  },
  rejectInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: 6,
    padding: 10,
    height: 70,
    fontSize: 13,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  rejectActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  cancelRejectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelRejectText: {
    color: '#64748B',
    fontWeight: '600',
    fontSize: 13,
  },
  confirmRejectBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  confirmRejectText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  lockedNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFBEB',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 16,
  },
  lockedNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    lineHeight: 17,
  },
  btn: {
    height: 48,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
    ...Shadows.md,
  },
  pdfBtn: { backgroundColor: '#D97706' },
  submitBtn: { backgroundColor: Colors.primary },
  btnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  continueDraftBtn: {
    backgroundColor: '#0284C7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  continueDraftBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  userPresenceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  userPresenceAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0F2027',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  userPresenceInitials: {
    color: '#D4AF37',
    fontSize: 14,
    fontWeight: '700',
  },
  presenceDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#16A34A',
  },
  presenceStatus: {
    fontSize: 10,
    color: '#16A34A',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  presenceName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  presenceRole: {
    fontSize: 11,
    color: '#64748B',
  },
  presenceEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  presenceEditBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
