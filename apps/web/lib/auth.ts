'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useUiStore } from './store';
import { useTranslations } from 'next-intl';

const TOKEN_STORAGE_KEY = 'codeccloud-token';

export type Session = {
  accessToken: string;
  expiresAt: number;
  locale: string;
  tenantId: string;
};

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const router = useRouter();
  const t = useTranslations('auth');
  const pushNotification = useUiStore((state) => state.pushNotification);

  useEffect(() => {
    const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Session;
      if (parsed.expiresAt > Date.now()) {
        setSession(parsed);
      } else {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch (error) {
      console.warn('Failed to parse session', error);
    }
  }, []);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setSession(null);
    pushNotification({ message: t('success'), level: 'success' });
    router.push('/');
  }, [router, pushNotification, t]);

  const hydrateSession = useCallback((payload: Session) => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(payload));
    setSession(payload);
  }, []);

  return { session, signOut, hydrateSession };
}
