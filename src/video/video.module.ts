import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Video } from './entity/video.entity';
import { VideoUploadService } from './video.service';
import { VideoUploadController } from './video.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Video])],
  providers: [VideoUploadService],
  controllers: [VideoUploadController],
})
export class VideoModule { }
