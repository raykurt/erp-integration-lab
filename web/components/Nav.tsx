'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { tokenStore } from '@/lib/api';
import type { Me } from '@/lib/types';

export function Nav({ me }: { me: Me }) {
  const path = usePathname();
  const router = useRouter();
  const canSeeStock = me.role !== 'EMPLOYEE';

  return (
    <header className="nav">
      <strong className="brand">ERP Integration Lab</strong>
      <nav aria-label="Main">
        <Link href="/leave" aria-current={path === '/leave' ? 'page' : undefined}>
          Leave
        </Link>
        {canSeeStock && (
          <Link href="/stock" aria-current={path === '/stock' ? 'page' : undefined}>
            Stock
          </Link>
        )}
      </nav>
      <span className="user" data-testid="current-user">
        {me.fullName} <span className="muted">({me.role})</span>
      </span>
      <button
        className="secondary"
        onClick={() => {
          tokenStore.clear();
          router.replace('/login');
        }}
      >
        Log out
      </button>
    </header>
  );
}
