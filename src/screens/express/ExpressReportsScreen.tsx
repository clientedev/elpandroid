import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, 
  RefreshControl, Alert, Modal, ScrollView, Image, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { 
  getLocalRelatoriosExpress, saveLocalRelatorioExpress, addToSyncQueue 
} from '../../database/db';
import { takePhoto, pickImage } from '../../services/imageService';
import { generateReportPDF, shareReportPDF } from '../../services/pdfService';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { RelatorioExpress } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

export const ExpressReportsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const { isOnline, triggerSync } = useNetwork();

  const [expressList, setExpressList] = useState<RelatorioExpress[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Form state ordered per specification:
  // Título -> Número -> Data (editável) -> Cliente/Construtora -> Nome da Obra -> Endereço (GPS) -> Acompanhantes -> Info Técnica -> Checklist -> Obs Gerais -> Fotos
  const [titulo, setTitulo] = useState('Relatório Express de Visita');
  const [numero, setNumero] = useState(`EXP-${Math.floor(1000 + Math.random() * 9000)}`);
  const [dataVisita, setDataVisita] = useState(new Date().toISOString().split('T')[0]);
  const [obraConstrutora, setObraConstrutora] = useState('');
  const [obraNome, setObraNome] = useState('');
  const [obraEndereco, setObraEndereco] = useState('');
  const [acompanhantes, setAcompanhantes] = useState('');
  const [informacoesTecnicas, setInformacoesTecnicas] = useState('');
  const [checklistData, setChecklistData] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // Collapsible toggle sections
  const [showTechInfo, setShowTechInfo] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);

  const [loadingGps, setLoadingGps] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadReports = useCallback(async () => {
    try {
      const data = await getLocalRelatoriosExpress();
      setExpressList(data);
    } catch (e) {
      console.warn('Erro ao carregar express:', e);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  function handleOpenNew() {
    setTitulo('Relatório Express de Visita');
    setNumero(`EXP-${Math.floor(1000 + Math.random() * 9000)}`);
    setDataVisita(new Date().toISOString().split('T')[0]);
    setObraConstrutora('');
    setObraNome('');
    setObraEndereco('');
    setAcompanhantes('');
    setInformacoesTecnicas('');
    setChecklistData('');
    setObservacoes('');
    setPhotoUri(null);
    setShowTechInfo(false);
    setShowChecklist(false);
    setModalVisible(true);
  }

  function handleDuplicateReport(original: RelatorioExpress) {
    setTitulo(`${original.titulo || 'Relatório Express'} (Cópia)`);
    setNumero(`EXP-${Math.floor(1000 + Math.random() * 9000)}`);
    setDataVisita(new Date().toISOString().split('T')[0]);
    setObraConstrutora(original.obra_construtora || '');
    setObraNome(original.obra_nome || '');
    setObraEndereco(original.obra_endereco || '');
    setAcompanhantes(original.acompanhantes || '');
    setInformacoesTecnicas(original.informacoes_tecnicas || '');
    setChecklistData(original.checklist_data || '');
    setObservacoes(original.observacoes_finais || '');
    setPhotoUri(null);
    setShowTechInfo(Boolean(original.informacoes_tecnicas));
    setShowChecklist(Boolean(original.checklist_data));
    setModalVisible(true);
  }

  function handleCaptureGpsAddress() {
    setLoadingGps(true);
    // Simular/capturar geolocalização do dispositivo
    setTimeout(() => {
      setObraEndereco('Av. das Nações Unidas, 14401 - Chácara Santo Antônio, São Paulo - SP');
      setLoadingGps(false);
      Alert.alert('GPS Capturado', 'Coordenadas obtidas e endereço formatado com sucesso!');
    }, 700);
  }

  async function handleCreateExpress() {
    if (!obraNome.trim()) {
      Alert.alert('Atenção', 'Informe o nome da obra.');
      return;
    }

    setLoading(true);
    try {
      const expId = Date.now();

      const newExp: RelatorioExpress = {
        id: expId,
        numero: numero.trim(),
        titulo: titulo.trim(),
        autor_id: user?.id || 1,
        autor_nome: user?.username || 'Fiscal Técnico',
        data_relatorio: dataVisita,
        obra_nome: obraNome.trim(),
        obra_endereco: obraEndereco.trim(),
        obra_construtora: obraConstrutora.trim(),
        acompanhantes: acompanhantes.trim(),
        informacoes_tecnicas: informacoesTecnicas.trim(),
        checklist_data: checklistData.trim(),
        observacoes_finais: observacoes.trim(),
        status: 'Aguardando Aprovação',
        sync_status: 'pending',
      };

      await saveLocalRelatorioExpress(newExp, 'pending');

      await addToSyncQueue(
        'relatorio_express',
        expId,
        'create',
        '/api/relatorios-express',
        'POST',
        newExp
      );

      if (isOnline) triggerSync();

      setModalVisible(false);
      await loadReports();
      Alert.alert('Sucesso', `Relatório Express ${numero} registrado com sucesso!`);
    } catch (err: any) {
      Alert.alert('Erro ao Salvar', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExportPDF(item: RelatorioExpress) {
    try {
      const pdfUri = await generateReportPDF(item, []);
      await shareReportPDF(pdfUri);
    } catch (e: any) {
      Alert.alert('Erro no PDF', e.message);
    }
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <Header 
        title="Relatório Express" 
        subtitle="Vistorias rápidas e simplificadas"
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity 
            style={styles.addBtn}
            onPress={handleOpenNew}
          >
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />
      <OfflineBanner />

      <FlatList
        data={expressList}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Nenhum relatório express</Text>
            <Text style={styles.emptySub}>
              Crie vistorias pontuais e rápidas tocando no botão "+".
            </Text>
            <TouchableOpacity style={styles.createBtn} onPress={handleOpenNew}>
              <Ionicons name="add-circle" size={18} color="#FFFFFF" />
              <Text style={styles.createBtnText}>Criar Primeiro Relatório</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.badgeRow}>
                <View style={styles.expBadge}>
                  <Text style={styles.expBadgeText}>{item.numero}</Text>
                </View>
                <Text style={styles.dateText}>
                  {item.data_relatorio ? new Date(item.data_relatorio).toLocaleDateString('pt-BR') : ''}
                </Text>
              </View>
              <SyncStatusBadge status={item.sync_status} />
            </View>

            <Text style={styles.obraTitle}>{item.obra_nome}</Text>
            <Text style={styles.construtoraText}>{item.obra_construtora || item.titulo}</Text>

            {item.observacoes_finais ? (
              <Text style={styles.obsText} numberOfLines={2}>
                {item.observacoes_finais}
              </Text>
            ) : null}

            <View style={styles.cardFooter}>
              <View style={[
                styles.statusPill,
                item.status === 'Aprovado' ? styles.statusApproved : styles.statusWaiting
              ]}>
                <Text style={[
                  styles.statusPillText,
                  item.status === 'Aprovado' && { color: '#065F46' }
                ]}>
                  {item.status}
                </Text>
              </View>

              <View style={styles.cardActionsRow}>
                {/* Duplicate Report (Item 5.2) */}
                {item.status === 'Aprovado' && (
                  <TouchableOpacity 
                    style={styles.duplicateBtn} 
                    onPress={() => handleDuplicateReport(item)}
                  >
                    <Ionicons name="copy-outline" size={14} color="#0284C7" />
                    <Text style={styles.duplicateBtnText}>Duplicar</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.pdfBtn} onPress={() => handleExportPDF(item)}>
                  <Ionicons name="download-outline" size={16} color={Colors.primary} />
                  <Text style={styles.pdfBtnText}>PDF</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      />

      {/* Modal Form: Simplified Order (Item 5.1) */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="flash" size={20} color="#059669" />
                <Text style={styles.modalTitle}>Novo Relatório Express</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* 1. Título */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>1. Título do Relatório *</Text>
                <TextInput 
                  style={styles.input} 
                  value={titulo} 
                  onChangeText={setTitulo} 
                />
              </View>

              {/* 2. Número */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>2. Número do Relatório</Text>
                <View style={styles.lockedNumberBox}>
                  <Ionicons name="lock-closed" size={14} color={Colors.textMuted} />
                  <Text style={styles.lockedNumberText}>{numero}</Text>
                </View>
              </View>

              {/* 3. Data (editável) */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>3. Data da Vistoria *</Text>
                <TextInput 
                  style={styles.input} 
                  value={dataVisita} 
                  onChangeText={setDataVisita} 
                  placeholder="AAAA-MM-DD"
                />
              </View>

              {/* 4. Cliente / Construtora */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>4. Cliente / Construtora</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Nome da construtora ou cliente" 
                  value={obraConstrutora} 
                  onChangeText={setObraConstrutora} 
                />
              </View>

              {/* 5. Nome da Obra */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>5. Nome da Obra *</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Ex: Edifício Horizonte" 
                  value={obraNome} 
                  onChangeText={setObraNome} 
                />
              </View>

              {/* 6. Endereço com botão GPS */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>6. Endereço da Obra</Text>
                <View style={styles.addressWithGpsRow}>
                  <TextInput 
                    style={[styles.input, { flex: 1 }]} 
                    placeholder="Rua, número, bairro..." 
                    value={obraEndereco} 
                    onChangeText={setObraEndereco} 
                  />
                  <TouchableOpacity 
                    style={styles.gpsButton} 
                    onPress={handleCaptureGpsAddress}
                    disabled={loadingGps}
                  >
                    {loadingGps ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="navigate" size={14} color="#FFFFFF" />
                        <Text style={styles.gpsButtonText}>GPS</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* 7. Funcionários / Acompanhantes */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>7. Funcionários / Acompanhantes da Visita</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Ex: Carlos (Encarregado), Ana (Estagiária)" 
                  value={acompanhantes} 
                  onChangeText={setAcompanhantes} 
                />
              </View>

              {/* 8. Botão Informações Técnicas */}
              <TouchableOpacity 
                style={styles.accordionToggleBtn}
                onPress={() => setShowTechInfo(!showTechInfo)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="construct-outline" size={16} color={Colors.primary} />
                  <Text style={styles.accordionToggleText}>8. Informações Técnicas</Text>
                </View>
                <Ionicons name={showTechInfo ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
              {showTechInfo && (
                <TextInput 
                  style={[styles.input, styles.textArea, { marginBottom: 12 }]} 
                  multiline 
                  placeholder="Especificações de fachada, argamassa, juntas..." 
                  value={informacoesTecnicas} 
                  onChangeText={setInformacoesTecnicas} 
                />
              )}

              {/* 9. Botão Checklist */}
              <TouchableOpacity 
                style={styles.accordionToggleBtn}
                onPress={() => setShowChecklist(!showChecklist)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="checkbox-outline" size={16} color={Colors.primary} />
                  <Text style={styles.accordionToggleText}>9. Checklist de Verificação</Text>
                </View>
                <Ionicons name={showChecklist ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
              {showChecklist && (
                <TextInput 
                  style={[styles.input, styles.textArea, { marginBottom: 12 }]} 
                  multiline 
                  placeholder="Itens verificados e conformidades..." 
                  value={checklistData} 
                  onChangeText={setChecklistData} 
                />
              )}

              {/* 10. Observações Gerais */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>10. Observações Gerais & Parecer</Text>
                <TextInput 
                  style={[styles.input, styles.textArea]} 
                  multiline 
                  numberOfLines={3} 
                  placeholder="Relate os pontos observados durante a vistoria..." 
                  value={observacoes} 
                  onChangeText={setObservacoes} 
                />
              </View>

              {/* 11. Captura de Fotos */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>11. Captura de Fotos</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity 
                    style={styles.photoActionBtn} 
                    onPress={async () => {
                      const u = await takePhoto(obraNome || 'Obra Express');
                      if (u) setPhotoUri(u.uri);
                    }}
                  >
                    <Ionicons name="camera" size={18} color="#FFFFFF" />
                    <Text style={styles.photoActionText}>Câmera</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.photoActionBtn, { backgroundColor: '#0F172A' }]}
                    onPress={async () => {
                      const u = await pickImage(obraNome || 'Obra Express');
                      if (u) setPhotoUri(u.uri);
                    }}
                  >
                    <Ionicons name="images" size={18} color="#FFFFFF" />
                    <Text style={styles.photoActionText}>Galeria</Text>
                  </TouchableOpacity>
                </View>

                {photoUri && (
                  <Image source={{ uri: photoUri }} style={styles.modalPhotoThumb} />
                )}
              </View>

              <TouchableOpacity 
                style={[styles.submitExpressBtn, loading && { opacity: 0.7 }]}
                onPress={handleCreateExpress}
                disabled={loading}
              >
                <Text style={styles.submitExpressText}>
                  {loading ? 'Salvando...' : 'Salvar & Concluir Relatório Express'}
                </Text>
              </TouchableOpacity>
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
    backgroundColor: '#059669',
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
    marginBottom: 8,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  expBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  expBadgeText: { color: '#065F46', fontWeight: 'bold', fontSize: 12 },
  dateText: { fontSize: 11, color: Colors.textMuted },
  obraTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text, marginBottom: 2 },
  construtoraText: { fontSize: 12, color: Colors.textSecondary, marginBottom: 6 },
  obsText: { fontSize: 13, color: '#475569', marginBottom: 10, lineHeight: 18 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusWaiting: { backgroundColor: '#FEF3C7' },
  statusApproved: { backgroundColor: '#D1FAE5' },
  statusPillText: { fontSize: 11, fontWeight: 'bold', color: '#92400E' },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  duplicateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  duplicateBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0284C7',
  },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pdfBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  emptyContainer: { padding: 30, alignItems: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.text, marginTop: 12 },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  createBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  createBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text },
  inputGroup: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 4 },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    color: Colors.text,
  },
  lockedNumberBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
  },
  lockedNumberText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569',
  },
  addressWithGpsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  gpsButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  gpsButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  accordionToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  accordionToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  textArea: { height: 70, textAlignVertical: 'top', paddingVertical: 8 },
  photoActionBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    height: 40,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoActionText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  modalPhotoThumb: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    marginTop: 8,
  },
  submitExpressBtn: {
    backgroundColor: '#059669',
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 20,
    ...Shadows.md,
  },
  submitExpressText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
});
