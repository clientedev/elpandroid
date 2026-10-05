import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, 
  RefreshControl, Alert, Modal, ScrollView, Image 
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

  // New Express Report Form State
  const [obraNome, setObraNome] = useState('');
  const [obraEndereco, setObraEndereco] = useState('');
  const [obraConstrutora, setObraConstrutora] = useState('');
  const [titulo, setTitulo] = useState('Vistoria Express');
  const [categoria, setCategoria] = useState('Geral');
  const [observacoes, setObservacoes] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
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

  async function handleCreateExpress() {
    if (!obraNome.trim()) {
      Alert.alert('Atenção', 'Informe o nome da obra / local.');
      return;
    }

    setLoading(true);
    try {
      const expId = Date.now();
      const expNum = `EXP-${Math.floor(1000 + Math.random() * 9000)}`;

      const newExp: RelatorioExpress = {
        id: expId,
        numero: expNum,
        titulo: titulo.trim(),
        autor_id: user?.id || 1,
        autor_nome: user?.username || 'Fiscal',
        data_relatorio: new Date().toISOString(),
        obra_nome: obraNome.trim(),
        obra_endereco: obraEndereco.trim(),
        obra_construtora: obraConstrutora.trim(),
        categoria: categoria,
        observacoes_finais: observacoes.trim(),
        status: 'Aguardando Aprovação',
        sync_status: 'pending',
      };

      await saveLocalRelatorioExpress(newExp, 'pending');

      await addToSyncQueue(
        'relatorio_express',
        expId,
        'create',
        '/express/api/relatorios',
        'POST',
        newExp
      );

      if (isOnline) triggerSync();

      // Reset form
      setObraNome('');
      setObraEndereco('');
      setObraConstrutora('');
      setObservacoes('');
      setPhotoUri(null);
      setModalVisible(false);

      await loadReports();
      Alert.alert('Sucesso', `Relatório Express ${expNum} criado e enviado com sucesso!`);
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
        title="Relatórios Express" 
        subtitle="Vistorias rápidas independentes"
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity 
            style={styles.addBtn}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="flash" size={20} color="#FFFFFF" />
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
            <Ionicons name="flash-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Nenhum Relatório Express</Text>
            <Text style={styles.emptySub}>
              O Relatório Express permite criar uma vistoria instantânea no canteiro sem necessidade de cadastrar a obra previamente.
            </Text>
            <TouchableOpacity style={styles.createBtn} onPress={() => setModalVisible(true)}>
              <Text style={styles.createBtnText}>Criar Relatório Express Agora</Text>
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
                <SyncStatusBadge status={item.sync_status} />
              </View>
              <Text style={styles.dateText}>
                {new Date(item.data_relatorio).toLocaleDateString('pt-BR')}
              </Text>
            </View>

            <Text style={styles.obraTitle}>{item.obra_nome}</Text>
            {item.obra_construtora ? (
              <Text style={styles.construtoraText}>Construtora: {item.obra_construtora}</Text>
            ) : null}

            {item.observacoes_finais ? (
              <Text style={styles.obsText} numberOfLines={2}>{item.observacoes_finais}</Text>
            ) : null}

            <View style={styles.cardFooter}>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>{item.status}</Text>
              </View>

              <TouchableOpacity style={styles.pdfBtn} onPress={() => handleExportPDF(item)}>
                <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
                <Text style={styles.pdfBtnText}>Gerar PDF</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* New Express Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
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
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Nome da Obra / Local *</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Ex: Edifício Torre Sul" 
                  value={obraNome} 
                  onChangeText={setObraNome} 
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Endereço da Obra</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Rua, número, cidade" 
                  value={obraEndereco} 
                  onChangeText={setObraEndereco} 
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Construtora</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Nome da construtora" 
                  value={obraConstrutora} 
                  onChangeText={setObraConstrutora} 
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Foto Rápida</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity 
                    style={styles.photoActionBtn} 
                    onPress={async () => {
                      const u = await takePhoto();
                      if (u) setPhotoUri(u);
                    }}
                  >
                    <Ionicons name="camera" size={18} color="#FFFFFF" />
                    <Text style={styles.photoActionText}>Câmera</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.photoActionBtn, { backgroundColor: '#0F172A' }]}
                    onPress={async () => {
                      const u = await pickImage();
                      if (u) setPhotoUri(u);
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

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Parecer Técnico / Observações</Text>
                <TextInput 
                  style={[styles.input, styles.textArea]} 
                  multiline 
                  numberOfLines={3} 
                  placeholder="Relate os pontos observados..." 
                  value={observacoes} 
                  onChangeText={setObservacoes} 
                />
              </View>

              <TouchableOpacity 
                style={[styles.submitExpressBtn, loading && { opacity: 0.7 }]}
                onPress={handleCreateExpress}
                disabled={loading}
              >
                <Text style={styles.submitExpressText}>
                  {loading ? 'Salvando...' : 'Salvar & Submeter Express'}
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
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillText: { fontSize: 11, fontWeight: 'bold', color: '#92400E' },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pdfBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  emptyContainer: { padding: 30, alignItems: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.text, marginTop: 12 },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  createBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 18,
  },
  createBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
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
  textArea: { height: 72, textAlignVertical: 'top', paddingVertical: 8 },
  photoActionBtn: {
    flex: 1,
    backgroundColor: '#059669',
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
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  submitExpressText: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
});
