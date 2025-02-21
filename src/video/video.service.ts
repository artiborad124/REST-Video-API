import { Injectable, BadRequestException, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as fs from 'fs';
import * as ffmpeg from 'fluent-ffmpeg';;
import { InjectRepository } from '@nestjs/typeorm';
import { Video } from './entity/video.entity';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { createReadStream, statSync } from 'fs';

@Injectable()
export class VideoService {
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

      const outputFileName = `trimmed-${video.filename}`;
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

      if (videos.length !== videoIds.length || videoIds.length === 0 || !videoIds){
        throw new BadRequestException('Invalid video IDs');
      }
  
      const timestamp = Date.now();
      const outputFileName = `merged-${timestamp}.mp4`;
      const outputPath = `./uploads/${outputFileName}`;
      const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
  
      return await new Promise(async (resolve, reject) => {
        const tempFiles = videos.map((video, index) => `./uploads/temp_${index}.ts`);
      
        // Create an array of promises for each video processing task
        const videoProcessingPromises = videos.map((video, index) => {
          return new Promise((resolve, reject) => {
            ffmpeg(video.filepath)
              .outputOptions(['-c', 'copy', '-bsf:v', 'h264_mp4toannexb', '-f', 'mpegts'])
              .output(tempFiles[index])
              .on('end', resolve)
              .on('error', reject)
              .run();
          });
        });
      
        // Wait for all video processing to complete
        try {
          await Promise.all(videoProcessingPromises);
      
          // Once all are converted, concatenate them
          ffmpeg()
            .input(`concat:${tempFiles.join('|')}`)
            .outputOptions(['-c', 'copy', '-bsf:a', 'aac_adtstoasc'])
            .output(outputPath)
            .on('end', async () => {
              // Clean up temporary files
              await Promise.all(tempFiles.map(file => unlink(file)));
              const mergedVideoUrl = `${BASE_URL}/uploads/${outputFileName}`;
              resolve({
                message: 'Video merged successfully',
                mergedVideoUrl: mergedVideoUrl,
              });
            })
            .on('error', (err) => {
              // Handle errors during concatenation
              reject(new BadRequestException('Error merging videos'));
            })
            .run();
        } catch (err) {
          // Handle errors from the individual video processing
          reject(new BadRequestException('Error processing videos'));
        }
      });
    } catch (error) {
      console.log('Error in mergeVideos:', error); // Log error
      throw new BadRequestException(error.message);
    }
  }

  async generateShareableLink(videoId: string, expiryMinutes: number): Promise<{ shareableLink: string; expiry: Date }> {
    const video = await this.videoRepo.findOne({ where: { id: videoId } });
    if (!video) {
      throw new NotFoundException('Video not found');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + expiryMinutes * 60 * 1000);

    video.shareToken = token;
    video.shareExpiry = expiry;

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const shareableLink = `${baseUrl}/video/${video.id}/share?token=${token}`;

    video.shareableLink = shareableLink;
    await this.videoRepo.save(video);

    return { shareableLink, expiry };
  }

  async validateSharedVideo(videoId: string, token: string): Promise<Video> {
    if (!token) {
      throw new BadRequestException('Token is required');
    }

    const video = await this.videoRepo.findOne({ where: { id: videoId } });
    if (!video) {
      throw new NotFoundException('Video not found');
    }

    if (video.shareToken !== token) {
      throw new UnauthorizedException('Invalid share token');
    }

    if (!video.shareExpiry || new Date() > new Date(video.shareExpiry)) {
      throw new UnauthorizedException('Shareable link has expired');
    }

    return video;
  }

  async streamVideo(videoId: string, token: string, req: any, res: any): Promise<void> {
    const video = await this.validateSharedVideo(videoId, token);
    
    const filePath = join(__dirname, '../../uploads', video.filename);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Video file not found');
    }

    const stat = statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    res.setHeader('Content-Type', 'video/mp4');
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.status(206).set({
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
      });

      createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', fileSize);
      createReadStream(filePath).pipe(res);
    }
  }
}
