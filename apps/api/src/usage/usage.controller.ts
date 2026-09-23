import { usageQuerySchema, type UsageSummary } from '@kb/shared';
import { Controller, Get, Query } from '@nestjs/common';
import type { z } from 'zod';
import { Ctx } from '../auth/auth.decorators.js';
import type { UserContext } from '../auth/user-context.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { UsageService } from './usage.service.js';

@Controller('usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get()
  summary(
    @Ctx() ctx: UserContext,
    @Query(new ZodValidationPipe(usageQuerySchema)) query: z.output<typeof usageQuerySchema>,
  ): Promise<UsageSummary> {
    return this.usage.summary(ctx, query.days);
  }
}
