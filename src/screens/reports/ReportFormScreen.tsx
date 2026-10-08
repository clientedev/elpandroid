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
  migrateLocalFotosRelatorioId, getDatabase, getLocalChecklistTemplate,
  getChecklistProgressoObra, saveBatchChecklistProgressoObra, getLocalRelatorios,
  updateLocalProjetoInfoTecnica
} from '../../database/db';
import { takePhoto, pickImage, readPhotoBase64 } from '../../services/imageService';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { apiClient } from '../../services/api';
import { notificationService } from '../../services/notificationService';

import { Projeto, Relatorio, FotoRelatorio, LegendaPredefinida, Lembrete, ChecklistProgressoObra } from '../../types';
import { Colors, Shadows } from '../../theme/colors';
import * as Location from 'expo-location';

export interface ChecklistItemState {
  id: number;
  item: string;
  ordem?: number;
  checked: boolean;
  observacao: string;
  aprovado_anteriormente?: boolean;
  aprovado_em_relatorio_numero?: string;
  data_aprovacao?: string;
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
  const [showProjectPickerModal, setShowProjectPickerModal] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
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

  // Legend picker modal com filtro de categorias
  const [legendas, setLegendas] = useState<LegendaPredefinida[]>([]);
  const [showLegendModal, setShowLegendModal] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [selectedLegendCategory, setSelectedLegendCategory] = useState<string>('Todas');
  const [legendSearchText, setLegendSearchText] = useState<string>('');

  const legendCategories = React.useMemo(() => {
    const cats = new Set<string>();
    cats.add('Todas');
    for (const l of legendas) {
      if (l.categoria && l.categoria.trim()) {
        cats.add(l.categoria.trim());
      }
    }
    return Array.from(cats);
  }, [legendas]);

