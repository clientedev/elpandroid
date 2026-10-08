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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  getLocalChecklistTemplate,
  addLocalChecklistItem,
  updateLocalChecklistItem,
  deleteLocalChecklistItem,
  reorderLocalChecklistItems,
  resetLocalChecklistTemplateToDefault,
} from '../../database/db';
import { ChecklistCustomItem } from '../../types';

export default function ChecklistCustomizerScreen() {
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<ChecklistCustomItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<ChecklistCustomItem | null>(null);
  const [inputText, setInputText] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getLocalChecklistTemplate();
      setItems(data);
    } catch (error) {
      console.error('Erro ao carregar checklist:', error);
      Alert.alert('Erro', 'Não foi possível carregar os itens de checklist.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setInputText('');
    setModalVisible(true);
  };

  const handleOpenEdit = (item: ChecklistCustomItem) => {
    setEditingItem(item);
    setInputText(item.item);
    setModalVisible(true);
  };

  const handleSaveItem = async () => {
    if (!inputText.trim()) {
      Alert.alert('Atenção', 'Informe o texto do item de checklist.');
      return;
    }

    try {
      if (editingItem) {
        await updateLocalChecklistItem(editingItem.id, inputText.trim(), editingItem.ordem);
      } else {
        await addLocalChecklistItem(inputText.trim());
      }
      setModalVisible(false);
      setInputText('');
      setEditingItem(null);
      await loadData();
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível salvar o item.');
    }
  };

  const handleDeleteItem = (item: ChecklistCustomItem) => {
    Alert.alert(
      'Excluir Item',
      `Deseja realmente remover o item: "${item.item}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLocalChecklistItem(item.id);
              await loadData();
            } catch (error) {
              Alert.alert('Erro', 'Falha ao excluir item.');
            }
          },
        },
      ]
    );
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const newItems = [...items];
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;

    // Recalcula ordens
    const updates = newItems.map((it, idx) => ({
      id: it.id,
      ordem: idx + 1,
    }));

    setItems(newItems.map((it, idx) => ({ ...it, ordem: idx + 1 })));

    try {
      await reorderLocalChecklistItems(updates);
    } catch (error) {
      console.error('Erro ao reordenar:', error);
      await loadData();
    }
  };

  const handleResetDefault = () => {
    Alert.alert(
      'Restaurar Checklist Padrão',
      'Isso restaurará a lista original de etapas técnicas de engenharia do ObraFlow. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetLocalChecklistTemplateToDefault();
              await loadData();
              Alert.alert('Sucesso', 'Checklist restaurado para o padrão.');
            } catch (e) {
              Alert.alert('Erro', 'Falha ao restaurar checklist.');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item, index }: { item: ChecklistCustomItem; index: number }) => (
    <View style={styles.card}>
      <View style={styles.orderBadge}>
        <Text style={styles.orderBadgeText}>{index + 1}º</Text>
      </View>

      <View style={styles.contentCol}>
        <Text style={styles.itemTitle}>{item.item}</Text>
        <Text style={styles.itemOrderText}>Posição no relatório: #{index + 1}</Text>
      </View>

      {/* Botões de Ação */}
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
          style={[styles.arrowBtn, index === items.length - 1 && styles.btnDisabled]}
          disabled={index === items.length - 1}
          onPress={() => handleMove(index, 'down')}
        >
          <Ionicons
            name="chevron-down"
            size={18}
            color={index === items.length - 1 ? '#CBD5E1' : '#1E293B'}
          />
        </TouchableOpacity>

        {/* Editar */}
        <TouchableOpacity style={styles.editBtn} onPress={() => handleOpenEdit(item)}>
          <Ionicons name="pencil" size={16} color="#2563EB" />
        </TouchableOpacity>

        {/* Excluir */}
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteItem(item)}>
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
          <Text style={styles.headerTitle}>Personalizar Checklist</Text>
          <Text style={styles.headerSubtitle}>Etapas técnicas para novos relatórios</Text>
        </View>
        <TouchableOpacity style={styles.addHeaderBtn} onPress={handleOpenAdd}>
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle-outline" size={20} color="#0284C7" />
        <Text style={styles.infoBannerText}>
          Os itens configurados aqui aparecem em ordem numeral em todos os relatórios da obra. Você
          pode adicionar, editar e reordenar as etapas livremente.
        </Text>
      </View>

      {/* Conteúdo */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Carregando checklist...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="checkbox-outline" size={48} color="#94A3B8" />
              <Text style={styles.emptyTitle}>Nenhum item cadastrado</Text>
              <Text style={styles.emptyText}>
                Clique no botão "+" acima ou restaure o padrão do sistema.
              </Text>
            </View>
          }
          ListFooterComponent={
            <View style={styles.footerWrap}>
              <TouchableOpacity style={styles.resetBtn} onPress={handleResetDefault}>
                <Ionicons name="refresh-outline" size={18} color="#64748B" />
                <Text style={styles.resetBtnText}>Restaurar Padrão do Sistema</Text>
              </TouchableOpacity>
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
                {editingItem ? 'Editar Etapa' : 'Nova Etapa de Checklist'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Descrição da Etapa / Procedimento:</Text>
            <TextInput
              style={styles.modalInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ex: Verificação de caimento e impermeabilização"
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
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveItem}>
                <Text style={styles.modalSaveText}>Salvar Etapa</Text>
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
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    borderLeftWidth: 4,
    borderLeftColor: '#0284C7',
    margin: 16,
    padding: 12,
    borderRadius: 8,
    gap: 10,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#0369A1',
    lineHeight: 18,
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
    paddingHorizontal: 16,
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
  orderBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  orderBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  contentCol: {
    flex: 1,
    marginRight: 8,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 20,
  },
  itemOrderText: {
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
  footerWrap: {
    marginTop: 20,
    alignItems: 'center',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#475569',
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
