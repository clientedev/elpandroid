import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';

interface Props {
  status?: 'synced' | 'pending' | 'error';
}

export const SyncStatusBadge: React.FC<Props> = ({ status = 'synced' }) => {
  if (status === 'synced') {
    return (
      <View style={[styles.badge, styles.syncedBg]}>
        <Ionicons name="cloud-done-outline" size={12} color={Colors.success} />
        <Text style={[styles.text, styles.syncedText]}>Nuvem</Text>
      </View>
    );
  }

  if (status === 'pending') {
    return (
      <View style={[styles.badge, styles.pendingBg]}>
        <Ionicons name="cloud-upload-outline" size={12} color={Colors.syncPending} />
        <Text style={[styles.text, styles.pendingText]}>Local (Pendente)</Text>
      </View>
    );
  }

  return (
    <View style={[styles.badge, styles.errorBg]}>
      <Ionicons name="alert-circle-outline" size={12} color={Colors.danger} />
      <Text style={[styles.text, styles.errorText]}>Erro Sync</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  syncedBg: {
    backgroundColor: '#ECFDF5',
  },
  syncedText: {
    color: '#065F46',
    fontSize: 10,
    fontWeight: '600',
  },
  pendingBg: {
    backgroundColor: '#FFF7ED',
  },
  pendingText: {
    color: '#C2410C',
    fontSize: 10,
    fontWeight: '600',
  },
  errorBg: {
    backgroundColor: '#FEF2F2',
  },
  errorText: {
    color: '#991B1B',
    fontSize: 10,
    fontWeight: '600',
  },
  text: {},
});
