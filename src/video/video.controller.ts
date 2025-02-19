import { Controller, Post, UseInterceptors, UploadedFile, Param, Body, BadRequestException, Get, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VideoUploadService } from './video.service';

declare global {
  namespace Express {
    export interface Multer {
      File: any;
    }
  }
}

@Controller('video')
export class VideoUploadController {
  constructor(private readonly videoUploadService: VideoUploadService) { }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { dest: './uploads' }))
  async uploadVideo(@UploadedFile() file: Express.Multer.File) {
    try {
      console.log('file: ', file);
      const processedVideoPath = await this.videoUploadService.uploadVideo(file);
      return { message: 'Video uploaded and processed successfully', path: processedVideoPath };
    } catch (error) {
      console.log('error: ', error);
      throw new BadRequestException(error.message)
    }
  }

  @Post(':id/trim')
  async trimVideo(
    @Param('id') id: string,
    @Body('start') start: number,
    @Body('end') end: number,
  ) {
    try {
      return this.videoUploadService.trimVideo(id, start, end);
    } catch (error) {
      console.log('error: ', error);
      throw new BadRequestException(error.message)
    }
  }

  @Post('merge')
  async mergeVideos(@Body('videoIds') videoIds: string[]) {
    try {
      return this.videoUploadService.mergeVideos(videoIds);
    } catch (error) {
      console.log('error: ', error);
      throw new BadRequestException(error.message)
    }
  }

}
