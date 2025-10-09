import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { nanoid } from 'nanoid';

export type NotificationLevel = 'info' | 'success' | 'error' | 'warning';

export type Notification = {
  id: string;
  message: string;
  level: NotificationLevel;
  timestamp: number;
};

export type ConnectivityState = 'online' | 'offline';

type UiState = {
  notifications: Notification[];
  connectivity: ConnectivityState;
  setConnectivity: (state: ConnectivityState) => void;
  pushNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  dismissNotification: (id: string) => void;
};

export const useUiStore = create<UiState>()(
  devtools(
    persist(
      (set) => ({
        notifications: [],
        connectivity: 'online',
        setConnectivity: (state) => set({ connectivity: state }),
        pushNotification: ({ message, level }) =>
          set((current) => ({
            notifications: [
              ...current.notifications,
              { id: nanoid(), message, level, timestamp: Date.now() }
            ]
          })),
        dismissNotification: (id) =>
          set((current) => ({
            notifications: current.notifications.filter((notification) => notification.id !== id)
          }))
      }),
      {
        name: 'codeccloud-ui',
        version: 1,
        storage: typeof window === 'undefined' ? undefined : createJSONStorage(() => localStorage)
      }
    )
  )
);
