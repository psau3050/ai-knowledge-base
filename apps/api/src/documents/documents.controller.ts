import {
  createDocumentSchema,
  listDocumentsQuerySchema,
  updateDocumentSchema,
  type DocumentDetail,
  type DocumentSummary,
} from '@kb/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { z } from 'zod';
import { Ctx } from '../auth/auth.decorators.js';
import type { UserContext } from '../auth/user-context.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DocumentsService } from './documents.service.js';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(
    @Ctx() ctx: UserContext,
    @Query(new ZodValidationPipe(listDocumentsQuerySchema))
    query: z.output<typeof listDocumentsQuerySchema>,
  ): Promise<DocumentSummary[]> {
    return this.documents.list(ctx, query);
  }

  @Post()
  create(
    @Ctx() ctx: UserContext,
    @Body(new ZodValidationPipe(createDocumentSchema)) body: z.output<typeof createDocumentSchema>,
  ): Promise<DocumentDetail> {
    return this.documents.create(ctx, body);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @Ctx() ctx: UserContext,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<DocumentDetail> {
    if (!file) throw new BadRequestException('Attach the file in a "file" form field');
    return this.documents.createFromFile(ctx, file);
  }

  @Post('reindex')
  @HttpCode(200)
  reindexOutdated(@Ctx() ctx: UserContext): Promise<{ reindexed: number }> {
    return this.documents.reindexOutdated(ctx);
  }

  @Get(':id')
  get(@Ctx() ctx: UserContext, @Param('id', ParseUUIDPipe) id: string): Promise<DocumentDetail> {
    return this.documents.get(ctx, id);
  }

  @Patch(':id')
  update(
    @Ctx() ctx: UserContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateDocumentSchema)) body: z.output<typeof updateDocumentSchema>,
  ): Promise<DocumentDetail> {
    return this.documents.update(ctx, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Ctx() ctx: UserContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.documents.remove(ctx, id);
  }

  @Post(':id/reindex')
  @HttpCode(200)
  reindex(
    @Ctx() ctx: UserContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentDetail> {
    return this.documents.reindex(ctx, id);
  }
}
