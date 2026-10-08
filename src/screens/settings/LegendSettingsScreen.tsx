import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  getLocalLegendas,
  saveLocalLegenda,
  updateLocalLegenda,
  deleteLocalLegenda,
  reorderLocalLegendas,
} from '../../database/db';
import { LegendaPredefinida } from '../../types';

const CATEGORIAS_PADRAO = ['Todas', 'Acabamentos', 'Estrutural', 'Geral', 'Segurança'];

export default function LegendSettingsScreen() {
  const navigation = useNavigation<any>();
  const [legendas, setLegendas] = useState<LegendaPredefinida[]>([]);
  const [selectedCat, setSelectedCat] = useState('Todas');
  const [loading, setLoading] = useState(true);

  // Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<LegendaPredefinida | null>(null);
  const [inputText, setInputText] = useState('');
  const [inputCategoria, setInputCategoria] = useState('Geral');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getLocalLegendas(selectedCat);
      setLegendas(data);
    } catch (error) {
      console.error('Erro ao carregar legendas:', error);
      Alert.alert('Erro', 'Não foi possível carregar as legendas.');
    } finally {
      setLoading(false);
    }
  }, [selectedCat]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setInputText('');
    setInputCategoria(selectedCat !== 'Todas' ? selectedCat : 'Geral');
    setModalVisible(true);
  };

  const handleOpenEdit = (legenda: LegendaPredefinida) => {
    setEditingItem(legenda);
    setInputText(legenda.texto);
    setInputCategoria(legenda.categoria);
    setModalVisible(true);
  };

  const handleSaveLegenda = async () => {
    if (!inputText.trim()) {
      Alert.alert('Atenção', 'Informe o texto da legenda.');
      return;
    }

    try {
      if (editingItem) {
        await updateLocalLegenda(editingItem.id, inputText.trim(), inputCategoria.trim());
      } else {
        await saveLocalLegenda({
          categoria: inputCategoria.trim(),
          texto: inputText.trim(),
          ordem: legendas.length + 1,
        });
      }
      setModalVisible(false);
      setInputText('');
      setEditingItem(null);
      await loadData();
    } catch (error) {
      Alert.alert('Erro', 'Falha ao salvar legenda técnica.');
    }
  };

  const handleDeleteLegenda = (legenda: LegendaPredefinida) => {
    Alert.alert(
      'Excluir Legenda',
      `Deseja excluir a legenda: "${legenda.texto}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLocalLegenda(legenda.id);
              await loadData();
            } catch (error) {
              Alert.alert('Erro', 'Falha ao excluir legenda.');
            }
          },
        },
      ]
    );
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= legendas.length) return;

    const newItems = [...legendas];
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;

    const updates = newItems.map((it, idx) => ({
      id: it.id,
      ordem: idx + 1,
    }));

    setLegendas(newItems.map((it, idx) => ({ ...it, ordem: idx + 1 })));

    try {
      await reorderLocalLegendas(updates);
    } catch (error) {
      console.error('Erro ao reordenar legendas:', error);
      await loadData();
    }
  };

  const renderItem = ({ item, index }: { item: LegendaPredefinida; index: number }) => (
    <View style={styles.card}>
      <View style={styles.tagBadge}>
        <Text style={styles.tagBadgeText}>{item.categoria}</Text>
      </View>

      <View style={styles.contentCol}>
        <Text style={styles.itemText}>{item.texto}</Text>
        <Text style={styles.orderLabel}>Posição: #{index + 1}</Text>
      </View>

      <View style={styles.actionButtons}>
        {/* Subir */}
        <TouchableOpacity
          style={[styles.arrowBtn, index === 0 && styles.btnDisabled]}
          disabled={index === 0}
          onPress={() => handleMove(index, 'up')}
        >
          <Ionicons name="chevron-up" size={18} color={index === 0 ? '#CBD5E1' : '#1E293B'} />
        </TouchableOpacity>

        {/* Descer */}
        <TouchableOpacity
          style={[styles.arrowBtn, index === legendas.length - 1 && styles.btnDisabled]}
          disabled={index === legendas.length - 1}
          onPress={() => handleMove(index, 'down')}
        >
          <Ionicons
            name="chevron-down"
            size={18}
            color={index === legendas.length - 1 ? '#CBD5E1' : '#1E293B'}
          />
        </TouchableOpacity>

        {/* Editar */}
        <TouchableOpacity style={styles.editBtn} onPress={() => handleOpenEdit(item)}>
          <Ionicons name="pencil" size={16} color="#2563EB" />
        </TouchableOpacity>

        {/* Excluir */}
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteLegenda(item)}>
          <Ionicons name="trash-outline" size={16} color="#DC2626" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Legendas Técnicas</Text>
          <Text style={styles.headerSubtitle}>Descrições pré-configuradas para fotos</Text>
        </View>
        <TouchableOpacity style={styles.addHeaderBtn} onPress={handleOpenAdd}>
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Categoria Chips */}
      <View style={styles.categoryScrollWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
          {CATEGORIAS_PADRAO.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.catChip, selectedCat === cat && styles.catChipActive]}
              onPress={() => setSelectedCat(cat)}
            >
              <Text style={[styles.catChipText, selectedCat === cat && styles.catChipTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Conteúdo */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Carregando legendas...</Text>
        </View>
      ) : (
        <FlatList
          data={legendas}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="text-outline" size={48} color="#94A3B8" />
              <Text style={styles.emptyTitle}>Nenhuma legenda encontrada</Text>
              <Text style={styles.emptyText}>
                Clique em "+" no topo para cadastrar uma nova descrição técnica.
              </Text>
            </View>
          }
        />
      )}

      {/* Modal Adicionar / Editar */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingItem ? 'Editar Legenda' : 'Nova Legenda Técnica'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Categoria:</Text>
            <View style={styles.catSelectRow}>
              {['Acabamentos', 'Estrutural', 'Geral', 'Segurança'].map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.modalCatChip, inputCategoria === c && styles.modalCatChipActive]}
                  onPress={() => setInputCategoria(c)}
                >
                  <Text
                    style={[
                      styles.modalCatChipText,
                      inputCategoria === c && styles.modalCatChipTextActive,
                    ]}
                  >
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Texto da Legenda:</Text>
            <TextInput
              style={styles.modalInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ex: Armadura exposta com sinais de corrosão"
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={3}
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveLegenda}>
                <Text style={styles.modalSaveText}>Salvar Legenda</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  addHeaderBtn: {
    backgroundColor: '#2563EB',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryScrollWrap: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 10,
  },
  categoryList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  catChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  catChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  catChipTextActive: {
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  tagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  tagBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  contentCol: {
    flex: 1,
    marginRight: 8,
  },
  itemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 20,
  },
  orderLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  arrowBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  editBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
  },
  deleteBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
    marginTop: 12,
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
    marginTop: 10,
  },
  catSelectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  modalCatChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalCatChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  modalCatChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  modalCatChipTextActive: {
    color: '#FFFFFF',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#0F172A',
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  modalSaveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#2563EB',
  },
  modalSaveText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
