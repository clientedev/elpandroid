import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNetwork } from '../contexts/NetworkContext';
import { Colors } from '../theme/colors';

export const OfflineBanner: React.FC = () => {
  const { isOnline, syncState, pendingCount, triggerSync } = useNetwork();

  if (isOnline && pendingCount === 0 && syncState !== 'syncing') {
    return null;
  }

  return (
    <View style={[
      styles.banner, 
      !isOnline ? styles.offlineBg : styles.pendingBg
    ]}>
      <View style={styles.left}>
        <Ionicons 
          name={!isOnline ? "cloud-offline-outline" : "sync-outline"} 
          size={18} 
          color={!isOnline ? "#B91C1C" : "#C2410C"} 
        />
        <Text style={[styles.text, !isOnline ? styles.offlineText : styles.pendingText]}>
          {!isOnline 
            ? `Modo Offline Ativo (${pendingCount} alteraçõ${pendingCount === 1 ? 'o' : 'es'} pendentes)` 
            : syncState === 'syncing' 
              ? 'Sincronizando com o servidor Railway...' 
              : `${pendingCount} item(ns) aguardando sincronização`}
        </Text>
      </View>

      {isOnline && syncState !== 'syncing' && (
        <TouchableOpacity style={styles.button} onPress={() => triggerSync()}>
          <Text style={styles.buttonText}>Sincronizar</Text>
        </TouchableOpacity>
      )}

      {syncState === 'syncing' && (
        <ActivityIndicator size="small" color="#2563EB" />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  offlineBg: {
    backgroundColor: '#FEF2F2',
    borderBottomColor: '#FCA5A5',
  },
  pendingBg: {
    backgroundColor: '#FFFBEB',
    borderBottomColor: '#FDE68A',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
  offlineText: {
    color: '#991B1B',
  },
  pendingText: {
    color: '#92400E',
  },
  button: {
    backgroundColor: '#D97706',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
