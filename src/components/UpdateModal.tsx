import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { updateService, UpdateInfo } from '../services/updateService';
import { Colors, Shadows } from '../theme/colors';

export const UpdateModal: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    // Register modal with updateService
    updateService.registerPromptCallback((info) => {
      setUpdateInfo(info);
      setVisible(true);
    });

    // Auto check on mount after a slight delay
    const timer = setTimeout(() => {
      updateService.checkForUpdate(false);
    }, 2500);

    return () => {
      clearTimeout(timer);
      updateService.unregisterPromptCallback();
    };
  }, []);

  async function handleConfirmUpdate() {
    if (!updateInfo) return;
    setIsDownloading(true);
    try {
      await updateService.applyUpdate(updateInfo);
    } finally {
      setIsDownloading(false);
      setVisible(false);
    }
  }

  async function handleDismiss() {
    if (isDownloading) return;
    if (updateInfo) {
      await updateService.dismissUpdate(updateInfo);
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header Icon / Badge */}
          <View style={styles.iconContainer}>
            <Image 
              source={require('../../assets/logo.png')} 
              style={styles.logoImage} 
              resizeMode="contain" 
            />
          </View>

          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Ionicons name="sparkles" size={14} color="#0284C7" />
              <Text style={styles.badgeText}>NOVA VERSÃO DETECTADA</Text>
            </View>
          </View>

          {/* Title & Message as requested */}
          <Text style={styles.title}>Atualização Disponível</Text>
          <Text style={styles.message}>
            Tem uma atualização recente. Deseja atualizar?
          </Text>

          {updateInfo?.version && (
            <Text style={styles.versionNote}>
              Versão disponível: v{updateInfo.version}
            </Text>
          )}

          {isDownloading ? (
            <View style={styles.downloadingBox}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.downloadingText}>
                Baixando atualização recente e reiniciando o ELP...
              </Text>
            </View>
          ) : (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleDismiss}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Mais tarde</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleConfirmUpdate}
                activeOpacity={0.8}
              >
                <Ionicons name="cloud-download-outline" size={18} color="#FFFFFF" />
                <Text style={styles.confirmBtnText}>Atualizar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    ...Shadows.lg,
  },
  iconContainer: {
    width: 80,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  logoImage: {
    width: 80,
    height: 48,
  },
  badgeRow: {
    marginBottom: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  versionNote: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 20,
  },
  downloadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 8,
    width: '100%',
    justifyContent: 'center',
  },
  downloadingText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  confirmBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    ...Shadows.sm,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
