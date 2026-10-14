import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, 
  Alert, Switch, Modal, FlatList 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { 
  getLocalProjetos, saveLocalVisita, addToSyncQueue, 
  getNextVisitNumber, getLocalUsers, getLocalVisitantes 
} from '../../database/db';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { Projeto, Visita, User, Visitante, VisitaParticipanteItem } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

export const VisitFormScreen: React.FC<{ route?: any; navigation: any }> = ({ route, navigation }) => {
  const { user } = useAuth();
  const { isOnline, triggerSync } = useNetwork();
  const preSelectedProjectId = route?.params?.preSelectedProjectId;

  // Estados dos Campos na Ordem Solicitada
  const [visitNumber, setVisitNumber] = useState<string>('VISIT-0001');
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | 'outros' | null>(preSelectedProjectId || null);
  const [outroNome, setOutroNome] = useState('');

  const initialDate = route?.params?.initialDate;

  // 2. Data e Hora de Início e 3. Data e Hora Fim
  const now = new Date();
  const defaultStart = initialDate 
    ? `${initialDate} 09:00` 
    : now.toISOString().substring(0, 16).replace('T', ' ');
  const defaultEnd = initialDate 
    ? `${initialDate} 11:00` 
    : new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString().substring(0, 16).replace('T', ' ');
  const [dataInicio, setDataInicio] = useState(defaultStart);
  const [dataFim, setDataFim] = useState(defaultEnd);

  // 4. Observações (opcional)
  const [observacoes, setObservacoes] = useState('');

  // 5. Responsável puxado dos usuários cadastrados
  const [usersList, setUsersList] = useState<User[]>([]);
  const [selectedResponsavelId, setSelectedResponsavelId] = useState<number>(user?.id || 1);

  // 6. Participantes (múltiplos, exibidos em cards com Nome e Função)
  const [participantes, setParticipantes] = useState<VisitaParticipanteItem[]>([]);
  const [visitantesCadastrados, setVisitantesCadastrados] = useState<Visitante[]>([]);
  const [modalParticipanteVisible, setModalParticipanteVisible] = useState(false);
  const [novoPartNome, setNovoPartNome] = useState('');
  const [novoPartFuncao, setNovoPartFuncao] = useState('');

  // 7. Por último: Check de Compromisso Pessoal
  const [isPessoal, setIsPessoal] = useState(false);

  // Dropdown de Obra
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');

  const [loading, setLoading] = useState(false);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string | null>(null);

  // Carregar dados iniciais: Próximo código VISIT-XXXX, Projetos, Usuários e Visitantes
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const nextNum = await getNextVisitNumber();
        if (isMounted) setVisitNumber(nextNum);

        const projs = await getLocalProjetos();
        if (isMounted) {
          setProjetos(projs);
          if (!selectedProjectId && projs.length > 0 && !preSelectedProjectId) {
            setSelectedProjectId(projs[0].id);
          }
        }

        const users = await getLocalUsers();
        if (isMounted) {
          setUsersList(users);
          if (user?.id && users.some(u => u.id === user.id)) {
            setSelectedResponsavelId(user.id);
          } else if (users.length > 0) {
            setSelectedResponsavelId(users[0].id);
          }
        }

        const vis = await getLocalVisitantes();
        if (isMounted) setVisitantesCadastrados(vis);
      } catch (err) {
        console.warn('Erro ao carregar dados do formulário de visita:', err);
      }
    })();

    return () => { isMounted = false; };
  }, [preSelectedProjectId]);

  // Restaurar rascunho salvo automaticamente
  useEffect(() => {
    import('@react-native-async-storage/async-storage').then(({ default: AsyncStorage }) => {
      AsyncStorage.getItem('@elp_visit_form_draft_v2').then(draftStr => {
        if (draftStr) {
          try {
            const draft = JSON.parse(draftStr);
            if (draft.observacoes !== undefined) setObservacoes(draft.observacoes);
            if (draft.outroNome !== undefined) setOutroNome(draft.outroNome);
            if (draft.selectedProjectId !== undefined) setSelectedProjectId(draft.selectedProjectId);
            if (draft.dataInicio) setDataInicio(draft.dataInicio);
            if (draft.dataFim) setDataFim(draft.dataFim);
            if (draft.selectedResponsavelId) setSelectedResponsavelId(draft.selectedResponsavelId);
            if (draft.participantes && Array.isArray(draft.participantes)) setParticipantes(draft.participantes);
            if (draft.isPessoal !== undefined) setIsPessoal(draft.isPessoal);
            setLastAutoSaveTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
          } catch (e) {}
        }
      });
    });
  }, []);

  // Autosave contínuo a cada alteração
  useEffect(() => {
    const timer = setTimeout(() => {
      if (observacoes || outroNome || selectedProjectId || participantes.length > 0) {
        import('@react-native-async-storage/async-storage').then(({ default: AsyncStorage }) => {
          AsyncStorage.setItem('@elp_visit_form_draft_v2', JSON.stringify({
            observacoes,
            outroNome,
            selectedProjectId,
            dataInicio,
            dataFim,
            selectedResponsavelId,
            participantes,
            isPessoal
          })).then(() => {
            setLastAutoSaveTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
          }).catch(() => null);
        });
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [observacoes, outroNome, selectedProjectId, dataInicio, dataFim, selectedResponsavelId, participantes, isPessoal]);

  function handleAddParticipantFromUser(u: User) {
    const name = u.nome_completo || u.username;
    if (participantes.some(p => p.user_id === u.id || p.nome.toLowerCase() === name.toLowerCase())) {
      Alert.alert('Aviso', 'Este participante já foi adicionado.');
      return;
    }
    setParticipantes(prev => [
      ...prev,
      {
        user_id: u.id,
        nome: name,
        funcao: u.cargo || 'Equipe Técnica',
        tipo: 'usuario'
      }
    ]);
    setModalParticipanteVisible(false);
  }

  function handleAddParticipantFromVisitor(v: Visitante) {
    if (participantes.some(p => p.nome.toLowerCase() === v.nome.toLowerCase())) {
      Alert.alert('Aviso', 'Este visitante já foi adicionado.');
      return;
    }
    setParticipantes(prev => [
      ...prev,
      {
        nome: v.nome,
        funcao: v.cargo || v.empresa || 'Visitante',
        tipo: 'visitante'
      }
    ]);
    setModalParticipanteVisible(false);
  }

  function handleAddCustomParticipant() {
    if (!novoPartNome.trim()) {
      Alert.alert('Atenção', 'Informe o nome do participante.');
      return;
    }
    setParticipantes(prev => [
      ...prev,
      {
        nome: novoPartNome.trim(),
        funcao: novoPartFuncao.trim() || 'Acompanhante',
        tipo: 'outro'
      }
    ]);
    setNovoPartNome('');
    setNovoPartFuncao('');
    setModalParticipanteVisible(false);
  }

  function handleRemoveParticipant(index: number) {
    setParticipantes(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setLoading(true);
    try {
      // Validação de Obra
      let projId: number | null = null;
      let projNome = '';
      let projOutros: string | undefined = undefined;

      if (isPessoal) {
        projNome = outroNome.trim() || 'Compromisso Pessoal';
        projOutros = projNome;
      } else if (selectedProjectId === 'outros') {
        if (!outroNome.trim()) {
          Alert.alert('Campo Obrigatório', 'Por favor, informe o nome ou descrição do local para a opção "Outros".');
          setLoading(false);
          return;
        }
        projNome = outroNome.trim();
        projOutros = outroNome.trim();
      } else if (typeof selectedProjectId === 'number') {
        const found = projetos.find(p => p.id === selectedProjectId);
        projId = selectedProjectId;
        projNome = found ? `${found.numero} - ${found.nome}` : 'Obra';
      } else {
        Alert.alert('Atenção', 'Por favor, selecione uma Obra ou a opção "Outros".');
        setLoading(false);
        return;
      }

      // Responsável
      const respUser = usersList.find(u => u.id === selectedResponsavelId);
      const responsavelNome = respUser ? (respUser.nome_completo || respUser.username) : (user?.username || 'Responsável');

      // Datas
      const isoInicio = new Date(dataInicio.replace(' ', 'T')).toISOString();
      const isoFim = new Date(dataFim.replace(' ', 'T')).toISOString();

      const visitId = Date.now();
      const currentNumber = visitNumber.startsWith('VISIT-') ? visitNumber : await getNextVisitNumber();

      const visitaData: Visita = {
        id: visitId,
        numero: currentNumber,
        projeto_id: projId,
        projeto_nome: projNome,
        projeto_outros: projOutros,
        responsavel_id: selectedResponsavelId,
        responsavel_nome: responsavelNome,
        data_inicio: isoInicio,
        data_fim: isoFim,
        observacoes: observacoes.trim(),
        status: 'Agendada',
        is_pessoal: isPessoal,
        sync_status: 'pending',
        participantes: participantes.map(p => p.user_id).filter(Boolean) as number[],
        participantes_detalhes: participantes
      };

      await saveLocalVisita(visitaData, 'pending');

      await addToSyncQueue(
        'visita',
        visitId,
        'create',
        '/api/visits',
        'POST',
        visitaData
      );

      // Limpar rascunho de autosave
      import('@react-native-async-storage/async-storage').then(({ default: AsyncStorage }) => {
        AsyncStorage.removeItem('@elp_visit_form_draft_v2').catch(() => null);
      });

      if (isOnline) triggerSync();

      Alert.alert(
        'Visita Agendada com Sucesso!', 
        `Visita ${visitaData.numero} registrada na agenda.\nLocal: ${projNome}\nResponsável: ${responsavelNome}`, 
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      Alert.alert('Erro ao Salvar', err.message || 'Ocorreu um erro ao salvar a visita.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Header 
        title="Agendar Visita" 
        subtitle={visitNumber}
        showBack 
        onBack={() => navigation.goBack()} 
      />
      <OfflineBanner />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Card do Cabeçalho com Código Sequencial */}
        <View style={styles.headerIndexCard}>
          <View style={styles.headerIndexLeft}>
            <View style={styles.indexIconWrap}>
              <Ionicons name="calendar" size={20} color="#2563EB" />
            </View>
            <View>
              <Text style={styles.indexCodeText}>{visitNumber}</Text>
              <Text style={styles.indexSubText}>Visita Técnica & Acompanhamento</Text>
            </View>
          </View>
          {lastAutoSaveTime ? (
            <View style={styles.autoSavePill}>
              <Ionicons name="cloud-done" size={12} color="#16A34A" />
              <Text style={styles.autoSaveText}>{lastAutoSaveTime}</Text>
            </View>
          ) : null}
        </View>

        {/* 1º CAMPO: OBRA EM MENU DROPDOWN (E CAMPO OUTROS ABAIXO QUANDO SELECIONADO) */}
        <View style={styles.formCard}>
          <View style={styles.fieldHeader}>
            <Ionicons name="business" size={16} color="#2563EB" />
            <Text style={styles.fieldTitle}>1. Obra / Projeto</Text>
          </View>
          <Text style={styles.fieldDesc}>Selecione o local da visita no menu dropdown:</Text>

          {/* Botão Trigger do Dropdown */}
          <TouchableOpacity
            style={styles.dropdownTrigger}
            onPress={() => setShowProjectDropdown(true)}
            activeOpacity={0.7}
          >
            <View style={styles.dropdownIconWrap}>
              <Ionicons 
                name={selectedProjectId === 'outros' ? "ellipsis-horizontal-circle" : "business"} 
                size={20} 
                color="#2563EB" 
              />
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.dropdownTriggerTitle} numberOfLines={1}>
                {selectedProjectId === 'outros'
                  ? 'Outros (Outro Local / Destino Especial)'
                  : (typeof selectedProjectId === 'number' && projetos.find(p => p.id === selectedProjectId))
                    ? `${projetos.find(p => p.id === selectedProjectId)?.numero ? `[${projetos.find(p => p.id === selectedProjectId)?.numero}] ` : ''}${projetos.find(p => p.id === selectedProjectId)?.nome}`
                    : 'Toque para selecionar a obra...'}
              </Text>
              {typeof selectedProjectId === 'number' && projetos.find(p => p.id === selectedProjectId) && (
                <Text style={styles.dropdownTriggerSub} numberOfLines={1}>
                  {projetos.find(p => p.id === selectedProjectId)?.construtora || 'ObraFlow'} • {projetos.find(p => p.id === selectedProjectId)?.tipo_obra || 'Edificação'}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-down" size={20} color="#64748B" />
          </TouchableOpacity>

          {/* Campo que aparece logo abaixo quando 'Outros' está selecionado */}
          {selectedProjectId === 'outros' && (
            <View style={styles.otherInputWrapper}>
              <Text style={styles.otherInputLabel}>Nome do Local / Projeto (Outros) *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ex: Escritório Central, Vistoria Externa, Reunião Técnica..."
                placeholderTextColor="#94A3B8"
                value={outroNome}
                onChangeText={setOutroNome}
                autoFocus
              />
            </View>
          )}
        </View>

        {/* 2º CAMPO: DATA E HORA DE INÍCIO & 3º CAMPO: DATA E HORA FIM */}
        <View style={styles.formCard}>
          <View style={styles.fieldHeader}>
            <Ionicons name="time" size={16} color="#2563EB" />
            <Text style={styles.fieldTitle}>2. Início & 3. Fim da Visita</Text>
          </View>

          <View style={styles.datesRow}>
            {/* Início */}
            <View style={styles.dateCol}>
              <Text style={styles.inputLabel}>Data e Hora de Início *</Text>
              <View style={styles.inputIconWrapper}>
                <Ionicons name="calendar-outline" size={16} color="#64748B" />
                <TextInput
                  style={styles.iconTextInput}
                  value={dataInicio}
                  onChangeText={setDataInicio}
                  placeholder="AAAA-MM-DD HH:MM"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            {/* Fim */}
            <View style={styles.dateCol}>
              <Text style={styles.inputLabel}>Data e Hora Fim *</Text>
              <View style={styles.inputIconWrapper}>
                <Ionicons name="time-outline" size={16} color="#64748B" />
                <TextInput
                  style={styles.iconTextInput}
                  value={dataFim}
                  onChangeText={setDataFim}
                  placeholder="AAAA-MM-DD HH:MM"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>
          </View>
        </View>

        {/* 4º CAMPO: OBSERVAÇÕES (OPCIONAL) */}
        <View style={styles.formCard}>
          <View style={styles.fieldHeader}>
            <Ionicons name="document-text" size={16} color="#2563EB" />
            <Text style={styles.fieldTitle}>4. Observações (Opcional)</Text>
          </View>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            multiline
            numberOfLines={3}
            placeholder="Descreva o objetivo da visita, tópicos a verificar ou notas importantes..."
            placeholderTextColor="#94A3B8"
            value={observacoes}
            onChangeText={setObservacoes}
          />
        </View>

        {/* 5º CAMPO: RESPONSÁVEL (PUXADO DOS USUÁRIOS CADASTRADOS) */}
        <View style={styles.formCard}>
          <View style={styles.fieldHeader}>
            <Ionicons name="person" size={16} color="#2563EB" />
            <Text style={styles.fieldTitle}>5. Responsável da Visita</Text>
          </View>
          <Text style={styles.fieldDesc}>Selecione o engenheiro/responsável cadastrado:</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
            {usersList.map(u => {
              const isSelected = selectedResponsavelId === u.id;
              const displayName = u.nome_completo || u.username;
              return (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.userChip, isSelected && styles.userChipActive]}
                  onPress={() => setSelectedResponsavelId(u.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.userAvatarBox, isSelected && styles.userAvatarBoxActive]}>
                    <Text style={[styles.userAvatarText, isSelected && styles.userAvatarTextActive]}>
                      {displayName.substring(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={[styles.userChipName, isSelected && styles.userChipNameActive]}>
                      {displayName}
                    </Text>
                    <Text style={[styles.userChipRole, isSelected && styles.userChipRoleActive]}>
                      {u.cargo || 'Equipe'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* 6º CAMPO: PARTICIPANTES (EM CARDS COM NOME E FUNÇÃO) */}
        <View style={styles.formCard}>
          <View style={styles.fieldHeaderBetween}>
            <View style={styles.fieldHeaderLeft}>
              <Ionicons name="people" size={16} color="#2563EB" />
              <Text style={styles.fieldTitle}>6. Participantes da Visita</Text>
            </View>
            <TouchableOpacity 
              style={styles.addParticipantBtn}
              onPress={() => setModalParticipanteVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={16} color="#2563EB" />
              <Text style={styles.addParticipantBtnText}>Adicionar</Text>
            </TouchableOpacity>
          </View>

          {participantes.length === 0 ? (
            <View style={styles.emptyParticipantsBox}>
              <Ionicons name="person-add-outline" size={24} color="#94A3B8" />
              <Text style={styles.emptyParticipantsText}>
                Nenhum participante adicionado além do responsável.
              </Text>
              <TouchableOpacity 
                style={styles.emptyAddBtn}
                onPress={() => setModalParticipanteVisible(true)}
              >
                <Text style={styles.emptyAddBtnText}>+ Adicionar Participante</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.participantsList}>
              {participantes.map((item, idx) => (
                <View key={idx} style={styles.participantCard}>
                  <View style={styles.participantLeft}>
                    <View style={styles.participantIconCircle}>
                      <Ionicons name="person" size={14} color="#2563EB" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.participantName}>{item.nome}</Text>
                      <Text style={styles.participantRole}>{item.funcao || 'Acompanhante'}</Text>
                    </View>
                  </View>
                  <TouchableOpacity 
                    onPress={() => handleRemoveParticipant(idx)} 
                    style={styles.removeParticipantBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 7º CAMPO (POR ÚLTIMO): COMPROMISSO PESSOAL */}
        <View style={[styles.formCard, styles.pessoalCard]}>
          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <View style={styles.pessoalTitleRow}>
                <Ionicons name="lock-closed" size={16} color="#D97706" />
                <Text style={styles.pessoalTitle}>7. Compromisso Pessoal</Text>
              </View>
              <Text style={styles.pessoalDesc}>
                Marcar como compromisso particular na agenda de visitas.
              </Text>
            </View>
            <Switch
              value={isPessoal}
              onValueChange={setIsPessoal}
              trackColor={{ false: '#CBD5E1', true: '#BFDBFE' }}
              thumbColor={isPessoal ? '#2563EB' : '#FFFFFF'}
            />
          </View>
        </View>

        {/* BOTÃO DE CONFIRMAÇÃO */}
        <TouchableOpacity 
          style={[styles.saveBtn, loading && styles.saveBtnDisabled]} 
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Ionicons name="calendar-outline" size={20} color="#FFFFFF" />
          <Text style={styles.saveBtnText}>
            {loading ? 'Salvando Visita...' : `Confirmar Agendamento (${visitNumber})`}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* MODAL PARA SELEÇÃO / ADIÇÃO DE PARTICIPANTES */}
      <Modal
        visible={modalParticipanteVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalParticipanteVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Adicionar Participante</Text>
              <TouchableOpacity onPress={() => setModalParticipanteVisible(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              {/* Usuários Cadastrados */}
              <Text style={styles.modalSectionLabel}>Usuários do Sistema:</Text>
              <View style={styles.modalList}>
                {usersList.map(u => (
                  <TouchableOpacity
                    key={u.id}
                    style={styles.modalListItem}
                    onPress={() => handleAddParticipantFromUser(u)}
                  >
                    <View style={styles.modalAvatarBox}>
                      <Ionicons name="person" size={14} color="#2563EB" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalItemTitle}>{u.nome_completo || u.username}</Text>
                      <Text style={styles.modalItemSub}>{u.cargo || 'Usuário Sistema'}</Text>
                    </View>
                    <Ionicons name="add-circle" size={20} color="#2563EB" />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Visitantes Cadastrados nos Ajustes */}
              {visitantesCadastrados.length > 0 && (
                <>
                  <Text style={[styles.modalSectionLabel, { marginTop: 14 }]}>
                    Visitantes Cadastrados (Ajustes):
                  </Text>
                  <View style={styles.modalList}>
                    {visitantesCadastrados.map(v => (
                      <TouchableOpacity
                        key={v.id}
                        style={styles.modalListItem}
                        onPress={() => handleAddParticipantFromVisitor(v)}
                      >
                        <View style={[styles.modalAvatarBox, { backgroundColor: '#FEF3C7' }]}>
                          <Ionicons name="briefcase" size={14} color="#D97706" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.modalItemTitle}>{v.nome}</Text>
                          <Text style={styles.modalItemSub}>
                            {v.cargo || ''} {v.empresa ? `• ${v.empresa}` : ''}
                          </Text>
                        </View>
                        <Ionicons name="add-circle" size={20} color="#D97706" />
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Adicionar Manualmente */}
              <Text style={[styles.modalSectionLabel, { marginTop: 16 }]}>Outro Participante:</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Nome completo..."
                placeholderTextColor="#94A3B8"
                value={novoPartNome}
                onChangeText={setNovoPartNome}
              />
              <TextInput
                style={[styles.modalInput, { marginTop: 8 }]}
                placeholder="Função / Cargo (Ex: Engenheiro, Fiscal, Mestre)..."
                placeholderTextColor="#94A3B8"
                value={novoPartFuncao}
                onChangeText={setNovoPartFuncao}
              />
              <TouchableOpacity 
                style={styles.modalAddManualBtn} 
                onPress={handleAddCustomParticipant}
              >
                <Text style={styles.modalAddManualBtnText}>Incluir Participante</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Dropdown para Seleção de Obra */}
      <Modal
        visible={showProjectDropdown}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowProjectDropdown(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dropdownModalContent}>
            <View style={styles.dropdownModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="business" size={20} color="#2563EB" />
                <Text style={styles.dropdownModalTitle}>Selecionar Obra / Projeto</Text>
              </View>
              <TouchableOpacity onPress={() => setShowProjectDropdown(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Barra de Pesquisa */}
            <View style={styles.dropdownSearchWrap}>
              <Ionicons name="search-outline" size={18} color="#64748B" />
              <TextInput
                style={styles.dropdownSearchInput}
                placeholder="Filtrar obras por nome ou número..."
                placeholderTextColor="#94A3B8"
                value={projectSearch}
                onChangeText={setProjectSearch}
              />
              {projectSearch.length > 0 && (
                <TouchableOpacity onPress={() => setProjectSearch('')}>
                  <Ionicons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
              {/* Opção Outros */}
              <TouchableOpacity
                style={[
                  styles.dropdownItemRow,
                  selectedProjectId === 'outros' && styles.dropdownItemRowActive
                ]}
                onPress={() => {
                  setSelectedProjectId('outros');
                  setShowProjectDropdown(false);
                  setProjectSearch('');
                }}
              >
                <View style={[styles.dropdownItemIcon, { backgroundColor: '#F1F5F9' }]}>
                  <Ionicons name="ellipsis-horizontal-circle" size={20} color="#475569" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.dropdownItemTitle, selectedProjectId === 'outros' && { color: '#2563EB', fontWeight: '700' }]}>
                    Outros (Outro Local / Destino Especial)
                  </Text>
                  <Text style={styles.dropdownItemSub}>
                    Permite digitar manualmente o local da visita abaixo
                  </Text>
                </View>
                {selectedProjectId === 'outros' && (
                  <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
                )}
              </TouchableOpacity>

              {/* Lista de Obras */}
              {projetos
                .filter(p => {
                  if (!projectSearch.trim()) return true;
                  const q = projectSearch.toLowerCase();
                  return (
                    (p.nome && p.nome.toLowerCase().includes(q)) ||
                    (p.numero && p.numero.toLowerCase().includes(q)) ||
                    (p.construtora && p.construtora.toLowerCase().includes(q))
                  );
                })
                .map(p => {
                  const isSelected = selectedProjectId === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.dropdownItemRow,
                        isSelected && styles.dropdownItemRowActive
                      ]}
                      onPress={() => {
                        setSelectedProjectId(p.id);
                        setShowProjectDropdown(false);
                        setProjectSearch('');
                      }}
                    >
                      <View style={[styles.dropdownItemIcon, isSelected && { backgroundColor: '#EFF6FF' }]}>
                        <Ionicons 
                          name="business" 
                          size={18} 
                          color={isSelected ? "#2563EB" : "#64748B"} 
                        />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.dropdownItemTitle, isSelected && { color: '#2563EB', fontWeight: '700' }]}>
                          {p.numero ? `[${p.numero}] ` : ''}{p.nome}
                        </Text>
                        <Text style={styles.dropdownItemSub}>
                          {p.construtora || 'ObraFlow'} • {p.tipo_obra || 'Edificação'}
                        </Text>
                      </View>
                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
                      )}
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 16 },

  headerIndexCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 12,
  },
  headerIndexLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  indexIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexCodeText: { fontSize: 16, fontWeight: '800', color: '#1E40AF', letterSpacing: 0.5 },
  indexSubText: { fontSize: 11.5, color: '#64748B', fontWeight: '500' },
  autoSavePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  autoSaveText: { fontSize: 10, color: '#16A34A', fontWeight: '700' },

  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  fieldHeaderBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  fieldHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldTitle: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  fieldDesc: { fontSize: 12, color: '#64748B', marginBottom: 10 },

  horizontalScroll: { marginTop: 4, marginBottom: 6 },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
  },
  dropdownIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  dropdownTriggerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  dropdownTriggerSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  dropdownModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  dropdownModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  dropdownSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 10,
    height: 42,
  },
  dropdownSearchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  dropdownItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  dropdownItemRowActive: {
    backgroundColor: '#EFF6FF',
  },
  dropdownItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownItemTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  dropdownItemSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  chipButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
  },
  chipButtonActive: { backgroundColor: '#1E293B', borderColor: '#1E293B' },
  chipButtonOther: { flexDirection: 'row', alignItems: 'center', gap: 5, borderColor: '#CBD5E1' },
  chipButtonOtherActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  chipText: { fontSize: 12.5, fontWeight: '600', color: '#475569' },
  chipTextActive: { color: '#FFFFFF' },

  otherInputWrapper: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  otherInputLabel: { fontSize: 12, fontWeight: '600', color: '#2563EB', marginBottom: 6 },

  datesRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  dateCol: { flex: 1 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 4 },
  inputIconWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
  },
  iconTextInput: { flex: 1, fontSize: 12.5, color: '#1E293B' },

  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    color: '#1E293B',
  },
  textArea: { height: 80, textAlignVertical: 'top', paddingTop: 8 },

  // Usuários Chips
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
  },
  userChipActive: { backgroundColor: '#EFF6FF', borderColor: '#2563EB' },
  userAvatarBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarBoxActive: { backgroundColor: '#2563EB' },
  userAvatarText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  userAvatarTextActive: { color: '#FFFFFF' },
  userChipName: { fontSize: 12, fontWeight: '700', color: '#1E293B' },
  userChipNameActive: { color: '#1E40AF' },
  userChipRole: { fontSize: 10.5, color: '#64748B' },
  userChipRoleActive: { color: '#2563EB' },

  // Participantes Cards
  addParticipantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  addParticipantBtnText: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  emptyParticipantsBox: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    marginTop: 4,
  },
  emptyParticipantsText: { fontSize: 12, color: '#94A3B8', marginTop: 4, textAlign: 'center' },
  emptyAddBtn: { marginTop: 8 },
  emptyAddBtnText: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  participantsList: { gap: 8, marginTop: 4 },
  participantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  participantLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  participantIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantName: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  participantRole: { fontSize: 11.5, color: '#64748B', marginTop: 1 },
  removeParticipantBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },

  // 7. Compromisso Pessoal
  pessoalCard: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchTextCol: { flex: 1, marginRight: 12 },
  pessoalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  pessoalTitle: { fontSize: 13.5, fontWeight: '700', color: '#92400E' },
  pessoalDesc: { fontSize: 11.5, color: '#B45309' },

  saveBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 10,
    marginTop: 8,
    ...Shadows.md,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '700' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  modalSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 6,
  },
  modalList: { gap: 6 },
  modalListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalAvatarBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalItemTitle: { fontSize: 13, fontWeight: '600', color: '#1E293B' },
  modalItemSub: { fontSize: 11, color: '#64748B' },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    fontSize: 13,
    color: '#1E293B',
  },
  modalAddManualBtn: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  modalAddManualBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
});
