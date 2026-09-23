import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { UsageModule } from '../usage/usage.module.js';
import { IngestionService } from './ingestion.service.js';

@Module({
  imports: [AiModule, UsageModule],
  providers: [IngestionService],
  exports: [IngestionService],
})
export class IngestionModule {}