  const filteredLegendas = React.useMemo(() => {
    return legendas.filter(l => {
      const matchCat = selectedLegendCategory === 'Todas' || (l.categoria || '').trim() === selectedLegendCategory;
      const matchSearch = !legendSearchText.trim() || 
        (l.texto && l.texto.toLowerCase().includes(legendSearchText.toLowerCase())) ||
        (l.categoria && l.categoria.toLowerCase().includes(legendSearchText.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [legendas, selectedLegendCategory, legendSearchText]);

  const [loading, setLoading] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const isProcessingPhotoRef = useRef(false);
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

  // 12 Campos de Informações Técnicas da Obra
  const [techElementosBase, setTechElementosBase] = useState('');
  const [techChapiscoColante, setTechChapiscoColante] = useState('');
  const [techChapiscoAlvenaria, setTechChapiscoAlvenaria] = useState('');
  const [techArgamassaEmboco, setTechArgamassaEmboco] = useState('');
  const [techFormaAplicacaoArgamassa, setTechFormaAplicacaoArgamassa] = useState('');
  const [techAcabamentosRevestimento, setTechAcabamentosRevestimento] = useState('');
  const [techAcabamentoPeitoris, setTechAcabamentoPeitoris] = useState('');
  const [techAcabamentoMuretas, setTechAcabamentoMuretas] = useState('');
  const [techDefinicaoFrisosCor, setTechDefinicaoFrisosCor] = useState('');
  const [techDefinicaoFaceInferiorAbas, setTechDefinicaoFaceInferiorAbas] = useState('');
  const [techObservacoesFachada, setTechObservacoesFachada] = useState('');
  const [techOutrasObservacoes, setTechOutrasObservacoes] = useState('');

  // Sincroniza informações técnicas com a obra selecionada
  useEffect(() => {
    if (selectedProj) {
      setTechElementosBase(selectedProj.elementos_construtivos_base || '');
      setTechChapiscoColante(selectedProj.especificacao_chapisco_colante || '');
      setTechChapiscoAlvenaria(selectedProj.especificacao_chapisco_alvenaria || '');
      setTechArgamassaEmboco(selectedProj.especificacao_argamassa_emboco || '');
      setTechFormaAplicacaoArgamassa(selectedProj.forma_aplicacao_argamassa || '');
      setTechAcabamentosRevestimento(selectedProj.acabamentos_revestimento || '');
      setTechAcabamentoPeitoris(selectedProj.acabamento_peitoris || '');
      setTechAcabamentoMuretas(selectedProj.acabamento_muretas || '');
      setTechDefinicaoFrisosCor(selectedProj.definicao_frisos_cor || '');
      setTechDefinicaoFaceInferiorAbas(selectedProj.definicao_face_inferior_abas || '');
      setTechObservacoesFachada(selectedProj.observacoes_projeto_fachada || '');
      setTechOutrasObservacoes(selectedProj.outras_observacoes || '');
    }
  }, [selectedProj]);

  const handleSaveTechInfo = useCallback(async () => {
    if (!selectedProjectId) {
      Alert.alert('Aviso', 'Nenhuma obra associada a este relatório.');
      return;
    }
    try {
      const infoPayload = {
        elementos_construtivos_base: techElementosBase.trim(),
        especificacao_chapisco_colante: techChapiscoColante.trim(),
        especificacao_chapisco_alvenaria: techChapiscoAlvenaria.trim(),
        especificacao_argamassa_emboco: techArgamassaEmboco.trim(),
        forma_aplicacao_argamassa: techFormaAplicacaoArgamassa.trim(),
        acabamentos_revestimento: techAcabamentosRevestimento.trim(),
        acabamento_peitoris: techAcabamentoPeitoris.trim(),
        acabamento_muretas: techAcabamentoMuretas.trim(),
        definicao_frisos_cor: techDefinicaoFrisosCor.trim(),
        definicao_face_inferior_abas: techDefinicaoFaceInferiorAbas.trim(),
        observacoes_projeto_fachada: techObservacoesFachada.trim(),
        outras_observacoes: techOutrasObservacoes.trim(),
      };

      await updateLocalProjetoInfoTecnica(selectedProjectId, infoPayload);

      if (isOnline) {
        apiClient.axios.put(`/api/projetos/${selectedProjectId}`, infoPayload).catch(err => {
          console.warn('[ReportForm] Aviso de sincronização técnica:', err);
        });
      }

      setProjetos(prev => prev.map(p => p.id === selectedProjectId ? { ...p, ...infoPayload } : p));
      Alert.alert('Sucesso', 'Informações técnicas da obra atualizadas com sucesso!');
    } catch (err: any) {
      Alert.alert('Erro', 'Não foi possível salvar as informações técnicas: ' + err.message);
    }
  }, [selectedProjectId, techElementosBase, techChapiscoColante, techChapiscoAlvenaria, techArgamassaEmboco, techFormaAplicacaoArgamassa, techAcabamentosRevestimento, techAcabamentoPeitoris, techAcabamentoMuretas, techDefinicaoFrisosCor, techDefinicaoFaceInferiorAbas, techObservacoesFachada, techOutrasObservacoes, isOnline]);

  // Função central para persistência imediata de rascunho
  const saveDraftImmediately = useCallback(async () => {
    try {
      setIsAutoSaving(true);
      const proj = projetosRef.current.find(p => p.id === selectedProjectId) || projetosRef.current[0];
      const projId = selectedProjectId || proj?.id || 1;
      const projNome = proj?.nome || 'Obra';

      // 1. Salva informações técnicas da obra no SQLite se houver obra selecionada
      if (selectedProjectId) {
        const infoPayload = {
          elementos_construtivos_base: techElementosBase.trim(),
          especificacao_chapisco_colante: techChapiscoColante.trim(),
          especificacao_chapisco_alvenaria: techChapiscoAlvenaria.trim(),
          especificacao_argamassa_emboco: techArgamassaEmboco.trim(),
          forma_aplicacao_argamassa: techFormaAplicacaoArgamassa.trim(),
          acabamentos_revestimento: techAcabamentosRevestimento.trim(),
          acabamento_peitoris: techAcabamentoPeitoris.trim(),
          acabamento_muretas: techAcabamentoMuretas.trim(),
          definicao_frisos_cor: techDefinicaoFrisosCor.trim(),
          definicao_face_inferior_abas: techDefinicaoFaceInferiorAbas.trim(),
          observacoes_projeto_fachada: techObservacoesFachada.trim(),
          outras_observacoes: techOutrasObservacoes.trim(),
        };
        await updateLocalProjetoInfoTecnica(selectedProjectId, infoPayload);
        if (isOnline) {
          apiClient.axios.put(`/api/projetos/${selectedProjectId}`, infoPayload).catch(() => null);
        }
      }

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
        acompanhantes: JSON.stringify(acompanhantesList),
        categoria: categoria,
        local: local,
        status: 'em_andamento', // RASCUNHO GARANTIDO
        sync_status: 'pending',
        updated_at: new Date().toISOString(),
      };

      // 2. Salva no SQLite local
      await saveLocalRelatorio(draftObj, 'pending');

      // 3. Persistir fotos atuais no SQLite
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
    checklist, acompanhantesList, categoria, local, fotos, isOnline,
    techElementosBase, techChapiscoColante, techChapiscoAlvenaria,
    techArgamassaEmboco, techFormaAplicacaoArgamassa, techAcabamentosRevestimento,
    techAcabamentoPeitoris, techAcabamentoMuretas, techDefinicaoFrisosCor,
    techDefinicaoFaceInferiorAbas, techObservacoesFachada, techOutrasObservacoes
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
        const targetId = currentReportId || initialReportId;
        if (targetId && isOnline) {
          apiClient.axios
            .post(`/api/relatorios/${targetId}/unlock`, { user_id: user?.id }, { timeout: 3000 })
            .catch(() => null);
        }
        navigation.goBack();
      });
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [saveDraftImmediately, navigation, currentReportId, initialReportId, isOnline, user]);

  // Intercepta qualquer saída da navegação (incluindo gestos e pop)
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', () => {
      saveDraftImmediately().catch(() => null);
      const targetId = currentReportId || initialReportId;
      if (targetId && isOnline) {
        apiClient.axios
          .post(`/api/relatorios/${targetId}/unlock`, { user_id: user?.id }, { timeout: 3000 })
          .catch(() => null);
      }
    });
    return unsub;
  }, [navigation, saveDraftImmediately, initialReportId, currentReportId, isOnline, user]);

  // Bloqueio Colaborativo: Impede entrar no relatório se outro usuário estiver preenchendo
  useEffect(() => {
    if (!initialReportId) return;

    let isCancelled = false;
    async function acquireLock() {
      try {
        const userName = (user as any)?.nome_completo || user?.username || 'Outro Usuário';
        const res = await apiClient.axios.post(
          `/api/relatorios/${initialReportId}/lock`,
          { user_id: user?.id, user_nome: userName },
          { timeout: 5000 }
        );

        if (res?.data?.locked && !isCancelled) {
          const editor = res.data.usuario_em_edicao_nome || 'outro usuário';
          Alert.alert(
            'Relatório em Preenchimento',
            `Este relatório já está aberto e sendo preenchido no momento por:\n\n👤 ${editor}\n\nVocê não pode entrar neste relatório até que ele finalize e saia para evitar perda ou sobrescrita de dados.`,
            [
              {
                text: 'OK, Voltar',
                onPress: () => navigation.goBack(),
              },
            ],
            { cancelable: false }
          );
        }
      } catch (e) {
        console.warn('[ReportForm] Verificação de lock colaborativo offline:', e);
      }
    }

    acquireLock();

    return () => {
      isCancelled = true;
      const targetId = currentReportId || initialReportId;
      if (targetId && isOnline) {
        apiClient.axios
          .post(`/api/relatorios/${targetId}/unlock`, { user_id: user?.id }, { timeout: 3000 })
          .catch(() => null);
      }
    };
  }, [initialReportId, currentReportId, isOnline, user, navigation]);

