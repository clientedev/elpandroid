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
import { getLocalUsers, saveLocalUsers } from '../../database/db';

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
    desc: 'Controle absoluto de usuários, ajustes de sistema e configurações globais',
    color: '#7C3AED',
    bg: '#F5F3FF',
    icon: 'shield-checkmark',
  },
  master: {
    label: 'Usuário Master',
    desc: 'Privilégio total em relatórios, aprovação técnica, controle e exclusão de obras',
    color: '#2563EB',
    bg: '#EFF6FF',
    icon: 'star',
  },
  aprovador: {
    label: 'Engenheiro Aprovador',
    desc: 'Assinatura e aprovação de laudos técnicos e inspeções express',
    color: '#059669',
    bg: '#ECFDF5',
    icon: 'ribbon',
  },
  funcionario: {
    label: 'Técnico de Campo',
    desc: 'Criação de vistorias, anotações fotográficas e relatórios técnicos',
    color: '#D97706',
    bg: '#FFFBEB',
    icon: 'hammer',
  },
  visualizador: {
    label: 'Visualizador / Cliente',
    desc: 'Apenas consulta, leitura e download de laudos finalizados em PDF',
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
  const [showPassword, setShowPassword] = useState(false);

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
    // 1. Carrega imediatamente do SQLite local para resposta instantânea
    try {
      const localUsers = await getLocalUsers();
      if (localUsers && localUsers.length > 0) {
        setUsers(localUsers);
        setLoading(false);
      }
    } catch {}

    if (!isOnline) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const res = await apiClient.axios.get('/api/users', {
        params: {
          user_id: currentUser?.id,
          username: currentUser?.username,
        },
        timeout: 10000,
      });
      if (Array.isArray(res.data)) {
        setUsers(res.data);
        await saveLocalUsers(res.data);
      }
    } catch (err: any) {
      console.warn('Erro ao carregar usuários:', err.message);
      const localUsers = await getLocalUsers();
      if (!localUsers || localUsers.length === 0) {
        Alert.alert('Aviso', 'Não foi possível carregar a lista de usuários do servidor.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOnline, currentUser]);

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
    setShowPassword(false);
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
    setShowPassword(false);
    setFormAtivo(Boolean(userToEdit.ativo !== false));
    setFormAprovadorExpress(Boolean(userToEdit.is_aprovador_express));
    setModalVisible(true);
  }

  async function handleSaveUser() {
    if (!formNome.trim() || !formUsername.trim() || !formEmail.trim()) {
      Alert.alert('Campos Obrigatórios', 'Por favor, informe Nome Completo, Login de Usuário e E-mail.');
      return;
    }

    if (!editingUser && !formPassword.trim()) {
      Alert.alert('Senha Obrigatória', 'Defina uma senha de acesso inicial para o novo usuário.');
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
        is_aprovador_express: formAprovadorExpress || formTipoAcesso === 'admin' || formTipoAcesso === 'master' || formTipoAcesso === 'aprovador',
      };

      if (formPassword.trim()) {
        payload.password = formPassword.trim();
      }

      if (editingUser?.id) {
        await apiClient.axios.put(`/api/users/${editingUser.id}`, payload);
        Alert.alert('Sucesso', `Perfil do usuário @${formUsername} atualizado com êxito!`);
      } else {
        await apiClient.axios.post('/api/users', payload);
        Alert.alert('Sucesso', `Novo usuário @${formUsername} cadastrado no sistema!`);
      }

      setModalVisible(false);
      fetchUsers();
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Erro ao processar dados do usuário.';
      Alert.alert('Erro ao Salvar', msg);
    } finally {
      setFormLoading(false);
    }
  }

  async function handleToggleStatus(u: User) {
    if (u.username === 'admin') {
      Alert.alert('Operação Negada', 'O administrador master do sistema não pode ser inativado.');
      return;
    }

    const nextStatus = !u.ativo;
    try {
      await apiClient.axios.put(`/api/users/${u.id}`, { ativo: nextStatus });
      fetchUsers();
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.error || 'Não foi possível alterar o status do usuário.');
    }
  }

  async function handleDeleteUser(u: User) {
    if (u.username === 'admin') {
      Alert.alert('Operação Negada', 'O administrador do sistema não pode ser removido.');
      return;
    }

    Alert.alert(
      'Desativar Usuário',
      `Deseja realmente desativar o acesso de ${u.nome_completo || u.username} ao sistema?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Confirmar', 
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.axios.delete(`/api/users/${u.id}`);
              Alert.alert('Concluído', `Usuário @${u.username} foi desativado.`);
              fetchUsers();
            } catch (err: any) {
              Alert.alert('Erro', err.response?.data?.error || 'Erro ao desativar usuário.');
            }
          }
        }
      ]
    );
  }

  // Filtragem da lista
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

  // Estatísticas calculadas
  const totalCount = users.length;
  const adminMasterCount = users.filter(u => u.is_master || u.username === 'admin').length;
  const aprovadorCount = users.filter(u => u.is_aprovador_express || u.tipo_acesso === 'aprovador').length;
  const ativoCount = users.filter(u => u.ativo !== false).length;

  if (!isMasterOrAdmin) {
    return (
      <View style={styles.container}>
        <Header title="Gestão de Usuários" showBack onBack={() => navigation.goBack()} />
        <View style={styles.unauthorizedBox}>
          <View style={styles.unauthorizedIconCircle}>
            <Ionicons name="lock-closed" size={38} color="#DC2626" />
          </View>
          <Text style={styles.unauthorizedTitle}>Acesso Restrito</Text>
          <Text style={styles.unauthorizedDesc}>
            A gestão de usuários e concessão de privilégios é restrita a Administradores Gerais e Usuários Master.
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Text style={styles.backBtnText}>Voltar ao Painel</Text>
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
            <Ionicons name="person-add" size={16} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Novo Usuário</Text>
          </TouchableOpacity>
        }
      />
      <OfflineBanner />

      {/* KPI CARDS: Estatísticas com Design Moderno */}
      <View style={styles.kpiContainer}>
        <View style={[styles.kpiCard, { borderLeftColor: '#2563EB' }]}>
          <View style={styles.kpiHeader}>
            <Text style={styles.kpiLabel}>Total</Text>
            <View style={[styles.kpiIconBox, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="people" size={14} color="#2563EB" />
            </View>
          </View>
          <Text style={styles.kpiValue}>{totalCount}</Text>
        </View>

        <View style={[styles.kpiCard, { borderLeftColor: '#7C3AED' }]}>
          <View style={styles.kpiHeader}>
            <Text style={styles.kpiLabel}>Admins/Master</Text>
            <View style={[styles.kpiIconBox, { backgroundColor: '#F5F3FF' }]}>
              <Ionicons name="shield-checkmark" size={14} color="#7C3AED" />
            </View>
          </View>
          <Text style={[styles.kpiValue, { color: '#7C3AED' }]}>{adminMasterCount}</Text>
        </View>

        <View style={[styles.kpiCard, { borderLeftColor: '#059669' }]}>
          <View style={styles.kpiHeader}>
            <Text style={styles.kpiLabel}>Aprovadores</Text>
            <View style={[styles.kpiIconBox, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="ribbon" size={14} color="#059669" />
            </View>
          </View>
          <Text style={[styles.kpiValue, { color: '#059669' }]}>{aprovadorCount}</Text>
        </View>

        <View style={[styles.kpiCard, { borderLeftColor: '#0EA5E9' }]}>
          <View style={styles.kpiHeader}>
            <Text style={styles.kpiLabel}>Ativos</Text>
            <View style={[styles.kpiIconBox, { backgroundColor: '#F0F9FF' }]}>
              <Ionicons name="checkmark-circle" size={14} color="#0EA5E9" />
            </View>
          </View>
          <Text style={[styles.kpiValue, { color: '#0EA5E9' }]}>{ativoCount}</Text>
        </View>
      </View>

      {/* Barra de Pesquisa Profissional */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#94A3B8" />
          <TextInput 
            style={styles.searchInput}
            placeholder="Buscar por nome, login @, e-mail ou cargo..."
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
      </View>

      {/* Filtros em Chips Horizontais com Indicadores de Quantidade */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {[
            { key: 'todos', label: 'Todos', count: totalCount },
            { key: 'admin', label: '👑 Admin', count: users.filter(u => u.username === 'admin' || (u.is_master && u.tipo_acesso === 'admin')).length },
            { key: 'master', label: '⭐ Master', count: users.filter(u => u.is_master && u.username !== 'admin').length },
            { key: 'aprovador', label: '🛡️ Aprovador', count: aprovadorCount },
            { key: 'funcionario', label: '🛠️ Técnico', count: users.filter(u => !u.is_master && !u.is_aprovador_express && u.tipo_acesso !== 'visualizador').length },
            { key: 'visualizador', label: '👁️ Visualizador', count: users.filter(u => u.tipo_acesso === 'visualizador').length },
          ].map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.filterChip, roleFilter === tab.key && styles.filterChipActive]}
              onPress={() => setRoleFilter(tab.key as any)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, roleFilter === tab.key && styles.filterChipTextActive]}>
                {tab.label}
              </Text>
              <View style={[styles.filterChipBadge, roleFilter === tab.key && styles.filterChipBadgeActive]}>
                <Text style={[styles.filterChipBadgeText, roleFilter === tab.key && styles.filterChipBadgeTextActive]}>
                  {tab.count}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Lista de Usuários */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Sincronizando usuários com a nuvem...</Text>
        </View>
      ) : (
        <FlatList 
          data={filteredUsers}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="people-outline" size={36} color="#94A3B8" />
              </View>
              <Text style={styles.emptyTitle}>Nenhum usuário encontrado</Text>
              <Text style={styles.emptySub}>
                {search.length > 0 
                  ? 'Nenhum resultado corresponde à sua pesquisa.' 
                  : 'Toque no botão "+ Novo Usuário" no topo para criar o primeiro cadastro.'}
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
            const isSelf = currentUser?.id === item.id || currentUser?.username === item.username;

            return (
              <View style={[styles.userCard, item.ativo === false && styles.userCardInactive]}>
                {/* Header do Card */}
                <View style={styles.userCardHeader}>
                  <View style={[styles.userAvatarContainer, { borderColor: roleMeta.color }]}>
                    <Text style={[styles.userAvatarText, { color: roleMeta.color }]}>
                      {(item.nome_completo || item.username).substring(0, 2).toUpperCase()}
                    </Text>
                    {/* Indicador de Status Ativo/Inativo */}
                    <View style={[styles.statusDot, { backgroundColor: item.ativo !== false ? '#10B981' : '#94A3B8' }]} />
                  </View>

                  <View style={styles.userMainInfo}>
                    <View style={styles.userNameRow}>
                      <Text style={styles.userName} numberOfLines={1}>
                        {item.nome_completo || item.username}
                      </Text>
                      {isSelf && (
                        <View style={styles.selfBadge}>
                          <Text style={styles.selfBadgeText}>Você</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.userHandle}>@{item.username}</Text>
                  </View>

                  <View style={[styles.roleBadge, { backgroundColor: roleMeta.bg, borderColor: roleMeta.color }]}>
                    <Ionicons name={roleMeta.icon} size={13} color={roleMeta.color} />
                    <Text style={[styles.roleBadgeText, { color: roleMeta.color }]}>
                      {roleMeta.label}
                    </Text>
                  </View>
                </View>

                {/* Detalhes de Cargo e Contato */}
                <View style={styles.userDetailsGrid}>
                  <View style={styles.detailRow}>
                    <Ionicons name="mail-outline" size={13} color="#64748B" />
                    <Text style={styles.detailText} numberOfLines={1}>{item.email}</Text>
                  </View>

                  {item.cargo ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="briefcase-outline" size={13} color="#64748B" />
                      <Text style={styles.detailText} numberOfLines={1}>{item.cargo}</Text>
                    </View>
                  ) : null}

                  {item.telefone ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="call-outline" size={13} color="#64748B" />
                      <Text style={styles.detailText}>{item.telefone}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Barra de Ações do Card */}
                <View style={styles.cardActionsRow}>
                  <TouchableOpacity 
                    style={styles.editBtn}
                    onPress={() => handleOpenEdit(item)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="create-outline" size={14} color="#2563EB" />
                    <Text style={styles.editBtnText}>Editar Perfil</Text>
                  </TouchableOpacity>

                  <View style={styles.secondaryActions}>
                    <TouchableOpacity 
                      style={[
                        styles.statusToggleBtn, 
                        item.ativo === false ? styles.statusBtnActivate : styles.statusBtnDeactivate
                      ]}
                      onPress={() => handleToggleStatus(item)}
                      activeOpacity={0.7}
                    >
                      <Ionicons 
                        name={item.ativo === false ? "checkmark-circle-outline" : "ban-outline"} 
                        size={14} 
                        color={item.ativo === false ? "#059669" : "#D97706"} 
                      />
                      <Text style={[
                        styles.statusToggleText, 
                        { color: item.ativo === false ? "#059669" : "#D97706" }
                      ]}>
                        {item.ativo === false ? 'Ativar' : 'Desativar'}
                      </Text>
                    </TouchableOpacity>

                    {item.username !== 'admin' && (
                      <TouchableOpacity 
                        style={styles.deleteUserBtn}
                        onPress={() => handleDeleteUser(item)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={15} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* MODAL PROFISSIONAL DE CRIAÇÃO / EDIÇÃO DE USUÁRIO */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {editingUser ? `Editar: @${editingUser.username}` : 'Cadastrar Novo Usuário'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  Atribua permissões e nível de acesso no ObraFlow / ELP
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
              {/* SEÇÃO 1: DADOS PESSOAIS */}
              <View style={styles.formSection}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="person-outline" size={16} color="#2563EB" />
                  <Text style={styles.sectionTitle}>1. Identificação & Contato</Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Nome Completo *</Text>
                  <TextInput 
                    style={styles.input}
                    placeholder="Ex: Gabriel Eduardo Silva"
                    placeholderTextColor="#94A3B8"
                    value={formNome}
                    onChangeText={setFormNome}
                  />
                </View>

                <View style={styles.rowInputs}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Login @ (Usuário) *</Text>
                    <TextInput 
                      style={styles.input}
                      placeholder="gabriel.silva"
                      placeholderTextColor="#94A3B8"
                      value={formUsername}
                      onChangeText={setFormUsername}
                      autoCapitalize="none"
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1.2 }]}>
                    <Text style={styles.inputLabel}>E-mail Corporativo *</Text>
                    <TextInput 
                      style={styles.input}
                      placeholder="email@empresa.com"
                      placeholderTextColor="#94A3B8"
                      value={formEmail}
                      onChangeText={setFormEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                <View style={styles.rowInputs}>
                  <View style={[styles.inputGroup, { flex: 1.2 }]}>
                    <Text style={styles.inputLabel}>Cargo / Função</Text>
                    <TextInput 
                      style={styles.input}
                      placeholder="Ex: Engenheiro Fiscal"
                      placeholderTextColor="#94A3B8"
                      value={formCargo}
                      onChangeText={setFormCargo}
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Telefone / WhatsApp</Text>
                    <TextInput 
                      style={styles.input}
                      placeholder="(11) 99999-9999"
                      placeholderTextColor="#94A3B8"
                      value={formTelefone}
                      onChangeText={setFormTelefone}
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>
              </View>

              {/* SEÇÃO 2: SELEÇÃO DO TIPO DE ACESSO */}
              <View style={styles.formSection}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="shield-outline" size={16} color="#7C3AED" />
                  <Text style={styles.sectionTitle}>2. Nível de Hierarquia & Permissões *</Text>
                </View>

                <View style={styles.rolesGrid}>
                  {(Object.keys(ROLES_INFO) as TipoAcesso[]).map((rKey) => {
                    const rMeta = ROLES_INFO[rKey];
                    const isSelected = formTipoAcesso === rKey;
                    return (
                      <TouchableOpacity
                        key={rKey}
                        style={[
                          styles.roleSelectCard,
                          isSelected && { borderColor: rMeta.color, backgroundColor: rMeta.bg, borderWidth: 1.5 }
                        ]}
                        onPress={() => setFormTipoAcesso(rKey)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.roleCardHeader}>
                          <Ionicons 
                            name={isSelected ? "radio-button-on" : "radio-button-off"} 
                            size={18} 
                            color={isSelected ? rMeta.color : "#94A3B8"} 
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

              {/* SEÇÃO 3: CREDENCIAIS DE ACESSO */}
              <View style={styles.formSection}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="key-outline" size={16} color="#059669" />
                  <Text style={styles.sectionTitle}>3. Senha de Acesso</Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    {editingUser ? 'Alterar Senha (deixe vazio para manter a atual)' : 'Senha Inicial *'}
                  </Text>
                  <View style={styles.passwordInputContainer}>
                    <TextInput 
                      style={styles.passwordInput}
                      placeholder={editingUser ? "Digite para alterar" : "Mínimo 6 caracteres"}
                      placeholderTextColor="#94A3B8"
                      value={formPassword}
                      onChangeText={setFormPassword}
                      secureTextEntry={!showPassword}
                    />
                    <TouchableOpacity 
                      onPress={() => setShowPassword(!showPassword)} 
                      style={styles.eyeBtn}
                    >
                      <Ionicons 
                        name={showPassword ? "eye-off-outline" : "eye-outline"} 
                        size={20} 
                        color="#64748B" 
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* SEÇÃO 4: CONFIGURAÇÕES EXTRAS */}
              <View style={styles.formSection}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="options-outline" size={16} color="#D97706" />
                  <Text style={styles.sectionTitle}>4. Configurações Adicionais</Text>
                </View>

                <View style={styles.switchGroup}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.switchTitle}>Aprovador de Relatórios Express</Text>
                    <Text style={styles.switchSub}>Permite homologar inspeções técnicas express pelo app</Text>
                  </View>
                  <Switch 
                    value={formAprovadorExpress || formTipoAcesso === 'admin' || formTipoAcesso === 'master' || formTipoAcesso === 'aprovador'}
                    onValueChange={setFormAprovadorExpress}
                    trackColor={{ true: Colors.primary, false: '#CBD5E1' }}
                    disabled={formTipoAcesso === 'admin' || formTipoAcesso === 'master' || formTipoAcesso === 'aprovador'}
                  />
                </View>

                <View style={[styles.switchGroup, { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.switchTitle}>Usuário Ativo</Text>
                    <Text style={styles.switchSub}>Permite login e sincronização no aplicativo</Text>
                  </View>
                  <Switch 
                    value={formAtivo}
                    onValueChange={setFormAtivo}
                    trackColor={{ true: '#10B981', false: '#CBD5E1' }}
                    disabled={editingUser?.username === 'admin'}
                  />
                </View>
              </View>
            </ScrollView>

            {/* Modal Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.modalCancelBtn}
                onPress={() => setModalVisible(false)}
                disabled={formLoading}
              >
                <Text style={styles.modalCancelBtnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalSubmitBtn, formLoading && { opacity: 0.7 }]}
                onPress={handleSaveUser}
                disabled={formLoading}
              >
                {formLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-sharp" size={18} color="#FFFFFF" />
                    <Text style={styles.modalSubmitBtnText}>
                      {editingUser ? 'Salvar Alterações' : 'Cadastrar Usuário'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
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
  unauthorizedBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  unauthorizedIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  unauthorizedTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 8,
  },
  unauthorizedDesc: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  backBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  addBtn: {
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    ...Shadows.sm,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  // KPI Analytics
  kpiContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    ...Shadows.sm,
  },
  kpiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  kpiIconBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  // Search
  searchWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 44,
    gap: 8,
    ...Shadows.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  // Filter Bar
  filterBar: {
    paddingBottom: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filterChipBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  filterChipBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  filterChipBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#475569',
  },
  filterChipBadgeTextActive: {
    color: '#FFFFFF',
  },
  // List
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    color: '#64748B',
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  // User Card
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  userCardInactive: {
    opacity: 0.65,
    backgroundColor: '#F8FAFC',
  },
  userCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  userAvatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    position: 'relative',
  },
  userAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    position: 'absolute',
    bottom: -1,
    right: -1,
  },
  userMainInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
    flexShrink: 1,
  },
  selfBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  selfBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  userHandle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  userDetailsGrid: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    gap: 6,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  detailText: {
    fontSize: 12,
    color: '#475569',
    flex: 1,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  secondaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBtnActivate: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusBtnDeactivate: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  statusToggleText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  deleteUserBtn: {
    padding: 7,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingBottom: 20,
    ...Shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalScroll: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 16,
  },
  formSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  inputGroup: {
    gap: 4,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    color: '#0F172A',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    height: 42,
    paddingHorizontal: 12,
  },
  passwordInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    height: '100%',
  },
  eyeBtn: {
    padding: 6,
  },
  rolesGrid: {
    gap: 8,
  },
  roleSelectCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  roleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleSelectTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  roleSelectDesc: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
    marginLeft: 26,
  },
  switchGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  switchSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  modalSubmitBtn: {
    flex: 1.5,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...Shadows.sm,
  },
  modalSubmitBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
