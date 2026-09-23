import type { AiMeta } from '@kb/shared';
import { Controller, Get, Inject } from '@nestjs/common';
import { Public } from '../auth/auth.decorators.js';
import { CHAT_MODEL, EMBEDDING_MODEL, type ChatModel, type EmbeddingModel } from './ai.types.js';

@Controller('ai')
export class AiController {
  constructor(
    @Inject(CHAT_MODEL) private readonly chatModel: ChatModel,
    @Inject(EMBEDDING_MODEL) private readonly embeddingModel: EmbeddingModel,
  ) {}

  /** Lets the UI show which providers are active, which makes a provider swap visible. */
  @Public()
  @Get('meta')
  meta(): AiMeta {
    return {
      chat: { provider: this.chatModel.provider, model: this.chatModel.model },
      embeddings: {
        provider: this.embeddingModel.provider,
        model: this.embeddingModel.model,
        dimensions: this.embeddingModel.dimensions,
      },
    };
  }
}
