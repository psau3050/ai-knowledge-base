import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AiModule } from './ai/ai.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { ChatModule } from './chat/chat.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import type { AppConfig } from './config/config.js';
import { ConfigModule } from './config/config.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { HealthController } from './health.controller.js';
import { SupabaseModule } from './supabase/supabase.module.js';
import { UsageModule } from './usage/usage.module.js';

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.register(config),
        SupabaseModule,
        AiModule,
        DocumentsModule,
        ChatModule,
        UsageModule,
      ],
      controllers: [HealthController],
      providers: [
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
    };
  }
}
