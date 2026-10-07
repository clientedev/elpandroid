import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNetwork } from '../contexts/NetworkContext';
import { Colors } from '../theme/colors';

export const OfflineBanner: React.FC = () => {
  // A faixa invasiva de sincronização foi removida a pedido do usuário em favor de um indicador discreto no Header superior.
  return null;
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
