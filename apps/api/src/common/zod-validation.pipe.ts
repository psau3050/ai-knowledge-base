import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';

/**
 * Validates input against a schema from @kb/shared, so the web client and the API enforce the same
 * contract from one definition.
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'validation_failed',
        message: z.prettifyError(result.error),
        details: z.flattenError(result.error).fieldErrors,
      });
    }
    return result.data;
  }
}
