import type { TokenUsage, UsageKind, UsageRow, UsageSummary } from '@kb/shared';
import { Injectable, Logger } from '@nestjs/common';
import type { UserContext } from '../auth/user-context.js';
import { toHttpError } from '../supabase/db-error.js';

const DAY_MS = 86_400_000;

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  /** Accounting must never break the feature it measures, so a failed insert is logged, not thrown. */
  async record(
    ctx: UserContext,
    kind: UsageKind,
    source: { provider: string; model: string },
    usage: TokenUsage | null,
  ): Promise<void> {
    const { error } = await ctx.db.from('usage_events').insert({
      kind,
      provider: source.provider,
      model: source.model,
      prompt_tokens: usage?.promptTokens ?? 0,
      completion_tokens: usage?.completionTokens ?? 0,
      total_tokens: usage?.totalTokens ?? 0,
    });
    if (error) this.logger.warn(`Could not record ${kind} usage: ${error.message}`);
  }

  async summary(ctx: UserContext, days: number): Promise<UsageSummary> {
    const since = new Date(Date.now() - (days - 1) * DAY_MS).toISOString().slice(0, 10);
    const { data, error } = await ctx.db
      .from('usage_daily')
      .select('*')
      .gte('day', since)
      .order('day', { ascending: false })
      .order('total_tokens', { ascending: false });
    if (error) throw toHttpError(error);

    // View columns are nullable in generated types even though these never are.
    const rows: UsageRow[] = data.map((row) => ({
      day: row.day ?? '',
      kind: row.kind ?? 'chat',
      model: row.model ?? '',
      requests: Number(row.requests ?? 0),
      promptTokens: Number(row.prompt_tokens ?? 0),
      completionTokens: Number(row.completion_tokens ?? 0),
      totalTokens: Number(row.total_tokens ?? 0),
    }));
    const totals = rows.reduce(
      (sum, row) => ({
        requests: sum.requests + row.requests,
        promptTokens: sum.promptTokens + row.promptTokens,
        completionTokens: sum.completionTokens + row.completionTokens,
        totalTokens: sum.totalTokens + row.totalTokens,
      }),
      { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    );
    return { rows, totals };
  }
}
