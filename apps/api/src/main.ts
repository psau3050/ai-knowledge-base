import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadConfig, loadEnvFile } from './config/config.js';

async function bootstrap(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();

  const app = await NestFactory.create(AppModule.register(config));
  app.enableCors({ origin: config.webOrigin });
  app.enableShutdownHooks();
  await app.listen(config.port);

  const { chat, embeddings } = config.ai;
  new Logger('Bootstrap').log(
    `API listening on http://localhost:${config.port} · chat: ${chat.provider}/${chat.model} · ` +
      `embeddings: ${embeddings.provider}/${embeddings.model} (${embeddings.dimensions}d)`,
  );
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
