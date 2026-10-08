import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, Animated, TouchableOpacity, Platform, StatusBar 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { notificationService, ToastPayload } from '../services/notificationService';
import { Shadows } from '../theme/colors';

const STATUSBAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 44;

export const NotificationToast: React.FC = () => {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const translateY = useRef(new Animated.Value(-120)).current;
  const hideTimeoutRef = useRef<any>(null);

  useEffect(() => {
    const unsub = notificationService.subscribeToast((payload) => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      setToast(payload);

      // Deslizar para baixo
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }).start();

      // Auto-fechar em 4.5 segundos
      hideTimeoutRef.current = setTimeout(() => {
        dismiss();
      }, 4500);
    });

    return () => {
      unsub();
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  function dismiss() {
    Animated.timing(translateY, {
      toValue: -150,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setToast(null);
    });
  }

  if (!toast) return null;

  const iconName = 
    toast.tipo === 'aprovacao' ? 'checkmark-circle' :
    toast.tipo === 'relatorio' ? 'document-text' :
    toast.tipo === 'sincronizacao' ? 'cloud-done' :
    toast.tipo === 'lembrete' ? 'alarm' : 'notifications';

  const iconColor = 
    toast.tipo === 'aprovacao' ? '#10B981' :
    toast.tipo === 'relatorio' ? '#2563EB' :
    toast.tipo === 'sincronizacao' ? '#0EA5E9' :
    toast.tipo === 'lembrete' ? '#F59E0B' : '#7C3AED';

  return (
    <Animated.View 
      style={[
        styles.container, 
        { transform: [{ translateY }] }
      ]}
    >
      <TouchableOpacity 
        style={styles.card} 
        activeOpacity={0.9} 
        onPress={dismiss}
      >
        <View style={[styles.iconCircle, { backgroundColor: `${iconColor}15` }]}>
          <Ionicons name={iconName} size={22} color={iconColor} />
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {toast.titulo}
          </Text>
          <Text style={styles.message} numberOfLines={2}>
            {toast.mensagem}
          </Text>
        </View>

        <TouchableOpacity onPress={dismiss} style={styles.closeBtn}>
          <Ionicons name="close" size={18} color="#94A3B8" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: STATUSBAR_HEIGHT + 6,
    left: 12,
    right: 12,
    zIndex: 99999,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 2,
  },
  message: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  closeBtn: {
    padding: 6,
    marginLeft: 6,
  },
});
