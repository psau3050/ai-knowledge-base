/** A provider call failed or returned something unusable. Mapped to 502 by the exception filter. */
export class AiProviderError extends Error {
  override readonly name = 'AiProviderError';

  constructor(
    readonly provider: string,
    message: string,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
