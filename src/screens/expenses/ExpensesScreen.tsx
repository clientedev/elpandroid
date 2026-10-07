import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  Modal, TextInput, RefreshControl, Alert, ScrollView, Image, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { 
  getLocalReembolsos, saveLocalReembolso, addToSyncQueue, 
  getLocalProjetos, updateLocalReembolsoStatus 
} from '../../database/db';
import { takePhoto, pickImage, readPhotoBase64 } from '../../services/imageService';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { Reembolso, Projeto } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

export const ExpensesScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const { isOnline, triggerSync } = useNetwork();

  const [reembolsos, setReembolsos] = useState<Reembolso[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Perfil Master / Diretoria
  const isMaster = Boolean(
    user?.is_master || 
    (user as any)?.role === 'master' || 
    (user as any)?.role === 'admin' || 
    (user as any)?.is_admin ||
    user?.username?.toLowerCase() === 'admin'
  );

  // New Expense form
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [km, setKm] = useState('');
  const [valorKm, setValorKm] = useState('1.20');
  const [alimentacao, setAlimentacao] = useState('');
  const [hospedagem, setHospedagem] = useState('');
  const [outros, setOutros] = useState('');
  const [obs, setObs] = useState('');
  const [comprovanteUri, setComprovanteUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [processingAction, setProcessingAction] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const data = await getLocalReembolsos();
      setReembolsos(data);
      const projs = await getLocalProjetos();
      setProjetos(projs);
    } catch (e) {
      console.warn('Erro ao carregar reembolsos:', e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleAttachPhotoCamera() {
    const p = await takePhoto('Comprovante Reembolso');
    if (p) setComprovanteUri(p.uri);
  }

  async function handleAttachPhotoGallery() {
    const p = await pickImage('Comprovante Reembolso');
    if (p) setComprovanteUri(p.uri);
  }

  async function handleCreateExpense() {
    setLoading(true);
    try {
      const expId = Date.now();
      const proj = projetos.find(p => p.id === selectedProjectId);

      const nKm = parseFloat(km) || 0;
      const nValorKm = parseFloat(valorKm) || 1.20;
      const nAlim = parseFloat(alimentacao) || 0;
      const nHosp = parseFloat(hospedagem) || 0;
      const nOutros = parseFloat(outros) || 0;
      const total = (nKm * nValorKm) + nAlim + nHosp + nOutros;

      let b64: string | undefined = undefined;
      if (comprovanteUri) {
        b64 = await readPhotoBase64(comprovanteUri).catch(() => undefined);
      }

      const newExp: Reembolso = {
        id: expId,
        usuario_id: user?.id || 1,
        usuario_nome: user?.username || 'Colaborador',
        projeto_id: selectedProjectId || undefined,
        projeto_nome: proj?.nome || 'Deslocamento Geral',
        periodo_inicio: new Date().toISOString().substring(0, 10),
        periodo_fim: new Date().toISOString().substring(0, 10),
        quilometragem: nKm,
        valor_km: nValorKm,
        alimentacao: nAlim,
        hospedagem: nHosp,
        outros_gastos: nOutros,
        total: total,
        status: 'Pendente',
        observacoes: obs.trim(),
        comprovante_uri: comprovanteUri || undefined,
        comprovante_base64: b64,
        sync_status: 'pending',
      };

      await saveLocalReembolso(newExp, 'pending');

      await addToSyncQueue(
        'reembolso',
        expId,
        'create',
        '/api/reembolsos',
        'POST',
        newExp
      );

      if (isOnline) triggerSync();

      // Reset
      setKm('');
      setAlimentacao('');
      setHospedagem('');
      setOutros('');
      setObs('');
      setComprovanteUri(null);
      setModalVisible(false);

      await loadData();
      Alert.alert('Sucesso', 'Solicitação de reembolso salva com sucesso!');
    } catch (err: any) {
      Alert.alert('Erro ao Salvar', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApproveExpense(expId: number) {
    if (!isMaster) return;
    setProcessingAction(expId);
    try {
      await updateLocalReembolsoStatus(expId, 'Aprovado', user?.username || 'Gestor Master');
      await addToSyncQueue('reembolso', expId, 'approve', `/api/reembolsos/${expId}/status`, 'POST', {
        status: 'Aprovado',
        aprovado_por_nome: user?.username || 'Gestor Master',
      });
      if (isOnline) triggerSync();
      await loadData();
      Alert.alert('Sucesso', 'Despesa homologada e aprovada com sucesso!');
    } catch (err: any) {
      Alert.alert('Erro', err.message);
    } finally {
      setProcessingAction(null);
    }
  }

  async function handleRejectExpense(expId: number) {
    if (!isMaster) return;
    setProcessingAction(expId);
    try {
      await updateLocalReembolsoStatus(expId, 'Rejeitado', user?.username || 'Gestor Master');
      await addToSyncQueue('reembolso', expId, 'reject', `/api/reembolsos/${expId}/status`, 'POST', {
        status: 'Rejeitado',
        aprovado_por_nome: user?.username || 'Gestor Master',
      });
      if (isOnline) triggerSync();
      await loadData();
      Alert.alert('Sucesso', 'Despesa rejeitada.');
    } catch (err: any) {
      Alert.alert('Erro', err.message);
    } finally {
      setProcessingAction(null);
    }
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <Header 
        title="Reembolsos" 
        subtitle="Despesas de deslocamento & alimentação"
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity 
            style={styles.addBtn}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />
      <OfflineBanner />

      <FlatList
        data={reembolsos}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Nenhum reembolso cadastrado</Text>
            <Text style={styles.emptySub}>Toque no botão + acima para cadastrar quilometragem ou despesas da obra.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.dateText}>Data: {item.periodo_inicio}</Text>
              <SyncStatusBadge status={item.sync_status} />
            </View>

            <Text style={styles.projTitle}>{item.projeto_nome || 'Geral'}</Text>
            <Text style={styles.userLabel}>Solicitante: {item.usuario_nome || 'Colaborador'}</Text>

            <View style={styles.breakdownBox}>
              {item.quilometragem > 0 && (
                <Text style={styles.breakdownText}>
                  • KM: {item.quilometragem} km x R$ {item.valor_km.toFixed(2)} = R$ {(item.quilometragem * item.valor_km).toFixed(2)}
                </Text>
              )}
              {item.alimentacao > 0 && (
                <Text style={styles.breakdownText}>• Alimentação: R$ {item.alimentacao.toFixed(2)}</Text>
              )}
              {item.hospedagem > 0 && (
                <Text style={styles.breakdownText}>• Hospedagem: R$ {item.hospedagem.toFixed(2)}</Text>
              )}
              {item.outros_gastos > 0 && (
                <Text style={styles.breakdownText}>• Outros / Pedágio: R$ {item.outros_gastos.toFixed(2)}</Text>
              )}
            </View>

            {/* Comprovante Anexo (se houver) */}
            {item.comprovante_uri && (
              <View style={styles.comprovanteThumbWrapper}>
                <Ionicons name="document-attach" size={16} color="#0284C7" />
                <Text style={styles.comprovanteThumbText}>Comprovante Fiscal Anexado</Text>
                <Image source={{ uri: item.comprovante_uri }} style={styles.receiptSmallImg} resizeMode="cover" />
              </View>
            )}

            <View style={styles.cardFooter}>
              <View style={[
                styles.statusTag, 
                item.status === 'Aprovado' ? styles.statusApproved : item.status === 'Rejeitado' ? styles.statusRejected : styles.statusPending
              ]}>
                <Text style={styles.statusTagText}>{item.status}</Text>
              </View>

              <Text style={styles.totalText}>
                Total: R$ {(item.total || 0).toFixed(2)}
              </Text>
            </View>

            {item.aprovado_por_nome && (
              <Text style={styles.homologadoText}>
                Homologado por: {item.aprovado_por_nome}
              </Text>
            )}

            {/* Mesa de Homologação do Gestor Master (Seção 11.2 e 15.12) */}
            {isMaster && item.status === 'Pendente' && (
              <View style={styles.masterApprovalBox}>
                <Text style={styles.masterApprovalTitle}>Decisão do Gestor Master:</Text>
                <View style={styles.masterApprovalButtonsRow}>
                  <TouchableOpacity 
                    style={[styles.btnMasterApprove, processingAction === item.id && { opacity: 0.6 }]}
                    onPress={() => handleApproveExpense(item.id)}
                    disabled={processingAction === item.id}
                  >
                    <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                    <Text style={styles.btnMasterActionText}>Aprovar Despesa</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.btnMasterReject, processingAction === item.id && { opacity: 0.6 }]}
                    onPress={() => handleRejectExpense(item.id)}
                    disabled={processingAction === item.id}
                  >
                    <Ionicons name="close-circle" size={16} color="#FFFFFF" />
                    <Text style={styles.btnMasterActionText}>Rejeitar Despesa</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
      />

      {/* Modal Novo Reembolso */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Solicitar Reembolso</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Obra Atendida:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {projetos.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.chip, selectedProjectId === p.id && styles.chipActive]}
                      onPress={() => setSelectedProjectId(p.id)}
                    >
                      <Text style={[styles.chipText, selectedProjectId === p.id && styles.chipTextActive]}>
                        {p.nome}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>KM Percorrido:</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="Ex: 45"
                    value={km}
                    onChangeText={setKm}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Valor por KM (R$):</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={valorKm}
                    onChangeText={setValorKm}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Alimentação (R$):</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="0.00"
                    value={alimentacao}
                    onChangeText={setAlimentacao}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Hospedagem (R$):</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="0.00"
                    value={hospedagem}
                    onChangeText={setHospedagem}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Outros Gastos / Pedágio (R$):</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="0.00"
                  value={outros}
                  onChangeText={setOutros}
                />
              </View>

              {/* Upload de Comprovantes Fiscais (Câmera / Galeria - Seção 11.1 e 15.12) */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Comprovante Fiscal (Cupom / Nota):</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <TouchableOpacity style={styles.receiptAttachBtn} onPress={handleAttachPhotoCamera}>
                    <Ionicons name="camera" size={18} color="#FFFFFF" />
                    <Text style={styles.receiptAttachBtnText}>Foto Cupom</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.receiptAttachBtn, { backgroundColor: '#475569' }]} onPress={handleAttachPhotoGallery}>
                    <Ionicons name="images" size={18} color="#FFFFFF" />
                    <Text style={styles.receiptAttachBtnText}>Galeria</Text>
                  </TouchableOpacity>
                </View>
                {comprovanteUri && (
                  <View style={styles.previewBox}>
                    <Image source={{ uri: comprovanteUri }} style={styles.previewImg} resizeMode="cover" />
                    <TouchableOpacity style={styles.removeReceiptBtn} onPress={() => setComprovanteUri(null)}>
                      <Ionicons name="trash" size={16} color="#EF4444" />
                      <Text style={styles.removeReceiptText}>Remover</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Observações:</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  multiline
                  numberOfLines={2}
                  placeholder="Descreva o motivo da despesa ou detalhes do trajeto..."
                  value={obs}
                  onChangeText={setObs}
                />
              </View>

              {/* Disposição de Botões do Modal: Cancelar à esquerda e Enviar Solicitação à direita (Seção 15.12) */}
              <View style={styles.modalButtonsRow}>
                <TouchableOpacity 
                  style={styles.modalCancelBtn}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.modalCancelBtnText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.modalSubmitBtn, loading && { opacity: 0.7 }]}
                  onPress={handleCreateExpense}
                  disabled={loading}
                >
                  <Text style={styles.modalSubmitBtnText}>
                    {loading ? 'Enviando...' : 'Enviar Solicitação'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  addBtn: {
    backgroundColor: Colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    marginBottom: 6,
  },
  dateText: { fontSize: 12, color: Colors.textMuted },
  projTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text, marginBottom: 2 },
  userLabel: { fontSize: 12, color: '#64748B', marginBottom: 8 },
  breakdownBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  breakdownText: { fontSize: 12, color: '#475569', marginBottom: 2 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  statusTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusApproved: { backgroundColor: '#D1FAE5' },
  statusPending: { backgroundColor: '#FEF3C7' },
  statusRejected: { backgroundColor: '#FEE2E2' },
  statusTagText: { fontSize: 11, fontWeight: 'bold', color: '#1E293B' },
  totalText: { fontSize: 15, fontWeight: 'bold', color: Colors.primary },
  homologadoText: { fontSize: 11, color: '#15803D', fontStyle: 'italic', marginTop: 4 },
  
  // Master Approval Section
  masterApprovalBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  masterApprovalTitle: { fontSize: 12, fontWeight: 'bold', color: '#334155', marginBottom: 6 },
  masterApprovalButtonsRow: { flexDirection: 'row', gap: 8 },
  btnMasterApprove: {
    flex: 1,
    height: 38,
    backgroundColor: '#16A34A',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnMasterReject: {
    flex: 1,
    height: 38,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnMasterActionText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 },

  // Comprovante
  comprovanteThumbWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F9FF',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  comprovanteThumbText: { fontSize: 12, color: '#0369A1', flex: 1, fontWeight: '600' },
  receiptSmallImg: { width: 36, height: 36, borderRadius: 4 },
  receiptAttachBtn: {
    flex: 1,
    height: 42,
    backgroundColor: '#0284C7',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  receiptAttachBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  previewImg: { width: 60, height: 60, borderRadius: 6 },
  removeReceiptBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 },
  removeReceiptText: { color: '#EF4444', fontSize: 12, fontWeight: 'bold' },

  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text, marginTop: 12 },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
  },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.text },
  inputGroup: { marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 4 },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: Colors.text,
  },
  textArea: { height: 60, textAlignVertical: 'top', paddingVertical: 8 },
  chipScroll: { flexDirection: 'row', marginTop: 4 },
  chip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },

  // Modal Buttons: Cancelar à esquerda e Enviar Solicitação à direita (Seção 15.12)
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    marginBottom: 20,
  },
  modalCancelBtn: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  modalCancelBtnText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalSubmitBtn: {
    flex: 1.5,
    height: 48,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  modalSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

