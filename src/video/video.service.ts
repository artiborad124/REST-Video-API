import { Injectable, BadRequestException, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as fs from 'fs';
import * as ffmpeg from 'fluent-ffmpeg';;
import { InjectRepository } from '@nestjs/typeorm';
import { Video } from './entity/video.entity';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { unlink } from 'fs/promises';

@Injectable()
export class VideoUploadService {
  constructor(
    @InjectRepository(Video) private readonly videoRepo: Repository<Video>,
  ) { }

  async uploadVideo(file: Express.Multer.File): Promise<Video> {
    try {
      const maxSize = 25 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new BadRequestException('File size exceeds limit');
      }

      const duration = await this.getVideoDuration(file.path);
      if (duration < 5 || duration > 25) {
        fs.unlinkSync(file.path);
        throw new BadRequestException('Invalid video duration');
      }

      const video = this.videoRepo.create({
        filename: file.filename,
        filepath: file.path,
        size: file.size,
        duration,
      });

      return await this.videoRepo.save(video);
    } catch (error) {
      console.log('error: ', error);
      throw new BadRequestException(error.message)
    }
  }

  async getVideoDuration(filePath: string): Promise<number> {
    try {
      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
          if (err) reject(err);
          resolve(metadata.format.duration);
        });
      });
    } catch (error) {
      console.log('error: ', error);
      throw new BadRequestException(error.message)
    }
  }

  async trimVideo(videoId: string, start: number, end: number) {
    try {
      const video = await this.videoRepo.findOne({ where: { id: videoId } });
      if (!video) throw new BadRequestException('Video not found');

      if (start >= end || start < 0 || end > video.duration) {
        throw new BadRequestException('Invalid start and end times');
      }

      const outputFileName = `trimmed-${video.filename}.mp4`;
      const outputFile = `./uploads/${outputFileName}`;
      const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

      return new Promise((resolve, reject) => {
        ffmpeg(video.filepath)
          .setStartTime(start)
          .setDuration(end - start)
          .output(outputFile)
          .on('end', () => {
            const trimmedVideoUrl = `${BASE_URL}/uploads/${outputFileName}`;
            resolve({
              message: 'Video trimmed successfully',
              trimmedVideoUrl,
            });
          })
          .on('error', (err) =>
            reject(new InternalServerErrorException('Error trimming video')),
          )
          .run();
      });
    } catch (error) {
      console.log('error: ', error);
      throw new BadRequestException(error.message)
    }
  }

  async mergeVideos(videoIds: string[]) {
    try {
      const videos = await this.videoRepo.findByIds(videoIds);
      if (videos.length !== videoIds.length) {
        throw new BadRequestException('Invalid video IDs');
      }

      const timestamp = Date.now();
      const outputFileName = `merged-${timestamp}.mp4`;
      const outputPath = `./uploads/${outputFileName}`;
      const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

      return new Promise((resolve, reject) => {
        const ffmpegCmd = ffmpeg();

        // Convert each video to raw format for concatenation
        const tempFiles = videos.map((video, index) => `./uploads/temp_${index}.ts`);

        let processCount = 0;
        videos.forEach((video, index) => {
          ffmpeg(video.filepath)
            .outputOptions(['-c', 'copy', '-bsf:v', 'h264_mp4toannexb', '-f', 'mpegts'])
            .output(tempFiles[index])
            .on('end', () => {
              processCount++;
              if (processCount === videos.length) {
                // Once all are converted, concatenate them
                ffmpeg()
                  .input(`concat:${tempFiles.join('|')}`)
                  .outputOptions(['-c', 'copy', '-bsf:a', 'aac_adtstoasc'])
                  .output(outputPath)
                  .on('end', async () => {
                    await Promise.all(tempFiles.map(file => unlink(file)));
                    const mergedVideoUrl = `${BASE_URL}/uploads/${outputFileName}`;
                    resolve({
                      message: 'Video merged successfully',
                      mergedVideoUrl: mergedVideoUrl,
                    });
                  })
                  .on('error', (err) => {
                    console.error('FFmpeg error:', err);
                    reject(new BadRequestException('Error merging videos'));
                  })
                  .run();
              }
            })
            .on('error', (err) => {
              console.error('FFmpeg error:', err);
              reject(new BadRequestException('Error processing video'));
            })
            .run();
        });
      });
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

}
