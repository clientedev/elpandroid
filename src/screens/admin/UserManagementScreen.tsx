import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, 
  RefreshControl, Alert, Modal, ScrollView, ActivityIndicator, Switch 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { OfflineBanner } from '../../components/OfflineBanner';
import { apiClient } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { User } from '../../types';
import { Colors, Shadows } from '../../theme/colors';

type TipoAcesso = 'admin' | 'master' | 'aprovador' | 'funcionario' | 'visualizador';

interface UserFormData {
  id?: number;
  username: string;
  email: string;
  nome_completo: string;
  cargo: string;
  telefone: string;
  tipo_acesso: TipoAcesso;
  password?: string;
  ativo: boolean;
  is_master?: boolean;
  is_aprovador_express?: boolean;
}

const ROLES_INFO: { [key in TipoAcesso]: { label: string; desc: string; color: string; bg: string; icon: any } } = {
  admin: {
    label: 'Administrador Geral',
    desc: 'Controle total do sistema, edição de usuários e configurações',
    color: '#7C3AED',
    bg: '#F5F3FF',
    icon: 'shield-checkmark',
  },
  master: {
    label: 'Usuário Master',
    desc: 'Privilégio total em relatórios, aprovação técnica e exclusão',
    color: '#2563EB',
    bg: '#EFF6FF',
    icon: 'star',
  },
  aprovador: {
    label: 'Engenheiro Aprovador',
    desc: 'Aprovação de relatórios técnicos e inspeções express',
    color: '#059669',
    bg: '#ECFDF5',
    icon: 'checkmark-circle',
  },
  funcionario: {
    label: 'Técnico de Campo',
    desc: 'Criação de relatórios, anotações de fotos e vistorias',
    color: '#D97706',
    bg: '#FFFBEB',
    icon: 'hammer',
  },
  visualizador: {
    label: 'Visualizador / Cliente',
    desc: 'Apenas consulta e download de relatórios em PDF',
    color: '#475569',
    bg: '#F8FAFC',
    icon: 'eye',
  },
};

