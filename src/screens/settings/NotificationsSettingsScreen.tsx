import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import {
  getLocalNotificacoes,
  markAllNotificacoesAsRead,
  clearLocalNotificacoes,
} from '../../database/db';
import { Notificacao } from '../../types';
import { notificationService } from '../../services/notificationService';

export default function NotificationsSettingsScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const list = await getLocalNotificacoes(user?.id);
      setNotificacoes(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTestNotification = async () => {
    const perm = await notificationService.requestPermission();
    if (!perm) {
      Alert.alert(
        'Permissão Necessária',
        'Por favor, habilite as notificações do ObraFlow nas configurações do Android.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Abrir Configurações', onPress: () => notificationService.openSettings() },
        ]
      );
      return;
    }

    await notificationService.notify({
      titulo: 'Notificação de Teste - ObraFlow',
      mensagem: 'As notificações do aplicativo estão funcionando perfeitamente em seu aparelho!',
      tipo: 'sistema',
      userId: user?.id,
    });
    Alert.alert('Sucesso', 'Notificação de teste disparada!');
    await loadData();
  };

  const handleMarkAllRead = async () => {
    await markAllNotificacoesAsRead(user?.id);
    await loadData();
  };

  const handleClearAll = () => {
    Alert.alert(
      'Limpar Notificações',
      'Deseja apagar todas as notificações recebidas?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar',
          style: 'destructive',
          onPress: async () => {
            await clearLocalNotificacoes(user?.id);
            await loadData();
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: Notificacao }) => (
    <View style={[styles.card, !item.lida && styles.cardUnread]}>
      <View style={styles.iconWrap}>
        <Ionicons
          name={item.lida ? 'notifications-outline' : 'notifications'}
          size={20}
          color={item.lida ? '#64748B' : '#2563EB'}
        />
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.itemTitle}>{item.titulo}</Text>
        <Text style={styles.itemMessage}>{item.mensagem}</Text>
        <Text style={styles.itemDate}>
          {item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : ''}
        </Text>
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
          <Text style={styles.headerTitle}>Notificações</Text>
          <Text style={styles.headerSubtitle}>Alertas de relatórios e visitas</Text>
        </View>
      </View>

      {/* Teste Banner */}
      <View style={styles.testBanner}>
        <View style={{ flex: 1 }}>
          <Text style={styles.testTitle}>Notificações no Dispositivo</Text>
          <Text style={styles.testSubtitle}>
            Teste os avisos sonoros e popups no seu celular.
          </Text>
        </View>
        <TouchableOpacity style={styles.testBtn} onPress={handleTestNotification}>
          <Ionicons name="paper-plane-outline" size={16} color="#FFFFFF" />
          <Text style={styles.testBtnText}>Testar</Text>
        </TouchableOpacity>
      </View>

      {/* Subheader */}
      <View style={styles.actionRow}>
        <Text style={styles.sectionTitle}>Histórico ({notificacoes.length})</Text>
        <View style={styles.actionBtnsGroup}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleMarkAllRead}>
            <Text style={styles.actionBtnText}>Marcar Lidas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleClearAll}>
            <Text style={[styles.actionBtnText, { color: '#DC2626' }]}>Limpar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Lista */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={notificacoes}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="notifications-off-outline" size={48} color="#94A3B8" />
              <Text style={styles.emptyTitle}>Nenhuma notificação</Text>
              <Text style={styles.emptyText}>Você receberá avisos quando houver atualizações.</Text>
            </View>
          }
        />
      )}
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
  testBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
  },
  testTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  testSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  actionBtnsGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardUnread: {
    borderColor: '#BFDBFE',
    backgroundColor: '#F8FAFC',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  cardContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  itemMessage: {
    fontSize: 13,
    color: '#475569',
    marginTop: 2,
    lineHeight: 18,
  },
  itemDate: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 6,
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
  },
});
