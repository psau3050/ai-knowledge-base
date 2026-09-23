import type { ApiErrorBody } from '@kb/shared';
import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { AiProviderError } from '../ai/ai.errors.js';

const CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  429: 'rate_limited',
};

/** Every error leaves the API in one shape: `{ error: { code, message, details? } }`. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, error } = this.describe(exception);

    if (status >= 500) this.logger.error(error.message, this.trace(exception));

    // A streaming response has already sent its headers; its errors travel inside the stream.
    if (response.headersSent) {
      response.end();
      return;
    }
    response.status(status).json({ error } satisfies ApiErrorBody);
  }

  private describe(exception: unknown): { status: number; error: ApiErrorBody['error'] } {
    if (exception instanceof AiProviderError) {
      // A provider rate limit is actionable for the user; anything else is an upstream failure.
      const status = exception.status === 429 ? 429 : 502;
      return { status, error: { code: 'ai_provider_error', message: exception.message } };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const fields = typeof body === 'object' ? (body as Record<string, unknown>) : {};
      const message = Array.isArray(fields.message)
        ? fields.message.join('; ')
        : typeof fields.message === 'string'
          ? fields.message
          : exception.message;
      return {
        status,
        error: {
          code: typeof fields.code === 'string' ? fields.code : (CODES[status] ?? 'error'),
          message: status >= 500 ? 'Unexpected server error' : message,
          ...(fields.details !== undefined && { details: fields.details }),
        },
      };
    }
    return { status: 500, error: { code: 'internal_error', message: 'Unexpected server error' } };
  }

  private trace(exception: unknown): string | undefined {
    if (!(exception instanceof Error)) return String(exception);
    const cause = exception.cause ? `\nCaused by: ${JSON.stringify(exception.cause)}` : '';
    return `${exception.stack ?? exception.message}${cause}`;
  }
}
