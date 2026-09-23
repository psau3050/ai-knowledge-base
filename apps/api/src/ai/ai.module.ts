import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { AiController } from './ai.controller.js';
import { CHAT_MODEL, EMBEDDING_MODEL } from './ai.types.js';
import { OpenAICompatibleChatModel, OpenAICompatibleEmbeddingModel } from './openai-compatible.js';

/** The only place that knows which implementation backs the AI interfaces. */
@Module({
  controllers: [AiController],
  providers: [
    {
      provide: CHAT_MODEL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new OpenAICompatibleChatModel(config.ai.chat),
    },
    {
      provide: EMBEDDING_MODEL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new OpenAICompatibleEmbeddingModel(config.ai.embeddings),
    },
  ],
  exports: [CHAT_MODEL, EMBEDDING_MODEL],
})
export class AiModule {}
