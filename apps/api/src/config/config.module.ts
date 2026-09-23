import { Global, Module, type DynamicModule } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from './config.js';

@Global()
@Module({})
export class ConfigModule {
  /** Config is parsed before Nest boots (see main.ts), so a bad .env fails with a readable message. */
  static register(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
