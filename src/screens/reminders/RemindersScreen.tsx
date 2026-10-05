import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  Modal, TextInput, RefreshControl, Alert, ScrollView 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBadge } from '../../components/SyncStatusBadge';
import { 
  getLocalLembretes, saveLocalLembrete, closeLocalLembrete, 
  addToSyncQueue, getLocalProjetos 
} from '../../database/db';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { Lembrete, Projeto } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

export const RemindersScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const { isOnline, triggerSync } = useNetwork();

  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // New Reminder form
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await getLocalLembretes(undefined, false);
      setLembretes(data);
      const projs = await getLocalProjetos();
      setProjetos(projs);
      if (projs.length > 0 && !selectedProjectId) {
        setSelectedProjectId(projs[0].id);
      }
    } catch (e) {
      console.warn('Erro ao carregar lembretes:', e);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateReminder() {
    if (!selectedProjectId || !texto.trim()) {
      Alert.alert('Atenção', 'Selecione a obra e informe o texto do lembrete.');
      return;
    }

    setLoading(true);
    try {
      const lemId = Date.now();
      const proj = projetos.find(p => p.id === selectedProjectId);

      const newLem: Lembrete = {
        id: lemId,
        projeto_id: selectedProjectId,
        projeto_nome: proj?.nome || 'Obra',
        texto: texto.trim(),
        fechado: false,
        criado_em: new Date().toISOString(),
        criado_por_nome: user?.username || 'Usuário',
        sync_status: 'pending',
      };

      await saveLocalLembrete(newLem, 'pending');

      await addToSyncQueue(
        'lembrete',
        lemId,
        'create',
        '/api/lembrete/criar',
        'POST',
        newLem
      );

      if (isOnline) triggerSync();

      setTexto('');
      setModalVisible(false);
      await loadData();
      Alert.alert('Sucesso', 'Lembrete criado com sucesso!');
    } catch (err: any) {
      Alert.alert('Erro ao Salvar', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCloseReminder(item: Lembrete) {
    try {
      await closeLocalLembrete(item.id, user?.username || 'Usuário');
      await addToSyncQueue(
        'lembrete',
        item.id,
        'close',
        `/api/lembrete/${item.id}/fechar`,
        'POST',
        { fechado: true }
      );
      if (isOnline) triggerSync();
      await loadData();
    } catch (err: any) {
      Alert.alert('Erro', err.message);
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
        title="Lembretes de Obras" 
        subtitle="Avisos e pendências ativas"
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity 
            style={styles.addBtn}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />
      <OfflineBanner />

      <FlatList
        data={lembretes}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Nenhum lembrete registrado</Text>
            <Text style={styles.emptySub}>Crie lembretes com pendências ou avisos para as obras.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, item.fechado && styles.cardClosed]}>
            <View style={styles.cardHeader}>
              <View style={styles.badgeRow}>
                <View style={[styles.statusBadge, item.fechado ? styles.badgeClosed : styles.badgeActive]}>
                  <Text style={[styles.statusBadgeText, item.fechado ? styles.textClosed : styles.textActive]}>
                    {item.fechado ? 'RESOLVIDO' : 'ATIVO'}
                  </Text>
                </View>
                <SyncStatusBadge status={item.sync_status} />
              </View>

              {!item.fechado && (
                <TouchableOpacity 
                  style={styles.checkDoneBtn}
                  onPress={() => handleCloseReminder(item)}
                >
                  <Ionicons name="checkmark-circle-outline" size={22} color={Colors.success} />
                  <Text style={styles.checkDoneText}>Resolver</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.lemTexto, item.fechado && styles.lineThrough]}>
              {item.texto}
            </Text>

            <View style={styles.cardFooter}>
              <Text style={styles.footerObra}>Obra: {item.projeto_nome}</Text>
              <Text style={styles.footerDate}>
                {new Date(item.criado_em).toLocaleDateString('pt-BR')}
              </Text>
            </View>
          </View>
        )}
      />

      {/* New Reminder Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo Lembrete de Obra</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Selecione a Obra:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {projetos.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chip, selectedProjectId === p.id && styles.chipActive]}
                  onPress={() => setSelectedProjectId(p.id)}
                >
                  <Text style={[styles.chipText, selectedProjectId === p.id && styles.chipTextActive]}>
                    {p.nome}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.label, { marginTop: 12 }]}>Texto do Lembrete *</Text>
            <TextInput
              style={styles.textArea}
              multiline
              numberOfLines={3}
              placeholder="Ex: Cobrar ensaio de resistência da argamassa..."
              value={texto}
              onChangeText={setTexto}
            />

            <TouchableOpacity 
              style={[styles.saveBtn, loading && { opacity: 0.7 }]}
              onPress={handleCreateReminder}
              disabled={loading}
            >
              <Text style={styles.saveBtnText}>{loading ? 'Salvando...' : 'Salvar Lembrete'}</Text>
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
    backgroundColor: '#EC4899',
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
  cardClosed: {
    backgroundColor: '#F8FAFC',
    opacity: 0.8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeActive: { backgroundColor: '#FCE7F3' },
  badgeClosed: { backgroundColor: '#E2E8F0' },
  statusBadgeText: { fontSize: 10, fontWeight: 'bold' },
  textActive: { color: '#BE185D' },
  textClosed: { color: '#64748B' },
  checkDoneBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  checkDoneText: { fontSize: 12, fontWeight: 'bold', color: Colors.success },
  lemTexto: { fontSize: 15, fontWeight: '600', color: Colors.text, marginBottom: 8, lineHeight: 20 },
  lineThrough: { textDecorationLine: 'line-through', color: Colors.textMuted },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  footerObra: { fontSize: 12, color: Colors.textSecondary },
  footerDate: { fontSize: 11, color: Colors.textMuted },
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
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  chipScroll: { flexDirection: 'row' },
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
  textArea: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 10,
    height: 72,
    textAlignVertical: 'top',
    fontSize: 14,
    marginBottom: 16,
  },
  saveBtn: {
    backgroundColor: '#EC4899',
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
});
