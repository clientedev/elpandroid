import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  Alert, Modal, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { 
  getLocalVisitantes, saveLocalVisitante, deleteLocalVisitante 
} from '../../database/db';
import { Visitante } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

export const VisitorsSettingsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [visitantes, setVisitantes] = useState<Visitante[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form states
  const [nome, setNome] = useState('');
  const [cargo, setCargo] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getLocalVisitantes();
      setVisitantes(list || []);
    } catch (err: any) {
      console.warn('Erro ao carregar visitantes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleOpenCreate() {
    setEditingId(null);
    setNome('');
    setCargo('');
    setEmpresa('');
    setTelefone('');
    setEmail('');
    setModalVisible(true);
  }

  function handleOpenEdit(item: Visitante) {
    setEditingId(item.id);
    setNome(item.nome || '');
    setCargo(item.cargo || '');
    setEmpresa(item.empresa || '');
    setTelefone(item.telefone || '');
    setEmail(item.email || '');
    setModalVisible(true);
  }

  async function handleSave() {
    if (!nome.trim()) {
      Alert.alert('Campo Obrigatório', 'Informe o nome do acompanhante/visitante.');
      return;
    }

    try {
      const vis: Visitante = {
        id: editingId || Date.now(),
        nome: nome.trim(),
        cargo: cargo.trim() || undefined,
        empresa: empresa.trim() || undefined,
        telefone: telefone.trim() || undefined,
        email: email.trim() || undefined,
        ativo: true,
        sync_status: 'pending'
      };

      await saveLocalVisitante(vis, 'pending');
      setModalVisible(false);
      await loadData();
      Alert.alert('Sucesso', editingId ? 'Visitante atualizado com sucesso!' : 'Visitante cadastrado com sucesso!');
    } catch (err: any) {
      Alert.alert('Erro ao Salvar', err.message || 'Falha ao salvar visitante.');
    }
  }

  function handleDelete(item: Visitante) {
    Alert.alert(
      'Remover Visitante',
      `Deseja realmente remover "${item.nome}" do cadastro de acompanhantes frequentes?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLocalVisitante(item.id);
              await loadData();
            } catch (err: any) {
              Alert.alert('Erro', 'Não foi possível remover o visitante.');
            }
          }
        }
      ]
    );
  }

  const filtered = visitantes.filter(v => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (v.nome && v.nome.toLowerCase().includes(q)) ||
      (v.cargo && v.cargo.toLowerCase().includes(q)) ||
      (v.empresa && v.empresa.toLowerCase().includes(q))
    );
  });

  return (
    <View style={styles.container}>
      <Header title="Visitantes e Acompanhantes" showBack />
      <OfflineBanner />

      <View style={styles.content}>
        {/* Barra Superior com Descrição e Ação de Adicionar */}
        <View style={styles.topCard}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.topTitle}>Cadastro de Acompanhantes</Text>
            <Text style={styles.topDesc}>
              Cadastre engenheiros residentes, fiscais, estagiários e visitantes frequentes para inclusão rápida em visitas e relatórios.
            </Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={handleOpenCreate} activeOpacity={0.8}>
            <Ionicons name="person-add" size={18} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Novo</Text>
          </TouchableOpacity>
        </View>

        {/* Campo de Busca */}
        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={18} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nome, cargo ou empresa..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Carregando acompanhantes...</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={48} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>Nenhum visitante cadastrado</Text>
                <Text style={styles.emptySub}>
                  Toque em "Novo" acima para cadastrar acompanhantes que estarão disponíveis para seleção rápida na criação de visitas e laudos.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.cardItem}>
                <View style={styles.avatarWrap}>
                  <Text style={styles.avatarText}>
                    {item.nome.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardNome}>{item.nome}</Text>
                  {(item.cargo || item.empresa) && (
                    <Text style={styles.cardSub}>
                      {[item.cargo, item.empresa].filter(Boolean).join(' • ')}
                    </Text>
                  )}
                  {(item.telefone || item.email) && (
                    <Text style={styles.cardContact}>
                      {[item.telefone, item.email].filter(Boolean).join(' | ')}
                    </Text>
                  )}
                </View>
                <View style={styles.actionsRow}>
                  <TouchableOpacity 
                    style={styles.actionIconBtn} 
                    onPress={() => handleOpenEdit(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="create-outline" size={20} color="#2563EB" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.actionIconBtn} 
                    onPress={() => handleDelete(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}
      </View>

      {/* Modal de Cadastro / Edição */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons 
                  name={editingId ? "person" : "person-add"} 
                  size={20} 
                  color={Colors.primary} 
                />
                <Text style={styles.modalTitle}>
                  {editingId ? 'Editar Visitante / Acompanhante' : 'Novo Visitante / Acompanhante'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nome Completo *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Carlos Eduardo Silva"
                  placeholderTextColor="#94A3B8"
                  value={nome}
                  onChangeText={setNome}
                  autoFocus
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Cargo / Função</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Engenheiro Residente / Fiscal da Obra"
                  placeholderTextColor="#94A3B8"
                  value={cargo}
                  onChangeText={setCargo}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Empresa / Construtora</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Construtora Cyrela / ObraFlow"
                  placeholderTextColor="#94A3B8"
                  value={empresa}
                  onChangeText={setEmpresa}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Telefone / WhatsApp</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: (11) 98765-4321"
                  placeholderTextColor="#94A3B8"
                  value={telefone}
                  onChangeText={setTelefone}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>E-mail</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: carlos.silva@empresa.com.br"
                  placeholderTextColor="#94A3B8"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.cancelBtn} 
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.saveBtn} 
                onPress={handleSave}
              >
                <Ionicons name="checkmark-sharp" size={18} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  topCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Shadows.sm,
  },
  topTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  topDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  addBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  searchWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#0F172A',
  },
  listContainer: {
    paddingBottom: 24,
  },
  cardItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...Shadows.sm,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
  },
  cardContent: {
    flex: 1,
  },
  cardNome: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  cardSub: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
    marginBottom: 2,
  },
  cardContact: {
    fontSize: 11,
    color: '#94A3B8',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  actionIconBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
    color: '#64748B',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalScroll: {
    padding: 18,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    height: 46,
    fontSize: 14,
    color: '#0F172A',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  saveBtn: {
    flex: 2,
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
