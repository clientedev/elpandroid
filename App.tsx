import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { NetworkProvider } from './src/contexts/NetworkContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { UpdateModal } from './src/components/UpdateModal';
import { NotificationToast } from './src/components/NotificationToast';
import { notificationService } from './src/services/notificationService';
import { ensureAllProjectsFolders } from './src/services/appFilesService';

export default function App() {
  useEffect(() => {
    // Solicita permissão de notificação no celular (obrigatório para Android 13+)
    notificationService.requestPermission().catch(() => null);

    // Garante que todas as obras no SQLite tenham suas pastas criadas e espelhadas na raiz de Documentos do celular
    ensureAllProjectsFolders().catch(() => null);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <AuthProvider>
        <NetworkProvider>
          <AppNavigator />
          <UpdateModal />
          <NotificationToast />
        </NetworkProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
