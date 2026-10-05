import React, { createContext, useContext, useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncService, SyncState } from '../services/syncService';

interface NetworkContextData {
  isOnline: boolean;
  syncState: SyncState;
  pendingCount: number;
  triggerSync: () => Promise<{ success: boolean; message: string }>;
}

const NetworkContext = createContext<NetworkContextData>({} as NetworkContextData);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    // Listen to network status changes
    const unsubscribeNet = NetInfo.addEventListener(state => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      if (online) {
        // Automatic sync when connection returns
        syncService.syncAll();
      }
    });

    // Listen to sync engine events
    const unsubscribeSync = syncService.subscribe((state, count) => {
      setSyncState(state);
      setPendingCount(count);
    });

    // Initial check
    syncService.getPendingCount().then(c => setPendingCount(c));

    return () => {
      unsubscribeNet();
      unsubscribeSync();
    };
  }, []);

  async function triggerSync() {
    return await syncService.syncAll();
  }

  return (
    <NetworkContext.Provider value={{ isOnline, syncState, pendingCount, triggerSync }}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => useContext(NetworkContext);
