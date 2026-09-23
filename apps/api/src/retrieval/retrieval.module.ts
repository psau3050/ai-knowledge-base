import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { UsageModule } from '../usage/usage.module.js';
import { RetrievalService } from './retrieval.service.js';

@Module({
  imports: [AiModule, UsageModule],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
