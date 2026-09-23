'use client';

import { useState } from 'react';
import { ErrorNotice, PageHeader, Spinner } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { useUsage } from '@/lib/queries';

const PERIODS = [7, 30, 90];

const KIND_LABELS: Record<string, string> = {
  chat: 'Answer',
  condense: 'Query rewrite',
  embed_documents: 'Embed documents',
  embed_query: 'Embed query',
};

export default function UsagePage() {
  const [days, setDays] = useState(30);
  const { data, isPending, error } = useUsage(days);

  return (
    <>
      <PageHeader
        title="Token usage"
        actions={
          <div className="flex rounded-md border border-zinc-300 bg-white p-0.5">
            {PERIODS.map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setDays(period)}
                className={`rounded px-2.5 py-1 text-sm ${
                  days === period ? 'bg-indigo-600 text-white' : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                {period}d
              </button>
            ))}
          </div>
        }
      />

      <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
        {isPending ? (
          <Spinner />
        ) : error ? (
          <ErrorNotice error={error} />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Requests', data.totals.requests],
                ['Prompt tokens', data.totals.promptTokens],
                ['Completion tokens', data.totals.completionTokens],
                ['Total tokens', data.totals.totalTokens],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-zinc-200 bg-white p-4">
                  <dt className="text-xs text-zinc-500">{label}</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums">
                    {formatNumber(Number(value))}
                  </dd>
                </div>
              ))}
            </dl>

            {data.rows.length === 0 ? (
              <p className="text-sm text-zinc-500">No AI calls in this period yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Day</th>
                      <th className="px-4 py-2 font-medium">Operation</th>
                      <th className="px-4 py-2 font-medium">Model</th>
                      <th className="px-4 py-2 text-right font-medium">Requests</th>
                      <th className="px-4 py-2 text-right font-medium">Tokens</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {data.rows.map((row) => (
                      <tr key={`${row.day}-${row.kind}-${row.model}`}>
                        <td className="px-4 py-2 whitespace-nowrap">{row.day}</td>
                        <td className="px-4 py-2">{KIND_LABELS[row.kind] ?? row.kind}</td>
                        <td className="px-4 py-2 break-all text-zinc-600">{row.model}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatNumber(row.requests)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatNumber(row.totalTokens)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
