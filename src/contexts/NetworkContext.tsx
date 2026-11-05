import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncService, SyncState } from '../services/syncService';

interface NetworkContextData {
  isOnline: boolean;
  syncState: SyncState;
  pendingCount: number;
  triggerSync: (manual?: boolean) => Promise<{ success: boolean; message: string }>;
}

const NetworkContext = createContext<NetworkContextData>({} as NetworkContextData);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [pendingCount, setPendingCount] = useState<number>(0);
  const isOnlineRef = useRef<boolean>(true);

  useEffect(() => {
    // Initial fetch once
    NetInfo.fetch().then(state => {
      const online = Boolean(state.isConnected);
      isOnlineRef.current = online;
      setIsOnline(online);
      if (online) {
        // Run sync only if pending items exist
        syncService.getPendingCount().then(c => {
          if (c > 0) {
            syncService.syncAll(false);
          }
        });
      }
    }).catch(() => null);

    // Listen to network status changes
    const unsubscribeNet = NetInfo.addEventListener(state => {
      const online = Boolean(state.isConnected);
      if (isOnlineRef.current !== online) {
        isOnlineRef.current = online;
        setIsOnline(online);
        if (online) {
          syncService.syncAll(false);
        }
      }
    });

    // Listen to sync engine events
    const unsubscribeSync = syncService.subscribe((state, count) => {
      setSyncState(prev => (prev !== state ? state : prev));
      setPendingCount(prev => (prev !== count ? count : prev));
    });

    // Initial pending count
    syncService.getPendingCount().then(c => setPendingCount(c));

    return () => {
      unsubscribeNet();
      unsubscribeSync();
    };
  }, []);

  const triggerSync = useCallback(async (manual: boolean = false) => {
    return await syncService.syncAll(manual);
  }, []);

  const value = useMemo(() => ({
    isOnline,
    syncState,
    pendingCount,
    triggerSync,
  }), [isOnline, syncState, pendingCount, triggerSync]);

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => useContext(NetworkContext);

