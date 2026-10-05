import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useNetwork } from '../contexts/NetworkContext';
import { Colors, Shadows } from '../theme/colors';

const STATUSBAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 44;

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
  const { isOnline } = useNetwork();

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
              <Text style={styles.statusText}>{isOnline ? 'Online (Railway)' : 'Offline (Local)'}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.right}>
        {rightAction ? (
          rightAction
        ) : (
          <View style={styles.userBadge}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.username ? user.username.substring(0, 2).toUpperCase() : 'OF'}
              </Text>
            </View>
          </View>
        )}
      </View>
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
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
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
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.primary,
  },
});
