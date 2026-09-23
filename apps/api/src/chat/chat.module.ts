import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { RetrievalModule } from '../retrieval/retrieval.module.js';
import { UsageModule } from '../usage/usage.module.js';
import { ChatService } from './chat.service.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';

@Module({
  imports: [AiModule, RetrievalModule, UsageModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, ChatService],
})
export class ChatModule {}
