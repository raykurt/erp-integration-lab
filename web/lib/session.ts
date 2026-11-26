'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, tokenStore } from './api';
import type { Me } from './types';

/** Loads the signed-in user; sends the browser to /login when there is no valid token. */
export function useSession() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  const reload = useCallback(async () => {
    if (!tokenStore.get()) {
      router.replace('/login');
      return;
    }
    setMe(await api<Me>('/employees/me'));
  }, [router]);

  useEffect(() => {
    reload().catch(() => router.replace('/login'));
  }, [reload, router]);

  return { me, reload };
}
