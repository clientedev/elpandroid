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
  const [notifFilter, setNotifFilter] = useState<'todas' | 'nao_lidas'>('todas');

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

      {/* Gaveta Lateral de Notificações - Design Executivo */}
      <Modal 
        visible={drawerOpen} 
        animationType="fade" 
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
            {/* Cabeçalho Executivo */}
            <View style={styles.drawerHeader}>
              <View style={styles.drawerHeaderLeft}>
                <View style={styles.drawerHeaderIconWrap}>
                  <Ionicons name="notifications" size={20} color="#FFFFFF" />
                  {unreadCount > 0 && <View style={styles.drawerHeaderIconDot} />}
                </View>
                <View>
                  <Text style={styles.drawerTitle}>Notificações</Text>
                  <Text style={styles.drawerSubtitle}>Central de Avisos e Laudos</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setDrawerOpen(false)} style={styles.drawerCloseBtn} activeOpacity={0.7}>
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Pílulas de Filtro (Todas vs Não Lidas) */}
            <View style={styles.filterPillsRow}>
              <TouchableOpacity
                style={[styles.filterPill, notifFilter === 'todas' && styles.filterPillActive]}
                onPress={() => setNotifFilter('todas')}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterPillText, notifFilter === 'todas' && styles.filterPillTextActive]}>
                  Todas ({notificacoes.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterPill, notifFilter === 'nao_lidas' && styles.filterPillActive]}
                onPress={() => setNotifFilter('nao_lidas')}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterPillText, notifFilter === 'nao_lidas' && styles.filterPillTextActive]}>
                  Não lidas ({unreadCount})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Barra de Ações Rápidas */}
            <View style={styles.drawerQuickBar}>
              <Text style={styles.drawerUnreadCountText}>
                {unreadCount > 0 ? `${unreadCount} ${unreadCount === 1 ? 'pendente' : 'pendentes'}` : 'Nenhuma pendente'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {unreadCount > 0 && (
                  <TouchableOpacity 
                    style={styles.drawerActionBtn} 
                    onPress={handleMarkAllRead}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="checkmark-done" size={15} color="#2563EB" />
                    <Text style={styles.drawerActionText}>Marcar Lidas</Text>
                  </TouchableOpacity>
                )}
                {notificacoes.length > 0 && (
                  <TouchableOpacity 
                    style={[styles.drawerActionBtn, styles.drawerActionBtnDanger]} 
                    onPress={handleClearAll}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={15} color="#DC2626" />
                    <Text style={[styles.drawerActionText, { color: '#DC2626' }]}>Limpar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Corpo da Gaveta: Lista de cards */}
            <ScrollView style={styles.drawerList} contentContainerStyle={styles.drawerListContent} showsVerticalScrollIndicator={false}>
              {(() => {
                const list = notifFilter === 'nao_lidas'
                  ? notificacoes.filter(n => !n.lida)
                  : notificacoes;

                if (list.length === 0) {
                  return (
                    <View style={styles.drawerEmptyBox}>
                      <View style={styles.drawerEmptyIconWrap}>
                        <Ionicons name="notifications-off-outline" size={36} color="#94A3B8" />
                      </View>
                      <Text style={styles.drawerEmptyTitle}>
                        {notifFilter === 'nao_lidas' ? 'Nenhuma não lida' : 'Central em dia'}
                      </Text>
                      <Text style={styles.drawerEmptySub}>
                        {notifFilter === 'nao_lidas' 
                          ? 'Todas as notificações já foram visualizadas.' 
                          : 'Você não possui novos avisos ou pendências no momento.'}
                      </Text>
                    </View>
                  );
                }

                return list.map((item) => {
                  const isAprov = item.tipo === 'aprovacao';
                  const isRej = item.tipo === 'rejeicao';
                  const isRel = item.tipo === 'relatorio';
                  const isSinc = item.tipo === 'sincronizacao';
                  const isLemb = item.tipo === 'lembrete';

                  const badgeBg = isAprov ? '#DCFCE7' : isRej ? '#FEE2E2' : isRel ? '#DBEAFE' : isSinc ? '#E0F2FE' : isLemb ? '#FEF3C7' : '#EDE9FE';
                  const iconColor = isAprov ? '#10B981' : isRej ? '#EF4444' : isRel ? '#2563EB' : isSinc ? '#0EA5E9' : isLemb ? '#F59E0B' : '#7C3AED';
                  const iconName = isAprov ? 'checkmark-circle' : isRej ? 'close-circle' : isRel ? 'document-text' : isSinc ? 'cloud-done' : isLemb ? 'alarm' : 'information-circle';
                  const borderColor = item.lida ? '#E2E8F0' : iconColor;

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.notifCard,
                        !item.lida && styles.notifCardUnread,
                        { borderLeftColor: borderColor }
                      ]}
                      onPress={() => handleNotificationClick(item)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.notifIconCircle, { backgroundColor: badgeBg }]}>
                        <Ionicons name={iconName} size={18} color={iconColor} />
                      </View>
                      <View style={styles.notifContentCol}>
                        <View style={styles.notifHeaderRow}>
                          <Text style={[styles.notifTitle, !item.lida && styles.notifTitleBold]} numberOfLines={1}>
                            {item.titulo}
                          </Text>
                          {!item.lida && <View style={styles.unreadDot} />}
                        </View>
                        <Text style={styles.notifMessage} numberOfLines={3}>
                          {item.mensagem}
                        </Text>
                        <View style={styles.notifMetaRow}>
                          <Ionicons name="time-outline" size={11} color="#94A3B8" />
                          <Text style={styles.notifDate}>
                            {new Date(item.created_at).toLocaleDateString('pt-BR')} às {new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                });
              })()}
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

  // Drawer Offcanvas Styles - Design Executivo
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    flexDirection: 'row',
  },
  drawerBackdrop: {
    flex: 1,
  },
  drawerContent: {
    width: Math.min(SCREEN_WIDTH * 0.90, 380),
    backgroundColor: '#F8FAFC',
    height: '100%',
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 24,
    overflow: 'hidden',
  },
  drawerHeader: {
    backgroundColor: '#0F172A',
    paddingTop: STATUSBAR_HEIGHT + 14,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  drawerHeaderIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  drawerHeaderIconDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#0F172A',
  },
  drawerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  drawerSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  drawerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillsRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F4',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  filterPillTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  drawerQuickBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
  },
  drawerActionBtnDanger: {
    backgroundColor: '#FEE2E2',
  },
  drawerActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563EB',
  },
  drawerList: {
    flex: 1,
  },
  drawerListContent: {
    padding: 12,
    paddingBottom: 30,
    gap: 10,
  },
  drawerEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  drawerEmptyIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  drawerEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
  },
  drawerEmptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    borderLeftColor: '#94A3B8',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  notifCardUnread: {
    backgroundColor: '#FFFFFF',
    borderColor: '#BFDBFE',
    shadowOpacity: 0.08,
    elevation: 3,
  },
  notifIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  notifContentCol: {
    flex: 1,
  },
  notifHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  notifTitle: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
    flex: 1,
  },
  notifTitleBold: {
    fontWeight: '700',
    color: '#0F172A',
  },
  notifMessage: {
    fontSize: 12,
    color: '#475569',
    marginTop: 3,
    lineHeight: 17,
  },
  notifMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  notifDate: {
    fontSize: 10,
    color: '#94A3B8',
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#2563EB',
  },
});
