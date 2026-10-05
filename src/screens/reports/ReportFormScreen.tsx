import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, 
  Image, Alert, Modal, FlatList, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { PhotoEditorModal, PhotoAnnotationOverlay } from '../../components/PhotoEditorModal';
import { 
  getLocalProjetos, saveLocalRelatorio, saveLocalFoto, deleteLocalFoto,
  addToSyncQueue, getLocalLegendas, getLocalLembretes, saveLocalLembrete, 
  closeLocalLembrete, getLocalRelatorioById, getLocalFotos 
} from '../../database/db';
import { takePhoto, pickImage } from '../../services/imageService';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { apiClient } from '../../services/api';

import { Projeto, Relatorio, FotoRelatorio, LegendaPredefinida, Lembrete } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

interface ChecklistItemState {
  id: number;
  item: string;
  checked: boolean;
  observacao: string;
}

const DEFAULT_CHECKLIST: ChecklistItemState[] = [
  { id: 1, item: 'Chapisco colante e regularização da base estrutural', checked: false, observacao: '' },
  { id: 2, item: 'Aplicação de tela metálica / fibra de reforço e ancoragem', checked: false, observacao: '' },
  { id: 3, item: 'Aplicação e tempo de cura da argamassa de emboço', checked: false, observacao: '' },
  { id: 4, item: 'Assentamento de revestimentos cerâmicos / pastilhas de fachada', checked: false, observacao: '' },
  { id: 5, item: 'Selamento de juntas de dilatação, frisos e caimentos', checked: false, observacao: '' },
  { id: 6, item: 'Verificação de peitoris, pingadeiras, muretas e impermeabilização', checked: false, observacao: '' },
  { id: 7, item: 'Limpeza e desincrustação final da fachada', checked: false, observacao: '' },
];

