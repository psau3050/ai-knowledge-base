'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui';
import { useAiMeta } from '@/lib/queries';
import { createClient } from '@/lib/supabase';

const NAV = [
  { href: '/documents', label: 'Documents' },
  { href: '/chat', label: 'Chat' },
  { href: '/usage', label: 'Usage' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: meta } = useAiMeta();
  const { data: email } = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await createClient().auth.getUser()).data.user?.email ?? null,
    staleTime: Infinity,
  });

  async function signOut() {
    await createClient().auth.signOut();
    queryClient.clear();
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-zinc-200 bg-white md:w-60 md:border-r md:border-b-0">
        <div className="px-4 py-4 font-semibold">Knowledge Base</div>
        <nav className="flex gap-1 px-2 md:flex-col">
          {NAV.map(({ href, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  active ? 'bg-indigo-50 text-indigo-700' : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto hidden space-y-3 border-t border-zinc-200 p-4 text-xs text-zinc-500 md:block">
          {meta && (
            <dl className="space-y-1" title="Configured via AI_* variables in .env">
              <dt className="font-medium text-zinc-700">Chat</dt>
              <dd className="break-all">
                {meta.chat.provider} · {meta.chat.model}
              </dd>
              <dt className="pt-1 font-medium text-zinc-700">Embeddings</dt>
              <dd className="break-all">
                {meta.embeddings.provider} · {meta.embeddings.model} ({meta.embeddings.dimensions}d)
              </dd>
            </dl>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-zinc-200 pt-3">
            <span className="truncate">{email}</span>
            <Button variant="ghost" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
