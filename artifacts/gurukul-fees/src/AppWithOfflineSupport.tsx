import React, { ReactNode } from 'react';
import { OfflineIndicator } from './OfflineIndicator';
import { useOfflineSync } from '../hooks/useOfflineSync';

interface AppWithOfflineSupportProps {
  children: ReactNode;
}

/**
 * Wrapper component that provides offline support to the entire app
 * - Registers service worker
 * - Listens to online/offline events
 * - Provides OfflineIndicator
 */
export function AppWithOfflineSupport({ children }: AppWithOfflineSupportProps) {
  // Initialize offline sync
  useOfflineSync();

  return (
    <>
      {children}
      <OfflineIndicator />
    </>
  );
}