export const UserManagementScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user: currentUser } = useAuth();
  const { isOnline } = useNetwork();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'todos' | TipoAcesso>('todos');

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<UserFormData | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Form Fields
  const [formNome, setFormNome] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formTelefone, setFormTelefone] = useState('');
  const [formCargo, setFormCargo] = useState('');
  const [formTipoAcesso, setFormTipoAcesso] = useState<TipoAcesso>('funcionario');
  const [formPassword, setFormPassword] = useState('');
  const [formAtivo, setFormAtivo] = useState(true);
  const [formAprovadorExpress, setFormAprovadorExpress] = useState(false);

  const isMasterOrAdmin = Boolean(
    currentUser?.is_master || currentUser?.username === 'admin'
  );

  const fetchUsers = useCallback(async () => {
    if (!isOnline) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const res = await apiClient.axios.get('/api/users');
      if (Array.isArray(res.data)) {
        setUsers(res.data);
      }
    } catch (err: any) {
      console.warn('Erro ao carregar usuários:', err.message);
      Alert.alert('Aviso', 'Não foi possível carregar a lista de usuários do servidor.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOnline]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchUsers();
  };

  function handleOpenCreate() {
    setEditingUser(null);
    setFormNome('');
    setFormUsername('');
    setFormEmail('');
    setFormTelefone('');
    setFormCargo('');
    setFormTipoAcesso('funcionario');
    setFormPassword('');
    setFormAtivo(true);
    setFormAprovadorExpress(false);
    setModalVisible(true);
  }

  function handleOpenEdit(userToEdit: User) {
    const tipo = (userToEdit.tipo_acesso as TipoAcesso) || (
      userToEdit.username === 'admin' ? 'admin' :
      userToEdit.is_master ? 'master' :
      userToEdit.is_aprovador_express ? 'aprovador' : 'funcionario'
    );

    setEditingUser({
      id: userToEdit.id,
      username: userToEdit.username,
      email: userToEdit.email,
      nome_completo: userToEdit.nome_completo || userToEdit.username,
      cargo: userToEdit.cargo || '',
      telefone: userToEdit.telefone || '',
      tipo_acesso: tipo,
      ativo: Boolean(userToEdit.ativo !== false),
      is_master: userToEdit.is_master,
      is_aprovador_express: userToEdit.is_aprovador_express,
    });

    setFormNome(userToEdit.nome_completo || userToEdit.username);
    setFormUsername(userToEdit.username);
    setFormEmail(userToEdit.email);
    setFormTelefone(userToEdit.telefone || '');
    setFormCargo(userToEdit.cargo || '');
    setFormTipoAcesso(tipo);
    setFormPassword('');
    setFormAtivo(Boolean(userToEdit.ativo !== false));
    setFormAprovadorExpress(Boolean(userToEdit.is_aprovador_express));
    setModalVisible(true);
  }

  async function handleSaveUser() {
    if (!formNome.trim() || !formUsername.trim() || !formEmail.trim()) {
      Alert.alert('Atenção', 'Preencha Nome Completo, Usuário e E-mail.');
      return;
    }

    if (!editingUser && !formPassword.trim()) {
      Alert.alert('Atenção', 'Defina uma senha de acesso inicial para o novo usuário.');
      return;
    }

    setFormLoading(true);
    try {
      const payload: any = {
        nome_completo: formNome.trim(),
        username: formUsername.trim().toLowerCase(),
        email: formEmail.trim().toLowerCase(),
        telefone: formTelefone.trim(),
        cargo: formCargo.trim(),
        tipo_acesso: formTipoAcesso,
        ativo: formAtivo,
        is_aprovador_express: formAprovadorExpress,
      };

      if (formPassword.trim()) {
        payload.password = formPassword.trim();
      }

      if (editingUser?.id) {
        // PUT
        await apiClient.axios.put(`/api/users/${editingUser.id}`, payload);
        Alert.alert('Sucesso', `Usuário ${formUsername} atualizado com sucesso!`);
      } else {
        // POST
        await apiClient.axios.post('/api/users', payload);
        Alert.alert('Sucesso', `Novo usuário ${formUsername} cadastrado com sucesso!`);
      }

      setModalVisible(false);
      fetchUsers();
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Erro ao salvar usuário.';
      Alert.alert('Erro ao Salvar', msg);
    } finally {
      setFormLoading(false);
    }
  }

  async function handleToggleStatus(u: User) {
    if (u.username === 'admin') {
      Alert.alert('Operação Negada', 'O usuário admin principal não pode ser inativado.');
      return;
    }

    const nextStatus = !u.ativo;
    try {
      await apiClient.axios.put(`/api/users/${u.id}`, { ativo: nextStatus });
      fetchUsers();
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.error || 'Não foi possível alterar o status.');
    }
  }

  async function handleDeleteUser(u: User) {
    if (u.username === 'admin') {
      Alert.alert('Operação Negada', 'O administrador do sistema não pode ser removido.');
      return;
    }

    Alert.alert(
      'Desativar Usuário',
      `Deseja realmente desativar o acesso de ${u.nome_completo || u.username}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Confirmar', 
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.axios.delete(`/api/users/${u.id}`);
              Alert.alert('Concluído', `Usuário ${u.username} foi desativado.`);
              fetchUsers();
            } catch (err: any) {
              Alert.alert('Erro', err.response?.data?.error || 'Erro ao desativar usuário.');
            }
          }
        }
      ]
    );
  }

  // Filtragem
  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    const matchesSearch = 
      (u.nome_completo || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.cargo || '').toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (roleFilter === 'todos') return true;
    if (roleFilter === 'admin') return u.username === 'admin' || (u.is_master && u.tipo_acesso === 'admin');
    if (roleFilter === 'master') return u.is_master && u.username !== 'admin';
    if (roleFilter === 'aprovador') return u.is_aprovador_express || u.tipo_acesso === 'aprovador';
    if (roleFilter === 'visualizador') return u.tipo_acesso === 'visualizador';
    if (roleFilter === 'funcionario') return !u.is_master && !u.is_aprovador_express && u.tipo_acesso !== 'visualizador';

    return true;
  });

  if (!isMasterOrAdmin) {
    return (
      <View style={styles.container}>
        <Header title="Gestão de Usuários" showBack onBack={() => navigation.goBack()} />
        <View style={styles.unauthorizedBox}>
          <Ionicons name="lock-closed" size={56} color={Colors.danger} />
          <Text style={styles.unauthorizedTitle}>Acesso Restrito</Text>
          <Text style={styles.unauthorizedDesc}>
            A gestão de usuários e perfis de acesso é exclusiva para Administradores e Usuários Master do sistema.
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>Voltar ao Início</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header 
        title="Gestão de Usuários" 
        subtitle="Administração de Acessos & Perfis"
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity 
            style={styles.addBtn}
            onPress={handleOpenCreate}
            activeOpacity={0.8}
          >
            <Ionicons name="person-add" size={18} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Novo</Text>
          </TouchableOpacity>
        }
      />
      <OfflineBanner />

      {/* Estatísticas Rápidas */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{users.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: '#7C3AED' }]}>
            {users.filter(u => u.is_master || u.username === 'admin').length}
          </Text>
          <Text style={styles.statLabel}>Admins/Masters</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: '#059669' }]}>
            {users.filter(u => u.is_aprovador_express).length}
          </Text>
          <Text style={styles.statLabel}>Aprovadores</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: '#2563EB' }]}>
            {users.filter(u => u.ativo !== false).length}
          </Text>
          <Text style={styles.statLabel}>Ativos</Text>
        </View>
      </View>

      {/* Barra de Pesquisa */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput 
          style={styles.searchInput}
          placeholder="Buscar por nome, login, e-mail ou cargo..."
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filtros de Tipo de Acesso */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
        {[
          { key: 'todos', label: 'Todos' },
          { key: 'admin', label: '👑 Admin' },
          { key: 'master', label: '⭐ Master' },
          { key: 'aprovador', label: '🛡️ Aprovador' },
          { key: 'funcionario', label: '🛠️ Técnico' },
          { key: 'visualizador', label: '👁️ Visualizador' },
        ].map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.filterChip, roleFilter === tab.key && styles.filterChipActive]}
            onPress={() => setRoleFilter(tab.key as any)}
          >
            <Text style={[styles.filterChipText, roleFilter === tab.key && styles.filterChipTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Lista de Usuários */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ marginTop: 10, color: Colors.textMuted }}>Carregando usuários do servidor...</Text>
        </View>
      ) : (
        <FlatList 
          data={filteredUsers}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>Nenhum usuário encontrado</Text>
              <Text style={styles.emptySub}>
                Toque em "+ Novo" no canto superior direito para cadastrar um novo usuário.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const tipo: TipoAcesso = (item.tipo_acesso as TipoAcesso) || (
              item.username === 'admin' ? 'admin' :
              item.is_master ? 'master' :
              item.is_aprovador_express ? 'aprovador' : 'funcionario'
            );
            const roleMeta = ROLES_INFO[tipo] || ROLES_INFO.funcionario;

            return (
              <View style={[styles.userCard, item.ativo === false && styles.userCardInactive]}>
                <View style={styles.userCardHeader}>
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>
                      {(item.nome_completo || item.username).substring(0, 2).toUpperCase()}
                    </Text>
                  </View>

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.userName} numberOfLines={1}>
                        {item.nome_completo || item.username}
                      </Text>
                      {item.ativo === false && (
                        <View style={styles.inactiveBadge}>
                          <Text style={styles.inactiveBadgeText}>Inativo</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.userHandle}>@{item.username}</Text>
                  </View>

                  <View style={[styles.roleBadge, { backgroundColor: roleMeta.bg, borderColor: roleMeta.color }]}>
                    <Ionicons name={roleMeta.icon} size={12} color={roleMeta.color} />
                    <Text style={[styles.roleBadgeText, { color: roleMeta.color }]}>
                      {roleMeta.label}
                    </Text>
                  </View>
                </View>

                {/* Detalhes de Contato */}
                <View style={styles.userDetailsRow}>
                  <View style={styles.detailItem}>
                    <Ionicons name="mail-outline" size={13} color={Colors.textMuted} />
                    <Text style={styles.detailText} numberOfLines={1}>{item.email}</Text>
                  </View>
                  {item.cargo ? (
                    <View style={styles.detailItem}>
                      <Ionicons name="briefcase-outline" size={13} color={Colors.textMuted} />
                      <Text style={styles.detailText} numberOfLines={1}>{item.cargo}</Text>
                    </View>
                  ) : null}
                  {item.telefone ? (
                    <View style={styles.detailItem}>
                      <Ionicons name="call-outline" size={13} color={Colors.textMuted} />
                      <Text style={styles.detailText}>{item.telefone}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Barra de Ações */}
                <View style={styles.userActionsRow}>
                  <TouchableOpacity 
                    style={styles.editActionBtn}
                    onPress={() => handleOpenEdit(item)}
                  >
                    <Ionicons name="pencil" size={14} color={Colors.primary} />
                    <Text style={styles.editActionText}>Editar Perfil</Text>
                  </TouchableOpacity>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity 
                      style={[styles.statusToggleBtn, item.ativo === false ? styles.activateBtn : styles.deactivateBtn]}
                      onPress={() => handleToggleStatus(item)}
                    >
                      <Ionicons 
                        name={item.ativo === false ? "checkmark-circle-outline" : "ban-outline"} 
                        size={14} 
                        color={item.ativo === false ? "#059669" : "#D97706"} 
                      />
                      <Text style={[styles.statusToggleText, { color: item.ativo === false ? "#059669" : "#D97706" }]}>
                        {item.ativo === false ? 'Ativar' : 'Desativar'}
                      </Text>
                    </TouchableOpacity>

                    {item.username !== 'admin' && (
                      <TouchableOpacity 
                        style={styles.deleteActionBtn}
                        onPress={() => handleDeleteUser(item)}
                      >
                        <Ionicons name="trash-outline" size={14} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* MODAL DE CRIAÇÃO / EDIÇÃO DE USUÁRIO COM TODOS OS TIPOS DE ACESSO */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {editingUser ? `Editar: @${editingUser.username}` : 'Cadastrar Novo Usuário'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  Atribua permissões e tipo de acesso no sistema
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* 1. Nome Completo */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nome Completo *</Text>
                <TextInput 
                  style={styles.input}
                  placeholder="Ex: Gabriel Eduardo Silva"
                  value={formNome}
                  onChangeText={setFormNome}
                />
              </View>

              {/* 2. Login e E-mail */}
              <View style={styles.rowInputs}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Login / Usuário *</Text>
                  <TextInput 
                    style={styles.input}
                    placeholder="Ex: gabriel.silva"
                    value={formUsername}
                    onChangeText={setFormUsername}
                    autoCapitalize="none"
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1.2 }]}>
                  <Text style={styles.inputLabel}>E-mail *</Text>
                  <TextInput 
                    style={styles.input}
                    placeholder="email@empresa.com"
                    value={formEmail}
                    onChangeText={setFormEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {/* 3. Cargo e Telefone */}
              <View style={styles.rowInputs}>
                <View style={[styles.inputGroup, { flex: 1.2 }]}>
                  <Text style={styles.inputLabel}>Cargo / Função</Text>
                  <TextInput 
                    style={styles.input}
                    placeholder="Ex: Engenheiro Fiscal"
                    value={formCargo}
                    onChangeText={setFormCargo}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Telefone</Text>
                  <TextInput 
                    style={styles.input}
                    placeholder="(11) 99999-9999"
                    value={formTelefone}
                    onChangeText={setFormTelefone}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              {/* 4. SELEÇÃO DO TIPO DE ACESSO (TODOS OS TIPOS DO SISTEMA) */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Tipo de Acesso & Hierarquia *</Text>
                <View style={styles.rolesGrid}>
                  {(Object.keys(ROLES_INFO) as TipoAcesso[]).map((rKey) => {
                    const rMeta = ROLES_INFO[rKey];
                    const isSelected = formTipoAcesso === rKey;
                    return (
                      <TouchableOpacity
                        key={rKey}
                        style={[
                          styles.roleSelectCard,
                          isSelected && { borderColor: rMeta.color, backgroundColor: rMeta.bg }
                        ]}
                        onPress={() => setFormTipoAcesso(rKey)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Ionicons 
                            name={isSelected ? "radio-button-on" : "radio-button-off"} 
                            size={18} 
                            color={isSelected ? rMeta.color : Colors.textMuted} 
                          />
                          <Text style={[styles.roleSelectTitle, isSelected && { color: rMeta.color, fontWeight: 'bold' }]}>
                            {rMeta.label}
                          </Text>
                        </View>
                        <Text style={styles.roleSelectDesc}>{rMeta.desc}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* 5. Senha */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  {editingUser ? 'Alterar Senha (deixe em branco para manter)' : 'Senha de Acesso Inicial *'}
                </Text>
                <TextInput 
                  style={styles.input}
                  placeholder={editingUser ? "Digite nova senha ou deixe vazio" : "Mínimo 6 caracteres"}
                  value={formPassword}
                  onChangeText={setFormPassword}
                  secureTextEntry
                />
              </View>

              {/* 6. Opções adicionais */}
              <View style={styles.switchGroup}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Aprovador de Relatórios Express</Text>
                  <Text style={styles.switchSub}>Permite aprovar vistorias técnicas express pelo app</Text>
                </View>
                <Switch 
                  value={formAprovadorExpress || formTipoAcesso === 'admin' || formTipoAcesso === 'master' || formTipoAcesso === 'aprovador'}
                  onValueChange={setFormAprovadorExpress}
                  trackColor={{ true: Colors.primary, false: '#CBD5E1' }}
                  disabled={formTipoAcesso === 'admin' || formTipoAcesso === 'master' || formTipoAcesso === 'aprovador'}
                />
              </View>

              <View style={styles.switchGroup}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Usuário Ativo</Text>
                  <Text style={styles.switchSub}>Usuários inativos não conseguem realizar login</Text>
                </View>
                <Switch 
                  value={formAtivo}
                  onValueChange={setFormAtivo}
                  trackColor={{ true: '#10B981', false: '#CBD5E1' }}
                  disabled={formUsername === 'admin'}
                />
              </View>

              {/* Botão Salvar */}
              <TouchableOpacity 
                style={styles.saveUserBtn}
                onPress={handleSaveUser}
                disabled={formLoading}
              >
                {formLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done" size={20} color="#FFFFFF" />
                    <Text style={styles.saveUserBtnText}>
                      {editingUser ? 'Salvar Alterações' : 'Cadastrar Usuário'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  addBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    justifyContent: 'space-between',
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statNum: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
  },
  filterScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  list: {
    padding: 16,
    paddingTop: 4,
    paddingBottom: 40,
  },
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  userCardInactive: {
    opacity: 0.65,
    backgroundColor: '#F8FAFC',
  },
  userCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryBackground,
    borderWidth: 1.5,
    borderColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  userName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.text,
  },
  userHandle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 1,
  },
  inactiveBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  inactiveBadgeText: {
    color: '#DC2626',
    fontSize: 10,
    fontWeight: 'bold',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  userDetailsRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 4,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  userActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  editActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  editActionText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  statusToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  activateBtn: {
    backgroundColor: '#ECFDF5',
  },
  deactivateBtn: {
    backgroundColor: '#FFFBEB',
  },
  statusToggleText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  deleteActionBtn: {
    padding: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  unauthorizedBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  unauthorizedTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 16,
  },
  unauthorizedDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  backBtn: {
    marginTop: 20,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  inputGroup: {
    marginBottom: 12,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    color: Colors.text,
  },
  rolesGrid: {
    gap: 8,
  },
  roleSelectCard: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#FFFFFF',
  },
  roleSelectTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  roleSelectDesc: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
    marginLeft: 26,
  },
  switchGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.text,
  },
  switchSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  saveUserBtn: {
    backgroundColor: Colors.primary,
    height: 48,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 20,
    ...Shadows.md,
  },
  saveUserBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
