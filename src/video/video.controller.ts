import { Controller, Post, UseInterceptors, UploadedFile, Param, Body, BadRequestException, Get, Query, NotFoundException, Res, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VideoService } from './video.service';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Response, Request } from 'express';
declare global {
  namespace Express {
    export interface Multer {
      File: any;
    }
  }
}

@Controller('video')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const extension = extname(file.originalname); // Get the file extension
          const filename = `${uniqueSuffix}${extension}`; // Append the extension to the filename
          callback(null, filename);
        },
      }),
    }),
  )
  async uploadVideo(@UploadedFile() file: Express.Multer.File) {
    try {
      const processedVideoPath = await this.videoService.uploadVideo(file);
      return {
        message: 'Video uploaded and processed successfully',
        path: processedVideoPath,
      };
    } catch (error) {
      console.log('error: ', error);
      throw new BadRequestException(error.message);
    }
  }

  @Post(':id/trim')
  async trimVideo(
    @Param('id') id: string,
    @Body('start') start: number,
    @Body('end') end: number,
  ) {
    try {
      return this.videoService.trimVideo(id, start, end);
    } catch (error) {
      console.log('error: ', error);
      throw new BadRequestException(error.message);
    }
  }

  @Post('merge')
  async mergeVideos(@Body('videoIds') videoIds: string[]) {
    try {
      return this.videoService.mergeVideos(videoIds);
    } catch (error) {
      console.log('error: ', error);
      throw new BadRequestException(error.message);
    }
  }

  @Get(':id/share')
  async handleVideoRequest(
    @Req() req: Request,
    @Res() res: Response,
    @Param('id') id: string,
    @Query('token') token?: string,
    @Query('expiry') expiryMinutes?: number,
  ) {
    if (!token) {
      if (!expiryMinutes) {
        throw new BadRequestException('Expiry time is required when generating a link');
      }
      const response = await this.videoService.generateShareableLink(id, expiryMinutes);
      return res.json(response);
    }

    await this.videoService.streamVideo(id, token, req, res);
  }
}
