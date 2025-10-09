'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useEffect, useState } from 'react';
import { ThemeProvider } from 'next-themes';
import { Toaster, toast } from 'sonner';
import { useUiStore } from '@/lib/store';

function useQueryClient() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 2,
            refetchOnWindowFocus: false
          }
        }
      })
  );
  return client;
}

function NotificationsBridge() {
  const notifications = useUiStore((state) => state.notifications);
  const dismissNotification = useUiStore((state) => state.dismissNotification);
  const displayed = useState(() => new Set<string>())[0];

  useEffect(() => {
    notifications.forEach((notification) => {
      if (displayed.has(notification.id)) return;
      const presenters = toast as unknown as Record<string, typeof toast>;
      const presenter = presenters[notification.level] ?? toast;
      presenter(notification.message, {
        id: notification.id,
        onDismiss: () => {
          dismissNotification(notification.id);
          displayed.delete(notification.id);
        }
      });
      displayed.add(notification.id);
    });
  }, [notifications, dismissNotification, displayed]);

  return null;
}

function ConnectivityWatcher() {
  const setConnectivity = useUiStore((state) => state.setConnectivity);

  useEffect(() => {
    const handleOnline = () => setConnectivity('online');
    const handleOffline = () => setConnectivity('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    handleOnline();
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setConnectivity]);

  return null;
}

function LiveRegion() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      if (typeof customEvent.detail === 'string') {
        setMessage(customEvent.detail);
      }
    };
    window.addEventListener('calendar-announcement', handler);
    return () => window.removeEventListener('calendar-announcement', handler);
  }, []);
  return (
    <div aria-live="polite" aria-atomic className="sr-only">
      {message}
    </div>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const client = useQueryClient();

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <LiveRegion />
        <NotificationsBridge />
        <ConnectivityWatcher />
        {children}
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