  // Carrega e mescla o checklist (template configurado + histórico de aprovações da obra)
  const loadChecklistForProject = useCallback(async (projId: number, existingChecklistJson?: string) => {
    try {
      const template = await getLocalChecklistTemplate();
      const progressoObra = await getChecklistProgressoObra(projId);

      // Complementa com o histórico de relatórios anteriores desta obra
      try {
        const relsObra = await getLocalRelatorios(projId);
        for (const rel of relsObra) {
          const raw = rel.checklist_data || (rel as any).checklist;
          if (raw) {
            const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (Array.isArray(arr)) {
              for (const it of arr) {
                if (it && it.checked && it.item) {
                  const k = String(it.item).trim().toLowerCase();
                  if (!progressoObra.some(p => p.item_texto.trim().toLowerCase() === k)) {
                    progressoObra.push({
                      projeto_id: projId,
                      item_texto: it.item,
                      aprovado: true,
                      aprovado_em_relatorio_numero: rel.numero || undefined,
                      data_aprovacao: rel.data_relatorio || rel.created_at || undefined,
                      observacao: it.observacao || undefined,
                    });
                  }
                }
              }
            }
          }
        }
      } catch {}

      let savedChecks: ChecklistItemState[] = [];
      if (existingChecklistJson) {
        try {
          savedChecks = JSON.parse(existingChecklistJson);
        } catch {}
      }

      // Deduplica baseItems rigorosamente por texto normalizado para evitar duplicações
      const uniqueBaseMap = new Map<string, { id: number; item: string; ordem: number }>();
      const rawBase = template.length > 0 
        ? template.map((t, idx) => ({ id: t.id, item: t.item, ordem: t.ordem || idx + 1 }))
        : DEFAULT_CHECKLIST.map((d, idx) => ({ id: d.id, item: d.item, ordem: idx + 1 }));

      for (const b of rawBase) {
        if (!b.item) continue;
        const normKey = b.item.trim().toLowerCase();
        if (!uniqueBaseMap.has(normKey)) {
          uniqueBaseMap.set(normKey, b);
        }
      }

      // Adiciona itens que estavam no rascunho anterior e não estão no template
      for (const s of savedChecks) {
        if (!s.item) continue;
        const normKey = s.item.trim().toLowerCase();
        if (!uniqueBaseMap.has(normKey)) {
          uniqueBaseMap.set(normKey, { id: s.id || (uniqueBaseMap.size + 1), item: s.item, ordem: uniqueBaseMap.size + 1 });
        }
      }

      const baseItems = Array.from(uniqueBaseMap.values());

      const merged: ChecklistItemState[] = baseItems.map((base, idx) => {
        // Verifica se já foi aprovado em algum relatório anterior desta obra
        const prevAppr = progressoObra.find(p => 
          p.item_texto.trim().toLowerCase() === base.item.trim().toLowerCase()
        );

        // Verifica se tem estado já salvo no rascunho atual
        const savedItem = savedChecks.find(s => 
          s.item?.trim().toLowerCase() === base.item.trim().toLowerCase() || s.id === base.id
        );

        const isChecked = Boolean(savedItem ? savedItem.checked : (prevAppr && prevAppr.aprovado));

        return {
          id: idx + 1,
          item: base.item,
          ordem: idx + 1,
          checked: isChecked,
          observacao: savedItem?.observacao || prevAppr?.observacao || '',
          aprovado_anteriormente: Boolean(prevAppr && prevAppr.aprovado),
          aprovado_em_relatorio_numero: prevAppr?.aprovado_em_relatorio_numero || undefined,
          data_aprovacao: prevAppr?.data_aprovacao || undefined,
        };
      });

      setChecklist(merged);
    } catch (e) {
      console.warn('Erro ao carregar checklist para a obra:', e);
    }
  }, []);

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
          if (r.acompanhantes) {
            try {
              const aList = JSON.parse(r.acompanhantes);
              if (Array.isArray(aList)) setAcompanhantesList(aList);
            } catch {}
          }
          await loadChecklistForProject(r.projeto_id, r.checklist_data);
          const savedFotos = await getLocalFotos(r.id, r.uuid);
          if (savedFotos && savedFotos.length > 0) {
            // Deduplica estritamente para não exibir duplicadas ao reabrir relatório
            const seenFp = new Set<string>();
            const uniqueSaved = savedFotos.filter(sf => {
              const rawName = sf.filename 
                || (sf.uri_local ? sf.uri_local.split('/').pop()?.split('?')[0] : null)
                || (sf.url ? sf.url.split('/').pop()?.split('?')[0] : null);
              const m = rawName ? rawName.match(/elp_(?:foto|import)_[0-9]+_[0-9]+\.jpg/i) : null;
              const fp = m ? m[0].toLowerCase() : (rawName ? rawName.toLowerCase() : `id_${sf.id}`);
              if (seenFp.has(fp)) return false;
              seenFp.add(fp);
              return true;
            });
            setFotos(uniqueSaved);
          }
        }
      });
    }
  }, [initialReportId, loadChecklistForProject]);

  // Ao selecionar/trocar de obra (quando novo relatório), inicializa checklist com histórico daquela obra
  useEffect(() => {
    if (selectedProjectId && !initialReportId) {
      loadChecklistForProject(selectedProjectId);
      getLocalLembretes(selectedProjectId, true).then(l => setLembretes(l));
    } else if (selectedProjectId) {
      getLocalLembretes(selectedProjectId, true).then(l => setLembretes(l));
    }
  }, [selectedProjectId, initialReportId, loadChecklistForProject]);

  // Mecanismo de AutoSave a cada 2 segundos após parar de digitar (debounce de 2000ms conforme Regra do Manual)
  useEffect(() => {
    if (!selectedProjectId) return;

    const timer = setTimeout(async () => {
      try {
        setIsAutoSaving(true);
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
          acompanhantes: JSON.stringify(acompanhantesList),
          categoria: categoria,
          local: local,
          status: 'em_andamento',
          sync_status: 'pending',
        };

        // 0. Salva informações técnicas da obra no SQLite se houver obra selecionada
        if (selectedProjectId) {
          const infoPayload = {
            elementos_construtivos_base: techElementosBase.trim(),
            especificacao_chapisco_colante: techChapiscoColante.trim(),
            especificacao_chapisco_alvenaria: techChapiscoAlvenaria.trim(),
            especificacao_argamassa_emboco: techArgamassaEmboco.trim(),
            forma_aplicacao_argamassa: techFormaAplicacaoArgamassa.trim(),
            acabamentos_revestimento: techAcabamentosRevestimento.trim(),
            acabamento_peitoris: techAcabamentoPeitoris.trim(),
            acabamento_muretas: techAcabamentoMuretas.trim(),
            definicao_frisos_cor: techDefinicaoFrisosCor.trim(),
            definicao_face_inferior_abas: techDefinicaoFaceInferiorAbas.trim(),
            observacoes_projeto_fachada: techObservacoesFachada.trim(),
            outras_observacoes: techOutrasObservacoes.trim(),
          };
          await updateLocalProjetoInfoTecnica(selectedProjectId, infoPayload);
          if (isOnline) {
            apiClient.axios.put(`/api/projetos/${selectedProjectId}`, infoPayload).catch(() => null);
          }
        }

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
              await apiClient.axios.put(`/api/relatorios/${currentReportId}`, {
                ...draft,
                autor_id: user?.id,
                fotos: preparedFotos,
              }, { timeout: 12000 });
              await saveLocalRelatorio({ ...draft, sync_status: 'synced' }, 'synced');
            } else {
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
  }, [
    selectedProjectId, titulo, dataVisita, descricao, observacoesFinais, checklist,
    acompanhantesList, fotos, categoria, local, reportNumber, currentReportId, isOnline,
    techElementosBase, techChapiscoColante, techChapiscoAlvenaria, techArgamassaEmboco,
    techFormaAplicacaoArgamassa, techAcabamentosRevestimento, techAcabamentoPeitoris,
    techAcabamentoMuretas, techDefinicaoFrisosCor, techDefinicaoFaceInferiorAbas,
    techObservacoesFachada, techOutrasObservacoes
  ]);

  async function handleAddPhotoCamera() {
    if (isProcessingPhotoRef.current) return;
    isProcessingPhotoRef.current = true;
    setIsProcessingPhoto(true);

    try {
      const photo = await takePhoto(selectedProj?.nome);
      if (photo && photo.uri) {
        let b64 = photo.base64;
        if (!b64 && photo.uri) {
          b64 = await readPhotoBase64(photo.uri);
        }
        const photoFilename = photo.filename || `elp_foto_${Date.now()}_${Math.floor(100 + Math.random() * 900)}.jpg`;
        const newFoto: FotoRelatorio = {
          id: Date.now(),
          relatorio_id: currentReportId,
          relatorio_uuid: reportUuid,
          filename: photoFilename,
          uri_local: photo.uri,
          base64: b64,
          ordem: fotos.length,
          legenda: '',
          local: local,
          anotacoes_dados: '',
          sync_status: isOnline ? 'synced' : 'pending',
        };

        // Prevenção rigorosa de duplicidade no estado em tempo real
        setFotos(prev => {
          const isDuplicate = prev.some(existing => {
            if (newFoto.filename && existing.filename && existing.filename.toLowerCase() === newFoto.filename.toLowerCase()) return true;
            if (newFoto.uri_local && existing.uri_local && existing.uri_local === newFoto.uri_local) return true;
            if (newFoto.base64 && existing.base64 && existing.base64.length > 50 && existing.base64 === newFoto.base64) return true;
            return false;
          });
          if (isDuplicate) {
            console.log('[ReportForm] Foto já existente no formulário. Duplicação evitada.');
            return prev;
          }
          return [...prev, newFoto];
        });

        await saveLocalFoto(newFoto, isOnline ? 'synced' : 'pending');
      }
    } catch (errCam) {
      console.warn('[ReportForm] Erro ao adicionar foto da câmera:', errCam);
    } finally {
      isProcessingPhotoRef.current = false;
      setIsProcessingPhoto(false);
    }
  }

  async function handleAddPhotoGallery() {
    if (isProcessingPhotoRef.current) return;
    isProcessingPhotoRef.current = true;
    setIsProcessingPhoto(true);

    try {
      const photo = await pickImage(selectedProj?.nome);
      if (photo && photo.uri) {
        let b64 = photo.base64;
        if (!b64 && photo.uri) {
          b64 = await readPhotoBase64(photo.uri);
        }
        const photoFilename = photo.filename || `elp_import_${Date.now()}_${Math.floor(100 + Math.random() * 900)}.jpg`;
        const newFoto: FotoRelatorio = {
          id: Date.now(),
          relatorio_id: currentReportId,
          relatorio_uuid: reportUuid,
          filename: photoFilename,
          uri_local: photo.uri,
          base64: b64,
          ordem: fotos.length,
          legenda: '',
          local: local,
          anotacoes_dados: '',
          sync_status: isOnline ? 'synced' : 'pending',
        };

        // Prevenção rigorosa de duplicidade no estado em tempo real
        setFotos(prev => {
          const isDuplicate = prev.some(existing => {
            if (newFoto.filename && existing.filename && existing.filename.toLowerCase() === newFoto.filename.toLowerCase()) return true;
            if (newFoto.uri_local && existing.uri_local && existing.uri_local === newFoto.uri_local) return true;
            if (newFoto.base64 && existing.base64 && existing.base64.length > 50 && existing.base64 === newFoto.base64) return true;
            return false;
          });
          if (isDuplicate) {
            console.log('[ReportForm] Foto já existente no formulário. Duplicação evitada.');
            return prev;
          }
          return [...prev, newFoto];
        });

        await saveLocalFoto(newFoto, isOnline ? 'synced' : 'pending');
      }
    } catch (errGal) {
      console.warn('[ReportForm] Erro ao selecionar foto da galeria:', errGal);
    } finally {
      isProcessingPhotoRef.current = false;
      setIsProcessingPhoto(false);
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
        acompanhantes: JSON.stringify(acompanhantesList),
        categoria: categoria,
        local: local,
        status: status,
        sync_status: 'pending',
      };

      // 1. Save Relatorio to SQLite
      await saveLocalRelatorio(relData, 'pending');

      // Salva progresso cumulativo das etapas de checklist checadas para a obra
      if (selectedProjectId) {
        const checkedItems = checklist.filter(c => c.checked);
        if (checkedItems.length > 0) {
          await saveBatchChecklistProgressoObra(
            selectedProjectId,
            checkedItems.map(c => ({
              item_texto: c.item,
              ordem: c.ordem || c.id,
              aprovado_em_relatorio_id: reportId,
              aprovado_em_relatorio_numero: reportNumber,
              data_aprovacao: dataVisita || new Date().toISOString(),
              observacao: c.observacao || '',
            }))
          ).catch(cpErr => console.warn('[ReportForm] Erro ao salvar progresso cumulativo:', cpErr));
        }

        // Salva simultaneamente as informações técnicas da obra preenchidas no formulário
        updateLocalProjetoInfoTecnica(selectedProjectId, {
          elementos_construtivos_base: techElementosBase.trim(),
          especificacao_chapisco_colante: techChapiscoColante.trim(),
          especificacao_chapisco_alvenaria: techChapiscoAlvenaria.trim(),
          especificacao_argamassa_emboco: techArgamassaEmboco.trim(),
          forma_aplicacao_argamassa: techFormaAplicacaoArgamassa.trim(),
          acabamentos_revestimento: techAcabamentosRevestimento.trim(),
          acabamento_peitoris: techAcabamentoPeitoris.trim(),
          acabamento_muretas: techAcabamentoMuretas.trim(),
          definicao_frisos_cor: techDefinicaoFrisosCor.trim(),
          definicao_face_inferior_abas: techDefinicaoFaceInferiorAbas.trim(),
          observacoes_projeto_fachada: techObservacoesFachada.trim(),
          outras_observacoes: techOutrasObservacoes.trim(),
        }).catch(err => console.warn('[ReportForm] Erro ao salvar info técnica da obra:', err));
      }

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
            const targetId = currentReportId || initialReportId;
            if (targetId && isOnline) {
              apiClient.axios
                .post(`/api/relatorios/${targetId}/unlock`, { user_id: user?.id }, { timeout: 3000 })
                .catch(() => null);
            }
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
          const targetId = currentReportId || initialReportId;
          if (targetId && isOnline) {
            apiClient.axios
              .post(`/api/relatorios/${targetId}/unlock`, { user_id: user?.id }, { timeout: 3000 })
              .catch(() => null);
          }
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

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Bloco 1: Data da Visita, Obra e Número */}
        <View style={styles.card}>
          <Text style={styles.sectionHeaderTitle}>Identificação da Visita</Text>

          {/* 1º Campo: Data da Visita */}
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

          {/* 2º Campo: Obra do Relatório (Valor Fixo) */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>2. Obra do Relatório</Text>
            <View style={styles.fixedProjectCard}>
              <View style={styles.fixedProjectIconWrap}>
                <Ionicons name="business" size={22} color="#0284C7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fixedProjectName}>
                  {selectedProj?.numero ? `[${selectedProj.numero}] ` : ''}{selectedProj?.nome || 'Obra Selecionada'}
                </Text>
                <Text style={styles.fixedProjectSub}>
                  {selectedProj?.construtora || 'ObraFlow'} • {selectedProj?.tipo_obra || 'Edificação'}
                </Text>
              </View>
              <View style={styles.fixedProjectLockBadge}>
                <Ionicons name="lock-closed" size={13} color="#64748B" />
                <Text style={styles.fixedProjectLockText}>Fixo</Text>
              </View>
            </View>
          </View>

          {/* 3º Campo: Número do Relatório */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>3. Número do Relatório</Text>
            <View style={styles.lockedNumberBox}>
              <Ionicons name="lock-closed" size={16} color="#64748B" />
              <Text style={styles.lockedNumberText}>{reportNumber}</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Título do Laudo</Text>
            <TextInput style={styles.input} value={titulo} onChangeText={setTitulo} />
          </View>
        </View>

        {/* 4º Sanfona Colapsável 1: Informações Técnicas da Obra (Preenchível e Editável) */}
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
              <View style={styles.techFormContainer}>
                <View style={styles.techInputGroup}>
                  <Text style={styles.techInputLabel}>Elementos construtivos da base</Text>
                  <TextInput 
                    style={styles.techInput} 
                    value={techElementosBase} 
                    onChangeText={setTechElementosBase} 
                    placeholder="Ex: Estrutura em concreto armado e alvenaria..."
                  />
                </View>

                <View style={styles.techInputGroup}>
                  <Text style={styles.techInputLabel}>Especificação chapisco colante</Text>
                  <TextInput 
                    style={styles.techInput} 
                    value={techChapiscoColante} 
                    onChangeText={setTechChapiscoColante} 
                    placeholder="Ex: Chapisco com aditivo polimérico..."
                  />
                </View>

                <View style={styles.techInputGroup}>
                  <Text style={styles.techInputLabel}>Especificação chapisco da alvenaria</Text>
                  <TextInput 
                    style={styles.techInput} 
                    value={techChapiscoAlvenaria} 
                    onChangeText={setTechChapiscoAlvenaria} 
                    placeholder="Ex: Traço 1:3 com areia média..."
                  />
                </View>

                <View style={styles.techInputGroup}>
                  <Text style={styles.techInputLabel}>Especificação da argamassa de emboço</Text>
                  <TextInput 
                    style={styles.techInput} 
                    value={techArgamassaEmboco} 
                    onChangeText={setTechArgamassaEmboco} 
                    placeholder="Ex: Argamassa com fibras anti-fissuras..."
                  />
                </View>

                <View style={styles.techInputGroup}>
                  <Text style={styles.techInputLabel}>Forma da aplicação da argamassa de emboço</Text>
                  <TextInput 
                    style={styles.techInput} 
                    value={techFormaAplicacaoArgamassa} 
                    onChangeText={setTechFormaAplicacaoArgamassa} 
                    placeholder="Ex: Projeção mecânica / sarrafeamento..."
                  />
                </View>

                <View style={styles.techInputGroup}>
                  <Text style={styles.techInputLabel}>Acabamentos do revestimento</Text>
                  <TextInput 
                    style={styles.techInput} 
                    value={techAcabamentosRevestimento} 
                    onChangeText={setTechAcabamentosRevestimento} 
                    placeholder="Ex: Textura acrílica / pastilha cerâmica..."
                  />
                </View>

                <View style={styles.techInputGroup}>
                  <Text style={styles.techInputLabel}>Acabamento em peitoris de janela</Text>
                  <TextInput 
                    style={styles.techInput} 
                    value={techAcabamentoPeitoris} 
                    onChangeText={setTechAcabamentoPeitoris} 
                    placeholder="Ex: Granito com pingadeira e caimento..."
                  />
                </View>

                <View style={styles.techInputGroup}>
                  <Text style={styles.techInputLabel}>Acabamento em muretas de terraços</Text>
                  <TextInput 
                    style={styles.techInput} 
                    value={techAcabamentoMuretas} 
                    onChangeText={setTechAcabamentoMuretas} 
                    placeholder="Ex: Rufo com vedação e pingadeira..."
                  />
                </View>

                <View style={styles.techInputGroup}>
                  <Text style={styles.techInputLabel}>Definição sobre frisos de mudança de cor de textura</Text>
                  <TextInput 
                    style={styles.techInput} 
                    value={techDefinicaoFrisosCor} 
                    onChangeText={setTechDefinicaoFrisosCor} 
                    placeholder="Ex: Frisos de 2x2cm com selante..."
                  />
                </View>

                <View style={styles.techInputGroup}>
                  <Text style={styles.techInputLabel}>Definição sobre face inferior das abas (friso pingadeira ou caimento invertido)</Text>
                  <TextInput 
                    style={styles.techInput} 
                    value={techDefinicaoFaceInferiorAbas} 
                    onChangeText={setTechDefinicaoFaceInferiorAbas} 
                    placeholder="Ex: Pingadeira com corte inferior a 3cm..."
                  />
                </View>

                <View style={styles.techInputGroup}>
                  <Text style={styles.techInputLabel}>Caso haja projeto de fachada, especificar o projetista e fazer observações sobre procedimentos específicos ou divergências de orientações</Text>
                  <TextInput 
                    style={[styles.techInput, styles.techInputMultiline]} 
                    value={techObservacoesFachada} 
                    onChangeText={setTechObservacoesFachada} 
                    multiline
                    placeholder="Ex: Projetista / Observações de procedimentos..."
                  />
                </View>

                <View style={styles.techInputGroup}>
                  <Text style={styles.techInputLabel}>Outras observações</Text>
                  <TextInput 
                    style={[styles.techInput, styles.techInputMultiline]} 
                    value={techOutrasObservacoes} 
                    onChangeText={setTechOutrasObservacoes} 
                    multiline
                    placeholder="Observações adicionais..."
                  />
                </View>

                <TouchableOpacity 
                  style={styles.saveTechInfoBtn}
                  onPress={handleSaveTechInfo}
                >
                  <Ionicons name="save-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.saveTechInfoBtnText}>Salvar Informações da Obra</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* 5º Sanfona Colapsável 2: Checklist da Obra com Barra de Progresso Numeral */}
        {(() => {
          const totalChecks = checklist.length;
          const completedChecks = checklist.filter(c => c.checked).length;
          const progressPercent = totalChecks > 0 ? Math.round((completedChecks / totalChecks) * 100) : 0;

          return (
            <View style={styles.accordionCard}>
              <TouchableOpacity 
                style={styles.checklistAccordionHeader}
                onPress={() => setShowChecklist(!showChecklist)}
              >
                <View style={{ flex: 1, marginRight: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="checkbox" size={18} color="#FFFFFF" />
                      <Text style={styles.checklistAccordionTitle}>
                        5. Checklist de Verificação ({completedChecks}/{totalChecks})
                      </Text>
                    </View>
                    <Text style={styles.checklistAccordionPercentText}>{progressPercent}%</Text>
                  </View>
                  {/* Barra de Progresso no Cabeçalho */}
                  <View style={styles.checklistProgressBarTrackMini}>
                    <View style={[styles.checklistProgressBarFillMini, { width: `${progressPercent}%` }]} />
                  </View>
                </View>
                <Ionicons name={showChecklist ? "chevron-up" : "chevron-down"} size={18} color="#FFFFFF" />
              </TouchableOpacity>

              {showChecklist && (
                <View style={styles.accordionBody}>
                  {/* Card de Progresso Visual Detalhado */}
                  <View style={styles.checklistProgressCardDetail}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={styles.checklistProgressDetailLabel}>Progresso das Etapas Concluídas</Text>
                      <Text style={styles.checklistProgressDetailValue}>
                        {completedChecks} de {totalChecks} ({progressPercent}%)
                      </Text>
                    </View>
                    <View style={styles.checklistProgressBarTrackLarge}>
                      <View style={[styles.checklistProgressBarFillLarge, { width: `${progressPercent}%` }]} />
                    </View>
                  </View>

                  {checklist.map((item, idx) => (
                    <View key={item.id} style={styles.checkItemContainer}>
                      <TouchableOpacity 
                        style={[
                          styles.checkItemRow, 
                          item.checked && styles.checkItemRowActive,
                          item.aprovado_anteriormente && styles.checkItemRowPreviouslyApproved
                        ]}
                        onPress={() => toggleChecklistItem(idx)}
                      >
                        <Ionicons 
                          name={item.checked ? (item.aprovado_anteriormente ? "shield-checkmark" : "checkbox") : "square-outline"} 
                          size={24} 
                          color={item.checked ? (item.aprovado_anteriormente ? "#059669" : "#16A34A") : Colors.textMuted} 
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.checkItemText, item.checked && styles.checkItemTextActive]}>
                            {idx + 1}. {item.item}
                          </Text>
                          {item.aprovado_anteriormente ? (
                            <View style={styles.prevApprovalBadge}>
                              <Ionicons name="shield-checkmark" size={13} color="#059669" />
                              <Text style={styles.prevApprovalText}>
                                Aprovado no {item.aprovado_em_relatorio_numero || 'relatório anterior'}
                                {item.data_aprovacao ? ` em ${new Date(item.data_aprovacao).toLocaleString('pt-BR')}` : ''}
                              </Text>
                            </View>
                          ) : null}
                        </View>
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
          );
        })()}

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
        </View>

        {/* 8º Galeria de Fotos Mobile-First com Barra Superior Adesiva (56px) */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>8. Galeria de Fotos do Laudo ({fotos.length} fotos)</Text>

          {/* Barra Fixa / Adesiva de 56px de altura (Seção 15.7) */}
          <View style={styles.stickyPhotoBar}>
            <TouchableOpacity 
              style={[styles.cameraBigBtn, isProcessingPhoto && { opacity: 0.6 }]} 
              onPress={handleAddPhotoCamera}
              disabled={isProcessingPhoto}
            >
              <Ionicons name="camera" size={24} color="#FFFFFF" />
              <Text style={styles.cameraBigBtnText}>{isProcessingPhoto ? 'Processando...' : 'Câmera'}</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.galleryBigBtn, isProcessingPhoto && { opacity: 0.6 }]} 
              onPress={handleAddPhotoGallery}
              disabled={isProcessingPhoto}
            >
              <Ionicons name="images" size={24} color="#FFFFFF" />
              <Text style={styles.galleryBigBtnText}>{isProcessingPhoto ? 'Processando...' : 'Galeria'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.photoCountRow}>
            <Text style={styles.photoCountText}>Capacidade: {fotos.length} / 200 fotos</Text>
          </View>

          {fotos.map((item, index) => (
            <View key={`${item.id}_${item.filename || index}`} style={styles.photoCard}>
              <View style={styles.thumbWrapper}>
                {(() => {
                  // Carregamento instantâneo ("na hora"): prioriza URI de arquivo local file:// ou base64
                  const resolvedUri = (item.uri_local && item.uri_local.startsWith('file://'))
                    ? item.uri_local
                    : (item.base64
                        ? (item.base64.startsWith('data:') ? item.base64 : `data:image/jpeg;base64,${item.base64}`)
                        : (item.uri_local || (item.url?.startsWith('http') ? item.url : (item.url ? `https://elpandroid-production.up.railway.app${item.url.startsWith('/') ? '' : '/'}${item.url}` : null))));
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
        base64={editingPhotoIndex !== null && fotos[editingPhotoIndex] ? fotos[editingPhotoIndex].base64 : undefined}
        initialAnnotations={editingPhotoIndex !== null && fotos[editingPhotoIndex] ? fotos[editingPhotoIndex].anotacoes_dados : undefined}
        onClose={() => {
          setShowEditorModal(false);
          setEditingPhotoIndex(null);
        }}
        onSave={handleSavePhotoAnnotations}
      />

      {/* Legendas Modal com Filtro de Categorias e Pesquisa */}
      <Modal visible={showLegendModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Legendas Predefinidas</Text>
                <Text style={{ fontSize: 12, color: Colors.textMuted }}>Filtre por categoria ou pesquise o termo</Text>
              </View>
              <TouchableOpacity onPress={() => setShowLegendModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {/* Barra de Pesquisa de Legendas */}
            <View style={styles.legendSearchBox}>
              <Ionicons name="search" size={18} color="#64748B" />
              <TextInput
                style={styles.legendSearchInput}
                placeholder="Pesquisar legendas técnicas..."
                value={legendSearchText}
                onChangeText={setLegendSearchText}
                placeholderTextColor="#94A3B8"
              />
              {legendSearchText.length > 0 && (
                <TouchableOpacity onPress={() => setLegendSearchText('')}>
                  <Ionicons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Chips de Categorias Horizontal */}
            <View style={{ marginBottom: 12 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.legendCategoryScroll}>
                {legendCategories.map(cat => {
                  const isActive = selectedLegendCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.legendCategoryChip, isActive && styles.legendCategoryChipActive]}
                      onPress={() => setSelectedLegendCategory(cat)}
                    >
                      <Text style={[styles.legendCategoryChipText, isActive && styles.legendCategoryChipTextActive]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <FlatList
              data={filteredLegendas}
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
              ListEmptyComponent={
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: Colors.textMuted, fontSize: 14 }}>Nenhuma legenda encontrada para esta categoria ou busca.</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Modal Completo de Seleção de Obra em Lista */}
      <Modal visible={showProjectPickerModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Obras Disponíveis</Text>
                <Text style={{ fontSize: 12, color: Colors.textMuted }}>Toque em uma obra para selecionar</Text>
              </View>
              <TouchableOpacity onPress={() => setShowProjectPickerModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {/* Barra de Pesquisa de Obras */}
            <View style={styles.projectModalSearchBox}>
              <Ionicons name="search" size={18} color="#64748B" />
              <TextInput
                style={styles.projectModalSearchInput}
                placeholder="Buscar por nome, número ou construtora..."
                value={projectSearchQuery}
                onChangeText={setProjectSearchQuery}
                clearButtonMode="while-editing"
              />
              {projectSearchQuery ? (
                <TouchableOpacity onPress={() => setProjectSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Lista Completa das Obras */}
            <FlatList
              data={projetos.filter(p => {
                if (!projectSearchQuery.trim()) return true;
                const q = projectSearchQuery.toLowerCase();
                return (
                  p.nome.toLowerCase().includes(q) ||
                  (p.numero && p.numero.toLowerCase().includes(q)) ||
                  (p.construtora && p.construtora.toLowerCase().includes(q))
                );
              })}
              keyExtractor={item => item.id.toString()}
              contentContainerStyle={{ paddingBottom: 16 }}
              renderItem={({ item }) => {
                const isSel = selectedProjectId === item.id;
                const distKm = (userLocation && item.latitude && item.longitude)
                  ? calculateDistanceKm(userLocation.latitude, userLocation.longitude, item.latitude, item.longitude)
                  : null;

                return (
                  <TouchableOpacity
                    style={[styles.projectModalItemRow, isSel && styles.projectModalItemRowActive]}
                    onPress={() => {
                      setSelectedProjectId(item.id);
                      setShowProjectPickerModal(false);
                      setProjectSearchQuery('');
                    }}
                  >
                    <Ionicons 
                      name={isSel ? "checkmark-circle" : "ellipse-outline"} 
                      size={22} 
                      color={isSel ? "#16A34A" : "#94A3B8"} 
                    />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.projectModalItemName, isSel && styles.projectModalItemNameActive]}>
                        {item.numero ? `[${item.numero}] ` : ''}{item.nome}
                      </Text>
                      <Text style={styles.projectModalItemSub}>
                        {item.construtora || 'ObraFlow'} • {item.tipo_obra || 'Edificação'}
                        {distKm !== null ? ` • 📍 ${distKm.toFixed(1)} km` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
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
  checklistAccordionPercentText: {
    color: '#86EFAC',
    fontSize: 13,
    fontWeight: '700',
  },
  checklistProgressBarTrackMini: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    marginTop: 4,
    overflow: 'hidden',
  },
  checklistProgressBarFillMini: {
    height: '100%',
    backgroundColor: '#22C55E',
    borderRadius: 2,
  },
  checklistProgressCardDetail: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  checklistProgressDetailLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  checklistProgressDetailValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16A34A',
  },
  checklistProgressBarTrackLarge: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  checklistProgressBarFillLarge: {
    height: '100%',
    backgroundColor: '#16A34A',
    borderRadius: 4,
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
  checkItemRowPreviouslyApproved: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
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
  prevApprovalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 3,
    gap: 4,
  },
  prevApprovalText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#065F46',
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
  legendSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
    marginBottom: 10,
  },
  legendSearchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
    marginLeft: 8,
    paddingVertical: 0,
  },
  legendCategoryScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  legendCategoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  legendCategoryChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  legendCategoryChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  legendCategoryChipTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
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
  selectedProjectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#0284C7',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  selectedProjectIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  selectedProjectName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  selectedProjectSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  selectedProjectGps: {
    fontSize: 11,
    color: '#16A34A',
    fontWeight: '600',
    marginTop: 2,
  },
  changeProjectBtnBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  changeProjectBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  emptyProjectSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  emptyProjectSelectorText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
    marginLeft: 10,
    flex: 1,
  },
  quickProjectsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    marginTop: 4,
  },
  quickProjectsHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  projectListItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  projectListItemRowActive: {
    backgroundColor: '#F0FDF4',
  },
  projectListItemName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  projectListItemNameActive: {
    color: '#15803D',
    fontWeight: '700',
  },
  projectListItemSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  seeAllProjectsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    gap: 4,
  },
  seeAllProjectsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },
  projectModalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    gap: 8,
  },
  projectModalSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    padding: 0,
  },
  projectModalItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  projectModalItemRowActive: {
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
  },
  projectModalItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  projectModalItemNameActive: {
    color: '#15803D',
    fontWeight: '700',
  },
  projectModalItemSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  fixedProjectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    gap: 12,
  },
  fixedProjectIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fixedProjectName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  fixedProjectSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  fixedProjectLockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  fixedProjectLockText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  techFormContainer: {
    paddingVertical: 8,
    gap: 14,
  },
  techInputGroup: {
    gap: 6,
  },
  techInputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  techInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  techInputMultiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  saveTechInfoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  saveTechInfoBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
