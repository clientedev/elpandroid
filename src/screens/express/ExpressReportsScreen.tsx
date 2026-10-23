import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, 
  RefreshControl, Alert, Modal, ScrollView, Image, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { PhotoEditorModal, PhotoAnnotationOverlay } from '../../components/PhotoEditorModal';
import { 
  getLocalRelatoriosExpress, saveLocalRelatorioExpress, 
  getLocalFotosExpress, saveLocalFotoExpress, addToSyncQueue,
  getNextExpressReportNumber, getLocalVisitantes, updateLocalRelatorioExpressStatus,
  deleteLocalRelatorioExpress, deleteLocalFotoExpress, getDatabase, getLocalLegendas
} from '../../database/db';
import { takePhoto, pickImage, readPhotoBase64 } from '../../services/imageService';
import { generateReportPDF } from '../../services/pdfService';
import { apiClient } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { RelatorioExpress, FotoRelatorioExpress, FotoRelatorio, Visitante, Relatorio, LegendaPredefinida } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

export interface AttachedExpressPhoto {
  id?: number;
  uri: string;
  base64?: string;
  filename?: string;
  legenda?: string;
  anotacoes_dados?: string;
  local?: string;
}

export interface ChecklistItemState {
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

export const ExpressReportsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const { isOnline, triggerSync } = useNetwork();

  const [expressList, setExpressList] = useState<RelatorioExpress[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingReportId, setEditingReportId] = useState<number | null>(null);

  // Modal de Aprovação / Rejeição
  const [approvalModalVisible, setApprovalModalVisible] = useState(false);
  const [reportToApprove, setReportToApprove] = useState<RelatorioExpress | null>(null);
  const [approvalAction, setApprovalAction] = useState<'Aprovado' | 'Rejeitado'>('Aprovado');
  const [approvalComment, setApprovalComment] = useState('');

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
  const canApprove = isMasterOrAdmin || hasApproverPrivilege;

  // Form state:
  const [titulo, setTitulo] = useState('Relatório Express EXP-0000');
  const [numero, setNumero] = useState('EXP-0000');
  const [dataVisita, setDataVisita] = useState(new Date().toISOString().split('T')[0]);
  const [obraConstrutora, setObraConstrutora] = useState('');
  const [obraNome, setObraNome] = useState('');
  const [obraEndereco, setObraEndereco] = useState('');
  const [acompanhantes, setAcompanhantes] = useState('');
  const [observacoes, setObservacoes] = useState('');
  
  // 12 Campos de Informações Técnicas da Fachada (Idênticos ao Relatório Normal)
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

  // Checklist de Verificação (Idêntico ao Relatório Normal)
  const [checklist, setChecklist] = useState<ChecklistItemState[]>(DEFAULT_CHECKLIST);

  // Visitantes cadastrados para sugestão com 1 toque
  const [visitantesCadastrados, setVisitantesCadastrados] = useState<Visitante[]>([]);

  // Fotos anexadas com suporte a edição, anotações e legendas técnicas
  const [attachedPhotos, setAttachedPhotos] = useState<AttachedExpressPhoto[]>([]);
  const isProcessingPhotoRef = React.useRef(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);

