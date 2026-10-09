import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { saveLocalProjeto, addToSyncQueue, getNextProjectNumber } from '../../database/db';
import { ensureProjectFolders } from '../../services/appFilesService';
import { apiClient } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { Projeto } from '../../types';
import { Colors } from '../../theme/colors';
import * as Location from 'expo-location';

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

  // 1º Campo: Construtora (em estrito atendimento à regra do manual)
  const [construtora, setConstrutora] = useState(existingProject?.construtora || '');

  // 2º Campo: Nome da Obra e Número de Identificação (Regra OBRA-0001 em diante)
  const [nome, setNome] = useState(existingProject?.nome || '');
  const [numero, setNumero] = useState(existingProject?.numero || 'OBRA-0001');

  // CEP e Autocomplete de Endereço
  const [cep, setCep] = useState('');
  const [loadingCep, setLoadingCep] = useState(false);
  const [streetSuggestions, setStreetSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const streetSearchTimeout = useRef<any>(null);

  useEffect(() => {
    if (!existingProject) {
      getNextProjectNumber().then(nextNum => {
        setNumero(nextNum);
      }).catch(err => {
        console.warn('Erro ao obter próximo código OBRA-0001:', err);
      });
    }
  }, [existingProject]);

  // 3º Campo: Tipo de Obra
  const [tipoObra, setTipoObra] = useState(existingProject?.tipo_obra || 'Edifício Residencial Multifamiliar');
  const [showTipoObraPicker, setShowTipoObraPicker] = useState(false);

  // 4º Campo: Funcionário Responsável
  const [funcionario, setFuncionario] = useState(
    existingProject?.nome_funcionario || (user as any)?.nome_completo || user?.username || 'Gabriel Eduardo'
  );

  // 5º Campo: E-mail Principal da Obra
  const [emailPrincipal, setEmailPrincipal] = useState(existingProject?.email_principal || user?.email || '');

  // 6º Campo: Numeração Inicial de Relatórios
  const [numeracaoInicial, setNumeracaoInicial] = useState<string>(
    existingProject?.numeracao_inicial ? existingProject.numeracao_inicial.toString() : '1'
  );

  // 7º Campo: Endereço e Geolocalização GPS
  const [endereco, setEndereco] = useState(existingProject?.endereco || '');
  const [latitude, setLatitude] = useState<number | undefined>(existingProject?.latitude);
  const [longitude, setLongitude] = useState<number | undefined>(existingProject?.longitude);
  const [loadingGps, setLoadingGps] = useState(false);

  // Status da Obra
  const [status, setStatus] = useState(existingProject?.status || 'Ativo');

  // 8º Campo: Especificações Técnicas de Fachada (Sanfona Colapsável Roxa #6f42c1)
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

  const [loading, setLoading] = useState(false);

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
        responsavel_id: existingProject?.responsavel_id || user?.id || 1,
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
    funcionario, emailPrincipal, numeracaoInicial, status, elementosBase,
    chapiscoColante, chapiscoAlvenaria, argamassaEmboco, formaAplicacao,
    acabamentosRevestimento, peitoris, muretas, frisosCor, faceInferiorAbas,
    observacoesFachada, outrasObs, existingProject, user, isOnline
  ]);

  // Debounced AutoSave a cada alteração em qualquer campo da obra (1500ms)
  useEffect(() => {
    if (!nome.trim() && !construtora.trim()) return;
    const timer = setTimeout(() => {
      saveDraftImmediately();
    }, 1500);
    return () => clearTimeout(timer);
  }, [
    nome, construtora, tipoObra, funcionario, emailPrincipal, numeracaoInicial,
    endereco, latitude, longitude, status, elementosBase, chapiscoColante,
    chapiscoAlvenaria, argamassaEmboco, formaAplicacao, acabamentosRevestimento,
    peitoris, muretas, frisosCor, faceInferiorAbas, observacoesFachada, outrasObs,
    saveDraftImmediately
  ]);

  // Forçar salvamento e atualização sempre que voltar de janela (seja deslizando o dedo ou botão voltar)
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

      // Tenta geocodificar coordenadas
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
    } catch (err: any) {
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
    setStreetSuggestions([]);
  }

  // Captura de GPS de hardware de alta precisão do dispositivo móvel + Geocodificação Reversa para endereço
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
          if (logradouro) {
            parts.push(num ? `${logradouro}, ${num}` : logradouro);
          }

          if (item.district || item.subregion) {
            parts.push(item.district || item.subregion || '');
          }

          const cidade = item.city || item.subregion || '';
          const uf = item.region || '';
          if (cidade && uf) {
            parts.push(`${cidade} - ${uf}`);
          } else if (cidade || uf) {
            parts.push(cidade || uf);
          }

          if (item.postalCode) {
            parts.push(`CEP ${item.postalCode}`);
          }

          resolvedAddress = parts.filter(Boolean).join(', ');
        }
      } catch (revErr) {
        console.warn('[GPS] Erro no geocoding reverso:', revErr);
      }

      if (resolvedAddress) {
        setEndereco(resolvedAddress);
        Alert.alert(
          'Localização do Dispositivo Obtida',
          `Endereço identificado com sucesso pelo GPS do dispositivo:\n\n${resolvedAddress}\n\nCoordenadas do Dispositivo:\nLat: ${newLat.toFixed(6)}, Lon: ${newLon.toFixed(6)}`
        );
      } else {
        const fallbackCoord = `Lat: ${newLat.toFixed(6)}, Lon: ${newLon.toFixed(6)}`;
        if (!endereco.trim()) {
          setEndereco(fallbackCoord);
        }
        Alert.alert(
          'GPS do Dispositivo Capturado',
          `Coordenadas de alta precisão do hardware obtidas:\n${fallbackCoord}\n(Você pode complementar o nome da rua manualmente).`
        );
      }
    } catch (err: any) {
      console.warn('[GPS] Falha ao capturar localização:', err);
      Alert.alert(
        'Falha no GPS',
        'Não foi possível obter a localização do dispositivo no momento. Verifique se o GPS (Localização) do aparelho está ativado.'
      );
    } finally {
      setLoadingGps(false);
    }
  }

  async function handleSave() {
    if (!construtora.trim()) {
      Alert.alert('Campo Obrigatório', 'Por favor, informe o Nome da Construtora (1º campo da tela).');
      return;
    }
    if (!nome.trim()) {
      Alert.alert('Campo Obrigatório', 'Por favor, informe o Nome da Obra.');
      return;
    }
    if (!emailPrincipal.trim()) {
      Alert.alert('Campo Obrigatório', 'Por favor, informe o E-mail Principal para Envio de Relatórios.');
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
        responsavel_id: existingProject?.responsavel_id || user?.id || 1,
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

          {/* 1. Nome da Construtora (1º Campo Oficial) */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>1. Nome da Construtora *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Ex: Construtora Silva & Costa S/A" 
              placeholderTextColor="#94A3B8"
              value={construtora} 
              onChangeText={setConstrutora} 
            />
          </View>

          {/* 2. Nome da Obra e Código de Identificação */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>2. Nome da Obra *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Ex: Residencial Alphaville Horizon" 
              placeholderTextColor="#94A3B8"
              value={nome} 
              onChangeText={setNome} 
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Código / Número de Identificação *</Text>
            <TextInput 
              style={[styles.input, styles.readOnlyInput]} 
              value={numero} 
              placeholder="OBRA-0001"
              placeholderTextColor="#94A3B8"
              onChangeText={setNumero} 
            />
            <Text style={styles.hintText}>
              Regra de indexação: Sequencial automático OBRA-0001 em diante.
            </Text>
          </View>

          {/* 3. Tipo de Obra */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>3. Tipo de Obra</Text>
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

          {/* 4. Funcionário Responsável */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>4. Engenheiro / Coordenador Responsável</Text>
            <TextInput 
              style={styles.input} 
              value={funcionario} 
              onChangeText={setFuncionario} 
            />
          </View>

          {/* 5. E-mail Principal da Obra */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>5. E-mail Principal da Obra *</Text>
            <TextInput 
              style={styles.input} 
              keyboardType="email-address" 
              autoCapitalize="none"
              placeholder="engenharia@obra.com.br"
              placeholderTextColor="#94A3B8"
              value={emailPrincipal} 
              onChangeText={setEmailPrincipal} 
            />
          </View>

          {/* 6. Numeração Inicial de Relatórios */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>6. Numeração Inicial de Relatórios</Text>
            <TextInput 
              style={styles.input} 
              keyboardType="numeric"
              placeholder="1"
              value={numeracaoInicial} 
              onChangeText={setNumeracaoInicial} 
            />
            <Text style={styles.hintText}>
              Se a obra já emitia relatórios antes do sistema, defina aqui o número de partida.
            </Text>
          </View>

          {/* 7. Endereço Completo e Geolocalização */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>7. Endereço Completo e Localização</Text>

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

            {/* Nome da Rua / Endereço com Autocomplete */}
            <Text style={[styles.label, { fontSize: 12, color: '#64748B', marginTop: 4 }]}>
              Logradouro / Rua (sugestões em lista ao digitar) ou GPS:
            </Text>
            <View style={styles.addressRow}>
              <TextInput 
                style={[styles.input, { flex: 1 }]} 
                placeholder="Digite a rua (busca automática) ou endereço completo" 
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

            {/* Sugestões do Dropdown da Rua */}
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
                  GPS do Dispositivo (Alta Precisão) • Lat: {latitude.toFixed(6)} | Lon: {longitude.toFixed(6)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* 8. Especificações Técnicas de Fachada (Sanfona Colapsável Roxa #6f42c1 - Seção 15.5) */}
        <View style={styles.purpleAccordionSection}>
          <TouchableOpacity 
            style={styles.purpleAccordionHeader}
            onPress={() => setAccordionOpen(!accordionOpen)}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="layers" size={20} color="#FFFFFF" />
              <Text style={styles.purpleAccordionTitle}>
                8. Especificações Técnicas de Fachada
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

        {/* 9. Disposição Estrita dos Botões no Rodapé: Esquerda: Cancelar | Direita: Salvar Obra (Seção 15.5) */}
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
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
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
  readOnlyInput: {
    backgroundColor: '#F1F5F9',
    color: '#64748B',
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
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
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
    fontWeight: 'bold',
    color: Colors.primary,
  },
  autoSaveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#DCFCE7',
  },
  autoSaveText: {
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '500',
  },
  cepRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  cepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 8,
  },
  cepBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  suggestionsContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 8,
    marginTop: 4,
    maxHeight: 180,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    zIndex: 999,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  suggestionText: {
    fontSize: 12,
    color: '#1E293B',
    flex: 1,
  },
  suggestionLoading: {
    padding: 10,
    alignItems: 'center',
  },
  addressRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0284C7',
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 8,
  },
  gpsBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  coordinatesTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  coordinatesText: {
    fontSize: 11,
    color: '#0369A1',
    fontWeight: '600',
  },

  // Sanfona Colapsável Roxa (#6f42c1)
  purpleAccordionSection: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#6f42c1',
    backgroundColor: '#FFFFFF',
    marginBottom: 20,
    overflow: 'hidden',
  },
  purpleAccordionHeader: {
    backgroundColor: '#6f42c1',
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  purpleAccordionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  purpleAccordionBody: {
    padding: 16,
  },

  // Disposição dos Botões de Ação no Rodapé: Esquerda Cancelar / Direita Salvar Obra
  footerButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  btnCancel: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancelText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#475569',
  },
  btnSave: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnSaveDisabled: {
    opacity: 0.7,
  },
  btnSaveText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
