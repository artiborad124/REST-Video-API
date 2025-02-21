import { BadRequestException, INestApplication, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { VideoService } from './video.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Video } from './entity/video.entity';
import * as fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import * as request from 'supertest';
import * as crypto from 'crypto';

jest.mock('fs');

jest.mock('fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('fluent-ffmpeg', () => {
  const mockFfmpeg = jest.fn(() => ({
    setStartTime: jest.fn().mockReturnThis(),
    setDuration: jest.fn().mockReturnThis(),
    output: jest.fn().mockReturnThis(),
    input: jest.fn().mockReturnThis(),
    outputOptions: jest.fn().mockReturnThis(),
    on: jest.fn().mockImplementation(function (event, callback) {
      if (event === 'end') setTimeout(callback, 100); // Simulate async success
      if (event === 'error') setTimeout(() => callback(new Error('FFmpeg Error')), 100); // Simulate error
      return this;
    }),
    run: jest.fn(),
  }));

  return mockFfmpeg;
});

describe('VideoUploadService', () => {
  let app: INestApplication;
  let service: VideoService;
  let videoRepo: Repository<Video>;

  beforeEach(async () => {
    const mockRepository = {
      findByIds: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoService,
        {
          provide: getRepositoryToken(Video),
          useValue: mockRepository,
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();


    service = module.get<VideoService>(VideoService);
    videoRepo = module.get(getRepositoryToken(Video));
  });

  afterEach(async () => {
    await app.close();
  });


  describe('Upload video', () => {

    it('should upload a valid video successfully', async () => {
      const mockFile = {
        filename: '1740034043245-691678761.mkv',
        path: '/uploads/1740034043245-691678761.mkv',
        size: 10 * 1024 * 1024, // 10MB
      } as Express.Multer.File;

      jest.spyOn(service, 'getVideoDuration').mockResolvedValue(10);
      jest.spyOn(videoRepo, 'create').mockReturnValue(mockFile as any);
      jest.spyOn(videoRepo, 'save').mockResolvedValue(mockFile as any);

      const result = await service.uploadVideo(mockFile);

      expect(result).toBeDefined();
      expect(result.filename).toEqual('1740034043245-691678761.mkv');
      expect(videoRepo.create).toHaveBeenCalled();
      expect(videoRepo.save).toHaveBeenCalled();
    });

    it('should throw an error if file size exceeds limit', async () => {
      const mockFile = {
        filename: 'large.mp4',
        path: '/uploads/large.mp4',
        size: 30 * 1024 * 1024, // 30MB
      } as Express.Multer.File;

      await expect(service.uploadVideo(mockFile)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should delete the file and throw an error if duration is invalid', async () => {
      const mockFile = {
        filename: 'short.mkv',
        path: '/uploads/short.mkv',
        size: 10 * 1024 * 1024, // 10MB
      } as Express.Multer.File;

      jest.spyOn(service, 'getVideoDuration').mockResolvedValue(3);
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync');

      await expect(service.uploadVideo(mockFile)).rejects.toThrow(
        BadRequestException,
      );

      expect(unlinkSpy).toHaveBeenCalledWith(mockFile.path);
    });

    it('should handle internal errors gracefully', async () => {
      const mockFile = {
        filename: 'corrupt.mp4',
        path: '/uploads/corrupt.mp4',
        size: 10 * 1024 * 1024, // 10MB
      } as Express.Multer.File;

      jest.spyOn(service, 'getVideoDuration').mockRejectedValue(
        new Error('Processing error'),
      );

      await expect(service.uploadVideo(mockFile)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw error if video does not exist', async () => {
      jest.spyOn(videoRepo, 'findOne').mockResolvedValue(null);

      await expect(service.trimVideo('123', 0, 10)).rejects.toThrow(BadRequestException);
    });

    it('should throw error if start time >= end time', async () => {
      jest.spyOn(videoRepo, 'findOne').mockResolvedValue({
        id: '123',
        filename: 'test.mp4',
        filepath: './uploads/test.mp4',
        duration: 30,
      } as Video);

      await expect(service.trimVideo('123', 10, 5)).rejects.toThrow(BadRequestException);
    });

    it('should throw error if start time is negative', async () => {
      jest.spyOn(videoRepo, 'findOne').mockResolvedValue({
        id: '123',
        filename: 'test.mp4',
        filepath: './uploads/test.mp4',
        duration: 30,
      } as Video);

      await expect(service.trimVideo('123', -5, 10)).rejects.toThrow(BadRequestException);
    });

    it('should throw error if end time exceeds video duration', async () => {
      jest.spyOn(videoRepo, 'findOne').mockResolvedValue({
        id: '123',
        filename: 'test.mp4',
        filepath: './uploads/test.mp4',
        duration: 30,
      } as Video);

      await expect(service.trimVideo('123', 5, 40)).rejects.toThrow(BadRequestException);
    });
  })

  describe('trim video', () => {
    it('should return trimmed video URL on success', async () => {
      jest.spyOn(videoRepo, 'findOne').mockResolvedValue({
        id: '123',
        filename: 'test.mp4',
        filepath: './uploads/test.mp4',
        duration: 30,
      } as Video);

      const result = await service.trimVideo('123', 5, 10);

      expect(result).toEqual({
        message: 'Video trimmed successfully',
        trimmedVideoUrl: expect.stringContaining('/uploads/trimmed-'),
      });
    });

    it('should throw error if start time >= end time', async () => {
      // Mock videoRepo.findOne to return a valid video
      jest.spyOn(videoRepo, 'findOne').mockResolvedValue({
        id: '123',
        filename: 'test.mp4',
        filepath: './uploads/test.mp4',
        duration: 30,
      } as Video);

      await expect(service.trimVideo('123', 10, 5)).rejects.toThrow(BadRequestException);
    });


    it('should throw error if end time exceeds video duration', async () => {
      jest.spyOn(videoRepo, 'findOne').mockResolvedValue({
        id: '123',
        filename: 'test.mp4',
        filepath: './uploads/test.mp4',
        duration: 30,
      } as Video);

      await expect(service.trimVideo('123', 5, 40)).rejects.toThrow(BadRequestException);
    });


    it('should throw error if end time exceeds video duration', async () => {
      jest.spyOn(videoRepo, 'findOne').mockResolvedValue({
        id: '123',
        filename: 'test.mp4',
        filepath: './uploads/test.mp4',
        duration: 30,
      } as Video);

      await expect(service.trimVideo('123', 5, 40)).rejects.toThrow(BadRequestException);
    });

  })


  describe('shareable link', () => {
    it('should generate a valid shareable link', async () => {
      const mockVideo = {
        id: '123',
        shareToken: null,
        shareExpiry: null,
      } as any;

      jest.spyOn(videoRepo, 'findOne').mockResolvedValue(mockVideo);
      jest.spyOn(videoRepo, 'save').mockResolvedValue(mockVideo);
      jest.spyOn(crypto, 'randomBytes').mockImplementation(() => Buffer.from('mocktoken12345678901234567890123456789012'));


      const result = await service.generateShareableLink('123', 60);

      expect(result).toBeDefined();
      expect(result.shareableLink).toMatch(new RegExp(`http:\/\/localhost:3000\/video\/123\/share\\?token=${Buffer.from('mocktoken12345678901234567890123456789012').toString('hex')}`));
      expect(result.expiry).toBeInstanceOf(Date);
      expect(videoRepo.save).toHaveBeenCalledWith(expect.objectContaining({ shareToken: expect.any(String), shareExpiry: expect.any(Date) }));
    });

    it('should throw NotFoundException if video does not exist', async () => {
      jest.spyOn(videoRepo, 'findOne').mockResolvedValue(null);

      await expect(service.generateShareableLink('invalid-id', 60)).rejects.toThrow(NotFoundException);
    });

    it('should set the correct expiry time based on expiryMinutes', async () => {
      const mockVideo = {
        id: '456',
        shareToken: null,
        shareExpiry: null,
      } as any;

      jest.spyOn(videoRepo, 'findOne').mockResolvedValue(mockVideo);
      jest.spyOn(videoRepo, 'save').mockResolvedValue(mockVideo);

      const expiryMinutes = 30;
      const beforeTime = new Date(Date.now() + expiryMinutes * 60 * 1000 - 5000); // Allow small buffer
      const result = await service.generateShareableLink('456', expiryMinutes);
      const afterTime = new Date(Date.now() + expiryMinutes * 60 * 1000 + 5000);

      expect(result.expiry.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(result.expiry.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should use the BASE_URL from environment variables if defined', async () => {
      process.env.BASE_URL = 'https://mycustomdomain.com';

      const mockVideo = {
        id: '789',
        shareToken: null,
        shareExpiry: null,
      } as any;

      jest.spyOn(videoRepo, 'findOne').mockResolvedValue(mockVideo);
      jest.spyOn(videoRepo, 'save').mockResolvedValue(mockVideo);

      const result = await service.generateShareableLink('789', 60);

      expect(result.shareableLink).toMatch(/https:\/\/mycustomdomain.com\/video\/789\/share\?token=/);
    });

    it('should generate a unique token each time', async () => {
      const mockVideo = {
        id: '123',
        shareToken: null,
        shareExpiry: null,
      } as any;

      jest.spyOn(videoRepo, 'findOne').mockResolvedValue(mockVideo);
      jest.spyOn(videoRepo, 'save').mockResolvedValue(mockVideo);

      // ✅ Fix: Ensure the token is unique each time
      jest.spyOn(crypto, 'randomBytes').mockImplementation((size) => Buffer.from([...Array(size)].map(() => Math.floor(Math.random() * 256))));

      const result1 = await service.generateShareableLink('123', 10);
      const result2 = await service.generateShareableLink('123', 10);

      expect(result1.shareableLink).not.toEqual(result2.shareableLink);
    });

  })

  describe('merge video', () => {

    it('should successfully merge videos', async () => {
      const mockVideos = [
        { id: '1', filepath: './uploads/video1.mp4' },
        { id: '2', filepath: './uploads/video2.mp4' },
      ];

      (videoRepo.findByIds as jest.Mock).mockResolvedValue(mockVideos);

      const result = await service.mergeVideos(['1', '2']);

      expect(result).toEqual({
        message: 'Video merged successfully',
        mergedVideoUrl: expect.stringContaining('/uploads/merged-'),
      });

    });

    it('should throw BadRequestException for invalid video IDs', async () => {
      (videoRepo.findByIds as jest.Mock).mockResolvedValue([]); // No videos found

      await expect(service.mergeVideos(['invalid-id'])).rejects.toThrow(
        new BadRequestException('Invalid video IDs'),
      );
    });


    it('should successfully merge a large number of videos', async () => {
      const mockVideos = Array.from({ length: 100 }, (_, index) => ({
        id: String(index + 1),
        filepath: `./uploads/video${index + 1}.mp4`,
      }));

      (videoRepo.findByIds as jest.Mock).mockResolvedValue(mockVideos);

      const result = await service.mergeVideos(mockVideos.map(video => video.id));

      expect(result).toEqual({
        message: 'Video merged successfully',
        mergedVideoUrl: expect.stringContaining('/uploads/merged-'),
      });
    });
  })
});
