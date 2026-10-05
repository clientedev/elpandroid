import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  Modal, TextInput, RefreshControl, Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { getLocalContatos, saveLocalContato, addToSyncQueue } from '../../database/db';
import { useNetwork } from '../../contexts/NetworkContext';
import { Contato } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

export const ContactsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { isOnline, triggerSync } = useNetwork();
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const [nome, setNome] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await getLocalContatos();
      setContatos(data);
    } catch (e) {
      console.warn('Erro ao carregar contatos:', e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateContact() {
    if (!nome.trim()) {
      Alert.alert('Atenção', 'Informe o nome do contato.');
      return;
    }

    setLoading(true);
    try {
      const contactId = Date.now();
      const newContact: Contato = {
        id: contactId,
        nome: nome.trim(),
        empresa: empresa.trim(),
        email: email.trim(),
        telefone: telefone.trim(),
        sync_status: 'pending',
      };

      await saveLocalContato(newContact, 'pending');

      await addToSyncQueue(
        'contato',
        contactId,
        'create',
        '/api/contatos',
        'POST',
        newContact
      );

      if (isOnline) triggerSync();

      setNome('');
      setEmpresa('');
      setEmail('');
      setTelefone('');
      setModalVisible(false);

      await loadData();
      Alert.alert('Sucesso', 'Contato adicionado com sucesso!');
    } catch (err: any) {
      Alert.alert('Erro ao Salvar', err.message);
    } finally {
      setLoading(false);
    }
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <Header 
        title="Contatos" 
        subtitle="Clientes, construtoras & engenheiros"
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />
      <OfflineBanner />

      <FlatList
        data={contatos}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Nenhum contato salvo</Text>
            <Text style={styles.emptySub}>Adicione engenheiros, fiscais e clientes para vincular a relatórios.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.nome.substring(0, 2).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.nomeText}>{item.nome}</Text>
                {item.empresa ? <Text style={styles.empresaText}>{item.empresa}</Text> : null}
              </View>
              <SyncStatusBadge status={item.sync_status} />
            </View>

            <View style={styles.contactDetails}>
              {item.telefone ? (
                <View style={styles.detailRow}>
                  <Ionicons name="call-outline" size={14} color={Colors.primary} />
                  <Text style={styles.detailText}>{item.telefone}</Text>
                </View>
              ) : null}
              {item.email ? (
                <View style={styles.detailRow}>
                  <Ionicons name="mail-outline" size={14} color={Colors.primary} />
                  <Text style={styles.detailText}>{item.email}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}
      />

      {/* New Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo Contato</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nome Completo *</Text>
              <TextInput style={styles.input} placeholder="Ex: Carlos Mendes" value={nome} onChangeText={setNome} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Empresa / Construtora</Text>
              <TextInput style={styles.input} placeholder="Ex: Monteiro Construtora" value={empresa} onChangeText={setEmpresa} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Telefone / WhatsApp</Text>
              <TextInput style={styles.input} keyboardType="phone-pad" placeholder="(11) 99999-9999" value={telefone} onChangeText={setTelefone} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>E-mail</Text>
              <TextInput style={styles.input} keyboardType="email-address" autoCapitalize="none" placeholder="carlos@exemplo.com" value={email} onChangeText={setEmail} />
            </View>

            <TouchableOpacity 
              style={[styles.saveBtn, loading && { opacity: 0.7 }]}
              onPress={handleCreateContact}
              disabled={loading}
            >
              <Text style={styles.saveBtnText}>{loading ? 'Salvando...' : 'Salvar Contato'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  addBtn: {
    backgroundColor: Colors.primary,
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
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: 'bold', color: Colors.primary },
  nomeText: { fontSize: 16, fontWeight: 'bold', color: Colors.text },
  empresaText: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  contactDetails: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
    gap: 6,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 13, color: '#334155' },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text, marginTop: 12 },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
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
  inputGroup: { marginBottom: 12 },
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
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
});
