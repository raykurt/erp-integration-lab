import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './config';
import { configureApp } from './setup';

async function bootstrap(): Promise<void> {
  const app = configureApp(await NestFactory.create(AppModule));
  await app.listen(config.port);
  console.log(`API on http://localhost:${config.port}  ·  Swagger UI on http://localhost:${config.port}/docs`);
}
bootstrap();
