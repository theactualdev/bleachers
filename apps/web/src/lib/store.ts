'use client';

import { create } from 'zustand';

interface ConnectivityState {
  online: boolean;
  pending: number;
  syncing: boolean;
  setOnline: (online: boolean) => void;
  setPending: (pending: number) => void;
  setSyncing: (syncing: boolean) => void;
}

export const useConnectivity = create<ConnectivityState>((set) => ({
  online:
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true,
  pending: 0,
  syncing: false,
  setOnline: (online) => set({ online }),
  setPending: (pending) => set({ pending }),
  setSyncing: (syncing) => set({ syncing }),
}));
