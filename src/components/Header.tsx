import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar, Image, 
  Modal, ScrollView, Dimensions, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useNetwork } from '../contexts/NetworkContext';
import { Colors, Shadows } from '../theme/colors';
import { 
  getLocalNotificacoes, markNotificacaoAsRead, markAllNotificacoesAsRead, 
  clearLocalNotificacoes, saveLocalNotificacao 
} from '../database/db';
import { Notificacao } from '../types';
import { notificationService } from '../services/notificationService';

const STATUSBAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 44;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ 
  title, 
  subtitle, 
  showBack, 
  onBack, 
  rightAction 
}) => {
  const { user } = useAuth();
  const { isOnline, syncState, pendingCount, triggerSync } = useNetwork();
  
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadNotificacoes = useCallback(async () => {
    try {
      let list = await getLocalNotificacoes(user?.id);
      if (list.length === 0) {
        // Seed initial notifications if empty
        await saveLocalNotificacao({
          user_id: user?.id || 1,
          titulo: 'Bem-vindo ao ObraFlow / ELP',
          mensagem: 'Sistema sincronizado e pronto para vistorias em campo com AutoSave ativo.',
          tipo: 'sistema',
          lida: false,
          created_at: new Date().toISOString()
        });
        list = await getLocalNotificacoes(user?.id);
      }
      setNotificacoes(list);

      // Sincronizar em segundo plano com as notificações do servidor Railway se online
      if (isOnline) {
        notificationService.syncServerNotifications(user?.id).then((newCount) => {
          if (newCount > 0) {
            getLocalNotificacoes(user?.id).then(updated => setNotificacoes(updated));
          }
        }).catch(() => null);
      }
    } catch (e) {
      console.warn('Erro ao carregar notificacoes:', e);
    }
  }, [user?.id, isOnline]);

  useEffect(() => {
    loadNotificacoes();
    const unsub = notificationService.subscribe(() => {
      loadNotificacoes();
    });
    return unsub;
  }, [loadNotificacoes]);

  const unreadCount = notificacoes.filter(n => !n.lida).length;

  async function handleMarkAllRead() {
    await markAllNotificacoesAsRead(user?.id);
    await loadNotificacoes();
  }

  async function handleClearAll() {
    await clearLocalNotificacoes(user?.id);
    await loadNotificacoes();
  }

  async function handleNotificationClick(item: Notificacao) {
    if (!item.lida) {
      await markNotificacaoAsRead(item.id);
      await loadNotificacoes();
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent />
      <View style={styles.left}>
        {showBack ? (
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
        ) : (
          <Image 
            source={require('../../assets/logo.png')} 
            style={styles.headerLogo} 
            resizeMode="contain" 
          />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          ) : (
            <View style={styles.statusIndicator}>
              <View style={[styles.dot, isOnline ? styles.onlineDot : styles.offlineDot]} />
              <Text style={styles.statusText}>{isOnline ? 'Online' : 'Offline'}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.right}>
        {/* Ícone Discreto no Header: Exibido SOMENTE se estiver offline ou com pendências a sincronizar */}
        {(!isOnline || pendingCount > 0) && (
          <TouchableOpacity 
            style={styles.syncIconButton} 
            onPress={() => triggerSync()}
            disabled={!isOnline}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={!isOnline ? "cloud-offline-outline" : "cloud-upload-outline"} 
              size={20} 
              color={!isOnline ? "#94A3B8" : "#D97706"} 
            />
            {pendingCount > 0 && isOnline && (
              <View style={styles.syncBadge}>
                <Text style={styles.syncBadgeText}>
                  {pendingCount > 9 ? '9+' : pendingCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Sino de Notificações com Badge Vermelho Flutuante */}
        <TouchableOpacity 
          style={styles.bellButton} 
          onPress={() => {
            loadNotificacoes();
            setDrawerOpen(true);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="notifications-outline" size={22} color={Colors.text} />
          {unreadCount > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {rightAction ? (
          <View style={{ marginLeft: 4 }}>{rightAction}</View>
        ) : (
          <View style={styles.userBadge}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.username ? user.username.substring(0, 2).toUpperCase() : 'ELP'}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Gaveta Lateral de Notificações (Offcanvas Modal - Seção 15.1) */}
      <Modal 
        visible={drawerOpen} 
        animationType="slide" 
        transparent 
        onRequestClose={() => setDrawerOpen(false)}
      >
        <View style={styles.drawerOverlay}>
          <TouchableOpacity 
            style={styles.drawerBackdrop} 
            activeOpacity={1} 
            onPress={() => setDrawerOpen(false)} 
          />
          <View style={styles.drawerContent}>
            {/* Cabeçalho Azul */}
            <View style={styles.drawerHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="notifications" size={20} color="#FFFFFF" />
                <Text style={styles.drawerTitle}>Notificações</Text>
              </View>
              <TouchableOpacity onPress={() => setDrawerOpen(false)} style={styles.drawerCloseBtn}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Barra de Ações Rápidas */}
            <View style={styles.drawerQuickBar}>
              <Text style={styles.drawerUnreadCountText}>
                {unreadCount} não {unreadCount === 1 ? 'lida' : 'lidas'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity 
                  style={styles.drawerActionBtn} 
                  onPress={handleMarkAllRead}
                >
                  <Ionicons name="checkmark-done-outline" size={16} color={Colors.primary} />
                  <Text style={styles.drawerActionText}>Lidas</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.drawerActionBtn} 
                  onPress={handleClearAll}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                  <Text style={[styles.drawerActionText, { color: Colors.danger }]}>Limpar</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Corpo da Gaveta: Lista de cards */}
            <ScrollView style={styles.drawerList} showsVerticalScrollIndicator={false}>
              {notificacoes.length === 0 ? (
                <View style={styles.drawerEmptyBox}>
                  <Ionicons name="notifications-off-outline" size={40} color={Colors.textMuted} />
                  <Text style={styles.drawerEmptyTitle}>Nenhuma notificação</Text>
                  <Text style={styles.drawerEmptySub}>Você está com todos os avisos em dia.</Text>
                </View>
              ) : (
                notificacoes.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.notifCard, !item.lida && styles.notifCardUnread]}
                    onPress={() => handleNotificationClick(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.notifIconCircle}>
                      <Ionicons 
                        name={item.tipo === 'aprovacao' ? 'checkmark-circle' : item.tipo === 'rejeicao' ? 'close-circle' : 'information-circle'} 
                        size={20} 
                        color={item.tipo === 'aprovacao' ? Colors.success : item.tipo === 'rejeicao' ? Colors.danger : Colors.primary} 
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.notifTitle, !item.lida && styles.notifTitleBold]}>
                        {item.titulo}
                      </Text>
                      <Text style={styles.notifMessage} numberOfLines={3}>
                        {item.mensagem}
                      </Text>
                      <Text style={styles.notifDate}>
                        {new Date(item.created_at).toLocaleDateString('pt-BR')} às {new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    {!item.lida && <View style={styles.unreadDot} />}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: STATUSBAR_HEIGHT + 10,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    ...Shadows.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerLogo: {
    width: 38,
    height: 38,
    borderRadius: 8,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  onlineDot: {
    backgroundColor: Colors.success,
  },
  offlineDot: {
    backgroundColor: Colors.danger,
  },
  statusText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  syncBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#F59E0B',
    minWidth: 15,
    height: 15,
    borderRadius: 7.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  syncBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: 'bold',
  },
  bellButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#EF4444',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  bellBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryBackground,
    borderWidth: 1.5,
    borderColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.primary,
  },

  // Drawer Offcanvas Styles
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    flexDirection: 'row',
  },
  drawerBackdrop: {
    width: Math.max(0, SCREEN_WIDTH - 320),
  },
  drawerContent: {
    width: Math.min(SCREEN_WIDTH * 0.85, 340),
    backgroundColor: '#FFFFFF',
    height: '100%',
    shadowColor: '#000',
    shadowOffset: { width: -3, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 16,
  },
  drawerHeader: {
    backgroundColor: '#1E3A8A',
    paddingTop: STATUSBAR_HEIGHT + 14,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  drawerCloseBtn: {
    padding: 4,
  },
  drawerQuickBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  drawerUnreadCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  drawerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  drawerActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  drawerList: {
    flex: 1,
    padding: 12,
  },
  drawerEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  drawerEmptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    marginTop: 12,
  },
  drawerEmptySub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  notifCardUnread: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  notifIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  notifTitle: {
    fontSize: 13,
    color: '#1E293B',
  },
  notifTitleBold: {
    fontWeight: '700',
    color: '#0F172A',
  },
  notifMessage: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
    lineHeight: 16,
  },
  notifDate: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563EB',
    marginTop: 6,
  },
});
