import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideoModule } from './video/video.module';
import { Video } from './video/entity/video.entity';
import { MulterModule } from '@nestjs/platform-express';
import * as multer from 'multer';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'video.sqlite',
      entities: [Video],
      synchronize: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env'
    }),
    VideoModule,
    MulterModule.register({
      storage: multer.memoryStorage(),
      limits: {
        fieldSize: 25 * 1024 * 1024,
      }
    }),
  ],
})
export class AppModule { }