export const ReportFormScreen: React.FC<{ route?: any; navigation: any }> = ({ route, navigation }) => {
  const { user } = useAuth();
  const { isOnline, triggerSync } = useNetwork();
  const preSelectedProjectId = route?.params?.preSelectedProjectId;
  const preSelectedVisitId = route?.params?.preSelectedVisitId;
  const initialReportId = route?.params?.reportId;

  const [currentReportId, setCurrentReportId] = useState<number>(initialReportId || Date.now());
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(preSelectedProjectId || null);
  const [reportUuid, setReportUuid] = useState(() => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
  const [reportNumber, setReportNumber] = useState('Pendente Sincronização');
  const [titulo, setTitulo] = useState('Relatório de Vistoria Técnica');
  const [categoria, setCategoria] = useState('Geral');
  const [local, setLocal] = useState('Fachada Principal');
  const [descricao, setDescricao] = useState('');
  const [observacoesFinais, setObservacoesFinais] = useState('');
  const [fotos, setFotos] = useState<FotoRelatorio[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItemState[]>(DEFAULT_CHECKLIST);

  // Reminders
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  const [novoLembreteTexto, setNovoLembreteTexto] = useState('');
  const [showNovoLembreteInput, setShowNovoLembreteInput] = useState(false);

  // Photo Editor Modal
  const [editingPhotoIndex, setEditingPhotoIndex] = useState<number | null>(null);
  const [showEditorModal, setShowEditorModal] = useState(false);

  // Legend picker modal
  const [legendas, setLegendas] = useState<LegendaPredefinida[]>([]);
  const [showLegendModal, setShowLegendModal] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const initializedDraftRef = React.useRef(false);

  useEffect(() => {
    getLocalProjetos().then(p => {
      setProjetos(p);
      if (!selectedProjectId && p.length > 0 && !preSelectedProjectId && !initialReportId) {
        setSelectedProjectId(p[0].id);
      }
    });
    getLocalLegendas().then(l => setLegendas(l));
  }, [preSelectedProjectId, initialReportId]);

  // Sempre que o usuário inicia um novo relatório, o rascunho é criado imediatamente
  // Se estiver ONLINE, o número oficial é reservado e atribuído pelo servidor na hora!
  useEffect(() => {
    if (!initialReportId && selectedProjectId && !initializedDraftRef.current) {
      initializedDraftRef.current = true;
      initImmediateDraft(selectedProjectId);
    }
  }, [selectedProjectId, initialReportId]);

  async function initImmediateDraft(projId: number) {
    try {
      const selectedProj = projetos.find(p => p.id === projId);
      const draftId = currentReportId;
      const initialUuid = reportUuid;
      const creationDate = new Date().toISOString();

      let assignedNumero = 'Pendente Sincronização';
      let syncStatus: 'synced' | 'pending' = 'pending';

      // 1. Se estiver ONLINE ao começar, já busca o número oficial no servidor
      if (isOnline) {
        try {
          const res = await apiClient.axios.post('/api/relatorios', {
            uuid: initialUuid,
            uuid_local: initialUuid,
            projeto_id: projId,
            titulo: titulo || 'Relatório de Vistoria Técnica',
            status: 'em_andamento',
            data_criacao_local: creationDate,
          }, { timeout: 7000 });

          if (res?.data?.numero) {
            assignedNumero = res.data.numero;
            syncStatus = 'synced';
            setReportNumber(assignedNumero);
          }
        } catch (netErr) {
          console.warn('[ReportForm] Criação online indisponível, iniciando rascunho offline:', netErr);
        }
      }

      // 2. Salva o rascunho imediatamente no SQLite local
      const draftObj: Relatorio = {
        id: draftId,
        uuid: initialUuid,
        uuid_local: initialUuid,
        numero: assignedNumero,
        titulo: titulo || 'Relatório de Vistoria Técnica',
        projeto_id: projId,
        projeto_nome: selectedProj?.nome || 'Obra',
        visita_id: preSelectedVisitId || null,
        autor_id: user?.id || 1,
        autor_nome: user?.username || 'Responsável',
        data_relatorio: creationDate,
        data_criacao_local: creationDate,
        descricao: '',
        observacoes_finais: '',
        checklist_data: JSON.stringify(checklist),
        categoria: categoria,
        local: local,
        status: 'em_andamento',
        sync_status: syncStatus,
      };

      await saveLocalRelatorio(draftObj, syncStatus);

      if (syncStatus === 'pending') {
        await addToSyncQueue('relatorio', draftId, 'create', '/api/relatorios', 'POST', draftObj);
      }

      const d = new Date();
      setLastSavedTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (e) {
      console.warn('Erro ao inicializar rascunho imediato:', e);
    }
  }

  // Load existing draft if editing
  useEffect(() => {
    if (initialReportId) {
      getLocalRelatorioById(initialReportId).then(async (r) => {
        if (r) {
          setCurrentReportId(r.id);
          if (r.uuid) setReportUuid(r.uuid);
          setReportNumber(r.numero || 'Pendente Sincronização');
          setTitulo(r.titulo);
          setSelectedProjectId(r.projeto_id);
          setDescricao(r.descricao || '');
          setObservacoesFinais(r.observacoes_finais || '');
          setCategoria(r.categoria || 'Geral');
          setLocal(r.local || 'Fachada Principal');
          if (r.checklist_data) {
            try {
              setChecklist(JSON.parse(r.checklist_data));
            } catch {}
          }
          const savedFotos = await getLocalFotos(r.id);
          if (savedFotos && savedFotos.length > 0) {
            setFotos(savedFotos);
          }
        }
      });
    }
  }, [initialReportId]);

  useEffect(() => {
    if (selectedProjectId) {
      getLocalLembretes(selectedProjectId, true).then(l => setLembretes(l));
    }
  }, [selectedProjectId]);

  // Auto-Save Effect: saves draft locally in SQLite as the user fills the form
  useEffect(() => {
    if (!selectedProjectId) return;

    const timer = setTimeout(async () => {
      try {
        setIsAutoSaving(true);
        const selectedProj = projetos.find(p => p.id === selectedProjectId);
        const draft: Relatorio = {
          id: currentReportId,
          uuid: reportUuid,
          uuid_local: reportUuid,
          data_criacao_local: new Date().toISOString(),
          numero: reportNumber,
          titulo: titulo.trim() || 'Rascunho de Relatório',
          projeto_id: selectedProjectId,
          projeto_nome: selectedProj?.nome || 'Obra',
          visita_id: preSelectedVisitId || null,
          autor_id: user?.id || 1,
          autor_nome: user?.username || 'Responsável',
          data_relatorio: new Date().toISOString(),
          descricao: descricao.trim(),
          observacoes_finais: observacoesFinais.trim(),
          checklist_data: JSON.stringify(checklist),
          categoria: categoria,
          local: local,
          status: 'em_andamento',
          sync_status: 'pending',
        };
        await saveLocalRelatorio(draft, 'pending');

        for (let i = 0; i < fotos.length; i++) {
          await saveLocalFoto({
            ...fotos[i],
            relatorio_id: currentReportId,
            ordem: i,
          }, 'pending');
        }

        const d = new Date();
        setLastSavedTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } catch (err) {
        console.warn('Erro ao salvar rascunho automático:', err);
      } finally {
        setIsAutoSaving(false);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [selectedProjectId, titulo, descricao, observacoesFinais, checklist, fotos, categoria, local, reportNumber, currentReportId, projetos]);

  async function handleAddPhotoCamera() {
    const selectedProj = projetos.find(p => p.id === selectedProjectId);
    const photo = await takePhoto(selectedProj?.nome);
    if (photo) {
      const newFoto: FotoRelatorio = {
        id: Date.now(),
        relatorio_id: currentReportId,
        uri_local: photo.uri,
        base64: photo.base64,
        ordem: fotos.length,
        legenda: '',
        local: local,
        anotacoes_dados: '',
        sync_status: 'pending',
      };
      setFotos(prev => [...prev, newFoto]);
    }
  }

  async function handleAddPhotoGallery() {
    const selectedProj = projetos.find(p => p.id === selectedProjectId);
    const photo = await pickImage(selectedProj?.nome);
    if (photo) {
      const newFoto: FotoRelatorio = {
        id: Date.now(),
        relatorio_id: currentReportId,
        uri_local: photo.uri,
        base64: photo.base64,
        ordem: fotos.length,
        legenda: '',
        local: local,
        anotacoes_dados: '',
        sync_status: 'pending',
      };
      setFotos(prev => [...prev, newFoto]);
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

  async function handleRemovePhoto(index: number) {
    const target = fotos[index];
    if (target?.id) {
      await deleteLocalFoto(target.id).catch(() => null);
    }
    const updated = fotos.filter((_, i) => i !== index);
    setFotos(updated);
  }

  function handleSavePhotoAnnotations(json: string) {
    if (editingPhotoIndex !== null) {
      const updated = [...fotos];
      updated[editingPhotoIndex].anotacoes_dados = json;
      setFotos(updated);
    }
  }

  async function handleCloseReminder(lembreteId: number) {
    await closeLocalLembrete(lembreteId, user?.username || 'Responsável');
    if (selectedProjectId) {
      const updated = await getLocalLembretes(selectedProjectId, true);
      setLembretes(updated);
    }
  }

  async function handleAddReminder() {
    if (!novoLembreteTexto.trim() || !selectedProjectId) return;
    const selectedProj = projetos.find(p => p.id === selectedProjectId);
    const newLemb: Lembrete = {
      id: Date.now(),
      projeto_id: selectedProjectId,
      projeto_nome: selectedProj?.nome || '',
      texto: novoLembreteTexto.trim(),
      fechado: false,
      criado_em: new Date().toISOString(),
      criado_por_nome: user?.username || 'Responsável',
      sync_status: 'pending',
    };
    await saveLocalLembrete(newLemb, 'pending');
    await addToSyncQueue('lembrete', newLemb.id, 'create', '/api/lembretes', 'POST', newLemb);
    setNovoLembreteTexto('');
    setShowNovoLembreteInput(false);
    const updated = await getLocalLembretes(selectedProjectId, true);
    setLembretes(updated);
  }

  function toggleChecklistItem(index: number) {
    const updated = [...checklist];
    updated[index].checked = !updated[index].checked;
    setChecklist(updated);
  }

  function updateChecklistObservacao(index: number, text: string) {
    const updated = [...checklist];
    updated[index].observacao = text;
    setChecklist(updated);
  }

  async function handleSaveReport(status: 'em_andamento' | 'Aguardando Aprovação' = 'em_andamento') {
    if (!selectedProjectId) {
      Alert.alert('Atenção', 'Selecione a obra correspondente.');
      return;
    }

    setLoading(true);
    try {
      const selectedProj = projetos.find(p => p.id === selectedProjectId);
      const reportId = currentReportId;

      const relData: Relatorio = {
        id: reportId,
        uuid: reportUuid,
        uuid_local: reportUuid,
        data_criacao_local: new Date().toISOString(),
        numero: reportNumber,
        titulo: titulo.trim(),
        projeto_id: selectedProjectId,
        projeto_nome: selectedProj?.nome || 'Obra',
        visita_id: preSelectedVisitId || null,
        autor_id: user?.id || 1,
        autor_nome: user?.username || 'Responsável',
        data_relatorio: new Date().toISOString(),
        descricao: descricao.trim(),
        observacoes_finais: observacoesFinais.trim(),
        checklist_data: JSON.stringify(checklist),
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
          ? 'Relatório finalizado e enviado para aprovação!' 
          : 'Relatório salvo com sucesso no dispositivo!',
        [{ 
          text: 'OK', 
          onPress: () => {
            if (preSelectedProjectId) {
              navigation.navigate('ProjectDetailScreen', { projectId: preSelectedProjectId });
            } else {
              navigation.goBack();
            }
          } 
        }]
      );
    } catch (err: any) {
      Alert.alert('Erro ao Salvar', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Header 
        title="Novo Relatório de Obra" 
        subtitle={reportNumber}
        showBack 
        onBack={() => navigation.goBack()} 
      />
      <OfflineBanner />

      {/* Auto-save Status Indicator */}
      <View style={styles.autoSaveBar}>
        <Ionicons 
          name={isAutoSaving ? "sync-outline" : "checkmark-circle-outline"} 
          size={14} 
          color={isAutoSaving ? Colors.primary : "#16A34A"} 
        />
        <Text style={styles.autoSaveText}>
          {isAutoSaving 
            ? "Salvando rascunho automaticamente..." 
            : (lastSavedTime ? `Rascunho salvo automaticamente às ${lastSavedTime}` : "Salvamento automático ativado")}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Section 1: Basic Info */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>1. Identificação da Obra</Text>

          {/* Number Locked */}
          {(() => {
            const isOfficial = Boolean(reportNumber && reportNumber.startsWith('REL-'));
            return (
              <View style={styles.inputGroup}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={styles.label}>Número Oficial do Relatório</Text>
                  <View style={{ 
                    backgroundColor: isOfficial ? '#DCFCE7' : '#FEF3C7', 
                    paddingHorizontal: 8, 
                    paddingVertical: 2, 
                    borderRadius: 6 
                  }}>
                    <Text style={{ 
                      fontSize: 10, 
                      color: isOfficial ? '#15803D' : '#B45309', 
                      fontWeight: '700' 
                    }}>
                      {isOfficial ? 'OFICIAL • SERVIDOR' : 'OFFLINE • PENDENTE SYNC'}
                    </Text>
                  </View>
                </View>
                <View style={[styles.lockedNumberBox, isOfficial && { borderColor: '#16A34A', backgroundColor: '#F0FDF4' }]}>
                  <Ionicons 
                    name={isOfficial ? "checkmark-circle" : "cloud-offline-outline"} 
                    size={18} 
                    color={isOfficial ? "#16A34A" : Colors.warning} 
                  />
                  <Text style={[styles.lockedNumberText, isOfficial && { color: '#15803D', fontWeight: '700' }]}>
                    {isOfficial ? reportNumber : `Pendente Sincronização • UUID: ${reportUuid.substring(0, 8)}`}
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 4 }}>
                  {isOfficial 
                    ? 'Número sequencial atômico validado e atribuído pelo servidor central.' 
                    : 'A numeração oficial (REL-0001, REL-0042, etc.) é gerada exclusivamente pelo servidor central na ordem de sincronização.'}
                </Text>
              </View>
            );
          })()}

          <Text style={styles.label}>Obra Correspondente *</Text>
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

        {/* Section 2: Active Reminders */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.sectionTitle}>2. Lembretes da Visita Anterior</Text>
            <TouchableOpacity 
              style={styles.addReminderBtn}
              onPress={() => setShowNovoLembreteInput(!showNovoLembreteInput)}
            >
              <Ionicons name={showNovoLembreteInput ? "close" : "add"} size={16} color={Colors.primary} />
              <Text style={styles.addReminderText}>{showNovoLembreteInput ? "Cancelar" : "+ Lembrete"}</Text>
            </TouchableOpacity>
          </View>

          {showNovoLembreteInput && (
            <View style={styles.newReminderBox}>
              <TextInput
                style={styles.newReminderInput}
                placeholder="Ex: Verificar reaperto de ancoragens..."
                value={novoLembreteTexto}
                onChangeText={setNovoLembreteTexto}
              />
              <TouchableOpacity style={styles.saveReminderBtn} onPress={handleAddReminder}>
                <Text style={styles.saveReminderText}>Salvar Lembrete</Text>
              </TouchableOpacity>
            </View>
          )}

          {lembretes.length === 0 ? (
            <Text style={styles.emptyRemindersText}>Nenhum lembrete pendente para esta obra.</Text>
          ) : (
            lembretes.map(lem => (
              <View key={lem.id} style={styles.reminderCard}>
                <Ionicons name="notifications-outline" size={18} color="#F59E0B" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.reminderText}>{lem.texto}</Text>
                  <Text style={styles.reminderDate}>
                    Criado em: {new Date(lem.criado_em).toLocaleDateString('pt-BR')}
                  </Text>
                </View>
                <TouchableOpacity 
                  style={styles.closeReminderBtn}
                  onPress={() => handleCloseReminder(lem.id)}
                >
                  <Text style={styles.closeReminderText}>Fechar</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Section 3: Checklist with Individual Observations */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>3. Checklist de Verificação em Campo</Text>
          <Text style={styles.subHintText}>
            Marque os itens inspecionados e adicione observações individuais quando necessário:
          </Text>

          {checklist.map((item, idx) => (
            <View key={item.id} style={styles.checkItemContainer}>
              <TouchableOpacity 
                style={styles.checkItemRow}
                onPress={() => toggleChecklistItem(idx)}
              >
                <Ionicons 
                  name={item.checked ? "checkbox" : "square-outline"} 
                  size={22} 
                  color={item.checked ? Colors.primary : Colors.textMuted} 
                />
                <Text style={[styles.checkItemText, item.checked && styles.checkItemTextActive]}>
                  {item.item}
                </Text>
              </TouchableOpacity>

              {item.checked && (
                <View style={styles.obsBox}>
                  <TextInput
                    style={styles.obsInput}
                    placeholder="Adicionar observação específica deste item..."
                    value={item.observacao}
                    onChangeText={txt => updateChecklistObservacao(idx, txt)}
                    multiline
                  />
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Section 4: Photos with Editor (Arrows, Shapes, Text) */}
        <View style={styles.card}>
          <View style={styles.photoHeaderRow}>
            <Text style={styles.sectionTitle}>4. Fotos do Canteiro ({fotos.length})</Text>
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
              <View style={styles.thumbWrapper}>
                {(() => {
                  const resolvedUri = item.uri_local || (item.url?.startsWith('http') ? item.url : (item.url ? `https://elpandroid-production.up.railway.app${item.url.startsWith('/') ? '' : '/'}${item.url}` : null));
                  return resolvedUri ? (
                    <Image source={{ uri: resolvedUri }} style={styles.thumb} resizeMode="cover" />
                  ) : (
                    <View style={styles.thumbFallback}>
                      <Ionicons name="camera-outline" size={24} color="#94A3B8" />
                    </View>
                  );
                })()}
                <PhotoAnnotationOverlay annotationsJson={item.anotacoes_dados} />
              </View>

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

                <View style={styles.photoActionRow}>
                  <TouchableOpacity 
                    style={styles.editShapesBtn}
                    onPress={() => {
                      setEditingPhotoIndex(index);
                      setShowEditorModal(true);
                    }}
                  >
                    <Ionicons name="brush-outline" size={14} color="#7C3AED" />
                    <Text style={styles.editShapesText}>Editar (Setas / Formas)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.predefBtn}
                    onPress={() => {
                      setSelectedPhotoIndex(index);
                      setShowLegendModal(true);
                    }}
                  >
                    <Ionicons name="list-outline" size={14} color={Colors.primary} />
                    <Text style={styles.predefText}>Legenda Padrão</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Section 5: Technical Observations */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>5. Descrição & Parecer Técnico</Text>

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

        {/* Botão de Ação: Enviar para Aprovação */}
        <View style={styles.bottomButtonsRow}>
          <TouchableOpacity 
            style={[styles.btnActionSubmit, { flex: 1, height: 50, borderRadius: 10 }, loading && styles.btnDisabled]} 
            onPress={() => handleSaveReport('Aguardando Aprovação')}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={20} color="#FFFFFF" />
                <Text style={[styles.btnActionSubmitText, { fontSize: 15, fontWeight: '700' }]}>
                  Finalizar e Enviar para Aprovação
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ alignItems: 'center', marginTop: 10, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 12, color: Colors.textMuted, textAlign: 'center' }}>
            ✓ Rascunho salvo continuamente no dispositivo. Você pode retornar à tela anterior a qualquer momento sem perder seus dados.
          </Text>
        </View>


        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Photo Editor Modal */}
      <PhotoEditorModal
        visible={showEditorModal}
        photoUri={editingPhotoIndex !== null && fotos[editingPhotoIndex] ? (fotos[editingPhotoIndex].uri_local || fotos[editingPhotoIndex].url || null) : null}
        initialAnnotations={editingPhotoIndex !== null && fotos[editingPhotoIndex] ? fotos[editingPhotoIndex].anotacoes_dados : undefined}
        onClose={() => {
          setShowEditorModal(false);
          setEditingPhotoIndex(null);
        }}
        onSave={handleSavePhotoAnnotations}
      />

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
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text, marginBottom: 10 },
  subHintText: { fontSize: 12, color: Colors.textSecondary, marginBottom: 12 },
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
  lockedNumberBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
  },
  lockedNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#475569',
  },
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
  addReminderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  addReminderText: {
    color: Colors.primary,
    fontWeight: 'bold',
    fontSize: 12,
  },
  newReminderBox: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  newReminderInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 38,
    fontSize: 13,
    marginBottom: 8,
  },
  saveReminderBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  saveReminderText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  emptyRemindersText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 8,
  },
  reminderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
  },
  reminderDate: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
  },
  closeReminderBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D97706',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  closeReminderText: {
    color: '#D97706',
    fontSize: 11,
    fontWeight: 'bold',
  },
  checkItemContainer: {
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
  },
  checkItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkItemText: {
    fontSize: 13,
    color: '#334155',
    flex: 1,
  },
  checkItemTextActive: {
    fontWeight: '600',
    color: Colors.primary,
  },
  obsBox: {
    marginTop: 6,
    marginLeft: 30,
  },
  obsInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: Colors.text,
  },
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
    backgroundColor: '#64748B',
    height: 44,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  photoCard: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  thumbWrapper: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#E2E8F0',
  },
  thumbFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
  },
  thumb: { width: '100%', height: '100%', borderRadius: 8 },
  photoInfo: { flex: 1, marginLeft: 12 },
  photoTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  photoNum: { fontSize: 13, fontWeight: 'bold', color: Colors.text },
  legendaInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    height: 36,
    fontSize: 12,
    marginBottom: 6,
  },
  photoActionRow: {
    flexDirection: 'row',
    gap: 6,
  },
  editShapesBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.25)',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    justifyContent: 'center',
  },
  editShapesText: { fontSize: 11, color: '#7C3AED', fontWeight: '600' },
  predefBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    justifyContent: 'center',
  },
  predefText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  bottomButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  btnActionSubmit: {
    flex: 1.2,
    backgroundColor: Colors.primary,
    height: 48,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Shadows.md,
  },
  btnActionSubmitText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  btnActionDraft: {
    flex: 1,
    backgroundColor: '#E2E8F0',
    height: 48,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnActionDraftText: {
    color: Colors.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  btnDisabled: { opacity: 0.6 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  legendCategoryBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 10,
  },
  legendCategoryText: { fontSize: 11, color: '#0369A1', fontWeight: 'bold' },
  legendItemText: { fontSize: 14, color: Colors.text, flex: 1 },
  autoSaveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 12,
    backgroundColor: '#F0FDF4',
    borderBottomWidth: 1,
    borderBottomColor: '#DCFCE7',
    gap: 6,
  },
  autoSaveText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '500',
  },
});
