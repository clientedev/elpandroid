import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  Alert, RefreshControl, Modal, TextInput 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { 
  getLocalRelatorios, updateLocalRelatorioStatus, addToSyncQueue,
  getLocalFotos, saveBatchChecklistProgressoObra 
} from '../../database/db';
import { generateReportPDF } from '../../services/pdfService';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { Relatorio } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

export const ApprovalDashboardScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const { isOnline, triggerSync } = useNetwork();

  const [pendingReports, setPendingReports] = useState<Relatorio[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Approval modal
  const [selectedReport, setSelectedReport] = useState<Relatorio | null>(null);
  const [modalAction, setModalAction] = useState<'Aprovado' | 'Rejeitado'>('Aprovado');
  const [comment, setComment] = useState('');
  const [showModal, setShowModal] = useState(false);

  const loadPending = useCallback(async () => {
    try {
      const data = await getLocalRelatorios();
      setPendingReports(data.filter(r => r.status === 'Aguardando Aprovação'));
    } catch (e) {
      console.warn('Erro ao carregar aprovações:', e);
    }
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  async function handleConfirmAction() {
    if (!selectedReport) return;
    if (modalAction === 'Rejeitado' && !comment.trim()) {
      Alert.alert('Justificativa Obrigatória', 'Informe o motivo da rejeição do relatório.');
      return;
    }

    try {
      await updateLocalRelatorioStatus(
        selectedReport.id,
        modalAction,
        comment.trim(),
        user?.id,
        user?.username,
        'pending'
      );

      await addToSyncQueue(
        'relatorio',
        selectedReport.id,
        modalAction === 'Aprovado' ? 'approve' : 'reject',
        `/api/relatorios/${selectedReport.id}/status`,
        'POST',
        { status: modalAction, comentario: comment.trim(), aprovador_id: user?.id }
      );

      // Se for aprovado, salva histórico do checklist e PDF em background
      if (modalAction === 'Aprovado') {
        if (selectedReport.checklist_data) {
          try {
            const chkItems = typeof selectedReport.checklist_data === 'string'
              ? JSON.parse(selectedReport.checklist_data)
              : selectedReport.checklist_data;
            if (Array.isArray(chkItems)) {
              const aprovados = chkItems
                .filter((item: any) => item.checked)
                .map((item: any, idx: number) => ({
                  item_texto: item.item,
                  ordem: item.ordem || idx + 1,
                  aprovado_em_relatorio_id: selectedReport.id,
                  aprovado_em_relatorio_numero: selectedReport.numero || `REL-${selectedReport.id}`,
                  data_aprovacao: new Date().toISOString(),
                  observacao: item.observacao || null
                }));
              if (aprovados.length > 0) {
                await saveBatchChecklistProgressoObra(selectedReport.projeto_id, aprovados);
              }
            }
          } catch (chkErr) {
            console.warn('[ApprovalDashboard] Erro ao salvar progresso de checklist:', chkErr);
          }
        }

        // Gera PDF em segundo plano sem travar nem exibir alertas modais
        getLocalFotos(selectedReport.id, selectedReport.uuid)
          .then(fotos => generateReportPDF({ ...selectedReport, status: 'Aprovado' }, fotos))
          .catch(() => null);
      }

      if (isOnline) triggerSync();

      setShowModal(false);
      setComment('');
      setSelectedReport(null);
      await loadPending();
      Alert.alert('Sucesso', `Relatório marcado como ${modalAction}!`);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    }
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPending();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <Header 
        title="Painel de Aprovações" 
        subtitle={`${pendingReports.length} relatórios aguardando`}
        showBack
        onBack={() => navigation.goBack()}
      />
      <OfflineBanner />

      <FlatList
        data={pendingReports}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-done-circle-outline" size={54} color={Colors.success} />
            <Text style={styles.emptyTitle}>Tudo em dia!</Text>
            <Text style={styles.emptySub}>Não há nenhum relatório aguardando sua aprovação neste momento.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.badgeRow}>
                <View style={styles.numBadge}>
                  <Text style={styles.numText}>{item.numero}</Text>
                </View>
                <SyncStatusBadge status={item.sync_status} />
              </View>
              <Text style={styles.dateText}>
                {item.data_relatorio ? new Date(item.data_relatorio).toLocaleDateString('pt-BR') : ''}
              </Text>
            </View>

            <Text style={styles.cardTitle}>{item.titulo}</Text>
            <Text style={styles.cardSub}>Obra: {item.projeto_nome}</Text>
            <Text style={styles.authorText}>Autor: {item.autor_nome}</Text>

            {item.descricao ? (
              <Text style={styles.descText} numberOfLines={3}>{item.descricao}</Text>
            ) : null}

            <View style={styles.actionRow}>
              <TouchableOpacity 
                style={[styles.btn, styles.approveBtn]}
                onPress={() => {
                  setSelectedReport(item);
                  setModalAction('Aprovado');
                  setComment('Relatório aprovado em conformidade técnica.');
                  setShowModal(true);
                }}
              >
                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                <Text style={styles.btnText}>Aprovar</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.btn, styles.rejectBtn]}
                onPress={() => {
                  setSelectedReport(item);
                  setModalAction('Rejeitado');
                  setComment('');
                  setShowModal(true);
                }}
              >
                <Ionicons name="close" size={18} color="#FFFFFF" />
                <Text style={styles.btnText}>Rejeitar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* Action Modal */}
      <Modal visible={showModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {modalAction === 'Aprovado' ? 'Aprovar Relatório' : 'Rejeitar Relatório'}
            </Text>
            <Text style={styles.modalSub}>
              {selectedReport?.numero} - {selectedReport?.titulo}
            </Text>

            <Text style={styles.inputLabel}>
              {modalAction === 'Aprovado' ? 'Comentário (opcional):' : 'Motivo da Rejeição (obrigatório):'}
            </Text>
            <TextInput
              style={styles.modalInput}
              multiline
              numberOfLines={3}
              placeholder="Digite seu parecer..."
              value={comment}
              onChangeText={setComment}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.modalCancelBtn} 
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[
                  styles.modalConfirmBtn, 
                  modalAction === 'Aprovado' ? styles.approveBg : styles.rejectBg
                ]} 
                onPress={handleConfirmAction}
              >
                <Text style={styles.modalConfirmText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { padding: 16 },
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
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  numBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  numText: { color: Colors.primary, fontWeight: 'bold', fontSize: 12 },
  dateText: { fontSize: 11, color: Colors.textMuted },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text, marginBottom: 2 },
  cardSub: { fontSize: 13, color: Colors.textSecondary, marginBottom: 2 },
  authorText: { fontSize: 12, color: '#475569', marginBottom: 8 },
  descText: { fontSize: 13, color: '#64748B', marginBottom: 12, lineHeight: 18 },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  btn: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  approveBtn: { backgroundColor: '#10B981' },
  rejectBtn: { backgroundColor: '#EF4444' },
  btnText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  emptyContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.text, marginTop: 12 },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    ...Shadows.lg,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text },
  modalSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 2, marginBottom: 14 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 6 },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 10,
    height: 70,
    textAlignVertical: 'top',
    fontSize: 13,
    marginBottom: 16,
  },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: { fontSize: 14, fontWeight: 'bold', color: Colors.textSecondary },
  modalConfirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBg: { backgroundColor: '#10B981' },
  rejectBg: { backgroundColor: '#EF4444' },
  modalConfirmText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
});
