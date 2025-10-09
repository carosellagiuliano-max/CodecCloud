'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useUiStore } from './store';
import { useTranslations } from 'next-intl';
import type { PublicSession, SessionCookiePayload } from '@/lib/server/session-cookie';

const SESSION_STORAGE_KEY = 'codeccloud-session';

export type Session = PublicSession;

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const router = useRouter();
  const t = useTranslations('auth');
  const pushNotification = useUiStore((state) => state.pushNotification);

  useEffect(() => {
    let cancelled = false;

    try {
      const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Session;
        if (parsed.expiresAt > Date.now()) {
          setSession(parsed);
        } else {
          window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
    } catch (error) {
      console.warn('Failed to parse cached session metadata', error);
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }

    async function fetchSession() {
      try {
        const response = await fetch('/api/session', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store'
        });
        if (!response.ok) {
          throw new Error('Failed to load session');
        }
        const payload = (await response.json()) as { session: Session | null };
        if (cancelled) return;
        if (payload.session) {
          setSession(payload.session);
          window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload.session));
        } else {
          setSession(null);
          window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        }
      } catch (error) {
        if (!cancelled) {
          setSession(null);
          window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
    }

    fetchSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/session', { method: 'DELETE', credentials: 'include' });
    } catch (error) {
      console.warn('Failed to invalidate session cookie', error);
    }
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setSession(null);
    pushNotification({ message: t('success'), level: 'success' });
    router.push('/');
  }, [router, pushNotification, t]);

  const hydrateSession = useCallback(async (payload: SessionCookiePayload) => {
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Failed to persist session');
    }

    const data = (await response.json()) as { session: Session };
    setSession(data.session);
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data.session));
  }, []);

  return { session, signOut, hydrateSession };
}
