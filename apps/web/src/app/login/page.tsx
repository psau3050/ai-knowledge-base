'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, ErrorNotice, Input } from '@/components/ui';
import { createClient } from '@/lib/supabase';

type Mode = 'sign-in' | 'sign-up';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const { data, error } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setPending(false);

    if (error) return setError(error);
    // With email confirmation enabled (hosted Supabase), sign-up returns no session yet.
    if (!data.session) return setNotice('Check your inbox to confirm your email, then sign in.');
    router.replace('/documents');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Knowledge Base</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {mode === 'sign-in' ? 'Sign in to your documents.' : 'Create an account to get started.'}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Email</span>
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Password</span>
            <Input
              type="password"
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <ErrorNotice error={error} />
          {notice && <p className="text-sm text-emerald-700">{notice}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-indigo-600 hover:underline"
          onClick={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
            setError(null);
            setNotice(null);
          }}
        >
          {mode === 'sign-in' ? 'No account? Create one' : 'Already have an account? Sign in'}
        </button>
      </div>
    </main>
  );
}
