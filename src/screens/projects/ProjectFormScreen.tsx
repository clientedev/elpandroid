import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, Modal 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { 
  saveLocalProjeto, 
  addToSyncQueue, 
  getNextProjectNumber, 
  getLocalUsers, 
  getLocalChecklistTemplate,
  getLocalContatos
} from '../../database/db';
import { ensureProjectFolders } from '../../services/appFilesService';
import { apiClient } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { Projeto, User, ContatoObraItem, ChecklistCustomItem } from '../../types';
import { Colors, Shadows } from '../../theme/colors';
import * as Location from 'expo-location';

const CARGO_OPCOES = [
  'Engenheiro/a',
  'Arquiteto/a',
  'Analista',
  'Assistente',
  'Encarregado',
  'Mestre',
  'Estagiário/a',
  'Outro'
];

const TIPOS_OBRA_OPCOES = [
  'Edifício Residencial Multifamiliar',
  'Edifício Comercial',
  'Edifício Misto (Comercial / Residencial)',
  'Retrofit / Restauração de Fachada',
  'Galpão Industrial / Logístico',
  'Outro'
];

export const ProjectFormScreen: React.FC<{ route?: any; navigation: any }> = ({ route, navigation }) => {
  const { user } = useAuth();
  const { isOnline, triggerSync } = useNetwork();
  const existingProject: Projeto | undefined = route?.params?.project;
  const [projectId] = useState<number>(existingProject?.id || Date.now());

  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState('');
  const isSavingRef = useRef(false);
  const hasSavedRef = useRef(false);

  // ================= 1. NOME DA OBRA =================
  const [nome, setNome] = useState(existingProject?.nome || '');
  const [numero, setNumero] = useState(existingProject?.numero || 'OBRA-0001');

  useEffect(() => {
    if (!existingProject) {
      getNextProjectNumber().then(nextNum => {
        setNumero(nextNum);
      }).catch(err => {
        console.warn('Erro ao obter próximo código OBRA-0001:', err);
      });
    }
  }, [existingProject]);

  // ================= 2. CONSTRUTORA =================
  const [construtora, setConstrutora] = useState(existingProject?.construtora || '');

  // ================= 3. ENDEREÇO =================
  const [endereco, setEndereco] = useState(existingProject?.endereco || '');
  const [cep, setCep] = useState(() => {
    const match = (existingProject?.endereco || '').match(/\b(\d{5})-?(\d{3})\b/);
    return match ? `${match[1]}-${match[2]}` : '';
  });
  const [latitude, setLatitude] = useState<number | undefined>(existingProject?.latitude);
  const [longitude, setLongitude] = useState<number | undefined>(existingProject?.longitude);
  const [loadingCep, setLoadingCep] = useState(false);
  const [loadingGps, setLoadingGps] = useState(false);
  const [streetSuggestions, setStreetSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const streetSearchTimeout = useRef<any>(null);

  // ================= 4. RESPONSÁVEL (AUTO LINK COM EMAIL) =================
  const [users, setUsers] = useState<User[]>([]);
  const [responsavelId, setResponsavelId] = useState<number>(
    existingProject?.responsavel_id || user?.id || 1
  );
  const [funcionario, setFuncionario] = useState(
    existingProject?.nome_funcionario || (user as any)?.nome_completo || user?.username || 'Responsável'
  );
  const [emailPrincipal, setEmailPrincipal] = useState(
    existingProject?.email_principal || user?.email || ''
  );
  const [showResponsavelModal, setShowResponsavelModal] = useState(false);

  // ================= 5. CONTATOS DA OBRA =================
  const [contatos, setContatos] = useState<ContatoObraItem[]>(
    existingProject?.contatos || []
  );
  const [showContatoModal, setShowContatoModal] = useState(false);
  const [editingContatoIndex, setEditingContatoIndex] = useState<number | null>(null);
  const [contatoNome, setContatoNome] = useState('');
  const [contatoCargo, setContatoCargo] = useState('Engenheiro/a');
  const [contatoCargoCustom, setContatoCargoCustom] = useState('');
  const [contatoEmpresa, setContatoEmpresa] = useState('');
  const [contatoEmail, setContatoEmail] = useState('');
  const [contatoTelefone, setContatoTelefone] = useState('');
  const [showCargoPicker, setShowCargoPicker] = useState(false);

  // ================= 6. TIPO DA OBRA =================
  const [tipoObra, setTipoObra] = useState(existingProject?.tipo_obra || 'Edifício Residencial Multifamiliar');
  const [showTipoObraPicker, setShowTipoObraPicker] = useState(false);

  // ================= 7. NUMERAÇÃO INICIAL DOS RELATÓRIOS & STATUS =================
  const [numeracaoInicial, setNumeracaoInicial] = useState<string>(
    existingProject?.numeracao_inicial ? existingProject.numeracao_inicial.toString() : '1'
  );
  const [status, setStatus] = useState(existingProject?.status || 'Ativo');

  // ================= 8. INFORMAÇÕES TÉCNICAS =================
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [elementosBase, setElementosBase] = useState(existingProject?.elementos_construtivos_base || '');
  const [chapiscoColante, setChapiscoColante] = useState(existingProject?.especificacao_chapisco_colante || '');
  const [chapiscoAlvenaria, setChapiscoAlvenaria] = useState(existingProject?.especificacao_chapisco_alvenaria || '');
  const [argamassaEmboco, setArgamassaEmboco] = useState(existingProject?.especificacao_argamassa_emboco || '');
  const [formaAplicacao, setFormaAplicacao] = useState(existingProject?.forma_aplicacao_argamassa || '');
  const [acabamentosRevestimento, setAcabamentosRevestimento] = useState(existingProject?.acabamentos_revestimento || '');
  const [peitoris, setPeitoris] = useState(existingProject?.acabamento_peitoris || '');
  const [muretas, setMuretas] = useState(existingProject?.acabamento_muretas || '');
  const [frisosCor, setFrisosCor] = useState(existingProject?.definicao_frisos_cor || '');
  const [faceInferiorAbas, setFaceInferiorAbas] = useState(existingProject?.definicao_face_inferior_abas || '');
  const [observacoesFachada, setObservacoesFachada] = useState(existingProject?.observacoes_projeto_fachada || '');
  const [outrasObs, setOutrasObs] = useState(existingProject?.outras_observacoes || '');

  // ================= 9. CHECKLIST =================
  const [checklistItems, setChecklistItems] = useState<ChecklistCustomItem[]>([]);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [newChecklistText, setNewChecklistText] = useState('');

  const [loading, setLoading] = useState(false);

  // Carregar Usuários e Checklist Padrão
  useEffect(() => {
    getLocalUsers().then(us => {
      setUsers(us);
      if (!existingProject && us.length > 0) {
        const found = us.find(u => u.id === user?.id) || us[0];
        setResponsavelId(found.id);
        setFuncionario(found.nome_completo || found.username);
        setEmailPrincipal(found.email || '');
      } else if (existingProject && us.length > 0) {
        const found = us.find(u => u.id === existingProject.responsavel_id);
        if (found) {
          setEmailPrincipal(found.email || '');
          setFuncionario(found.nome_completo || found.username);
        }
      }
    }).catch(err => console.warn('Erro ao carregar usuários:', err));

    getLocalChecklistTemplate().then(items => {
      if (existingProject?.checklist_data) {
        try {
          const parsed = JSON.parse(existingProject.checklist_data);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setChecklistItems(parsed);
            return;
          }
        } catch (e) {}
      }
      setChecklistItems(items);
    }).catch(err => console.warn('Erro ao carregar checklist:', err));

    if (existingProject?.id) {
      getLocalContatos(existingProject.id).then(cList => {
        if (cList && cList.length > 0) {
          setContatos(prev => {
            if (prev && prev.length > 0) return prev;
            return cList.map(c => ({
              id: c.id,
              nome: c.nome,
              cargo: c.cargo || 'Engenheiro/a',
              empresa: c.empresa || '',
              email: c.email || '',
              telefone: c.telefone || '',
            }));
          });
        }
      }).catch(err => console.warn('Erro ao carregar contatos da obra:', err));
    }
  }, [existingProject, user]);

  // Ao selecionar responsável, linkar automaticamente ao seu e-mail e nome
  const handleSelectResponsavel = (u: User) => {
    setResponsavelId(u.id);
    setFuncionario(u.nome_completo || u.username);
    setEmailPrincipal(u.email || '');
    setShowResponsavelModal(false);
  };

  // ================= AUTOSAVE EM TEMPO REAL =================
  const saveDraftImmediately = useCallback(async () => {
    if (!nome.trim() && !construtora.trim()) return;
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      setIsAutoSaving(true);
      const numInicialParsed = parseInt(numeracaoInicial, 10);
      const projData: Projeto = {
        id: projectId,
        numero: numero.trim() || 'OBRA-0001',
        nome: nome.trim() || 'Obra em Andamento',
        construtora: construtora.trim() || 'ELP Engenharia',
        tipo_obra: tipoObra,
        endereco: endereco.trim(),
        latitude: latitude,
        longitude: longitude,
        nome_funcionario: funcionario.trim(),
        responsavel_id: responsavelId,
        email_principal: emailPrincipal.trim(),
        numeracao_inicial: isNaN(numInicialParsed) ? 1 : numInicialParsed,
        status: status,
        elementos_construtivos_base: elementosBase.trim(),
        especificacao_chapisco_colante: chapiscoColante.trim(),
        especificacao_chapisco_alvenaria: chapiscoAlvenaria.trim(),
        especificacao_argamassa_emboco: argamassaEmboco.trim(),
        forma_aplicacao_argamassa: formaAplicacao.trim(),
        acabamentos_revestimento: acabamentosRevestimento.trim(),
        acabamento_peitoris: peitoris.trim(),
        acabamento_muretas: muretas.trim(),
        definicao_frisos_cor: frisosCor.trim(),
        definicao_face_inferior_abas: faceInferiorAbas.trim(),
        observacoes_projeto_fachada: observacoesFachada.trim(),
        outras_observacoes: outrasObs.trim(),
        contatos: contatos,
        checklist_data: JSON.stringify(checklistItems),
        sync_status: 'pending',
      };

      // 1. Salva no SQLite local
      await saveLocalProjeto(projData, 'pending');

      // 2. Garante pastas da obra
      await ensureProjectFolders(projData.nome, projData.numero).catch(() => null);

      // 3. Registra na fila de sincronização
      await addToSyncQueue(
        'projeto',
        projectId,
        existingProject ? 'update' : 'create',
        existingProject ? `/api/projetos/${projectId}` : '/api/projetos',
        existingProject ? 'PUT' : 'POST',
        projData
      );

      // 4. Salva online se conectado
      if (isOnline) {
        if (existingProject) {
          apiClient.axios.put(`/api/projetos/${projectId}`, projData).catch(() => null);
        } else {
          apiClient.axios.post('/api/projetos', projData).catch(() => null);
        }
      }

      const d = new Date();
      setLastSavedTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      console.warn('[ProjectForm] AutoSave erro:', err);
    } finally {
      setIsAutoSaving(false);
      isSavingRef.current = false;
    }
  }, [
    projectId, numero, nome, construtora, tipoObra, endereco, latitude, longitude,
    funcionario, responsavelId, emailPrincipal, numeracaoInicial, status,
    elementosBase, chapiscoColante, chapiscoAlvenaria, argamassaEmboco,
    formaAplicacao, acabamentosRevestimento, peitoris, muretas, frisosCor,
    faceInferiorAbas, observacoesFachada, outrasObs, contatos, checklistItems,
    existingProject, isOnline
  ]);

  // Debounced AutoSave (1500ms)
  useEffect(() => {
    if (!nome.trim() && !construtora.trim()) return;
    const timer = setTimeout(() => {
      saveDraftImmediately();
    }, 1500);
    return () => clearTimeout(timer);
  }, [
    nome, construtora, tipoObra, funcionario, responsavelId, emailPrincipal,
    numeracaoInicial, endereco, latitude, longitude, status, elementosBase,
    chapiscoColante, chapiscoAlvenaria, argamassaEmboco, formaAplicacao,
    acabamentosRevestimento, peitoris, muretas, frisosCor, faceInferiorAbas,
    observacoesFachada, outrasObs, contatos, checklistItems, saveDraftImmediately
  ]);

  // Forçar salvamento ao sair da tela
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (hasSavedRef.current) return;
      e.preventDefault();
      saveDraftImmediately().finally(() => {
        hasSavedRef.current = true;
        if (isOnline) triggerSync();
        navigation.dispatch(e.data.action);
      });
    });
    return unsubscribe;
  }, [navigation, saveDraftImmediately, isOnline, triggerSync]);

  // ================= CEP & AUTOCOMPLETE DE ENDEREÇO =================
  function handleCepChange(text: string) {
    let raw = text.replace(/\D/g, '');
    if (raw.length > 8) raw = raw.slice(0, 8);
    let formatted = raw;
    if (raw.length > 5) {
      formatted = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    }
    setCep(formatted);
    if (raw.length === 8) {
      handleBuscarCep(raw);
    }
  }

  async function handleBuscarCep(cepParam?: string) {
    const rawCep = (cepParam || cep).replace(/\D/g, '');
    if (rawCep.length !== 8) {
      Alert.alert('CEP Inválido', 'Por favor, informe um CEP válido com 8 dígitos.');
      return;
    }
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${rawCep}/json/`).then(r => r.json());
      if (res.erro) {
        Alert.alert('CEP Não Encontrado', 'Não foi possível localizar o endereço para o CEP informado.');
        return;
      }
      const parts = [
        res.logradouro,
        res.bairro,
        res.localidade ? `${res.localidade} - ${res.uf}` : res.uf,
        `CEP ${res.cep || rawCep}`
      ].filter(Boolean);
      const fullAddr = parts.join(', ');
      setEndereco(fullAddr);

      try {
        const query = `${res.logradouro || ''}, ${res.localidade || ''}, ${res.uf || ''}, Brasil`;
        const geocode = await Location.geocodeAsync(query);
        if (geocode && geocode.length > 0) {
          setLatitude(geocode[0].latitude);
          setLongitude(geocode[0].longitude);
        }
      } catch (geoErr) {
        console.warn('Geocodificação CEP aviso:', geoErr);
      }
    } catch {
      Alert.alert('Erro ao Buscar CEP', 'Falha na conexão com o serviço de busca de CEP.');
    } finally {
      setLoadingCep(false);
    }
  }

  function handleSearchStreet(query: string) {
    setEndereco(query);
    if (streetSearchTimeout.current) clearTimeout(streetSearchTimeout.current);
    if (!query || query.trim().length < 3) {
      setStreetSuggestions([]);
      return;
    }
    streetSearchTimeout.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=br&limit=5&addressdetails=1`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'ObraFlowAndroid/1.0' }
        }).then(r => r.json());
        if (Array.isArray(res)) {
          setStreetSuggestions(res);
        } else {
          setStreetSuggestions([]);
        }
      } catch {
        setStreetSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 400);
  }

  function handleSelectSuggestion(item: any) {
    setEndereco(item.display_name);
    if (item.lat && item.lon) {
      setLatitude(parseFloat(item.lat));
      setLongitude(parseFloat(item.lon));
    }
    const rawPostcode = item?.address?.postcode || '';
    const digits = String(rawPostcode).replace(/\D/g, '');
    if (digits.length === 8) {
      setCep(`${digits.slice(0, 5)}-${digits.slice(5)}`);
    } else if (rawPostcode) {
      setCep(String(rawPostcode));
    }
    setStreetSuggestions([]);
  }

  async function handleCapturarGps() {
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
      setLatitude(newLat);
      setLongitude(newLon);

      let resolvedAddress = '';
      let detectedCep = '';

      try {
        const reverseGeocode = await Location.reverseGeocodeAsync({
          latitude: newLat,
          longitude: newLon,
        });

        if (reverseGeocode && reverseGeocode.length > 0) {
          const item = reverseGeocode[0];
          const parts: string[] = [];
          const logradouro = item.street || item.name || '';
          const num = item.streetNumber || '';
          if (logradouro) parts.push(num ? `${logradouro}, ${num}` : logradouro);
          if (item.district || item.subregion) parts.push(item.district || item.subregion || '');
          const cidade = item.city || item.subregion || '';
          const uf = item.region || '';
          if (cidade && uf) parts.push(`${cidade} - ${uf}`);
          else if (cidade || uf) parts.push(cidade || uf);
          if (item.postalCode) {
            const digits = String(item.postalCode).replace(/\D/g, '');
            detectedCep = digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : String(item.postalCode).trim();
            parts.push(`CEP ${detectedCep}`);
          }
          resolvedAddress = parts.filter(Boolean).join(', ');
        }
      } catch (revErr) {
        console.warn('[GPS] Erro no geocoding reverso:', revErr);
      }

      // Fallback / complemento via Nominatim para garantir preenchimento automático do CEP
      if (!detectedCep || detectedCep.replace(/\D/g, '').length < 8 || !resolvedAddress) {
        try {
          const nomResp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${newLat}&lon=${newLon}&addressdetails=1`,
            { headers: { 'User-Agent': 'ELP-ObraFlow-Mobile/1.0' } }
          );
          if (nomResp.ok) {
            const nomData = await nomResp.json();
            const addr = nomData?.address || {};
            if (addr.postcode && (!detectedCep || detectedCep.replace(/\D/g, '').length < 8)) {
              const digits = String(addr.postcode).replace(/\D/g, '');
              detectedCep = digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : String(addr.postcode).trim();
            }
            if (!resolvedAddress && nomData?.display_name) {
              resolvedAddress = nomData.display_name;
            } else if (resolvedAddress && detectedCep && !resolvedAddress.includes('CEP')) {
              resolvedAddress = `${resolvedAddress}, CEP ${detectedCep}`;
            }
          }
        } catch (nomErr) {
          console.warn('[GPS] Fallback Nominatim CEP:', nomErr);
        }
      }

      if (detectedCep) {
        setCep(detectedCep);
      }

      if (resolvedAddress) {
        setEndereco(resolvedAddress);
        Alert.alert(
          'Localização do Dispositivo Obtida',
          `Endereço identificado com sucesso pelo GPS do dispositivo:\n\n${resolvedAddress}${detectedCep ? `\nCEP: ${detectedCep}` : ''}\n\nCoordenadas:\nLat: ${newLat.toFixed(6)}, Lon: ${newLon.toFixed(6)}`
        );
      } else {
        const fallbackCoord = `Lat: ${newLat.toFixed(6)}, Lon: ${newLon.toFixed(6)}`;
        if (!endereco.trim()) setEndereco(fallbackCoord);
        Alert.alert('GPS Capturado', `Coordenadas obtidas:\n${fallbackCoord}${detectedCep ? `\nCEP: ${detectedCep}` : ''}`);
      }
    } catch {
      Alert.alert('Falha no GPS', 'Não foi possível obter a localização do dispositivo no momento.');
    } finally {
      setLoadingGps(false);
    }
  }

  // ================= MODAL CONTATOS DA OBRA =================
  const handleOpenAddContato = () => {
    setEditingContatoIndex(null);
    setContatoNome('');
    setContatoCargo('Engenheiro/a');
    setContatoCargoCustom('');
    setContatoEmpresa(construtora || '');
    setContatoEmail('');
    setContatoTelefone('');
    setShowContatoModal(true);
  };

  const handleEditContato = (idx: number) => {
    const c = contatos[idx];
    setEditingContatoIndex(idx);
    setContatoNome(c.nome);
    if (CARGO_OPCOES.includes(c.cargo)) {
      setContatoCargo(c.cargo);
      setContatoCargoCustom('');
    } else {
      setContatoCargo('Outro');
      setContatoCargoCustom(c.cargo);
    }
    setContatoEmpresa(c.empresa || '');
    setContatoEmail(c.email || '');
    setContatoTelefone(c.telefone || '');
    setShowContatoModal(true);
  };

  const handleSaveContato = () => {
    if (!contatoNome.trim()) {
      Alert.alert('Nome Obrigatório', 'Informe o nome do contato.');
      return;
    }
    const finalCargo = contatoCargo === 'Outro' 
      ? (contatoCargoCustom.trim() || 'Outro') 
      : contatoCargo;

    const newContato: ContatoObraItem = {
      id: (editingContatoIndex !== null && contatos[editingContatoIndex]?.id) 
        ? contatos[editingContatoIndex].id 
        : Date.now() + Math.floor(Math.random() * 1000),
      nome: contatoNome.trim(),
      cargo: finalCargo,
      empresa: contatoEmpresa.trim(),
      email: contatoEmail.trim(),
      telefone: contatoTelefone.trim(),
    };

    if (editingContatoIndex !== null) {
      const updated = [...contatos];
      updated[editingContatoIndex] = newContato;
      setContatos(updated);
    } else {
      setContatos([...contatos, newContato]);
    }
    setShowContatoModal(false);
  };

  const handleRemoveContato = (idx: number) => {
    Alert.alert('Remover Contato', 'Deseja remover este contato da obra?', [
      { text: 'Cancelar', style: 'cancel' },
      { 
        text: 'Remover', 
        style: 'destructive', 
        onPress: () => {
          setContatos(contatos.filter((_, i) => i !== idx));
        }
      }
    ]);
  };

  // ================= MODAL CHECKLIST PERSONALIZADO =================
  const handleAddCustomChecklistItem = () => {
    if (!newChecklistText.trim()) return;
    const newItem: ChecklistCustomItem = {
      id: Date.now(),
      item: newChecklistText.trim(),
      texto: newChecklistText.trim(),
      ordem: checklistItems.length + 1,
      ativo: true
    };
    setChecklistItems([...checklistItems, newItem]);
    setNewChecklistText('');
  };

  const handleRemoveChecklistItem = (id: number) => {
    setChecklistItems(checklistItems.filter(item => item.id !== id));
  };

  // ================= SALVAMENTO FINAL =================
  async function handleSave() {
    if (!nome.trim()) {
      Alert.alert('Campo Obrigatório', 'Por favor, informe o Nome da Obra.');
      return;
    }
    if (!construtora.trim()) {
      Alert.alert('Campo Obrigatório', 'Por favor, informe o Nome da Construtora.');
      return;
    }

    setLoading(true);
    hasSavedRef.current = true;
    try {
      const numInicialParsed = parseInt(numeracaoInicial, 10) || 1;

      const projData: Projeto = {
        id: projectId,
        numero: numero.trim(),
        nome: nome.trim(),
        construtora: construtora.trim(),
        tipo_obra: tipoObra,
        endereco: endereco.trim(),
        latitude: latitude,
        longitude: longitude,
        nome_funcionario: funcionario.trim(),
        responsavel_id: responsavelId,
        email_principal: emailPrincipal.trim(),
        numeracao_inicial: numInicialParsed,
        status: status,
        elementos_construtivos_base: elementosBase.trim(),
        especificacao_chapisco_colante: chapiscoColante.trim(),
        especificacao_chapisco_alvenaria: chapiscoAlvenaria.trim(),
        especificacao_argamassa_emboco: argamassaEmboco.trim(),
        forma_aplicacao_argamassa: formaAplicacao.trim(),
        acabamentos_revestimento: acabamentosRevestimento.trim(),
        acabamento_peitoris: peitoris.trim(),
        acabamento_muretas: muretas.trim(),
        definicao_frisos_cor: frisosCor.trim(),
        definicao_face_inferior_abas: faceInferiorAbas.trim(),
        observacoes_projeto_fachada: observacoesFachada.trim(),
        outras_observacoes: outrasObs.trim(),
        contatos: contatos,
        checklist_data: JSON.stringify(checklistItems),
        sync_status: 'pending',
      };

      await saveLocalProjeto(projData, 'pending');
      await ensureProjectFolders(projData.nome, projData.numero).catch(() => null);

      await addToSyncQueue(
        'projeto',
        projectId,
        existingProject ? 'update' : 'create',
        existingProject ? `/api/projetos/${projectId}` : '/api/projetos',
        existingProject ? 'PUT' : 'POST',
        projData
      );

      if (isOnline) {
        triggerSync();
      }

      Alert.alert(
        'Sucesso', 
        `Obra ${existingProject ? 'atualizada' : 'cadastrada'} com sucesso no aplicativo!`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      Alert.alert('Erro ao Salvar', err.message || 'Ocorreu um erro.');
    } finally {
      setLoading(false);
    }
  }

  const selectedUserObj = users.find(u => u.id === responsavelId);

  return (
    <View style={styles.container}>
      <Header 
        title={existingProject ? "Editar Obra" : "Nova Obra"} 
        subtitle="Cadastro Técnico da Edificação"
        showBack 
        onBack={async () => {
          await saveDraftImmediately();
          if (isOnline) triggerSync();
          navigation.goBack();
        }} 
      />
      <OfflineBanner />

      {/* Indicador de AutoSave em Tempo Real no Topo */}
      <View style={styles.autoSaveBar}>
        <Ionicons 
          name={isAutoSaving ? "sync-outline" : "checkmark-circle"} 
          size={14} 
          color={isAutoSaving ? "#0284C7" : "#16A34A"} 
        />
        <Text style={[styles.autoSaveText, isAutoSaving && { color: '#0284C7' }]}>
          {isAutoSaving 
            ? 'Salvando alterações da obra...' 
            : lastSavedTime 
              ? `Todas as alterações salvas às ${lastSavedTime}` 
              : 'Salvamento automático ativo em todos os campos'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Identificação Geral da Obra</Text>

          {/* ================= 1. NOME DA OBRA ================= */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>1. Nome da Obra *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Ex: Residencial Alphaville Horizon" 
              placeholderTextColor="#94A3B8"
              value={nome} 
              onChangeText={setNome} 
            />
            <View style={styles.codeRow}>
              <Text style={styles.codeRowLabel}>Código Identificador:</Text>
              <View style={styles.codeBadge}>
                <Text style={styles.codeBadgeText}>{numero}</Text>
              </View>
            </View>
          </View>

          {/* ================= 2. CONSTRUTORA ================= */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>2. Construtora *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Ex: Construtora Silva & Costa S/A" 
              placeholderTextColor="#94A3B8"
              value={construtora} 
              onChangeText={setConstrutora} 
            />
          </View>

          {/* ================= 3. ENDEREÇO ================= */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>3. Endereço</Text>

            {/* Busca por CEP */}
            <Text style={[styles.label, { fontSize: 12, color: '#64748B', marginTop: 4 }]}>
              Preenchimento Automático por CEP:
            </Text>
            <View style={styles.cepRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Digite o CEP (Ex: 01001-000)"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                maxLength={9}
                value={cep}
                onChangeText={handleCepChange}
              />
              <TouchableOpacity
                style={styles.cepBtn}
                onPress={() => handleBuscarCep()}
                disabled={loadingCep}
              >
                {loadingCep ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="search" size={16} color="#FFFFFF" />
                    <Text style={styles.cepBtnText}>Buscar CEP</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Logradouro com Autocomplete ou GPS */}
            <Text style={[styles.label, { fontSize: 12, color: '#64748B', marginTop: 6 }]}>
              Logradouro Completo / Captura GPS:
            </Text>
            <View style={styles.addressRow}>
              <TextInput 
                style={[styles.input, { flex: 1 }]} 
                placeholder="Digite a rua ou capture pelo GPS" 
                placeholderTextColor="#94A3B8"
                value={endereco} 
                onChangeText={handleSearchStreet} 
              />
              <TouchableOpacity 
                style={styles.gpsBtn} 
                onPress={handleCapturarGps}
                disabled={loadingGps}
              >
                {loadingGps ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="location" size={16} color="#FFFFFF" />
                    <Text style={styles.gpsBtnText}>GPS Físico</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Sugestões de Rua */}
            {loadingSuggestions && (
              <View style={styles.suggestionLoading}>
                <ActivityIndicator size="small" color="#0284C7" />
              </View>
            )}
            {streetSuggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {streetSuggestions.map((item, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.suggestionItem}
                      onPress={() => handleSelectSuggestion(item)}
                    >
                      <Ionicons name="location-outline" size={16} color="#0284C7" />
                      <Text style={styles.suggestionText} numberOfLines={2}>
                        {item.display_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {latitude && longitude ? (
              <View style={styles.coordinatesTag}>
                <Ionicons name="shield-checkmark" size={14} color="#0369A1" />
                <Text style={styles.coordinatesText}>
                  GPS • Lat: {latitude.toFixed(6)} | Lon: {longitude.toFixed(6)}
                </Text>
              </View>
            ) : null}
          </View>

          {/* ================= 4. RESPONSÁVEL (AUTO LINKADO AO EMAIL) ================= */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>4. Responsável *</Text>
            <TouchableOpacity 
              style={styles.responsavelPickerBtn}
              onPress={() => setShowResponsavelModal(true)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.responsavelNameText}>
                  {selectedUserObj ? (selectedUserObj.nome_completo || selectedUserObj.username) : funcionario}
                </Text>
                <Text style={styles.responsavelRoleText}>
                  {selectedUserObj?.cargo || 'Responsável Técnico'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748B" />
            </TouchableOpacity>

            {/* Email linkado automaticamente (não precisa campo separado) */}
            <View style={styles.linkedEmailBox}>
              <Ionicons name="mail" size={14} color="#2563EB" />
              <Text style={styles.linkedEmailText}>
                E-mail vinculado automaticamente: <Text style={{ fontWeight: 'bold' }}>{emailPrincipal || 'Não configurado'}</Text>
              </Text>
            </View>
          </View>

          {/* ================= 5. CONTATOS DA OBRA ================= */}
          <View style={styles.inputGroup}>
            <View style={styles.contatosHeaderRow}>
              <Text style={styles.label}>5. Contatos da Obra</Text>
              <TouchableOpacity 
                style={styles.addContatoBtn}
                onPress={handleOpenAddContato}
                activeOpacity={0.7}
              >
                <Ionicons name="person-add-outline" size={14} color="#FFFFFF" />
                <Text style={styles.addContatoBtnText}>Adicionar Contato</Text>
              </TouchableOpacity>
            </View>

            {contatos.length === 0 ? (
              <View style={styles.contatosEmptyBox}>
                <Ionicons name="people-outline" size={24} color="#94A3B8" />
                <Text style={styles.contatosEmptyText}>
                  Nenhum contato específico cadastrado para esta obra.
                </Text>
              </View>
            ) : (
              contatos.map((cont, idx) => (
                <View key={idx} style={styles.contatoCard}>
                  <View style={styles.contatoCardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.contatoName}>{cont.nome}</Text>
                      <View style={styles.contatoCargoBadge}>
                        <Text style={styles.contatoCargoText}>{cont.cargo}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity 
                        onPress={() => handleEditContato(idx)} 
                        style={styles.contatoIconBtn}
                      >
                        <Ionicons name="create-outline" size={16} color="#2563EB" />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={() => handleRemoveContato(idx)} 
                        style={[styles.contatoIconBtn, { backgroundColor: '#FEE2E2' }]}
                      >
                        <Ionicons name="trash-outline" size={16} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {cont.empresa ? (
                    <Text style={styles.contatoDetail}>🏢 Empresa: {cont.empresa}</Text>
                  ) : null}
                  {cont.email ? (
                    <Text style={styles.contatoDetail}>✉️ E-mail: {cont.email}</Text>
                  ) : null}
                  {cont.telefone ? (
                    <Text style={styles.contatoDetail}>📞 Tel: {cont.telefone}</Text>
                  ) : null}
                </View>
              ))
            )}
          </View>

          {/* ================= 6. TIPO DA OBRA ================= */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>6. Tipo da Obra</Text>
            <TouchableOpacity 
              style={styles.dropdownBtn}
              onPress={() => setShowTipoObraPicker(!showTipoObraPicker)}
            >
              <Text style={styles.dropdownBtnText}>{tipoObra}</Text>
              <Ionicons name={showTipoObraPicker ? "chevron-up" : "chevron-down"} size={18} color="#64748B" />
            </TouchableOpacity>

            {showTipoObraPicker && (
              <View style={styles.dropdownList}>
                {TIPOS_OBRA_OPCOES.map((op) => (
                  <TouchableOpacity
                    key={op}
                    style={[styles.dropdownItem, tipoObra === op && styles.dropdownItemActive]}
                    onPress={() => {
                      setTipoObra(op);
                      setShowTipoObraPicker(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, tipoObra === op && styles.dropdownItemTextActive]}>
                      {op}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* ================= 7. NUMERAÇÃO INICIAL DOS RELATÓRIOS ================= */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>7. Numeração Inicial dos Relatórios</Text>
            <TextInput 
              style={styles.input} 
              keyboardType="numeric"
              placeholder="1"
              value={numeracaoInicial} 
              onChangeText={setNumeracaoInicial} 
            />
            <Text style={styles.hintText}>
              Primeiro número sequencial dos relatórios técnicos desta obra.
            </Text>
          </View>

          {/* Status da Obra */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Status Atual da Obra</Text>
            <View style={styles.statusChipsRow}>
              {(['Ativo', 'Não Iniciado', 'Pausado', 'Concluído'] as const).map(st => (
                <TouchableOpacity
                  key={st}
                  style={[styles.statusChip, status === st && styles.statusChipActive]}
                  onPress={() => setStatus(st)}
                >
                  <Text style={[styles.statusChipText, status === st && styles.statusChipTextActive]}>
                    {st}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* ================= 8. INFORMAÇÕES TÉCNICAS ================= */}
        <View style={styles.purpleAccordionSection}>
          <TouchableOpacity 
            style={styles.purpleAccordionHeader}
            onPress={() => setAccordionOpen(!accordionOpen)}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="layers" size={20} color="#FFFFFF" />
              <Text style={styles.purpleAccordionTitle}>
                8. Informações Técnicas (Fachada & Alvenaria)
              </Text>
            </View>
            <Ionicons 
              name={accordionOpen ? "chevron-up" : "chevron-down"} 
              size={20} 
              color="#FFFFFF" 
            />
          </TouchableOpacity>

          {accordionOpen && (
            <View style={styles.purpleAccordionBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Elementos Construtivos Base</Text>
                <TextInput 
                  style={[styles.input, styles.textArea]} 
                  multiline 
                  placeholder="Ex: Concreto armado, alvenaria de blocos cerâmicos..." 
                  value={elementosBase} 
                  onChangeText={setElementosBase} 
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Especificação de Chapisco Colante</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Ex: Chapisco rolado com aditivo de alto desempenho" 
                  value={chapiscoColante} 
                  onChangeText={setChapiscoColante} 
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Especificação de Chapisco de Alvenaria</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Ex: Chapisco tradicional 1:3 manual" 
                  value={chapiscoAlvenaria} 
                  onChangeText={setChapiscoAlvenaria} 
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Argamassa de Emboço</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Ex: Argamassa usinada estabilizada traço 1:1:6" 
                  value={argamassaEmboco} 
                  onChangeText={setArgamassaEmboco} 
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Forma de Aplicação da Argamassa</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Ex: Manual / Projetada mecânica" 
                  value={formaAplicacao} 
                  onChangeText={setFormaAplicacao} 
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Acabamentos de Revestimento</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Ex: Pastilhas cerâmicas 5x5cm e pintura acrílica fosca" 
                  value={acabamentosRevestimento} 
                  onChangeText={setAcabamentosRevestimento} 
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Acabamento de Peitoris</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Ex: Granito Cinza Andorinha com pingadeira dupla" 
                  value={peitoris} 
                  onChangeText={setPeitoris} 
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Acabamento de Muretas</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Ex: Chapim metálico ou pedra polida" 
                  value={muretas} 
                  onChangeText={setMuretas} 
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Definição de Frisos, Juntas e Cores</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Ex: Frisos horizontais 2x2cm, juntas a cada 3 pavimentos" 
                  value={frisosCor} 
                  onChangeText={setFrisosCor} 
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Caimento e Face Inferior de Abas</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Ex: Caimento de 2% para dentro e pingadeira em corte" 
                  value={faceInferiorAbas} 
                  onChangeText={setFaceInferiorAbas} 
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Observações Gerais da Consultoria de Fachada</Text>
                <TextInput 
                  style={[styles.input, styles.textArea]} 
                  multiline 
                  placeholder="Diretrizes do laudo preliminar e normas aplicáveis" 
                  value={observacoesFachada} 
                  onChangeText={setObservacoesFachada} 
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Outras Observações</Text>
                <TextInput 
                  style={[styles.input, styles.textArea]} 
                  multiline 
                  placeholder="Apontamentos contratuais extras" 
                  value={outrasObs} 
                  onChangeText={setOutrasObs} 
                />
              </View>
            </View>
          )}
        </View>

        {/* ================= 9. CHECKLIST ================= */}
        <View style={styles.checklistSection}>
          <View style={styles.checklistHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Ionicons name="checkbox-outline" size={20} color="#2563EB" />
              <Text style={styles.checklistTitle}>9. Checklist da Obra</Text>
            </View>
            <TouchableOpacity 
              style={styles.customChecklistBtn}
              onPress={() => setShowChecklistModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="options" size={14} color="#FFFFFF" />
              <Text style={styles.customChecklistBtnText}>Checklist Personalizado</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.checklistSubtitle}>
            Itens padrão configurados aplicáveis a esta obra ({checklistItems.length} etapas):
          </Text>

          <View style={styles.checklistCardList}>
            {checklistItems.map((item, index) => (
              <View key={item.id || index} style={styles.checklistItemRow}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={styles.checklistItemText}>
                  {index + 1}. {item.item || item.texto}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Botões Rodapé: Cancelar | Salvar Obra */}
        <View style={styles.footerButtonsRow}>
          <TouchableOpacity 
            style={styles.btnCancel}
            onPress={() => navigation.goBack()}
            disabled={loading}
          >
            <Text style={styles.btnCancelText}>Cancelar</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.btnSave, loading && styles.btnSaveDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="save" size={18} color="#FFFFFF" />
                <Text style={styles.btnSaveText}>Salvar Obra</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ================= MODAL DE SELEÇÃO DE RESPONSÁVEL ================= */}
      <Modal visible={showResponsavelModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecionar Responsável Técnico</Text>
              <TouchableOpacity onPress={() => setShowResponsavelModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 350 }}>
              {users.map(u => (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.userOptionCard, responsavelId === u.id && styles.userOptionCardActive]}
                  onPress={() => handleSelectResponsavel(u)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.userNameOption, responsavelId === u.id && styles.userOptionTextActive]}>
                      {u.nome_completo || u.username}
                    </Text>
                    <Text style={styles.userRoleOption}>
                      {u.cargo || 'Equipe Técnica'} • {u.email}
                    </Text>
                  </View>
                  {responsavelId === u.id && (
                    <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL ADICIONAR / EDITAR CONTATO DA OBRA ================= */}
      <Modal visible={showContatoModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingContatoIndex !== null ? 'Editar Contato da Obra' : 'Adicionar Contato da Obra'}
              </Text>
              <TouchableOpacity onPress={() => setShowContatoModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              {/* Nome */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Nome do Contato *</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Ex: Carlos Eduardo" 
                  value={contatoNome} 
                  onChangeText={setContatoNome} 
                />
              </View>

              {/* Cargo Dropdown */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Cargo *</Text>
                <TouchableOpacity 
                  style={styles.dropdownBtn}
                  onPress={() => setShowCargoPicker(!showCargoPicker)}
                >
                  <Text style={styles.dropdownBtnText}>{contatoCargo}</Text>
                  <Ionicons name={showCargoPicker ? "chevron-up" : "chevron-down"} size={16} color="#64748B" />
                </TouchableOpacity>

                {showCargoPicker && (
                  <View style={styles.dropdownList}>
                    {CARGO_OPCOES.map(c => (
                      <TouchableOpacity
                        key={c}
                        style={[styles.dropdownItem, contatoCargo === c && styles.dropdownItemActive]}
                        onPress={() => {
                          setContatoCargo(c);
                          setShowCargoPicker(false);
                        }}
                      >
                        <Text style={[styles.dropdownItemText, contatoCargo === c && styles.dropdownItemTextActive]}>
                          {c}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {contatoCargo === 'Outro' && (
                  <TextInput 
                    style={[styles.input, { marginTop: 8 }]} 
                    placeholder="Digite o cargo específico" 
                    value={contatoCargoCustom} 
                    onChangeText={setContatoCargoCustom} 
                  />
                )}
              </View>

              {/* Empresa */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Empresa</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Ex: Construtora ou Subempreiteira" 
                  value={contatoEmpresa} 
                  onChangeText={setContatoEmpresa} 
                />
              </View>

              {/* Email (opcional) */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>E-mail (opcional)</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="contato@empresa.com.br" 
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={contatoEmail} 
                  onChangeText={setContatoEmail} 
                />
              </View>

              {/* Telefone (opcional) */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Telefone (opcional)</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="(11) 99999-9999" 
                  keyboardType="phone-pad"
                  value={contatoTelefone} 
                  onChangeText={setContatoTelefone} 
                />
              </View>
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity 
                style={styles.btnModalCancel}
                onPress={() => setShowContatoModal(false)}
              >
                <Text style={styles.btnModalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.btnModalSave}
                onPress={handleSaveContato}
              >
                <Text style={styles.btnModalSaveText}>Salvar Contato</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL CHECKLIST PERSONALIZADO ================= */}
      <Modal visible={showChecklistModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Personalizar Checklist da Obra</Text>
              <TouchableOpacity onPress={() => setShowChecklistModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Adicione etapas específicas ou remova itens que não se aplicam a esta obra:
            </Text>

            {/* Adicionar Novo Item */}
            <View style={styles.addChecklistRow}>
              <TextInput 
                style={[styles.input, { flex: 1 }]} 
                placeholder="Nova etapa do checklist..." 
                value={newChecklistText} 
                onChangeText={setNewChecklistText} 
              />
              <TouchableOpacity 
                style={styles.addChecklistActionBtn}
                onPress={handleAddCustomChecklistItem}
              >
                <Ionicons name="add" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Lista com Opção de Remover */}
            <ScrollView style={{ maxHeight: 280 }}>
              {checklistItems.map((item, idx) => (
                <View key={item.id || idx} style={styles.customChecklistItemRow}>
                  <Text style={styles.customChecklistIndex}>{idx + 1}.</Text>
                  <Text style={styles.customChecklistText}>{item.item || item.texto}</Text>
                  <TouchableOpacity 
                    onPress={() => handleRemoveChecklistItem(item.id)}
                    style={styles.deleteChecklistBtn}
                  >
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity 
              style={[styles.btnModalSave, { marginTop: 14 }]}
              onPress={() => setShowChecklistModal(false)}
            >
              <Text style={styles.btnModalSaveText}>Concluir Personalização</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    padding: 16,
  },
  autoSaveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#DCFCE7',
    gap: 8,
  },
  autoSaveText: {
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '500',
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 5,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: '#0F172A',
  },
  textArea: {
    height: 64,
    textAlignVertical: 'top',
    paddingVertical: 8,
  },
  hintText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  codeRowLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  codeBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  codeBadgeText: {
    color: '#2563EB',
    fontWeight: 'bold',
    fontSize: 11,
  },
  cepRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  cepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 8,
    gap: 6,
  },
  cepBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  addressRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 8,
    gap: 6,
  },
  gpsBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  suggestionLoading: {
    paddingVertical: 6,
  },
  suggestionsContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 8,
    maxHeight: 140,
    marginTop: 6,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  suggestionText: {
    fontSize: 12,
    color: '#1E293B',
    flex: 1,
  },
  coordinatesTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 8,
    gap: 6,
  },
  coordinatesText: {
    fontSize: 11,
    color: '#0369A1',
    fontWeight: '600',
  },
  responsavelPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  responsavelNameText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  responsavelRoleText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  linkedEmailBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 6,
    gap: 6,
  },
  linkedEmailText: {
    fontSize: 12,
    color: '#1D4ED8',
  },
  contatosHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  addContatoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  addContatoBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  contatosEmptyBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    gap: 6,
  },
  contatosEmptyText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
  contatoCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    gap: 3,
  },
  contatoCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  contatoName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  contatoCargoBadge: {
    backgroundColor: '#E0E7FF',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  contatoCargoText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4338CA',
  },
  contatoDetail: {
    fontSize: 12,
    color: '#475569',
  },
  contatoIconBtn: {
    backgroundColor: '#EFF6FF',
    width: 30,
    height: 30,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
  },
  dropdownBtnText: {
    fontSize: 14,
    color: '#0F172A',
  },
  dropdownList: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    marginTop: 4,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownItemActive: {
    backgroundColor: '#EFF6FF',
  },
  dropdownItemText: {
    fontSize: 13,
    color: '#334155',
  },
  dropdownItemTextActive: {
    color: '#2563EB',
    fontWeight: 'bold',
  },
  statusChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  statusChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  statusChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  statusChipTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  purpleAccordionSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#6f42c1',
    overflow: 'hidden',
    ...Shadows.sm,
  },
  purpleAccordionHeader: {
    backgroundColor: '#6f42c1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  purpleAccordionTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  purpleAccordionBody: {
    padding: 16,
    backgroundColor: '#FAF5FF',
  },
  checklistSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#93C5FD',
    ...Shadows.sm,
  },
  checklistHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#EFF6FF',
    paddingBottom: 8,
    marginBottom: 6,
  },
  checklistTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1E40AF',
  },
  customChecklistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  customChecklistBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  checklistSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 10,
  },
  checklistCardList: {
    gap: 6,
  },
  checklistItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 8,
    gap: 8,
  },
  checklistItemText: {
    fontSize: 13,
    color: '#1E293B',
    flex: 1,
  },
  footerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  btnCancel: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  btnSave: {
    flex: 2,
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Shadows.md,
  },
  btnSaveDisabled: {
    opacity: 0.6,
  },
  btnSaveText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    ...Shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 12,
  },
  userOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    borderRadius: 8,
  },
  userOptionCardActive: {
    backgroundColor: '#EFF6FF',
  },
  userNameOption: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  userRoleOption: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  userOptionTextActive: {
    color: '#2563EB',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  btnModalCancel: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnModalCancelText: {
    color: '#64748B',
    fontWeight: '600',
  },
  btnModalSave: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnModalSaveText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  addChecklistRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  addChecklistActionBtn: {
    backgroundColor: '#10B981',
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customChecklistItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  customChecklistIndex: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748B',
    width: 22,
  },
  customChecklistText: {
    fontSize: 13,
    color: '#1E293B',
    flex: 1,
  },
  deleteChecklistBtn: {
    padding: 6,
  },
});
