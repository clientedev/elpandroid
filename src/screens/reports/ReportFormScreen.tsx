import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, 
  Image, Alert, Modal, FlatList 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { 
  getLocalProjetos, saveLocalRelatorio, saveLocalFoto, 
  addToSyncQueue, getLocalLegendas 
} from '../../database/db';
import { takePhoto, pickImage } from '../../services/imageService';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { Projeto, Relatorio, FotoRelatorio, LegendaPredefinida } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

export const ReportFormScreen: React.FC<{ route?: any; navigation: any }> = ({ route, navigation }) => {
  const { user } = useAuth();
  const { isOnline, triggerSync } = useNetwork();
  const preSelectedProjectId = route?.params?.preSelectedProjectId;
  const preSelectedVisitId = route?.params?.preSelectedVisitId;

  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(preSelectedProjectId || null);
  const [titulo, setTitulo] = useState('Relatório de Vistoria Técnica');
  const [categoria, setCategoria] = useState('Geral');
  const [local, setLocal] = useState('Fachada Principal');
  const [descricao, setDescricao] = useState('');
  const [observacoesFinais, setObservacoesFinais] = useState('');
  const [fotos, setFotos] = useState<FotoRelatorio[]>([]);

  // Legend picker modal
  const [legendas, setLegendas] = useState<LegendaPredefinida[]>([]);
  const [showLegendModal, setShowLegendModal] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getLocalProjetos().then(p => {
      setProjetos(p);
      if (!selectedProjectId && p.length > 0 && !preSelectedProjectId) {
        setSelectedProjectId(p[0].id);
      }
    });
    getLocalLegendas().then(l => setLegendas(l));
  }, [preSelectedProjectId]);

  async function handleAddPhotoCamera() {
    const uri = await takePhoto();
    if (uri) {
      const newFoto: FotoRelatorio = {
        id: Date.now(),
        relatorio_id: 0,
        uri_local: uri,
        ordem: fotos.length,
        legenda: '',
        local: local,
        sync_status: 'pending',
      };
      setFotos([...fotos, newFoto]);
    }
  }

  async function handleAddPhotoGallery() {
    const uri = await pickImage();
    if (uri) {
      const newFoto: FotoRelatorio = {
        id: Date.now(),
        relatorio_id: 0,
        uri_local: uri,
        ordem: fotos.length,
        legenda: '',
        local: local,
        sync_status: 'pending',
      };
      setFotos([...fotos, newFoto]);
    }
  }

  function handleSelectLegenda(legendaTexto: string) {
    if (selectedPhotoIndex !== null) {
      const updated = [...fotos];
      updated[selectedPhotoIndex].legenda = legendaTexto;
      setFotos(updated);
    }
    setShowLegendModal(false);
  }

  function handleRemovePhoto(index: number) {
    const updated = fotos.filter((_, i) => i !== index);
    setFotos(updated);
  }

  async function handleSaveReport(status: 'em_andamento' | 'Aguardando Aprovação' = 'em_andamento') {
    if (!selectedProjectId) {
      Alert.alert('Atenção', 'Selecione a obra correspondente.');
      return;
    }

    setLoading(true);
    try {
      const selectedProj = projetos.find(p => p.id === selectedProjectId);
      const reportId = Date.now();
      const reportNum = `REL-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

      const relData: Relatorio = {
        id: reportId,
        numero: reportNum,
        titulo: titulo.trim(),
        projeto_id: selectedProjectId,
        projeto_nome: selectedProj?.nome || 'Obra',
        visita_id: preSelectedVisitId || null,
        autor_id: user?.id || 1,
        autor_nome: user?.username || 'Responsável',
        data_relatorio: new Date().toISOString(),
        descricao: descricao.trim(),
        observacoes_finais: observacoesFinais.trim(),
        categoria: categoria,
        local: local,
        status: status,
        sync_status: 'pending',
      };

      // 1. Save Relatorio to SQLite
      await saveLocalRelatorio(relData, 'pending');

      // 2. Save all Photos to SQLite
      for (let i = 0; i < fotos.length; i++) {
        const f = fotos[i];
        await saveLocalFoto({
          ...f,
          relatorio_id: reportId,
          ordem: i,
        }, 'pending');
      }

      // 3. Queue sync operation for Railway backend
      await addToSyncQueue(
        'relatorio',
        reportId,
        'create',
        '/api/relatorios',
        'POST',
        relData
      );

      if (isOnline) triggerSync();

      Alert.alert(
        'Sucesso!', 
        status === 'Aguardando Aprovação' 
          ? 'Relatório salvo e enviado para aprovação!' 
          : 'Relatório salvo com sucesso no aplicativo!',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      Alert.alert('Erro ao Salvar', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Header title="Novo Relatório Técnico" showBack onBack={() => navigation.goBack()} />
      <OfflineBanner />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Section 1: Obra */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>1. Identificação da Obra</Text>

          <Text style={styles.label}>Obra / Projeto *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            {projetos.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.chip, selectedProjectId === p.id && styles.chipActive]}
                onPress={() => setSelectedProjectId(p.id)}
              >
                <Text style={[styles.chipText, selectedProjectId === p.id && styles.chipTextActive]}>
                  {p.numero} - {p.nome}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Título do Relatório *</Text>
            <TextInput style={styles.input} value={titulo} onChangeText={setTitulo} />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Categoria</Text>
              <TextInput style={styles.input} value={categoria} onChangeText={setCategoria} />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Local Específico</Text>
              <TextInput style={styles.input} value={local} onChangeText={setLocal} />
            </View>
          </View>
        </View>

        {/* Section 2: Photos */}
        <View style={styles.card}>
          <View style={styles.photoHeaderRow}>
            <Text style={styles.sectionTitle}>2. Fotos do Canteiro ({fotos.length})</Text>
          </View>

          <View style={styles.photoButtonsRow}>
            <TouchableOpacity style={styles.cameraBtn} onPress={handleAddPhotoCamera}>
              <Ionicons name="camera" size={20} color="#FFFFFF" />
              <Text style={styles.photoBtnText}>Tirar Foto (Câmera)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.galleryBtn} onPress={handleAddPhotoGallery}>
              <Ionicons name="images" size={20} color="#FFFFFF" />
              <Text style={styles.photoBtnText}>Galeria</Text>
            </TouchableOpacity>
          </View>

          {fotos.map((item, index) => (
            <View key={item.id} style={styles.photoCard}>
              <Image source={{ uri: item.uri_local }} style={styles.thumb} />
              <View style={styles.photoInfo}>
                <View style={styles.photoTopRow}>
                  <Text style={styles.photoNum}>Foto #{index + 1}</Text>
                  <TouchableOpacity onPress={() => handleRemovePhoto(index)}>
                    <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={styles.legendaInput}
                  placeholder="Escreva a legenda técnica da foto..."
                  value={item.legenda}
                  onChangeText={txt => {
                    const updated = [...fotos];
                    updated[index].legenda = txt;
                    setFotos(updated);
                  }}
                />

                <TouchableOpacity 
                  style={styles.predefBtn}
                  onPress={() => {
                    setSelectedPhotoIndex(index);
                    setShowLegendModal(true);
                  }}
                >
                  <Ionicons name="list-outline" size={14} color={Colors.primary} />
                  <Text style={styles.predefText}>Escolher Legenda Padrão</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        {/* Section 3: Technical Observations */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>3. Descrição & Parecer Técnico</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Descrição dos Serviços Verificados</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              numberOfLines={4}
              placeholder="Descreva o andamento dos serviços, testes realizados, anomalias encontradas..."
              value={descricao}
              onChangeText={setDescricao}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Recomendações e Observações Finais</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              numberOfLines={3}
              placeholder="Instruções para a construtora, prazos, alertas..."
              value={observacoesFinais}
              onChangeText={setObservacoesFinais}
            />
          </View>
        </View>

        {/* Submit Buttons */}
        <TouchableOpacity 
          style={[styles.btn, styles.submitBtn, loading && styles.btnDisabled]} 
          onPress={() => handleSaveReport('Aguardando Aprovação')}
          disabled={loading}
        >
          <Ionicons name="paper-plane" size={20} color="#FFFFFF" />
          <Text style={styles.btnText}>Enviar para Aprovação</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.btn, styles.draftBtn, loading && styles.btnDisabled]} 
          onPress={() => handleSaveReport('em_andamento')}
          disabled={loading}
        >
          <Ionicons name="save-outline" size={20} color={Colors.text} />
          <Text style={[styles.btnText, { color: Colors.text }]}>Salvar Rascunho no Celular</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Legendas Modal */}
      <Modal visible={showLegendModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Legendas Predefinidas</Text>
              <TouchableOpacity onPress={() => setShowLegendModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={legendas}
              keyExtractor={item => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.legendItem}
                  onPress={() => handleSelectLegenda(item.texto)}
                >
                  <View style={styles.legendCategoryBadge}>
                    <Text style={styles.legendCategoryText}>{item.categoria}</Text>
                  </View>
                  <Text style={styles.legendItemText}>{item.texto}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text, marginBottom: 12 },
  chipScroll: { flexDirection: 'row', marginBottom: 14 },
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
  textArea: { height: 80, textAlignVertical: 'top', paddingVertical: 8 },
  photoHeaderRow: { marginBottom: 10 },
  photoButtonsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  cameraBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    height: 44,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  galleryBtn: {
    flex: 1,
    backgroundColor: '#0F172A',
    height: 44,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  photoCard: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  thumb: { width: 90, height: 90, borderRadius: 8, backgroundColor: '#E2E8F0' },
  photoInfo: { flex: 1 },
  photoTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  photoNum: { fontSize: 12, fontWeight: 'bold', color: Colors.primary },
  legendaInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    height: 36,
    fontSize: 12,
    color: Colors.text,
  },
  predefBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  predefText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  btn: {
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
    ...Shadows.sm,
  },
  submitBtn: { backgroundColor: Colors.primary },
  draftBtn: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: Colors.border },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
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
    maxHeight: '80%',
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
  legendItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  legendCategoryBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  legendCategoryText: { fontSize: 10, fontWeight: 'bold', color: Colors.primary },
  legendItemText: { fontSize: 13, color: Colors.text },
});
