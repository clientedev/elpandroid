import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { saveLocalProjeto, addToSyncQueue } from '../../database/db';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { Projeto } from '../../types';
import { Colors } from '../../theme/colors';

export const ProjectFormScreen: React.FC<{ route?: any; navigation: any }> = ({ route, navigation }) => {
  const { user } = useAuth();
  const { isOnline, triggerSync } = useNetwork();
  const existingProject: Projeto | undefined = route?.params?.project;

  const [numero, setNumero] = useState(existingProject?.numero || `OBR-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
  const [nome, setNome] = useState(existingProject?.nome || '');
  const [construtora, setConstrutora] = useState(existingProject?.construtora || '');
  const [tipoObra, setTipoObra] = useState(existingProject?.tipo_obra || 'Edifício Residencial');
  const [endereco, setEndereco] = useState(existingProject?.endereco || '');
  const [funcionario, setFuncionario] = useState(existingProject?.nome_funcionario || user?.username || '');
  const [emailPrincipal, setEmailPrincipal] = useState(existingProject?.email_principal || user?.email || '');
  const [status, setStatus] = useState(existingProject?.status || 'Ativo');

  // Technical Specs
  const [elementosBase, setElementosBase] = useState(existingProject?.elementos_construtivos_base || '');
  const [chapisco, setChapisco] = useState(existingProject?.especificacao_chapisco_colante || '');
  const [argamassa, setArgamassa] = useState(existingProject?.especificacao_argamassa_emboco || '');
  const [peitoris, setPeitoris] = useState(existingProject?.acabamento_peitoris || '');
  const [frisos, setFrisos] = useState(existingProject?.definicao_frisos_cor || '');

  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (!nome.trim() || !construtora.trim() || !emailPrincipal.trim()) {
      Alert.alert('Campos Obrigatórios', 'Por favor, preencha o Nome da Obra, Construtora e E-mail Principal.');
      return;
    }

    setLoading(true);
    try {
      const projId = existingProject?.id || Date.now();
      const projData: Projeto = {
        id: projId,
        numero: numero.trim(),
        nome: nome.trim(),
        construtora: construtora.trim(),
        tipo_obra: tipoObra,
        endereco: endereco.trim(),
        nome_funcionario: funcionario.trim(),
        responsavel_id: existingProject?.responsavel_id || user?.id || 1,
        email_principal: emailPrincipal.trim(),
        status: status,
        elementos_construtivos_base: elementosBase.trim(),
        especificacao_chapisco_colante: chapisco.trim(),
        especificacao_argamassa_emboco: argamassa.trim(),
        acabamento_peitoris: peitoris.trim(),
        definicao_frisos_cor: frisos.trim(),
        sync_status: 'pending',
      };

      // 1. Save directly into local SQLite
      await saveLocalProjeto(projData, 'pending');

      // 2. Queue sync operation for Railway API
      await addToSyncQueue(
        'projeto',
        projId,
        existingProject ? 'update' : 'create',
        existingProject ? `/api/projetos/${projId}` : '/api/projetos',
        existingProject ? 'PUT' : 'POST',
        projData
      );

      // 3. Trigger immediate sync if online
      if (isOnline) {
        triggerSync();
      }

      Alert.alert(
        'Sucesso', 
        `Obra ${existingProject ? 'atualizada' : 'cadastrada'} com sucesso no dispositivo!`,
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
        showBack 
        onBack={() => navigation.goBack()} 
      />
      <OfflineBanner />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Identificação da Obra</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Número da Obra *</Text>
            <TextInput style={styles.input} value={numero} onChangeText={setNumero} />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nome da Obra *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Ex: Residencial Alphaville" 
              value={nome} 
              onChangeText={setNome} 
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Construtora *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Ex: Construtora Silva & Costa" 
              value={construtora} 
              onChangeText={setConstrutora} 
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Tipo de Obra</Text>
            <TextInput style={styles.input} value={tipoObra} onChangeText={setTipoObra} />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Endereço Completo</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Rua, número, bairro, cidade" 
              value={endereco} 
              onChangeText={setEndereco} 
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Engenheiro / Fiscal Responsável</Text>
            <TextInput style={styles.input} value={funcionario} onChangeText={setFuncionario} />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>E-mail Principal para Envio de Relatórios *</Text>
            <TextInput 
              style={styles.input} 
              keyboardType="email-address" 
              autoCapitalize="none"
              value={emailPrincipal} 
              onChangeText={setEmailPrincipal} 
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Especificações Técnicas de Fachada</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Elementos Construtivos de Base</Text>
            <TextInput 
              style={[styles.input, styles.textArea]} 
              multiline 
              numberOfLines={2} 
              placeholder="Ex: Concreto armado, blocos cerâmicos..." 
              value={elementosBase} 
              onChangeText={setElementosBase} 
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Chapisco Colante / Alvenaria</Text>
            <TextInput 
              style={[styles.input, styles.textArea]} 
              multiline 
              numberOfLines={2} 
              placeholder="Especificação do tipo de chapisco..." 
              value={chapisco} 
              onChangeText={setChapisco} 
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Argamassa de Emboço</Text>
            <TextInput 
              style={[styles.input, styles.textArea]} 
              multiline 
              numberOfLines={2} 
              placeholder="Traço ou argamassa industrializada..." 
              value={argamassa} 
              onChangeText={setArgamassa} 
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Acabamento de Peitoris & Muretas</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Ex: Granito cinza andorinha com pingadeira" 
              value={peitoris} 
              onChangeText={setPeitoris} 
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Frisos e Cores de Fachada</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Ex: Frisos horizontais 2x2cm, pintura acrílica" 
              value={frisos} 
              onChangeText={setFrisos} 
            />
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.saveBtn, loading && styles.saveBtnDisabled]} 
          onPress={handleSave}
          disabled={loading}
        >
          <Ionicons name="checkmark-circle-outline" size={22} color="#FFFFFF" />
          <Text style={styles.saveBtnText}>
            {loading ? 'Salvando...' : 'Salvar Obra no Dispositivo'}
          </Text>
        </TouchableOpacity>

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
    color: Colors.text,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
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
  textArea: {
    height: 64,
    textAlignVertical: 'top',
    paddingVertical: 8,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
