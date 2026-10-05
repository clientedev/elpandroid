import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { getLocalProjetos, saveLocalVisita, addToSyncQueue } from '../../database/db';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { Projeto, Visita } from '../../types';
import { Colors } from '../../theme/colors';

export const VisitFormScreen: React.FC<{ route?: any; navigation: any }> = ({ route, navigation }) => {
  const { user } = useAuth();
  const { isOnline, triggerSync } = useNetwork();
  const preSelectedProjectId = route?.params?.preSelectedProjectId;

  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(preSelectedProjectId || null);
  const [isPessoal, setIsPessoal] = useState(false);
  const [outroNome, setOutroNome] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [dataHora, setDataHora] = useState(new Date().toISOString().substring(0, 16).replace('T', ' '));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getLocalProjetos().then(p => {
      setProjetos(p);
      if (!selectedProjectId && p.length > 0 && !preSelectedProjectId) {
        setSelectedProjectId(p[0].id);
      }
    });
  }, [preSelectedProjectId]);

  async function handleSave() {
    setLoading(true);
    try {
      const selectedProj = projetos.find(p => p.id === selectedProjectId);
      const visitId = Date.now();
      const visitNum = `VIS-${Math.floor(100 + Math.random() * 900)}`;

      const visitaData: Visita = {
        id: visitId,
        numero: visitNum,
        projeto_id: isPessoal ? null : selectedProjectId,
        projeto_nome: isPessoal ? 'Compromisso Pessoal' : (selectedProj?.nome || outroNome || 'Visita Técnica'),
        projeto_outros: isPessoal ? 'Compromisso Pessoal' : outroNome,
        responsavel_id: user?.id || 1,
        responsavel_nome: user?.username || 'Responsável',
        data_inicio: new Date().toISOString(),
        data_fim: new Date(Date.now() + 7200000).toISOString(),
        observacoes: observacoes.trim(),
        status: 'Agendada',
        is_pessoal: isPessoal,
        sync_status: 'pending',
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

      if (isOnline) triggerSync();

      Alert.alert('Sucesso', 'Visita agendada com sucesso no aplicativo!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (err: any) {
      Alert.alert('Erro ao Salvar', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Header title="Agendar Visita" showBack onBack={() => navigation.goBack()} />
      <OfflineBanner />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Dados da Visita</Text>

          {/* Switch compromisso pessoal */}
          <View style={styles.switchRow}>
            <Text style={styles.label}>É um compromisso pessoal?</Text>
            <Switch
              value={isPessoal}
              onValueChange={setIsPessoal}
              trackColor={{ false: '#CBD5E1', true: Colors.primaryLight }}
              thumbColor={isPessoal ? Colors.primary : '#FFFFFF'}
            />
          </View>

          {!isPessoal ? (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Selecione a Obra / Projeto:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.projectScroll}>
                {projetos.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.projectChip, selectedProjectId === p.id && styles.projectChipActive]}
                    onPress={() => setSelectedProjectId(p.id)}
                  >
                    <Text style={[styles.projectChipText, selectedProjectId === p.id && styles.projectChipTextActive]}>
                      {p.numero} - {p.nome}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Descrição do Compromisso:</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Reunião interna / Alinhamento"
                value={outroNome}
                onChangeText={setOutroNome}
              />
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Data e Horário:</Text>
            <TextInput
              style={styles.input}
              value={dataHora}
              onChangeText={setDataHora}
              placeholder="AAAA-MM-DD HH:MM"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Objetivo / Observações:</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              numberOfLines={3}
              placeholder="Descreva o objetivo da vistoria..."
              value={observacoes}
              onChangeText={setObservacoes}
            />
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.saveBtn, loading && styles.saveBtnDisabled]} 
          onPress={handleSave}
          disabled={loading}
        >
          <Ionicons name="calendar-outline" size={20} color="#FFFFFF" />
          <Text style={styles.saveBtnText}>{loading ? 'Salvando...' : 'Confirmar Agendamento'}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text, marginBottom: 12 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  inputGroup: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
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
  projectScroll: { flexDirection: 'row', marginTop: 4 },
  projectChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  projectChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  projectChipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  projectChipTextActive: { color: '#FFFFFF' },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
});
