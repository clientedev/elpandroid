import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { NetworkProvider } from './src/contexts/NetworkContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { UpdateModal } from './src/components/UpdateModal';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <AuthProvider>
        <NetworkProvider>
          <AppNavigator />
          <UpdateModal />
        </NetworkProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
