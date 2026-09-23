import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  type HttpException,
} from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';

/** Maps a PostgREST / Postgres error to the HTTP error the client should see. */
export function toHttpError(error: PostgrestError, notFoundMessage = 'Not found'): HttpException {
  switch (error.code) {
    // `.single()` matched no row. RLS makes other users' rows invisible, so this also covers them.
    case 'PGRST116':
      return new NotFoundException(notFoundMessage);
    case '23505':
      return new ConflictException(error.message);
    // check_violation, string_data_right_truncation
    case '23514':
    case '22001':
      return new BadRequestException(error.message);
    default:
      return new InternalServerErrorException('Database request failed', { cause: error });
  }
}
