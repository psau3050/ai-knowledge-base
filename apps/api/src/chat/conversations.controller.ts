import {
  createConversationSchema,
  formatSseEvent,
  renameConversationSchema,
  sendMessageSchema,
  type ChatStreamEvent,
  type Conversation,
  type ConversationDetail,
} from '@kb/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import { AiProviderError } from '../ai/ai.errors.js';
import { Ctx } from '../auth/auth.decorators.js';
import type { UserContext } from '../auth/user-context.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ChatService } from './chat.service.js';
import { ConversationsService } from './conversations.service.js';

@Controller('conversations')
export class ConversationsController {
  private readonly logger = new Logger(ConversationsController.name);

  constructor(
    private readonly conversations: ConversationsService,
    private readonly chat: ChatService,
  ) {}

  @Get()
  list(@Ctx() ctx: UserContext): Promise<Conversation[]> {
    return this.conversations.list(ctx);
  }

  @Post()
  create(
    @Ctx() ctx: UserContext,
    @Body(new ZodValidationPipe(createConversationSchema))
    body: z.output<typeof createConversationSchema>,
  ): Promise<Conversation> {
    return this.conversations.create(ctx, body.title);
  }

  @Get(':id')
  get(
    @Ctx() ctx: UserContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationDetail> {
    return this.conversations.get(ctx, id);
  }

  @Patch(':id')
  rename(
    @Ctx() ctx: UserContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(renameConversationSchema))
    body: z.output<typeof renameConversationSchema>,
  ): Promise<Conversation> {
    return this.conversations.rename(ctx, id, body.title);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Ctx() ctx: UserContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.conversations.remove(ctx, id);
  }

  /** Streams one RAG turn as Server-Sent Events; see `ChatStreamEvent` in @kb/shared. */
  @Post(':id/messages')
  async sendMessage(
    @Ctx() ctx: UserContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: z.output<typeof sendMessageSchema>,
    @Res() res: Response,
  ): Promise<void> {
    // Fail with a regular JSON 404 before any streaming starts.
    await this.conversations.assertExists(ctx, id);

    // Stop paying for tokens nobody will read: a closed tab aborts the provider request.
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    try {
      for await (const event of this.chat.reply(ctx, id, body.content, abort.signal)) {
        res.write(formatSseEvent(event));
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        this.logger.warn(
          `Chat turn failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        const event: ChatStreamEvent = { type: 'error', message: userFacingMessage(error) };
        res.write(formatSseEvent(event));
      }
    } finally {
      res.end();
    }
  }
}

function userFacingMessage(error: unknown): string {
  if (error instanceof AiProviderError || error instanceof HttpException) return error.message;
  return 'Something went wrong while answering. Please try again.';
}
