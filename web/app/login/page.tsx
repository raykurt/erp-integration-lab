'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Alert } from '@/components/Status';
import { api, errorText, tokenStore } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const { accessToken } = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: { username: form.get('username'), password: form.get('password') },
      });
      tokenStore.set(accessToken);
      router.replace('/leave');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <div className="card login">
        <h1>Sign in</h1>
        <p className="muted">Demo users: ayse, mert, hulya, deniz … (password in README)</p>
        <form onSubmit={submit}>
          <label>
            Username
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <Alert message={error} />
      </div>
    </main>
  );
}
