import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, 
  Image, Alert, Modal, FlatList, ActivityIndicator, BackHandler 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { PhotoEditorModal, PhotoAnnotationOverlay } from '../../components/PhotoEditorModal';
import { 
  getLocalProjetos, saveLocalRelatorio, saveLocalFoto, deleteLocalFoto,
  addToSyncQueue, getLocalLegendas, getLocalLembretes, saveLocalLembrete, 
  closeLocalLembrete, getLocalRelatorioById, getLocalFotos, getActiveDraft,
  migrateLocalFotosRelatorioId, getDatabase
} from '../../database/db';
import { takePhoto, pickImage, readPhotoBase64 } from '../../services/imageService';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { apiClient } from '../../services/api';
import { notificationService } from '../../services/notificationService';

import { Projeto, Relatorio, FotoRelatorio, LegendaPredefinida, Lembrete } from '../../types';
import { Colors, Shadows } from '../../theme/colors';
import * as Location from 'expo-location';

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

const DEFAULT_USER_LAT = -23.55052;
const DEFAULT_USER_LON = -46.633308;

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export const ReportFormScreen: React.FC<{ route?: any; navigation: any }> = ({ route, navigation }) => {
  const { user } = useAuth();
  const { isOnline, triggerSync } = useNetwork();
  const preSelectedProjectId = route?.params?.preSelectedProjectId;
  const preSelectedVisitId = route?.params?.preSelectedVisitId;
  const initialReportId = route?.params?.reportId;

  const [currentReportId, setCurrentReportId] = useState<number>(initialReportId || Date.now());
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  // Ref para acessar projetos no autosave sem gerar re-renders/re-trigger do efeito
  const projetosRef = React.useRef<Projeto[]>([]);

  // 1º Campo Superior: Data da Visita (editável no topo)
  const [dataVisita, setDataVisita] = useState(new Date().toISOString().substring(0, 10));

  // 2º Campo: Obra Selecionada (ordenada por proximidade geográfica do GPS)
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(preSelectedProjectId || null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number }>({
    latitude: DEFAULT_USER_LAT,
    longitude: DEFAULT_USER_LON
  });

  // 3º Campo: Número Oficial (read-only)
  const [reportUuid, setReportUuid] = useState(() => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
  const [reportNumber, setReportNumber] = useState('Pendente Sincronização');
  const [titulo, setTitulo] = useState('Relatório de Vistoria Técnica');
  const [categoria, setCategoria] = useState('Geral');
  const [local, setLocal] = useState('Fachada Principal');

  // Sanfonas colapsáveis
  const [showTechInfo, setShowTechInfo] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);

  // Acompanhantes da Visita
  const [acompanhantesList, setAcompanhantesList] = useState<string[]>([]);
  const [showAcompanhanteModal, setShowAcompanhanteModal] = useState(false);
  const [novoAcompNome, setNovoAcompNome] = useState('');
  const [novoAcompCargo, setNovoAcompCargo] = useState('');
  const [novoAcompEmpresa, setNovoAcompEmpresa] = useState('');

  // Checklist e Observações
  const [checklist, setChecklist] = useState<ChecklistItemState[]>(DEFAULT_CHECKLIST);
  const [descricao, setDescricao] = useState('');
  const [observacoesFinais, setObservacoesFinais] = useState('');

  // Fotos
  const [fotos, setFotos] = useState<FotoRelatorio[]>([]);

  // Lembretes para a Próxima Visita
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

  // Localização do dispositivo via GPS de hardware para ordenação inteligente por proximidade
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Highest,
          });
          if (pos?.coords) {
            setUserLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude
            });
          }
        }
      } catch (locErr) {
        console.warn('[ReportForm] Falha ao capturar GPS de hardware:', locErr);
      }
    })();
  }, []);

  useEffect(() => {
    getLocalProjetos().then(p => {
      let sortedProjs = [...p];
      if (userLocation) {
        sortedProjs.sort((a, b) => {
          const distA = (a.latitude && a.longitude) 
            ? calculateDistanceKm(userLocation.latitude, userLocation.longitude, a.latitude, a.longitude) 
            : 999999;
          const distB = (b.latitude && b.longitude) 
            ? calculateDistanceKm(userLocation.latitude, userLocation.longitude, b.latitude, b.longitude) 
            : 999999;
          return distA - distB;
        });
      }
      // Atualiza o ref primeiro (para uso no autosave sem trigger de re-render)
      projetosRef.current = sortedProjs;
      setProjetos(sortedProjs);
      if (!selectedProjectId && sortedProjs.length > 0 && !preSelectedProjectId && !initialReportId) {
        setSelectedProjectId(sortedProjs[0].id);
      }
    });
    getLocalLegendas().then(l => setLegendas(l));
  }, [preSelectedProjectId, initialReportId, userLocation]);

  // Manter ref em sincronia quando projetos mudar
  useEffect(() => {
    projetosRef.current = projetos;
  }, [projetos]);

  const selectedProj = projetos.find(p => p.id === selectedProjectId);

  // Função central para persistência imediata de rascunho
  const saveDraftImmediately = useCallback(async () => {
    try {
      setIsAutoSaving(true);
      const proj = projetosRef.current.find(p => p.id === selectedProjectId) || projetosRef.current[0];
      const projId = selectedProjectId || proj?.id || 1;
      const projNome = proj?.nome || 'Obra';

      const draftObj: Relatorio = {
        id: currentReportId,
        uuid: reportUuid,
        uuid_local: reportUuid,
        numero: reportNumber && reportNumber.startsWith('REL-') ? reportNumber : 'Rascunho',
        titulo: (titulo && titulo.trim().length > 0) ? titulo.trim() : 'Relatório de Vistoria Técnica',
        projeto_id: projId,
        projeto_nome: projNome,
        visita_id: preSelectedVisitId || null,
        autor_id: user?.id || 1,
        autor_nome: user?.nome_completo || user?.username || 'Responsável',
        data_relatorio: dataVisita || new Date().toISOString().substring(0, 10),
        data_criacao_local: new Date().toISOString(),
        descricao: descricao.trim(),
        observacoes_finais: observacoesFinais.trim(),
        checklist_data: JSON.stringify(checklist),
        categoria: categoria,
        local: local,
        status: 'em_andamento', // RASCUNHO GARANTIDO
        sync_status: 'pending',
        updated_at: new Date().toISOString(),
      };

      // 1. Salva no SQLite local
      await saveLocalRelatorio(draftObj, 'pending');

      // 2. Persistir fotos atuais no SQLite
      for (let i = 0; i < fotos.length; i++) {
        let b64 = fotos[i].base64;
        if (!b64 && fotos[i].uri_local && !fotos[i].uri_local?.startsWith('http')) {
          try {
            b64 = await readPhotoBase64(fotos[i].uri_local!);
          } catch {}
        }
        await saveLocalFoto({
          ...fotos[i],
          relatorio_id: currentReportId,
          relatorio_uuid: reportUuid,
          ordem: i,
          base64: b64,
        }, 'pending');
      }

      const d = new Date();
      setLastSavedTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      // Rascunho salvo silenciosamente sem emitir notificações
    } catch (e) {
      console.warn('Erro ao salvar rascunho imediatamente:', e);
    } finally {
      setIsAutoSaving(false);
    }
  }, [
    currentReportId, reportUuid, reportNumber, titulo, selectedProjectId,
    preSelectedVisitId, user, dataVisita, descricao, observacoesFinais,
    checklist, categoria, local, fotos
  ]);

  // Sempre que o usuário inicia um novo relatório, o rascunho é criado imediatamente
  useEffect(() => {
    if (!initialReportId && !initializedDraftRef.current && (selectedProjectId || projetos.length > 0)) {
      initializedDraftRef.current = true;
      saveDraftImmediately();
    }
  }, [selectedProjectId, initialReportId, projetos, saveDraftImmediately]);

  // Intercepta botão voltar do hardware do Android
  useEffect(() => {
    const onHardwareBack = () => {
      saveDraftImmediately().finally(() => {
        navigation.goBack();
      });
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [saveDraftImmediately, navigation]);

  // Intercepta qualquer saída da navegação (incluindo gestos e pop)
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', () => {
      saveDraftImmediately().catch(() => null);
    });
    return unsub;
  }, [navigation, saveDraftImmediately]);

  // Carregar rascunho existente
  useEffect(() => {
    if (initialReportId) {
      getLocalRelatorioById(initialReportId).then(async (r) => {
        if (r) {
          setCurrentReportId(r.id);
          if (r.uuid) setReportUuid(r.uuid);
          setReportNumber(r.numero || 'Pendente Sincronização');
          setTitulo(r.titulo);
          setSelectedProjectId(r.projeto_id);
          if (r.data_relatorio) setDataVisita(r.data_relatorio.substring(0, 10));
          setDescricao(r.descricao || '');
          setObservacoesFinais(r.observacoes_finais || '');
          setCategoria(r.categoria || 'Geral');
          setLocal(r.local || 'Fachada Principal');
          if (r.checklist_data) {
            try {
              setChecklist(JSON.parse(r.checklist_data));
            } catch {}
          }
          const savedFotos = await getLocalFotos(r.id, r.uuid);
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

  // Mecanismo de AutoSave a cada 2 segundos após parar de digitar (debounce de 2000ms conforme Regra do Manual)
  // IMPORTANTE: NÃO incluir `projetos` nas dependências para evitar re-trigger ao carregar a lista!
  // Use `projetosRef.current` para acessar a lista de projetos sem causar re-render.
  useEffect(() => {
    if (!selectedProjectId) return;

    const timer = setTimeout(async () => {
      try {
        setIsAutoSaving(true);
        // Usa ref para não disparar o efeito ao carregar projetos
        const proj = projetosRef.current.find(p => p.id === selectedProjectId);
        const draft: Relatorio = {
          id: currentReportId,
          uuid: reportUuid,
          uuid_local: reportUuid,
          data_criacao_local: new Date().toISOString(),
          numero: reportNumber,
          titulo: titulo.trim() || 'Rascunho de Relatório',
          projeto_id: selectedProjectId,
          projeto_nome: proj?.nome || 'Obra',
          visita_id: preSelectedVisitId || null,
          autor_id: user?.id || 1,
          autor_nome: user?.nome_completo || user?.username || 'Responsável',
          data_relatorio: dataVisita,
          descricao: descricao.trim(),
          observacoes_finais: observacoesFinais.trim(),
          checklist_data: JSON.stringify(checklist),
          categoria: categoria,
          local: local,
          status: 'em_andamento',
          sync_status: 'pending',
        };

        // 1. Salva SEMPRE no SQLite local primeiro (garantia de persistência offline)
        await saveLocalRelatorio(draft, 'pending');

        // 2. Persistir todas as fotos no SQLite com Base64 garantido
        const preparedFotos: any[] = [];
        for (let i = 0; i < fotos.length; i++) {
          let b64 = fotos[i].base64;
          if (!b64 && fotos[i].uri_local && !fotos[i].uri_local?.startsWith('http')) {
            try {
              b64 = await readPhotoBase64(fotos[i].uri_local!);
            } catch (b64Err) {
              console.warn('[AutoSave] Erro ao ler base64 da foto:', b64Err);
            }
          }
          const fObj: FotoRelatorio = {
            ...fotos[i],
            relatorio_id: currentReportId,
            relatorio_uuid: reportUuid,
            ordem: i,
            base64: b64,
          };
          await saveLocalFoto(fObj, 'pending');
          preparedFotos.push({
            ...fObj,
            imagem_base64: b64,
          });
        }

        // 3. Sincronização em tempo real com o servidor Railway se conectado
        if (isOnline) {
          try {
            const isServerId = currentReportId > 0 && currentReportId < 2000000000;
            if (isServerId) {
              // PUT: atualizar relatório existente no servidor
              await apiClient.axios.put(`/api/relatorios/${currentReportId}`, {
                ...draft,
                autor_id: user?.id,
                fotos: preparedFotos,
              }, { timeout: 12000 });
              // Marca como synced no local
              await saveLocalRelatorio({ ...draft, sync_status: 'synced' }, 'synced');
            } else {
              // POST: criar novo relatório no servidor com o UUID
              const res = await apiClient.axios.post('/api/relatorios', {
                ...draft,
                uuid: reportUuid,
                uuid_local: reportUuid,
                autor_id: user?.id,
                fotos: preparedFotos,
              }, { timeout: 12000 });

              if (res?.data?.id) {
                const serverId = res.data.id;
                const serverNumero = res.data.numero || draft.numero;
                const oldId = currentReportId;
                setCurrentReportId(serverId);
                setReportNumber(serverNumero);
                if (oldId !== serverId) {
                  await migrateLocalFotosRelatorioId(oldId, serverId, reportUuid);
                  const db = await getDatabase();
                  await db.runAsync('DELETE FROM relatorios WHERE id = ?', [oldId]);
                  setFotos(prev => prev.map(f => ({ ...f, relatorio_id: serverId })));
                }
                await saveLocalRelatorio({ ...draft, id: serverId, numero: serverNumero, sync_status: 'synced' }, 'synced');
                for (const f of preparedFotos) {
                  await saveLocalFoto({ ...f, relatorio_id: serverId, sync_status: 'synced' }, 'synced');
                }
              }
            }
          } catch (netSaveErr) {
            console.warn('[ReportForm] AutoSave online aviso (continuando offline):', netSaveErr);
          }
        }

        const d = new Date();
        setLastSavedTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } catch (err) {
        console.warn('Erro ao salvar rascunho automático em tempo real:', err);
      } finally {
        setIsAutoSaving(false);
      }
    }, 2000);

    return () => clearTimeout(timer);
  // ATENÇÃO: `projetos` PROPOSITALMENTE removido das dependências - usar projetosRef.current!
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, titulo, dataVisita, descricao, observacoesFinais, checklist, fotos, categoria, local, reportNumber, currentReportId, isOnline]);

  async function handleAddPhotoCamera() {
    const photo = await takePhoto(selectedProj?.nome);
    if (photo) {
      let b64 = photo.base64;
      if (!b64 && photo.uri) {
        b64 = await readPhotoBase64(photo.uri);
      }
      const newFoto: FotoRelatorio = {
        id: Date.now(),
        relatorio_id: currentReportId,
        relatorio_uuid: reportUuid,
        uri_local: photo.uri,
        base64: b64,
        ordem: fotos.length,
        legenda: '',
        local: local,
        anotacoes_dados: '',
        sync_status: isOnline ? 'synced' : 'pending',
      };
      await saveLocalFoto(newFoto, isOnline ? 'synced' : 'pending');
      setFotos(prev => [...prev, newFoto]);
    }
  }

  async function handleAddPhotoGallery() {
    const photo = await pickImage(selectedProj?.nome);
    if (photo) {
      let b64 = photo.base64;
      if (!b64 && photo.uri) {
        b64 = await readPhotoBase64(photo.uri);
      }
      const newFoto: FotoRelatorio = {
        id: Date.now(),
        relatorio_id: currentReportId,
        relatorio_uuid: reportUuid,
        uri_local: photo.uri,
        base64: b64,
        ordem: fotos.length,
        legenda: '',
        local: local,
        anotacoes_dados: '',
        sync_status: isOnline ? 'synced' : 'pending',
      };
      await saveLocalFoto(newFoto, isOnline ? 'synced' : 'pending');
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

  function handleAddAcompanhante() {
    if (!novoAcompNome.trim()) return;
    const desc = `${novoAcompNome.trim()}${novoAcompCargo.trim() ? ` (${novoAcompCargo.trim()})` : ''}${novoAcompEmpresa.trim() ? ` - ${novoAcompEmpresa.trim()}` : ''}`;
    setAcompanhantesList(prev => [...prev, desc]);
    setNovoAcompNome('');
    setNovoAcompCargo('');
    setNovoAcompEmpresa('');
    setShowAcompanhanteModal(false);
  }

  function handleRemoveAcompanhante(idx: number) {
    setAcompanhantesList(prev => prev.filter((_, i) => i !== idx));
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

    // Regra Crítica da Tabela 16: Legenda de Fotos é Obrigatória para envio à aprovação
    if (status === 'Aguardando Aprovação' && fotos.length > 0) {
      const fotosSemLegenda = fotos.findIndex(f => !f.legenda || !f.legenda.trim());
      if (fotosSemLegenda !== -1) {
        Alert.alert(
          'Legenda Obrigatória',
          `A Foto #${fotosSemLegenda + 1} está sem legenda técnica. Pela regra de governança pericial, todas as fotos devem conter legenda antes do envio para aprovação.`
        );
        return;
      }
    }

    setLoading(true);
    try {
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
        data_relatorio: dataVisita,
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
          relatorio_uuid: reportUuid,
          ordem: i,
        }, 'pending');
      }

      // 3. Sincronização ou enfileiramento inteligente
      const isServerId = reportId > 0 && reportId < 2000000000;
      if (isOnline) {
        try {
          if (isServerId) {
            await apiClient.axios.put(`/api/relatorios/${reportId}`, {
              ...relData,
              autor_id: user?.id,
            }, { timeout: 12000 });
            await saveLocalRelatorio({ ...relData, sync_status: 'synced' }, 'synced');
          } else {
            const preparedFotos = fotos.map((f, i) => ({ ...f, relatorio_id: reportId, relatorio_uuid: reportUuid, ordem: i, imagem_base64: f.base64 }));
            const res = await apiClient.axios.post('/api/relatorios', {
              ...relData,
              uuid: reportUuid,
              uuid_local: reportUuid,
              autor_id: user?.id,
              fotos: preparedFotos,
            }, { timeout: 12000 });

            if (res?.data?.id) {
              const serverId = res.data.id;
              const serverNumero = res.data.numero;
              await migrateLocalFotosRelatorioId(reportId, serverId, reportUuid);
              const db = await getDatabase();
              await db.runAsync('DELETE FROM relatorios WHERE id = ?', [reportId]);
              await saveLocalRelatorio({ ...relData, id: serverId, numero: serverNumero, sync_status: 'synced' }, 'synced');
            }
          }
        } catch (netErr) {
          console.warn('[ReportForm] Envio online falhou, adicionando à fila offline:', netErr);
          await addToSyncQueue(
            'relatorio',
            reportId,
            isServerId ? 'update' : 'create',
            isServerId ? `/api/relatorios/${reportId}` : '/api/relatorios',
            isServerId ? 'PUT' : 'POST',
            relData
          );
        }
      } else {
        await addToSyncQueue(
          'relatorio',
          reportId,
          isServerId ? 'update' : 'create',
          isServerId ? `/api/relatorios/${reportId}` : '/api/relatorios',
          isServerId ? 'PUT' : 'POST',
          relData
        );
      }

      Alert.alert(
        'Sucesso!', 
        status === 'Aguardando Aprovação' 
          ? 'Relatório submetido para aprovação técnica com sucesso!' 
          : 'Relatório salvo e concluído com sucesso!',
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
        title="Relatório de Obra" 
        subtitle={reportNumber} 
        showBack 
        onBack={async () => {
          await saveDraftImmediately();
          navigation.goBack();
        }} 
      />

      {/* Indicador de AutoSave em Tempo Real no Topo (Seção 6 e 15.7) */}
      <View style={styles.autoSaveBar}>
        <Ionicons 
          name={isAutoSaving ? "sync-outline" : "checkmark-circle"} 
          size={14} 
          color={isAutoSaving ? "#0284C7" : "#16A34A"} 
        />
        <Text style={[styles.autoSaveText, isAutoSaving && { color: '#0284C7' }]}>
          {isAutoSaving 
            ? "⏳ Salvando rascunho silenciosamente..." 
            : (lastSavedTime ? `🟢 Salvo automaticamente às ${lastSavedTime}` : "🟢 Salvamento automático em tempo real ativado")}
        </Text>
      </View>

      {/* Indicador do Usuário Interagindo no Relatório (Identificação do operador e status ativo) */}
      <View style={styles.userInteractingCard}>
        <View style={styles.userAvatarBox}>
          <Text style={styles.userAvatarInitials}>
            {(user?.nome_completo || user?.username || 'U').substring(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={styles.onlineDot} />
            <Text style={styles.userInteractingStatus}>Interagindo agora neste relatório</Text>
          </View>
          <Text style={styles.userInteractingName}>
            {user?.nome_completo || user?.username || 'Usuário Responsável'}
          </Text>
          <Text style={styles.userInteractingRole}>
            {user?.cargo || (user?.is_master ? 'Administrador Master' : 'Responsável Técnico / Engenheiro')}
          </Text>
        </View>
        <View style={styles.reportBadgeMini}>
          <Ionicons name="document-text-outline" size={13} color="#0F2027" />
          <Text style={styles.reportBadgeMiniText}>{reportNumber}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Bloco 1: Data da Visita, Obra e Número */}
        <View style={styles.card}>
          <Text style={styles.sectionHeaderTitle}>Identificação da Visita</Text>

          {/* 1º Campo: Data da Visita (Prioridade no início da página - Seção 4.1 e 15.7) */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>1. Data da Visita Técnica *</Text>
            <View style={styles.dateInputWrapper}>
              <Ionicons name="calendar-outline" size={18} color="#0284C7" />
              <TextInput 
                style={styles.dateInput} 
                value={dataVisita} 
                onChangeText={setDataVisita} 
                placeholder="AAAA-MM-DD"
              />
            </View>
          </View>

          {/* 2º Campo: Seleção da Obra (ordenada por proximidade geográfica) */}
          <View style={styles.inputGroup}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={styles.label}>2. Seleção da Obra *</Text>
              {userLocation && (
                <Text style={{ fontSize: 11, color: '#16A34A', fontWeight: '600' }}>
                  📍 Ordenadas por proximidade GPS
                </Text>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {projetos.map(p => {
                const distKm = (userLocation && p.latitude && p.longitude)
                  ? calculateDistanceKm(userLocation.latitude, userLocation.longitude, p.latitude, p.longitude)
                  : null;

                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.chip, selectedProjectId === p.id && styles.chipActive]}
                    onPress={() => setSelectedProjectId(p.id)}
                  >
                    <Text style={[styles.chipText, selectedProjectId === p.id && styles.chipTextActive]}>
                      {p.numero ? `${p.numero} - ` : ''}{p.nome}
                      {distKm !== null ? ` (${distKm.toFixed(1)} km)` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* 3º Campo: Número do Relatório (Calculado e Não Editável) */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>3. Número do Relatório (Sequencial Automático)</Text>
            <View style={styles.lockedNumberBox}>
              <Ionicons name="lock-closed" size={16} color="#64748B" />
              <Text style={styles.lockedNumberText}>{reportNumber}</Text>
            </View>
            <Text style={styles.helperText}>
              Número sequencial contínuo gerado atomicamente pela regra da obra para evitar duplicidades.
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Título do Laudo</Text>
            <TextInput style={styles.input} value={titulo} onChangeText={setTitulo} />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Categoria da Obra</Text>
              <TextInput style={styles.input} value={categoria} onChangeText={setCategoria} placeholder="Ex: Fachada Leste" />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Local / Pavimento</Text>
              <TextInput style={styles.input} value={local} onChangeText={setLocal} placeholder="Ex: 12º Pavimento" />
            </View>
          </View>
        </View>

        {/* 4º Sanfona Colapsável 1: Informações Técnicas da Obra (Azul-petróleo #0284C7) */}
        <View style={styles.accordionCard}>
          <TouchableOpacity 
            style={styles.techAccordionHeader}
            onPress={() => setShowTechInfo(!showTechInfo)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="information-circle" size={18} color="#FFFFFF" />
              <Text style={styles.techAccordionTitle}>4. Informações Técnicas da Obra</Text>
            </View>
            <Ionicons name={showTechInfo ? "chevron-up" : "chevron-down"} size={18} color="#FFFFFF" />
          </TouchableOpacity>

          {showTechInfo && (
            <View style={styles.accordionBody}>
              {selectedProj ? (
                <View style={styles.techDetailsBox}>
                  <Text style={styles.techDetailItem}><Text style={styles.techDetailBold}>Construtora: </Text>{selectedProj.construtora || 'Não informada'}</Text>
                  <Text style={styles.techDetailItem}><Text style={styles.techDetailBold}>Tipo: </Text>{selectedProj.tipo_obra || 'Não informado'}</Text>
                  <Text style={styles.techDetailItem}><Text style={styles.techDetailBold}>Endereço: </Text>{selectedProj.endereco || 'Não informado'}</Text>
                  <Text style={styles.techDetailItem}><Text style={styles.techDetailBold}>Chapisco: </Text>{selectedProj.especificacao_chapisco_colante || selectedProj.especificacao_chapisco_alvenaria || 'Conforme projeto'}</Text>
                  <Text style={styles.techDetailItem}><Text style={styles.techDetailBold}>Argamassa: </Text>{selectedProj.especificacao_argamassa_emboco || selectedProj.forma_aplicacao_argamassa || 'Projetada/Manual com aditivo'}</Text>
                  <Text style={styles.techDetailItem}><Text style={styles.techDetailBold}>Peitoris: </Text>{selectedProj.acabamento_peitoris || 'Granito com pingadeira'}</Text>
                  <Text style={styles.techDetailItem}><Text style={styles.techDetailBold}>Frisos e Juntas: </Text>{selectedProj.definicao_frisos_cor || 'Selante elastomérico de PU'}</Text>
                  <Text style={styles.techDetailItem}><Text style={styles.techDetailBold}>Caimentos: </Text>{selectedProj.definicao_face_inferior_abas || 'Mínimo de 1% para ralos'}</Text>
                </View>
              ) : (
                <Text style={styles.emptyText}>Selecione uma obra acima para consultar as especificações de fachada.</Text>
              )}
            </View>
          )}
        </View>

        {/* 5º Sanfona Colapsável 2: Checklist da Obra (Grafite escuro #334155, 48px de área de toque) */}
        <View style={styles.accordionCard}>
          <TouchableOpacity 
            style={styles.checklistAccordionHeader}
            onPress={() => setShowChecklist(!showChecklist)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="checkbox" size={18} color="#FFFFFF" />
              <Text style={styles.checklistAccordionTitle}>
                5. Checklist de Verificação ({checklist.filter(c => c.checked).length}/{checklist.length})
              </Text>
            </View>
            <Ionicons name={showChecklist ? "chevron-up" : "chevron-down"} size={18} color="#FFFFFF" />
          </TouchableOpacity>

          {showChecklist && (
            <View style={styles.accordionBody}>
              <Text style={styles.subHintText}>
                Toque para alternar o status de inspeção (área de toque confortável de 48px):
              </Text>

              {checklist.map((item, idx) => (
                <View key={item.id} style={styles.checkItemContainer}>
                  <TouchableOpacity 
                    style={[styles.checkItemRow, item.checked && styles.checkItemRowActive]}
                    onPress={() => toggleChecklistItem(idx)}
                  >
                    <Ionicons 
                      name={item.checked ? "checkbox" : "square-outline"} 
                      size={24} 
                      color={item.checked ? "#16A34A" : Colors.textMuted} 
                    />
                    <Text style={[styles.checkItemText, item.checked && styles.checkItemTextActive]}>
                      {item.item}
                    </Text>
                  </TouchableOpacity>

                  {item.checked && (
                    <View style={styles.obsBox}>
                      <TextInput
                        style={styles.obsInput}
                        placeholder="Adicionar nota específica deste item..."
                        value={item.observacao}
                        onChangeText={txt => updateChecklistObservacao(idx, txt)}
                        multiline
                      />
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 6º Card de Acompanhantes da Visita */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.sectionTitle}>6. Acompanhantes da Visita ({acompanhantesList.length})</Text>
            <TouchableOpacity 
              style={styles.addBtnSmall}
              onPress={() => setShowAcompanhanteModal(true)}
            >
              <Ionicons name="add" size={16} color="#0284C7" />
              <Text style={styles.addBtnSmallText}>+ Adicionar</Text>
            </TouchableOpacity>
          </View>

          {acompanhantesList.length === 0 ? (
            <Text style={styles.emptyText}>Nenhum acompanhante cadastrado (engenheiro residente, mestre de obras, etc.).</Text>
          ) : (
            acompanhantesList.map((acomp, idx) => (
              <View key={idx} style={styles.acompItemRow}>
                <Ionicons name="person-circle-outline" size={20} color="#0284C7" />
                <Text style={styles.acompText}>{acomp}</Text>
                <TouchableOpacity onPress={() => handleRemoveAcompanhante(idx)}>
                  <Ionicons name="close-circle" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* 7º Observações Gerais */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>7. Observações Gerais & Parecer Técnico</Text>
          <View style={styles.inputGroup}>
            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              numberOfLines={4}
              placeholder="Diagnóstico pericial, condições encontradas em campo, testes realizados..."
              value={descricao}
              onChangeText={setDescricao}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Recomendações e Instruções à Construtora</Text>
            <TextInput
              style={[styles.input, styles.textAreaSmall]}
              multiline
              numberOfLines={3}
              placeholder="Prazos, diretrizes executivas e determinações técnicas..."
              value={observacoesFinais}
              onChangeText={setObservacoesFinais}
            />
          </View>
        </View>

        {/* 8º Galeria de Fotos Mobile-First com Barra Superior Adesiva (56px) */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>8. Galeria de Fotos do Laudo ({fotos.length} fotos)</Text>

          {/* Barra Fixa / Adesiva de 56px de altura (Seção 15.7) */}
          <View style={styles.stickyPhotoBar}>
            <TouchableOpacity style={styles.cameraBigBtn} onPress={handleAddPhotoCamera}>
              <Ionicons name="camera" size={24} color="#FFFFFF" />
              <Text style={styles.cameraBigBtnText}>Câmera</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.galleryBigBtn} onPress={handleAddPhotoGallery}>
              <Ionicons name="images" size={24} color="#FFFFFF" />
              <Text style={styles.galleryBigBtnText}>Galeria</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.photoCountRow}>
            <Text style={styles.photoCountText}>Capacidade: {fotos.length} / 200 fotos</Text>
          </View>

          {fotos.map((item, index) => (
            <View key={item.id} style={styles.photoCard}>
              <View style={styles.thumbWrapper}>
                {(() => {
                  const resolvedUri = item.uri_local 
                    || (item.base64 ? (item.base64.startsWith('data:') ? item.base64 : `data:image/jpeg;base64,${item.base64}`) : null)
                    || (item.url?.startsWith('http') ? item.url : (item.url ? `https://elpandroid-production.up.railway.app${item.url.startsWith('/') ? '' : '/'}${item.url}` : null));
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

                {/* Legenda Obrigatória com indicação visual */}
                <View style={{ marginBottom: 6 }}>
                  <Text style={[styles.legendaLabel, !item.legenda && { color: '#DC2626' }]}>
                    Legenda Técnica {!item.legenda ? '(Obrigatória *)' : '✓'}
                  </Text>
                  <TextInput
                    style={[styles.legendaInput, !item.legenda && styles.legendaInputMissing]}
                    placeholder="Digite a legenda da patologia..."
                    value={item.legenda}
                    onChangeText={txt => {
                      const updated = [...fotos];
                      updated[index].legenda = txt;
                      setFotos(updated);
                    }}
                  />
                </View>

                <View style={styles.photoActionRow}>
                  <TouchableOpacity 
                    style={styles.editShapesBtn}
                    onPress={() => {
                      setEditingPhotoIndex(index);
                      setShowEditorModal(true);
                    }}
                  >
                    <Ionicons name="brush-outline" size={14} color="#7C3AED" />
                    <Text style={styles.editShapesText}>Editar (Setas/Círculos)</Text>
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

        {/* 9º Card de Lembrete para a Próxima Visita */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.sectionTitle}>9. Lembretes para a Próxima Visita</Text>
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
                placeholder="Ex: Checar cura da argamassa no 14º andar..."
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

        {/* 10º Barra Inferior de Ações Finais: Regras Estritas das Seções 15.7 e 16 */}
        {/* Lado Esquerdo: "Enviar para Aprovação" (Amarelo warning com paper-plane) */}
        {/* Lado Direito: "Salvar / Concluir Relatório" (Azul primary com save) */}
        <View style={styles.bottomButtonsRow}>
          <TouchableOpacity 
            style={[styles.btnWarningSubmit, loading && styles.btnDisabled]} 
            onPress={() => handleSaveReport('Aguardando Aprovação')}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#1E293B" size="small" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={18} color="#1E293B" />
                <Text style={styles.btnWarningSubmitText}>
                  Enviar para Aprovação
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.btnPrimarySave, loading && styles.btnDisabled]} 
            onPress={() => handleSaveReport('em_andamento')}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="save" size={18} color="#FFFFFF" />
                <Text style={styles.btnPrimarySaveText}>
                  Salvar / Concluir
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modal Adicionar Acompanhante */}
      <Modal visible={showAcompanhanteModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentSmall}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo Acompanhante</Text>
              <TouchableOpacity onPress={() => setShowAcompanhanteModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nome Completo *</Text>
              <TextInput style={styles.input} value={novoAcompNome} onChangeText={setNovoAcompNome} placeholder="Ex: Eng. Roberto Santos" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Cargo / Função</Text>
              <TextInput style={styles.input} value={novoAcompCargo} onChangeText={setNovoAcompCargo} placeholder="Ex: Engenheiro Residente" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Empresa / Construtora</Text>
              <TextInput style={styles.input} value={novoAcompEmpresa} onChangeText={setNovoAcompEmpresa} placeholder="Ex: Construtora Alpha" />
            </View>

            <TouchableOpacity style={styles.primaryModalBtn} onPress={handleAddAcompanhante}>
              <Text style={styles.primaryModalBtnText}>Confirmar Acompanhante</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.text, marginBottom: 10 },
  subHintText: { fontSize: 12, color: Colors.textSecondary, marginBottom: 12 },
  chipScroll: { flexDirection: 'row', marginBottom: 10 },
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
  helperText: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  dateInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  dateInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  lockedNumberBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
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
  textArea: { height: 90, textAlignVertical: 'top', paddingVertical: 8 },
  textAreaSmall: { height: 70, textAlignVertical: 'top', paddingVertical: 8 },
  
  // Accordions
  accordionCard: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
    ...Shadows.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  techAccordionHeader: {
    backgroundColor: '#0284C7', // Azul-petróleo conforme Seção 15.7
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  techAccordionTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checklistAccordionHeader: {
    backgroundColor: '#334155', // Grafite escuro conforme Seção 15.7
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  checklistAccordionTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  accordionBody: {
    padding: 14,
    backgroundColor: '#FFFFFF',
  },
  techDetailsBox: {
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    gap: 6,
  },
  techDetailItem: {
    fontSize: 12,
    color: '#0369A1',
    lineHeight: 18,
  },
  techDetailBold: {
    fontWeight: 'bold',
  },
  emptyText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },

  // Checklist 48px Touch Target
  checkItemContainer: {
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 6,
  },
  checkItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48, // 48px touch target
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 10,
  },
  checkItemRowActive: {
    backgroundColor: '#F0FDF4',
  },
  checkItemText: {
    fontSize: 13,
    color: '#334155',
    flex: 1,
  },
  checkItemTextActive: {
    fontWeight: '600',
    color: '#166534',
  },
  obsBox: {
    marginTop: 4,
    marginLeft: 34,
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

  // Acompanhantes
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  addBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  addBtnSmallText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0284C7',
  },
  acompItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
    gap: 8,
  },
  acompText: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },

  // Sticky Photo Bar (56px)
  stickyPhotoBar: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  cameraBigBtn: {
    flex: 1,
    height: 56, // 56px de altura
    backgroundColor: '#0284C7', // Azul
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Shadows.sm,
  },
  cameraBigBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  galleryBigBtn: {
    flex: 1,
    height: 56, // 56px de altura
    backgroundColor: '#16A34A', // Verde
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Shadows.sm,
  },
  galleryBigBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  photoCountRow: {
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  photoCountText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
  },
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
    width: 86,
    height: 86,
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
  photoTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  photoNum: { fontSize: 13, fontWeight: 'bold', color: Colors.text },
  legendaLabel: { fontSize: 11, fontWeight: '600', color: '#475569', marginBottom: 2 },
  legendaInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    height: 36,
    fontSize: 12,
  },
  legendaInputMissing: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  photoActionRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  editShapesBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.25)',
    paddingVertical: 5,
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
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 6,
    justifyContent: 'center',
  },
  predefText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },

  // Lembretes
  addReminderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  addReminderText: { color: Colors.primary, fontWeight: 'bold', fontSize: 12 },
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
  saveReminderText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 },
  emptyRemindersText: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
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
  reminderText: { fontSize: 13, fontWeight: '600', color: '#92400E' },
  reminderDate: { fontSize: 11, color: '#B45309', marginTop: 2 },
  closeReminderBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D97706',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  closeReminderText: { color: '#D97706', fontSize: 11, fontWeight: 'bold' },

  // Bottom Buttons: Lado Esquerdo Amarelo Warning | Lado Direito Azul Primary (Seção 15.7 & 16)
  bottomButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  btnWarningSubmit: {
    flex: 1,
    height: 50,
    backgroundColor: '#F59E0B', // btn-warning amarelo
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...Shadows.md,
  },
  btnWarningSubmitText: {
    color: '#1E293B', // text-dark
    fontWeight: 'bold',
    fontSize: 13,
  },
  btnPrimarySave: {
    flex: 1,
    height: 50,
    backgroundColor: '#0284C7', // btn-primary azul
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...Shadows.md,
  },
  btnPrimarySaveText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  btnDisabled: { opacity: 0.6 },

  // Modais
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
  modalContentSmall: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text },
  primaryModalBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryModalBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
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
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#F0FDF4',
    borderBottomWidth: 1,
    borderBottomColor: '#DCFCE7',
    gap: 6,
  },
  autoSaveText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '600',
  },
  userInteractingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  userAvatarBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0F2027',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  userAvatarInitials: {
    color: '#D4AF37',
    fontSize: 14,
    fontWeight: '700',
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#16A34A',
  },
  userInteractingStatus: {
    fontSize: 10,
    color: '#16A34A',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  userInteractingName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  userInteractingRole: {
    fontSize: 11,
    color: '#64748B',
  },
  reportBadgeMini: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 4,
  },
  reportBadgeMiniText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F2027',
  },
});
