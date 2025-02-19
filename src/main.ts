import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AuthMiddleware } from './auth/auth.middleware';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const uploadFolder = join(__dirname, '..', 'uploads');
  if (!existsSync(uploadFolder)) {
    mkdirSync(uploadFolder);
    console.log('Upload folder created.');
  }
  app.use(new AuthMiddleware().use);
  await app.listen(3000);
}
bootstrap();