  // Modal de Edição Gráfica de Fotos (Canvas com setas, círculos e texto)
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editingPhotoIndex, setEditingPhotoIndex] = useState<number | null>(null);

  // Modal de Legendas Predefinidas
  const [showLegendModal, setShowLegendModal] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [legendas, setLegendas] = useState<LegendaPredefinida[]>([]);
  const [legendSearchText, setLegendSearchText] = useState('');
  const [selectedLegendCategory, setSelectedLegendCategory] = useState<string>('Todas');

  // Toggles de Sanfonas
  const [showTechInfo, setShowTechInfo] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);

  const [loadingGps, setLoadingGps] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string | null>(null);

  // Carrega legendas predefinidas do SQLite
  useEffect(() => {
    getLocalLegendas().then(l => {
      if (l && l.length > 0) setLegendas(l);
    }).catch(() => null);
  }, []);

  const legendCategories = React.useMemo(() => {
    const cats = Array.from(new Set(legendas.map(l => l.categoria).filter(Boolean))) as string[];
    return ['Todas', ...cats];
  }, [legendas]);

  const filteredLegendas = React.useMemo(() => {
    return legendas.filter(l => {
      const matchCat = selectedLegendCategory === 'Todas' || l.categoria === selectedLegendCategory;
      const matchSearch = !legendSearchText.trim() || 
        l.texto.toLowerCase().includes(legendSearchText.toLowerCase()) ||
        (l.categoria && l.categoria.toLowerCase().includes(legendSearchText.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [legendas, selectedLegendCategory, legendSearchText]);

  const loadReports = useCallback(async () => {
    try {
      const [data, vis] = await Promise.all([
        getLocalRelatoriosExpress(user),
        getLocalVisitantes(),
      ]);
      const enriched = await Promise.all(
        data.map(async (r) => {
          const fotos = await getLocalFotosExpress(r.id);
          return {
            ...r,
            fotos,
            fotos_count: (fotos && fotos.length) || r.fotos_count || 0
          };
        })
      );
      setExpressList(enriched);
      setVisitantesCadastrados(vis || []);
    } catch (e) {
      console.warn('Erro ao carregar express:', e);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Autosave contínuo para Relatório Express: assim que abrir e preencher qualquer dado, entra como Rascunho no SQLite
  useEffect(() => {
    if (!modalVisible) return;

    // Detecta se o usuário inseriu qualquer dado, foto ou checklist
    const hasAnyContent = Boolean(
      obraNome.trim() || 
      obraConstrutora.trim() || 
      obraEndereco.trim() || 
      observacoes.trim() || 
      acompanhantes.trim() ||
      techElementosBase.trim() ||
      techChapiscoColante.trim() ||
      techChapiscoAlvenaria.trim() ||
      techArgamassaEmboco.trim() ||
      techFormaAplicacaoArgamassa.trim() ||
      techAcabamentosRevestimento.trim() ||
      techAcabamentoPeitoris.trim() ||
      techAcabamentoMuretas.trim() ||
      techDefinicaoFrisosCor.trim() ||
      techDefinicaoFaceInferiorAbas.trim() ||
      techObservacoesFachada.trim() ||
      techOutrasObservacoes.trim() ||
      (checklist && checklist.some(c => c.checked || (c.observacao && c.observacao.trim()))) ||
      attachedPhotos.length > 0
    );

    if (!hasAnyContent) return;

    const timer = setTimeout(async () => {
      try {
        setIsAutoSaving(true);

        // Garante ID estável para este rascunho
        let targetId = editingReportId;
        if (!targetId) {
          targetId = Date.now();
          setEditingReportId(targetId);
        }

        const draftPayload = {
          editingReportId: targetId,
          titulo,
          numero,
          dataVisita,
          obraConstrutora,
          obraNome,
          obraEndereco,
          acompanhantes,
          observacoes,
          techElementosBase,
          techChapiscoColante,
          techChapiscoAlvenaria,
          techArgamassaEmboco,
          techFormaAplicacaoArgamassa,
          techAcabamentosRevestimento,
          techAcabamentoPeitoris,
          techAcabamentoMuretas,
          techDefinicaoFrisosCor,
          techDefinicaoFaceInferiorAbas,
          techObservacoesFachada,
          techOutrasObservacoes,
          checklist,
          attachedPhotos,
        };
        await AsyncStorage.setItem('@elp_express_report_draft', JSON.stringify(draftPayload));

        const techInfoJson = JSON.stringify({
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
        });

        const expDraft: RelatorioExpress = {
          id: targetId,
          numero: numero || 'EXP-0000',
          titulo: (!titulo || titulo.trim() === 'Relatório Express' || titulo.startsWith('Relatório Express EXP-'))
            ? `Relatório Express ${numero || 'EXP-0000'}`
            : titulo.trim(),
          autor_id: user?.id || 1,
          autor_nome: user?.nome_completo || user?.username || 'Fiscal Técnico',
          data_relatorio: dataVisita || new Date().toISOString().split('T')[0],
          obra_nome: obraNome.trim() || 'Rascunho de Obra',
          obra_endereco: obraEndereco.trim(),
          obra_construtora: obraConstrutora.trim(),
          acompanhantes: acompanhantes.trim(),
          informacoes_tecnicas: techInfoJson,
          checklist_data: JSON.stringify(checklist),
          observacoes_finais: observacoes.trim(),
          status: 'Rascunho',
          sync_status: 'pending',
          fotos_count: attachedPhotos.length,
        };

        // Salva imediatamente no SQLite local para aparecer na lista como Rascunho
        await saveLocalRelatorioExpress(expDraft, 'pending');

        // Limpa fotos anteriores do rascunho temporário para evitar duplicação a cada ciclo de autosave
        const db = await getDatabase();
        await db.runAsync(
          'DELETE FROM fotos_relatorio_express WHERE relatorio_express_id = ? OR relatorio_express_id = ?;',
          [targetId, String(targetId)]
        );

        for (let i = 0; i < attachedPhotos.length; i++) {
          const ap = attachedPhotos[i];
          const photoId = ap.id || (Date.now() + i + 1);
          ap.id = photoId; // Fixa o ID no objeto para os próximos ciclos de autosave
          const fotoObj: FotoRelatorioExpress = {
            id: photoId,
            relatorio_express_id: targetId,
            uri_local: ap.uri,
            base64: ap.base64,
            local: ap.local || obraNome.trim(),
            titulo: `Foto ${i + 1} - ${obraNome.trim() || 'Registro'}`,
            legenda: ap.legenda?.trim() || observacoes || 'Registro Fotográfico Express',
            anotacoes_dados: ap.anotacoes_dados,
            ordem: i,
            sync_status: 'pending'
          };
          await saveLocalFotoExpress(fotoObj, 'pending');
        }

        setLastAutoSaveTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));

        // Atualiza a lista na tela principal em segundo plano
        loadReports();
      } catch (errDraft) {
        console.warn('[Express] Erro no autosave de rascunho:', errDraft);
      } finally {
        setIsAutoSaving(false);
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [
    modalVisible, editingReportId, titulo, numero, dataVisita, obraConstrutora, obraNome, obraEndereco, acompanhantes, observacoes,
    techElementosBase, techChapiscoColante, techChapiscoAlvenaria, techArgamassaEmboco, techFormaAplicacaoArgamassa,
    techAcabamentosRevestimento, techAcabamentoPeitoris, techAcabamentoMuretas, techDefinicaoFrisosCor,
    techDefinicaoFaceInferiorAbas, techObservacoesFachada, techOutrasObservacoes, checklist, attachedPhotos, loadReports
  ]);

  async function handleClearDraft() {
    Alert.alert(
      'Limpar Rascunho',
      'Deseja limpar todos os dados e fotos deste rascunho express?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, Limpar',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('@elp_express_report_draft').catch(() => null);
            setObraNome('');
            setObraConstrutora('');
            setObraEndereco('');
            setAcompanhantes('');
            setObservacoes('');
            setTechElementosBase('');
            setTechChapiscoColante('');
            setTechChapiscoAlvenaria('');
            setTechArgamassaEmboco('');
            setTechFormaAplicacaoArgamassa('');
            setTechAcabamentosRevestimento('');
            setTechAcabamentoPeitoris('');
            setTechAcabamentoMuretas('');
            setTechDefinicaoFrisosCor('');
            setTechDefinicaoFaceInferiorAbas('');
            setTechObservacoesFachada('');
            setTechOutrasObservacoes('');
            setChecklist(DEFAULT_CHECKLIST);
            setAttachedPhotos([]);
            setLastAutoSaveTime(null);
          }
        }
      ]
    );
  }

  async function handleOpenNew() {
    let nextNum = 'EXP-0000';
    try {
      nextNum = await getNextExpressReportNumber();
    } catch (e) {
      console.warn('Erro ao calcular próximo EXP:', e);
    }

    let loadedPhotosFromDraft: AttachedExpressPhoto[] = [];

    try {
      const draftStr = await AsyncStorage.getItem('@elp_express_report_draft');
      if (draftStr) {
        const d = JSON.parse(draftStr);
        if (d.obraNome) setObraNome(d.obraNome);
        if (d.obraConstrutora) setObraConstrutora(d.obraConstrutora);
        if (d.obraEndereco) setObraEndereco(d.obraEndereco);
        if (d.observacoes) setObservacoes(d.observacoes);
        if (d.acompanhantes) setAcompanhantes(d.acompanhantes);

        if (d.techElementosBase) setTechElementosBase(d.techElementosBase);
        if (d.techChapiscoColante) setTechChapiscoColante(d.techChapiscoColante);
        if (d.techChapiscoAlvenaria) setTechChapiscoAlvenaria(d.techChapiscoAlvenaria);
        if (d.techArgamassaEmboco) setTechArgamassaEmboco(d.techArgamassaEmboco);
        if (d.techFormaAplicacaoArgamassa) setTechFormaAplicacaoArgamassa(d.techFormaAplicacaoArgamassa);
        if (d.techAcabamentosRevestimento) setTechAcabamentosRevestimento(d.techAcabamentosRevestimento);
        if (d.techAcabamentoPeitoris) setTechAcabamentoPeitoris(d.techAcabamentoPeitoris);
        if (d.techAcabamentoMuretas) setTechAcabamentoMuretas(d.techAcabamentoMuretas);
        if (d.techDefinicaoFrisosCor) setTechDefinicaoFrisosCor(d.techDefinicaoFrisosCor);
        if (d.techDefinicaoFaceInferiorAbas) setTechDefinicaoFaceInferiorAbas(d.techDefinicaoFaceInferiorAbas);
        if (d.techObservacoesFachada) setTechObservacoesFachada(d.techObservacoesFachada);
        if (d.techOutrasObservacoes) setTechOutrasObservacoes(d.techOutrasObservacoes);

        if (d.checklist && Array.isArray(d.checklist)) {
          setChecklist(d.checklist);
        } else {
          setChecklist(DEFAULT_CHECKLIST);
        }

        if (d.attachedPhotos && Array.isArray(d.attachedPhotos)) {
          loadedPhotosFromDraft = d.attachedPhotos;
        }

        setLastAutoSaveTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      } else {
        setChecklist(DEFAULT_CHECKLIST);
      }
    } catch (e) {
      setChecklist(DEFAULT_CHECKLIST);
    }

    setTitulo(`Relatório Express ${nextNum}`);
    setNumero(nextNum);
    setDataVisita(new Date().toISOString().split('T')[0]);
    setAttachedPhotos(loadedPhotosFromDraft);
    setEditingReportId(null);
    setModalVisible(true);
  }

  function handleCloseModal() {
    setModalVisible(false);
    loadReports();
  }

  async function handleDuplicateReport(original: RelatorioExpress) {
    let nextNum = 'EXP-0000';
    try {
      nextNum = await getNextExpressReportNumber();
    } catch {}

    setTitulo(`Relatório Express ${nextNum} (Cópia)`);
    setNumero(nextNum);
    setDataVisita(new Date().toISOString().split('T')[0]);
    setObraConstrutora(original.obra_construtora || '');
    setObraNome(original.obra_nome || '');
    setObraEndereco(original.obra_endereco || '');
    setAcompanhantes(original.acompanhantes || '');
    setObservacoes(original.observacoes_finais || '');
    setAttachedPhotos([]);
    setEditingReportId(null);

    // Extrair info técnica
    if (original.informacoes_tecnicas) {
      try {
        const t = typeof original.informacoes_tecnicas === 'string' 
          ? JSON.parse(original.informacoes_tecnicas) 
          : original.informacoes_tecnicas;
        setTechElementosBase(t.elementos_construtivos_base || '');
        setTechChapiscoColante(t.especificacao_chapisco_colante || '');
        setTechChapiscoAlvenaria(t.especificacao_chapisco_alvenaria || '');
        setTechArgamassaEmboco(t.especificacao_argamassa_emboco || '');
        setTechFormaAplicacaoArgamassa(t.forma_aplicacao_argamassa || '');
        setTechAcabamentosRevestimento(t.acabamentos_revestimento || '');
        setTechAcabamentoPeitoris(t.acabamento_peitoris || '');
        setTechAcabamentoMuretas(t.acabamento_muretas || '');
        setTechDefinicaoFrisosCor(t.definicao_frisos_cor || '');
        setTechDefinicaoFaceInferiorAbas(t.definicao_face_inferior_abas || '');
        setTechObservacoesFachada(t.observacoes_projeto_fachada || '');
        setTechOutrasObservacoes(t.outras_observacoes || '');
        setShowTechInfo(true);
      } catch {}
    }

    // Extrair checklist
    if (original.checklist_data) {
      try {
        const chk = typeof original.checklist_data === 'string'
          ? JSON.parse(original.checklist_data)
          : original.checklist_data;
        if (Array.isArray(chk)) {
          setChecklist(chk);
          setShowChecklist(true);
        }
      } catch {}
    }

    setModalVisible(true);
  }

  async function handleEditReport(item: RelatorioExpress) {
    setEditingReportId(item.id);
    const itemNum = item.numero || 'EXP-0000';
    setTitulo(item.titulo || `Relatório Express ${itemNum}`);
    setNumero(itemNum);
    setDataVisita(item.data_relatorio ? item.data_relatorio.split('T')[0] : new Date().toISOString().split('T')[0]);
    setObraConstrutora(item.obra_construtora || '');
    setObraNome(item.obra_nome || '');
    setObraEndereco(item.obra_endereco || '');
    const acompStr = typeof item.acompanhantes === 'string'
      ? item.acompanhantes
      : Array.isArray(item.acompanhantes as any)
      ? (item.acompanhantes as any).join(', ')
      : (item.acompanhantes || '');
    setAcompanhantes(acompStr);
    setObservacoes(item.observacoes_finais || '');

    // Extrair info técnica
    if (item.informacoes_tecnicas) {
      try {
        const t = typeof item.informacoes_tecnicas === 'string' 
          ? JSON.parse(item.informacoes_tecnicas) 
          : item.informacoes_tecnicas;
        setTechElementosBase(t.elementos_construtivos_base || '');
        setTechChapiscoColante(t.especificacao_chapisco_colante || '');
        setTechChapiscoAlvenaria(t.especificacao_chapisco_alvenaria || '');
        setTechArgamassaEmboco(t.especificacao_argamassa_emboco || '');
        setTechFormaAplicacaoArgamassa(t.forma_aplicacao_argamassa || '');
        setTechAcabamentosRevestimento(t.acabamentos_revestimento || '');
        setTechAcabamentoPeitoris(t.acabamento_peitoris || '');
        setTechAcabamentoMuretas(t.acabamento_muretas || '');
        setTechDefinicaoFrisosCor(t.definicao_frisos_cor || '');
        setTechDefinicaoFaceInferiorAbas(t.definicao_face_inferior_abas || '');
        setTechObservacoesFachada(t.observacoes_projeto_fachada || '');
        setTechOutrasObservacoes(t.outras_observacoes || '');
        setShowTechInfo(true);
      } catch {
        setShowTechInfo(false);
      }
    } else {
      setShowTechInfo(false);
    }

    // Extrair checklist
    if (item.checklist_data) {
      try {
        const chk = typeof item.checklist_data === 'string'
          ? JSON.parse(item.checklist_data)
          : item.checklist_data;
        if (Array.isArray(chk)) {
          setChecklist(chk);
          setShowChecklist(true);
        } else {
          setChecklist(DEFAULT_CHECKLIST);
        }
      } catch {
        setChecklist(DEFAULT_CHECKLIST);
      }
    } else {
      setChecklist(DEFAULT_CHECKLIST);
    }

    // Carregar fotos do relatório com legendas e anotações técnicas
    try {
      const fotosDb = await getLocalFotosExpress(item.id);
      if (fotosDb && fotosDb.length > 0) {
        setAttachedPhotos(fotosDb.map(f => ({
          id: f.id,
          uri: f.uri_local || f.url || '',
          base64: f.base64,
          filename: f.filename,
          legenda: f.legenda || '',
          anotacoes_dados: f.anotacoes_dados,
          local: f.local || item.obra_nome || '',
        })));
      } else {
        setAttachedPhotos([]);
      }
    } catch {
      setAttachedPhotos([]);
    }

    setModalVisible(true);
  }

  async function handleSendForApproval(item: RelatorioExpress) {
    if (item.status === 'Aguardando Aprovação') {
      Alert.alert('Aviso', 'Este relatório já foi enviado e está aguardando aprovação.');
      return;
    }
    if (item.status === 'Aprovado') {
      Alert.alert('Aviso', 'Este relatório já está aprovado.');
      return;
    }

    Alert.alert(
      'Enviar para Aprovação',
      `Deseja enviar o Relatório Express ${item.numero} para aprovação?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar',
          onPress: async () => {
            try {
              setLoading(true);
              await updateLocalRelatorioExpressStatus(
                item.id,
                'Aguardando Aprovação',
                '',
                undefined,
                undefined,
                'pending'
              );

              const fotosDb = await getLocalFotosExpress(item.id);
              const fotosPayload = (fotosDb || []).map(f => ({
                uri_local: f.uri_local,
                base64: f.base64,
                imagem_base64: f.base64,
                titulo: f.titulo,
                legenda: f.legenda,
                ordem: f.ordem,
              }));

              await addToSyncQueue(
                'relatorio_express',
                item.id,
                'update',
                '/api/relatorios-express',
                'POST',
                {
                  ...item,
                  status: 'Aguardando Aprovação',
                  fotos: fotosPayload,
                }
              );

              if (isOnline) triggerSync();
              await loadReports();
              Alert.alert('Sucesso', `Relatório Express ${item.numero} enviado para aprovação!`);
            } catch (e: any) {
              Alert.alert('Erro', e.message || 'Falha ao enviar para aprovação.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  }

  function handleOpenApproveModal(item: RelatorioExpress) {
    setReportToApprove(item);
    setApprovalAction('Aprovado');
    setApprovalComment('Relatório aprovado em conformidade técnica.');
    setApprovalModalVisible(true);
  }

  function handleOpenRejectModal(item: RelatorioExpress) {
    setReportToApprove(item);
    setApprovalAction('Rejeitado');
    setApprovalComment('');
    setApprovalModalVisible(true);
  }

  async function handleConfirmApprovalAction() {
    if (!reportToApprove) return;
    if (approvalAction === 'Rejeitado' && !approvalComment.trim()) {
      Alert.alert('Justificativa Obrigatória', 'Informe o motivo da rejeição do relatório express.');
      return;
    }

    setLoading(true);
    try {
      const approverName = user?.nome_completo || user?.username || 'Responsável Técnico';
      const comment = approvalComment.trim() || (approvalAction === 'Aprovado' ? 'Relatório aprovado em conformidade técnica.' : 'Necessita correções');
      
      await updateLocalRelatorioExpressStatus(
        reportToApprove.id,
        approvalAction,
        comment,
        user?.id,
        approverName,
        'pending'
      );

      await addToSyncQueue(
        'relatorio_express',
        reportToApprove.id,
        approvalAction === 'Aprovado' ? 'approve' : 'reject',
        '/api/relatorios-express',
        'POST',
        {
          id: reportToApprove.id,
          numero: reportToApprove.numero,
          status: approvalAction,
          comentario: comment,
          comentario_aprovacao: comment,
          aprovador_id: user?.id,
          aprovador_nome: approverName,
        }
      );

      if (isOnline) triggerSync();
      setApprovalModalVisible(false);
      const affectedNum = reportToApprove.numero;
      setReportToApprove(null);
      await loadReports();

      Alert.alert(
        approvalAction === 'Aprovado' ? 'Relatório Aprovado' : 'Relatório Rejeitado',
        `O Relatório Express ${affectedNum} foi marcado como ${approvalAction.toLowerCase()}.`
      );
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao processar ação no relatório.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteExpress(item: RelatorioExpress) {
    Alert.alert(
      'Excluir Relatório Express',
      `Deseja realmente excluir permanentemente o relatório ${item.numero} (${item.obra_nome || 'Sem obra'})? Esta ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await deleteLocalRelatorioExpress(item.id);
              if (isOnline) {
                await apiClient.axios.delete(`/api/relatorios-express/${item.id}`, {
                  data: { user_id: user?.id, is_master: isMasterOrAdmin }
                }).catch(() => null);
              } else {
                await addToSyncQueue('relatorio_express', item.id, 'delete', `/api/relatorios-express/${item.id}`, 'DELETE', { user_id: user?.id, is_master: isMasterOrAdmin });
              }
              await loadReports();
              Alert.alert('Sucesso', `Relatório Express ${item.numero} excluído.`);
            } catch (e: any) {
              Alert.alert('Erro', e.message || 'Falha ao excluir relatório express.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  }

  // Captura Real de GPS do Dispositivo
  async function handleCaptureGpsAddress() {
    setLoadingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permissão de GPS Necessária',
          'Permita o acesso à localização precisa do dispositivo para capturar o endereço exato da obra.'
        );
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });

      const newLat = location.coords.latitude;
      const newLon = location.coords.longitude;

      const reverseGeocode = await Location.reverseGeocodeAsync({
        latitude: newLat,
        longitude: newLon,
      });

      if (reverseGeocode && reverseGeocode.length > 0) {
        const item = reverseGeocode[0];
        const parts: string[] = [];

        const logradouro = item.street || item.name || '';
        const num = item.streetNumber || '';
        if (logradouro) {
          parts.push(num ? `${logradouro}, ${num}` : logradouro);
        }

        if (item.district || item.subregion) {
          parts.push(item.district || item.subregion || '');
        }

        const cidade = item.city || item.subregion || '';
        const uf = item.region || '';
        if (cidade) {
          parts.push(uf ? `${cidade} - ${uf}` : cidade);
        }

        if (item.postalCode) {
          parts.push(`CEP ${item.postalCode}`);
        }

        const fullAddr = parts.join(', ');
        setObraEndereco(fullAddr || `Lat: ${newLat.toFixed(5)}, Lon: ${newLon.toFixed(5)}`);
        Alert.alert('GPS Capturado', 'Localização do dispositivo obtida com sucesso:\n\n' + fullAddr);
      } else {
        const coordAddr = `Lat: ${newLat.toFixed(5)}, Lon: ${newLon.toFixed(5)}`;
        setObraEndereco(coordAddr);
        Alert.alert('GPS Capturado', `Coordenadas: ${coordAddr}`);
      }
    } catch (err: any) {
      Alert.alert('Erro ao obter GPS', err.message || 'Verifique se o GPS está ativado no aparelho.');
    } finally {
      setLoadingGps(false);
    }
  }

  async function handleAddPhotoCamera() {
    if (isProcessingPhotoRef.current) return;
    isProcessingPhotoRef.current = true;
    setIsProcessingPhoto(true);
    try {
      const projName = obraNome.trim() || 'Obra_Express';
      const photo = await takePhoto(projName);
      if (photo) {
        setAttachedPhotos(prev => [
          ...prev,
          {
            uri: photo.uri,
            base64: photo.base64,
            filename: photo.filename,
            legenda: '',
            anotacoes_dados: undefined,
            local: obraNome.trim() || 'Fachada',
          }
        ]);
      }
    } catch (errCam) {
      console.warn('[Express] Erro ao capturar foto da câmera:', errCam);
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
      const projName = obraNome.trim() || 'Obra_Express';
      const photo = await pickImage(projName);
      if (photo) {
        setAttachedPhotos(prev => [
          ...prev,
          {
            uri: photo.uri,
            base64: photo.base64,
            filename: photo.filename,
            legenda: '',
            anotacoes_dados: undefined,
            local: obraNome.trim() || 'Fachada',
          }
        ]);
      }
    } catch (errGal) {
      console.warn('[Express] Erro ao selecionar foto da galeria:', errGal);
    } finally {
      isProcessingPhotoRef.current = false;
      setIsProcessingPhoto(false);
    }
  }

  async function handleRemovePhoto(index: number) {
    const target = attachedPhotos[index];
    if (target?.id) {
      await deleteLocalFotoExpress(target.id).catch(() => null);
    }
    setAttachedPhotos(prev => prev.filter((_, idx) => idx !== index));
  }

  function handleSavePhotoAnnotations(json: string) {
    if (editingPhotoIndex !== null) {
      setAttachedPhotos(prev => {
        const updated = [...prev];
        if (updated[editingPhotoIndex]) {
          updated[editingPhotoIndex] = {
            ...updated[editingPhotoIndex],
            anotacoes_dados: json,
          };
        }
        return updated;
      });
    }
  }

  function handleSelectLegenda(legendaTexto: string) {
    if (selectedPhotoIndex !== null) {
      setAttachedPhotos(prev => {
        const updated = [...prev];
        if (updated[selectedPhotoIndex]) {
          updated[selectedPhotoIndex] = {
            ...updated[selectedPhotoIndex],
            legenda: legendaTexto,
          };
        }
        return updated;
      });
    }
    setShowLegendModal(false);
  }

  async function handleCreateExpress(status: 'em_andamento' | 'Rascunho' | 'Aguardando Aprovação' = 'Aguardando Aprovação') {
    if (status === 'Aguardando Aprovação') {
      if (!obraNome.trim()) {
        Alert.alert('Atenção', 'Informe o nome da obra para enviar para aprovação.');
        return;
      }

      // Regra Crítica: Legenda de Fotos é Obrigatória para envio à aprovação (mesma sistemática do comum)
      if (attachedPhotos.length > 0) {
        const fotoSemLegenda = attachedPhotos.findIndex(f => !f.legenda || !f.legenda.trim());
        if (fotoSemLegenda !== -1) {
          Alert.alert(
            'Legenda Obrigatória',
            `A foto #${fotoSemLegenda + 1} está sem legenda técnica. Todas as fotos devem possuir legenda antes do envio para aprovação.`
          );
          return;
        }
      }
    }

    setLoading(true);
    try {
      const expId = editingReportId || Date.now();
      let currentNumber = (editingReportId && numero) ? numero : (numero.startsWith('EXP-') ? numero : await getNextExpressReportNumber());
      if (!editingReportId) {
        currentNumber = await getNextExpressReportNumber();
      }

      const finalTitle = (!titulo || titulo.trim() === 'Relatório Express de Visita' || titulo.startsWith('Relatório Express EXP-') || titulo === 'Relatório Express')
        ? `Relatório Express ${currentNumber}`
        : titulo.trim();

      const techInfoPayload = {
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

      const techInfoJson = JSON.stringify(techInfoPayload);
      const checklistJson = JSON.stringify(checklist);

      // Se for edição, limpa fotos antigas deste relatório express localmente antes de regravar
      if (editingReportId) {
        try {
          const db = await getDatabase();
          await db.runAsync('DELETE FROM fotos_relatorio_express WHERE relatorio_express_id = ? OR relatorio_express_id = ?;', [editingReportId, String(editingReportId)]);
        } catch (delFotosErr) {
          console.warn('Erro ao limpar fotos antigas do relatório express:', delFotosErr);
        }
      }

      // Salva fotos anexadas com legenda e dados de anotação
      const savedFotosList: any[] = [];
      for (let i = 0; i < attachedPhotos.length; i++) {
        const ap = attachedPhotos[i];
        let b64 = ap.base64;
        if (!b64 && ap.uri) {
          b64 = await readPhotoBase64(ap.uri);
        }

        const fotoObj: FotoRelatorioExpress = {
          id: ap.id || (Date.now() + i + 1),
          relatorio_express_id: expId,
          uri_local: ap.uri,
          base64: b64,
          local: ap.local || obraNome.trim(),
          titulo: `Foto ${i + 1} - ${obraNome.trim()}`,
          legenda: ap.legenda?.trim() || observacoes || 'Registro Fotográfico Express',
          anotacoes_dados: ap.anotacoes_dados,
          ordem: i,
          sync_status: 'pending'
        };
        await saveLocalFotoExpress(fotoObj, 'pending');

        savedFotosList.push({
          id: fotoObj.id,
          uri_local: ap.uri,
          base64: b64,
          imagem_base64: b64,
          titulo: fotoObj.titulo,
          legenda: fotoObj.legenda,
          local: fotoObj.local,
          anotacoes_dados: ap.anotacoes_dados,
          ordem: i
        });
      }

      const newExp: RelatorioExpress = {
        id: expId,
        numero: currentNumber.trim(),
        titulo: finalTitle,
        autor_id: user?.id || 1,
        autor_nome: user?.nome_completo || user?.username || 'Fiscal Técnico',
        data_relatorio: dataVisita,
        obra_nome: obraNome.trim() || 'Rascunho de Obra',
        obra_endereco: obraEndereco.trim(),
        obra_construtora: obraConstrutora.trim(),
        acompanhantes: acompanhantes.trim(),
        informacoes_tecnicas: techInfoJson,
        checklist_data: checklistJson,
        observacoes_finais: observacoes.trim(),
        status: status === 'Aguardando Aprovação' ? 'Aguardando Aprovação' : 'Rascunho',
        sync_status: 'pending',
        fotos_count: savedFotosList.length,
      };

      await saveLocalRelatorioExpress(newExp, 'pending');

      await addToSyncQueue(
        'relatorio_express',
        expId,
        editingReportId ? 'update' : 'create',
        '/api/relatorios-express',
        'POST',
        {
          ...newExp,
          fotos: savedFotosList
        }
      );

      // Limpa rascunho após salvar com sucesso
      await AsyncStorage.removeItem('@elp_express_report_draft').catch(() => null);
      setLastAutoSaveTime(null);

      if (isOnline) triggerSync();

      setEditingReportId(null);
      setModalVisible(false);
      await loadReports();
      Alert.alert(
        'Sucesso', 
        status === 'Aguardando Aprovação' 
          ? `Relatório Express ${currentNumber} enviado para aprovação com sucesso!` 
          : `Rascunho do Relatório Express ${currentNumber} salvo localmente!`
      );
    } catch (err: any) {
      Alert.alert('Erro ao Salvar', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExportPDF(item: RelatorioExpress) {
    try {
      const fotosExp = item.fotos && item.fotos.length > 0 
        ? item.fotos 
        : await getLocalFotosExpress(item.id);
      const convertedFotos: FotoRelatorio[] = (fotosExp || []).map(f => ({
        id: f.id,
        relatorio_id: f.relatorio_express_id,
        uri_local: f.uri_local,
        url: f.url,
        base64: f.base64,
        titulo: f.titulo,
        legenda: f.legenda,
        ordem: f.ordem,
      }));

      const mockNormalRel: Relatorio = {
        id: item.id,
        numero: item.numero,
        titulo: item.titulo,
        autor_id: item.autor_id || 1,
        autor_nome: item.autor_nome || 'Fiscal',
        data_relatorio: item.data_relatorio,
        status: item.status,
        projeto_id: 0,
        projeto_nome: item.obra_nome,
        projeto_construtora: item.obra_construtora,
        projeto_endereco: item.obra_endereco,
        acompanhantes: item.acompanhantes,
        observacoes_finais: item.observacoes_finais,
        checklist_data: item.checklist_data,
        fotos_count: convertedFotos.length,
      };

      await generateReportPDF(mockNormalRel, convertedFotos);
    } catch (err: any) {
      Alert.alert('Erro ao gerar PDF', err.message);
    }
  }

  const completedChecks = checklist.filter(c => c.checked).length;
  const totalChecks = checklist.length;
  const progressPercent = totalChecks > 0 ? Math.round((completedChecks / totalChecks) * 100) : 0;

  return (
    <View style={styles.container}>
      <Header 
        title="Relatórios Express" 
        showBack 
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity style={styles.addBtn} onPress={handleOpenNew} activeOpacity={0.8}>
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />
      <OfflineBanner />

      <FlatList
        data={expressList}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadReports} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="flash-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Nenhum relatório express</Text>
            <Text style={styles.emptySub}>
              Crie vistorias pontuais e rápidas tocando no botão "+".
            </Text>
            <TouchableOpacity style={styles.createBtn} onPress={handleOpenNew}>
              <Ionicons name="add-circle" size={18} color="#FFFFFF" />
              <Text style={styles.createBtnText}>Criar Relatório EXP-0000</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const isDraft = item.status === 'Rascunho' || item.status === 'em_andamento' || item.status === 'Em preenchimento';
          const displayStatus = isDraft ? 'Rascunho' : item.status;

          return (
            <TouchableOpacity 
              style={styles.card} 
              activeOpacity={0.85}
              onPress={() => {
                if (isDraft) {
                  handleEditReport(item);
                } else {
                  navigation.navigate('ReportDetailScreen', { reportId: item.id, isExpress: true });
                }
              }}
            >
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

              <Text style={styles.obraTitle}>{item.titulo || `Relatório Express ${item.numero}`}</Text>
              <Text style={styles.construtoraText}>
                {item.obra_nome}{item.obra_construtora ? ` • ${item.obra_construtora}` : ''}
              </Text>
              <View style={styles.cardAuthorRow}>
                <Ionicons name="person-circle-outline" size={13.5} color="#64748B" />
                <Text style={styles.cardAuthorText} numberOfLines={1}>
                  Criado por: <Text style={styles.cardAuthorName}>{item.autor_nome || 'Fiscal Técnico'}</Text>
                </Text>
              </View>

              {/* Dica / Faixa de Toque para Visualização ou Edição */}
              <View style={styles.cardViewHintRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name={isDraft ? "create-outline" : "eye-outline"} size={13} color="#0284C7" />
                  <Text style={styles.cardViewHintText}>
                    {isDraft ? "Toque para continuar editando o rascunho" : "Toque para visualizar detalhes completos"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={13} color="#0284C7" />
              </View>

              {item.observacoes_finais ? (
                <Text style={styles.obsText} numberOfLines={2}>
                  {item.observacoes_finais}
                </Text>
              ) : null}

              {item.fotos && item.fotos.length > 0 && (() => {
                const f0 = item.fotos[0];
                const thumbUri = f0.base64
                  ? (f0.base64.startsWith('data:') ? f0.base64 : `data:image/jpeg;base64,${f0.base64}`)
                  : (f0.uri_local || f0.url);
                return (
                  <View style={styles.cardPhotoRow}>
                    {thumbUri ? (
                      <Image 
                        source={{ uri: thumbUri }} 
                        style={styles.cardPhotoThumb} 
                      />
                    ) : (
                      <View style={[styles.cardPhotoThumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' }]}>
                        <Ionicons name="image-outline" size={20} color="#94A3B8" />
                      </View>
                    )}
                    <View style={{ flex: 1, justifyContent: 'center', marginLeft: 10 }}>
                      <Text style={styles.photoCountLabel}>📷 {item.fotos.length} foto(s) anexada(s)</Text>
                      <Text style={styles.photoDescLabel} numberOfLines={1}>{f0.legenda || 'Registro fotográfico express'}</Text>
                    </View>
                  </View>
                );
              })()}

              <View style={styles.cardFooter}>
                <View style={[
                  styles.statusPill,
                  item.status === 'Aprovado' ? styles.statusApproved : 
                  item.status === 'Aguardando Aprovação' ? styles.statusWaiting : styles.statusDraft
                ]}>
                  <Text style={[
                    styles.statusPillText,
                    item.status === 'Aprovado' ? { color: '#065F46' } :
                    item.status === 'Aguardando Aprovação' ? { color: '#92400E' } : { color: '#B45309' }
                  ]}>
                    {displayStatus === 'Rascunho' ? '✏️ Rascunho' : displayStatus}
                  </Text>
                </View>

              <View style={styles.cardActionsRow}>
                {/* Botão Visualizar Sempre Visível */}
                <TouchableOpacity 
                  style={styles.viewBtn} 
                  onPress={() => navigation.navigate('ReportDetailScreen', { reportId: item.id, isExpress: true })}
                >
                  <Ionicons name="eye-outline" size={13} color="#0284C7" />
                  <Text style={styles.viewBtnText}>Visualizar</Text>
                </TouchableOpacity>

                {/* Ações de Aprovação / Rejeição diretas no Card */}
                {item.status === 'Aguardando Aprovação' && canApprove && (
                  <>
                    <TouchableOpacity 
                      style={styles.cardApproveBtn} 
                      onPress={() => handleOpenApproveModal(item)}
                    >
                      <Ionicons name="checkmark-circle" size={13} color="#FFFFFF" />
                      <Text style={styles.cardApproveBtnText}>Aprovar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.cardRejectBtn} 
                      onPress={() => handleOpenRejectModal(item)}
                    >
                      <Ionicons name="close-circle" size={13} color="#FFFFFF" />
                      <Text style={styles.cardRejectBtnText}>Rejeitar</Text>
                    </TouchableOpacity>
                  </>
                )}

                {item.status !== 'Aprovado' && (
                  <TouchableOpacity 
                    style={styles.editBtn} 
                    onPress={() => handleEditReport(item)}
                  >
                    <Ionicons name="create-outline" size={13} color="#D97706" />
                    <Text style={styles.editBtnText}>Editar</Text>
                  </TouchableOpacity>
                )}

                {(item.status === 'em_andamento' || item.status === 'Em preenchimento' || item.status === 'Rejeitado') && (
                  <TouchableOpacity 
                    style={styles.sendApprovalBtn} 
                    onPress={() => handleSendForApproval(item)}
                  >
                    <Ionicons name="paper-plane-outline" size={13} color="#059669" />
                    <Text style={styles.sendApprovalBtnText}>Enviar</Text>
                  </TouchableOpacity>
                )}

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

                <TouchableOpacity 
                  style={styles.cardDeleteBtn} 
                  onPress={() => handleDeleteExpress(item)}
                >
                  <Ionicons name="trash-outline" size={13} color="#DC2626" />
                  <Text style={styles.cardDeleteBtnText}>Excluir</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        );
      }}
      />

      {/* Modal Form: Relatório Express com Paridade ao Relatório Normal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="flash" size={20} color="#059669" />
                <Text style={styles.modalTitle}>{editingReportId ? `Editar ${numero}` : 'Novo Relatório Express'}</Text>
              </View>
              <TouchableOpacity onPress={handleCloseModal}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {/* Barra de Status do AutoSave em Tempo Real */}
            <View style={styles.autoSaveBar}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                {isAutoSaving ? (
                  <>
                    <ActivityIndicator size="small" color="#0284C7" />
                    <Text style={[styles.autoSaveText, { color: '#0284C7' }]}>Salvando alterações...</Text>
                  </>
                ) : lastAutoSaveTime ? (
                  <>
                    <Ionicons name="cloud-done" size={16} color="#16A34A" />
                    <Text style={styles.autoSaveText}>Salvo automaticamente às {lastAutoSaveTime}</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="cloud-outline" size={16} color="#94A3B8" />
                    <Text style={[styles.autoSaveText, { color: '#94A3B8' }]}>AutoSave ativo</Text>
                  </>
                )}
              </View>
              {!editingReportId && (
                <TouchableOpacity onPress={handleClearDraft} style={styles.clearDraftBtn}>
                  <Ionicons name="trash-bin-outline" size={13} color="#EF4444" />
                  <Text style={styles.clearDraftBtnText}>Limpar</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
              {/* 1. Título */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>1. Título do Relatório *</Text>
                <TextInput 
                  style={styles.input} 
                  value={titulo} 
                  onChangeText={setTitulo} 
                />
              </View>

              {/* 2. Número Sequencial EXP-XXXX */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>2. Número do Relatório (Sequencial)</Text>
                <View style={styles.lockedNumberBox}>
                  <Ionicons name="lock-closed" size={14} color={Colors.textMuted} />
                  <Text style={styles.lockedNumberText}>{numero}</Text>
                </View>
              </View>

              {/* 3. Data */}
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

              {/* 6. Endereço com botão GPS Real do Dispositivo */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>6. Endereço da Obra (GPS do Celular)</Text>
                <View style={styles.addressWithGpsRow}>
                  <TextInput 
                    style={[styles.input, { flex: 1 }]} 
                    placeholder="Rua, número, bairro, cidade..." 
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

              {/* 7. Funcionários / Acompanhantes com Sugestões de Visitantes */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>7. Funcionários / Acompanhantes da Visita</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Ex: Carlos (Encarregado), Ana (Estagiária)" 
                  value={acompanhantes} 
                  onChangeText={setAcompanhantes} 
                />

                {visitantesCadastrados.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600', marginBottom: 4 }}>
                      Acompanhantes Cadastrados nos Ajustes (Toque para incluir):
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                      {visitantesCadastrados.map(v => (
                        <TouchableOpacity
                          key={v.id}
                          style={styles.visitorSuggestionChip}
                          onPress={() => {
                            const add = [v.nome, v.cargo || v.empresa].filter(Boolean).join(' - ');
                            setAcompanhantes(prev => prev ? `${prev}, ${add}` : add);
                          }}
                        >
                          <Ionicons name="person-add-outline" size={12} color="#2563EB" />
                          <Text style={styles.visitorSuggestionText}>{v.nome}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* 8. Sanfona 1: Informações Técnicas da Fachada (12 Campos do Laudo Normal) */}
              <View style={styles.accordionContainer}>
                <TouchableOpacity 
                  style={styles.accordionHeader}
                  onPress={() => setShowTechInfo(!showTechInfo)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="construct-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.accordionTitle}>8. Informações Técnicas da Fachada</Text>
                  </View>
                  <Ionicons name={showTechInfo ? "chevron-up" : "chevron-down"} size={18} color="#FFFFFF" />
                </TouchableOpacity>

                {showTechInfo && (
                  <View style={styles.accordionBody}>
                    <View style={styles.techInputGroup}>
                      <Text style={styles.techInputLabel}>Elementos construtivos da base</Text>
                      <TextInput 
                        style={styles.techInput} 
                        value={techElementosBase} 
                        onChangeText={setTechElementosBase} 
                        placeholder="Ex: Concreto armado e alvenaria de blocos..."
                      />
                    </View>

                    <View style={styles.techInputGroup}>
                      <Text style={styles.techInputLabel}>Especificação chapisco colante</Text>
                      <TextInput 
                        style={styles.techInput} 
                        value={techChapiscoColante} 
                        onChangeText={setTechChapiscoColante} 
                        placeholder="Ex: Chapisco com aditivo de alto desempenho..."
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
                        placeholder="Ex: Argamassa usinada com fibras..."
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
                      <Text style={styles.techInputLabel}>Definição sobre face inferior das abas</Text>
                      <TextInput 
                        style={styles.techInput} 
                        value={techDefinicaoFaceInferiorAbas} 
                        onChangeText={setTechDefinicaoFaceInferiorAbas} 
                        placeholder="Ex: Pingadeira com corte inferior a 3cm..."
                      />
                    </View>

                    <View style={styles.techInputGroup}>
                      <Text style={styles.techInputLabel}>Caso haja projeto de fachada, especificar projetista e divergências</Text>
                      <TextInput 
                        style={[styles.techInput, styles.techInputMultiline]} 
                        value={techObservacoesFachada} 
                        onChangeText={setTechObservacoesFachada} 
                        multiline
                        placeholder="Ex: Projetista / Observações técnicas..."
                      />
                    </View>

                    <View style={styles.techInputGroup}>
                      <Text style={styles.techInputLabel}>Outras observações técnicas</Text>
                      <TextInput 
                        style={[styles.techInput, styles.techInputMultiline]} 
                        value={techOutrasObservacoes} 
                        onChangeText={setTechOutrasObservacoes} 
                        multiline
                        placeholder="Observações adicionais..."
                      />
                    </View>
                  </View>
                )}
              </View>

              {/* 9. Sanfona 2: Checklist de Verificação com Barra de Progresso */}
              <View style={styles.accordionContainer}>
                <TouchableOpacity 
                  style={[styles.accordionHeader, { backgroundColor: '#0284C7' }]}
                  onPress={() => setShowChecklist(!showChecklist)}
                >
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="checkbox" size={16} color="#FFFFFF" />
                        <Text style={styles.accordionTitle}>9. Checklist de Verificação ({completedChecks}/{totalChecks})</Text>
                      </View>
                      <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{progressPercent}%</Text>
                    </View>
                    <View style={styles.headerProgressTrack}>
                      <View style={[styles.headerProgressFill, { width: `${progressPercent}%` }]} />
                    </View>
                  </View>
                  <Ionicons name={showChecklist ? "chevron-up" : "chevron-down"} size={18} color="#FFFFFF" />
                </TouchableOpacity>

                {showChecklist && (
                  <View style={styles.accordionBody}>
                    {checklist.map((item, idx) => (
                      <View key={item.id} style={styles.checkItemContainer}>
                        <TouchableOpacity 
                          style={[styles.checkItemRow, item.checked && styles.checkItemRowActive]}
                          onPress={() => {
                            const updated = [...checklist];
                            updated[idx] = { ...updated[idx], checked: !updated[idx].checked };
                            setChecklist(updated);
                          }}
                        >
                          <Ionicons 
                            name={item.checked ? "checkbox" : "square-outline"} 
                            size={22} 
                            color={item.checked ? "#16A34A" : "#94A3B8"} 
                          />
                          <Text style={[styles.checkItemText, item.checked && styles.checkItemTextChecked]}>
                            {item.item}
                          </Text>
                        </TouchableOpacity>
                        <TextInput 
                          style={styles.checkItemObsInput}
                          placeholder="Observação deste item..."
                          placeholderTextColor="#94A3B8"
                          value={item.observacao}
                          onChangeText={(txt) => {
                            const updated = [...checklist];
                            updated[idx] = { ...updated[idx], observacao: txt };
                            setChecklist(updated);
                          }}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* 10. Observações Gerais & Parecer */}
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

              {/* 11. Galeria de Fotos do Laudo Express (Idêntico ao Relatório Normal) */}
              <View style={styles.inputGroup}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={styles.label}>11. Galeria de Fotos do Laudo ({attachedPhotos.length})</Text>
                  <Text style={styles.photoCountText}>Capacidade: {attachedPhotos.length} / 200 fotos</Text>
                </View>

                {/* Barra Fixa de 56px de altura para Captura Rápida (Câmera e Galeria) */}
                <View style={styles.stickyPhotoBar}>
                  <TouchableOpacity 
                    style={[styles.cameraBigBtn, isProcessingPhoto && { opacity: 0.6 }]} 
                    onPress={handleAddPhotoCamera}
                    disabled={isProcessingPhoto}
                  >
                    <Ionicons name="camera" size={22} color="#FFFFFF" />
                    <Text style={styles.cameraBigBtnText}>{isProcessingPhoto ? 'Processando...' : 'Câmera'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.galleryBigBtn, isProcessingPhoto && { opacity: 0.6 }]} 
                    onPress={handleAddPhotoGallery}
                    disabled={isProcessingPhoto}
                  >
                    <Ionicons name="images" size={22} color="#FFFFFF" />
                    <Text style={styles.galleryBigBtnText}>{isProcessingPhoto ? 'Processando...' : 'Galeria'}</Text>
                  </TouchableOpacity>
                </View>

                {/* Lista de Cards de Fotos no Padrão do Relatório Comum */}
                {attachedPhotos.map((item, index) => {
                  const resolvedUri = (item.uri && item.uri.startsWith('file://'))
                    ? item.uri
                    : (item.base64
                        ? (item.base64.startsWith('data:') ? item.base64 : `data:image/jpeg;base64,${item.base64}`)
                        : item.uri);

                  return (
                    <View key={`${item.id || index}_${item.uri || index}`} style={styles.photoCard}>
                      <View style={styles.thumbWrapper}>
                        {resolvedUri ? (
                          <Image source={{ uri: resolvedUri }} style={styles.thumb} resizeMode="cover" />
                        ) : (
                          <View style={styles.thumbFallback}>
                            <Ionicons name="camera-outline" size={24} color="#94A3B8" />
                          </View>
                        )}
                        <PhotoAnnotationOverlay annotationsJson={item.anotacoes_dados} />
                      </View>

                      <View style={styles.photoInfo}>
                        <View style={styles.photoTopRow}>
                          <Text style={styles.photoNum}>Foto #{index + 1}</Text>
                          <TouchableOpacity onPress={() => handleRemovePhoto(index)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="trash-outline" size={18} color="#DC2626" />
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
                            placeholderTextColor="#94A3B8"
                            value={item.legenda || ''}
                            onChangeText={txt => {
                              setAttachedPhotos(prev => {
                                const updated = [...prev];
                                if (updated[index]) {
                                  updated[index] = { ...updated[index], legenda: txt };
                                }
                                return updated;
                              });
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
                  );
                })}
              </View>

              {/* Botões Inferiores: Salvar Rascunho, Enviar Aprovação e Aprovar */}
              <View style={styles.modalExpressFooterRow}>
                {editingReportId && expressList.find(r => r.id === editingReportId)?.status === 'Aguardando Aprovação' && canApprove && (
                  <TouchableOpacity
                    style={[styles.btnExpressApproveModal, loading && { opacity: 0.6 }]}
                    onPress={() => {
                      const rep = expressList.find(r => r.id === editingReportId);
                      if (rep) {
                        setModalVisible(false);
                        handleOpenApproveModal(rep);
                      }
                    }}
                    disabled={loading}
                  >
                    <Ionicons name="checkmark-done" size={17} color="#FFFFFF" />
                    <Text style={styles.btnExpressApproveModalText}>Aprovar</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity 
                  style={[styles.btnExpressDraft, loading && { opacity: 0.6 }]}
                  onPress={() => handleCreateExpress('em_andamento')}
                  disabled={loading}
                >
                  <Ionicons name="document-text-outline" size={18} color="#0284C7" />
                  <Text style={styles.btnExpressDraftText}>Salvar Rascunho</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.btnExpressSubmit, loading && { opacity: 0.6 }]}
                  onPress={() => handleCreateExpress('Aguardando Aprovação')}
                  disabled={loading}
                >
                  <Ionicons name="paper-plane" size={18} color="#FFFFFF" />
                  <Text style={styles.btnExpressSubmitText}>Enviar Aprovação</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal do Editor de Fotos (Anotações com Setas, Círculos, etc.) */}
      <PhotoEditorModal
        visible={showEditorModal}
        photoUri={editingPhotoIndex !== null && attachedPhotos[editingPhotoIndex] ? (attachedPhotos[editingPhotoIndex].uri || null) : null}
        base64={editingPhotoIndex !== null && attachedPhotos[editingPhotoIndex] ? attachedPhotos[editingPhotoIndex].base64 : undefined}
        initialAnnotations={editingPhotoIndex !== null && attachedPhotos[editingPhotoIndex] ? attachedPhotos[editingPhotoIndex].anotacoes_dados : undefined}
        onClose={() => {
          setShowEditorModal(false);
          setEditingPhotoIndex(null);
        }}
        onSave={handleSavePhotoAnnotations}
      />

      {/* Legendas Predefinidas Modal com Filtro de Categorias e Pesquisa */}
      <Modal visible={showLegendModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
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

      {/* Modal de Parecer de Aprovação / Rejeição do Relatório Express */}
      <Modal visible={approvalModalVisible} animationType="fade" transparent>
        <View style={styles.actionModalOverlay}>
          <View style={styles.actionModalBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Ionicons 
                name={approvalAction === 'Aprovado' ? 'checkmark-circle' : 'close-circle'} 
                size={22} 
                color={approvalAction === 'Aprovado' ? '#059669' : '#DC2626'} 
              />
              <Text style={styles.actionModalTitle}>
                {approvalAction === 'Aprovado' ? 'Aprovar Relatório Express' : 'Rejeitar Relatório Express'}
              </Text>
            </View>

            <Text style={styles.actionModalSub}>
              {reportToApprove?.numero} - {reportToApprove?.obra_nome}
            </Text>

            <Text style={styles.actionModalInputLabel}>
              {approvalAction === 'Aprovado' ? 'Parecer Técnico (opcional):' : 'Motivo da Rejeição (obrigatório):'}
            </Text>
            <TextInput
              style={styles.actionModalInput}
              multiline
              numberOfLines={3}
              placeholder={approvalAction === 'Aprovado' ? 'Relatório aprovado em conformidade técnica...' : 'Descreva as correções necessárias...'}
              value={approvalComment}
              onChangeText={setApprovalComment}
            />

            <View style={styles.actionModalButtons}>
              <TouchableOpacity 
                style={styles.actionModalCancelBtn} 
                onPress={() => {
                  setApprovalModalVisible(false);
                  setReportToApprove(null);
                }}
              >
                <Text style={styles.actionModalCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[
                  styles.actionModalConfirmBtn,
                  approvalAction === 'Aprovado' ? { backgroundColor: '#059669' } : { backgroundColor: '#DC2626' }
                ]}
                onPress={handleConfirmApprovalAction}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.actionModalConfirmText}>
                    {approvalAction === 'Aprovado' ? 'Confirmar Aprovação' : 'Confirmar Rejeição'}
                  </Text>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  expBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  expBadgeText: { fontSize: 12, fontWeight: '700', color: '#059669' },
  dateText: { fontSize: 12, color: Colors.textMuted },
  obraTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  construtoraText: { fontSize: 13, color: Colors.textSecondary, marginBottom: 4 },
  cardAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4.5,
    marginBottom: 8,
  },
  cardAuthorText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '400',
  },
  cardAuthorName: {
    fontWeight: '600',
    color: '#334155',
  },
  obsText: { fontSize: 12, color: Colors.textSecondary, marginBottom: 10, fontStyle: 'italic' },
  cardPhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardPhotoThumb: { width: 44, height: 44, borderRadius: 6, backgroundColor: '#CBD5E1' },
  photoCountLabel: { fontSize: 12, fontWeight: '600', color: Colors.text },
  photoDescLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusApproved: { backgroundColor: '#D1FAE5' },
  statusWaiting: { backgroundColor: '#FEF3C7' },
  statusDraft: { backgroundColor: '#F1F5F9' },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  cardActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  editBtnText: { fontSize: 11, fontWeight: '600', color: '#B45309' },
  sendApprovalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  sendApprovalBtnText: { fontSize: 11, fontWeight: '600', color: '#047857' },
  duplicateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  duplicateBtnText: { fontSize: 12, fontWeight: '600', color: '#0284C7' },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  pdfBtnText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginTop: 12 },
  emptySub: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginTop: 4, paddingHorizontal: 32 },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
  },
  createBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  autoSaveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  autoSaveText: { fontSize: 11.5, color: '#15803D', fontWeight: '600' },
  clearDraftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  clearDraftBtnText: { fontSize: 11, fontWeight: '700', color: '#EF4444' },
  draftAutoSaveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  draftAutoSaveText: { fontSize: 11, color: '#16A34A', fontWeight: '600' },
  inputGroup: { marginBottom: 12 },
  label: { fontSize: 12.5, fontWeight: '600', color: '#334155', marginBottom: 4 },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
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
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
  },
  lockedNumberText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  textArea: { height: 72, textAlignVertical: 'top', paddingTop: 8 },
  addressWithGpsRow: { flexDirection: 'row', gap: 8 },
  gpsButton: {
    backgroundColor: '#0284C7',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: 'center',
  },
  gpsButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  visitorSuggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
  },
  visitorSuggestionText: { fontSize: 11, color: '#1E40AF', fontWeight: '600' },
  accordionContainer: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  accordionHeader: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accordionTitle: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  headerProgressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  headerProgressFill: {
    height: 4,
    backgroundColor: '#10B981',
    borderRadius: 2,
  },
  accordionBody: {
    padding: 12,
    backgroundColor: '#F8FAFC',
  },
  techInputGroup: { marginBottom: 10 },
  techInputLabel: { fontSize: 11.5, fontWeight: '600', color: '#475569', marginBottom: 3 },
  techInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 38,
    fontSize: 12.5,
    color: '#0F172A',
  },
  techInputMultiline: { height: 64, textAlignVertical: 'top', paddingTop: 6 },
  checkItemContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  checkItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkItemRowActive: {},
  checkItemText: { flex: 1, fontSize: 12.5, color: '#334155', fontWeight: '500' },
  checkItemTextChecked: { color: '#16A34A', fontWeight: '700' },
  checkItemObsInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    height: 34,
    fontSize: 11.5,
    marginTop: 6,
    color: '#334155',
  },
  stickyPhotoBar: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  cameraBigBtn: {
    flex: 1,
    height: 52,
    backgroundColor: '#0284C7',
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
    fontSize: 14,
  },
  galleryBigBtn: {
    flex: 1,
    height: 52,
    backgroundColor: '#16A34A',
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
    fontSize: 14,
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
  legendItemText: { fontSize: 13, color: Colors.text, flex: 1 },
  photoActionBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 8,
  },
  photoActionText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  photoThumbWrap: { position: 'relative' },
  modalPhotoThumb: { width: 70, height: 70, borderRadius: 8, backgroundColor: '#E2E8F0' },
  removePhotoBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
  },
  modalExpressFooterRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  btnExpressDraft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    height: 46,
    borderRadius: 10,
  },
  btnExpressDraftText: { color: '#0284C7', fontWeight: '700', fontSize: 13 },
  btnExpressSubmit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#059669',
    height: 46,
    borderRadius: 10,
  },
  btnExpressSubmitText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  cardApproveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#059669',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  cardApproveBtnText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  cardRejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  cardRejectBtnText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  btnExpressApproveModal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 10,
  },
  btnExpressApproveModalText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  actionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  actionModalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    ...Shadows.md,
  },
  actionModalTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  actionModalSub: { fontSize: 12.5, color: '#64748B', marginTop: 2, marginBottom: 12 },
  actionModalInputLabel: { fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 6 },
  actionModalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  actionModalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  actionModalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  actionModalCancelText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  actionModalConfirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionModalConfirmText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  cardViewHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0F2FE',
  },
  cardViewHintText: { fontSize: 11, color: '#0369A1', fontWeight: '600' },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  viewBtnText: { fontSize: 11, fontWeight: '700', color: '#0284C7' },
  cardDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  cardDeleteBtnText: { fontSize: 11, fontWeight: '700', color: '#DC2626' },
});
