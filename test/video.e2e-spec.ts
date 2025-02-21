import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { VideoController } from '../src/video/video.controller';
import { VideoService } from '../src/video/video.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Video } from '../src/video/entity/video.entity';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

describe('VideoController (e2e)', () => {
  let app: INestApplication;
  let videoService: VideoService;
  let videoRepository: Repository<Video>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Video],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Video]),
        MulterModule.register({
          storage: diskStorage({
            destination: './uploads',
            filename: (req, file, callback) => {
              const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
              const extension = extname(file.originalname);
              const filename = `${uniqueSuffix}${extension}`;
              callback(null, filename);
            },
          }),
        }),
      ],
      controllers: [VideoController],
      providers: [VideoService],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    videoService = moduleFixture.get<VideoService>(VideoService);
    videoRepository = moduleFixture.get<Repository<Video>>(getRepositoryToken(Video));
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await videoRepository.clear();
  });

  describe('POST /video/upload', () => {
    it('should upload a video successfully', async () => {
      console.log("first")
      const filePath = `${__dirname}/upload/video2.mp4`;
      console.log('filePath: ', filePath);
      const response = await request(app.getHttpServer())
        .post('/video/upload')
        .attach('file', filePath)
        .expect(201);

      console.log('response.body: ', response.body);
      expect(response.body).toHaveProperty('message', 'Video uploaded and processed successfully');
      expect(response.body).toHaveProperty('path');
    });

    it('should fail if file size exceeds limit', async () => {
      const filePath = './test/upload/large.mp4'; // Path to a large video file

      const response = await request(app.getHttpServer())
        .post('/video/upload')
        .attach('file', filePath)
        .expect(400);

      expect(response.body.message).toContain('File size exceeds limit');
    });

    it('should fail if video duration is invalid', async () => {
      const filePath = './test/upload/short.mkv';

      const response = await request(app.getHttpServer())
        .post('/video/upload')
        .attach('file', filePath)
        .expect(400);

      expect(response.body.message).toContain('Invalid video duration');
    })
  })

  describe('POST /video/:id/trim', () => {
    it('should trim a video successfully', async () => {
      const video = await videoRepository.save({
        filename: 'v1.mp4',
        filepath: './uploads/v1.mp4',
        size: 1024,
        duration: 10,
      });

      const response = await request(app.getHttpServer())
        .post(`/video/${video.id}/trim`)
        .send({ start: 1, end: 5 })
        .expect(201);

      expect(response.body).toHaveProperty('message', 'Video trimmed successfully');
      expect(response.body).toHaveProperty('trimmedVideoUrl');
    });

    it('should fail if video is not found', async () => {
      const response = await request(app.getHttpServer())
        .post('/video/invalid-id/trim')
        .send({ start: 1, end: 5 })
        .expect(400);

      expect(response.body.message).toContain('Video not found');
    });

    it('should fail if start and end times are invalid', async () => {
      const video = await videoRepository.save({
        filename: 'video2.mp4',
        filepath: './uploads/video2.mp4',
        size: 1024,
        duration: 10,
      });

      const response = await request(app.getHttpServer())
        .post(`/video/${video.id}/trim`)
        .send({ start: 5, end: 1 })
        .expect(400);

      expect(response.body.message).toContain('Invalid start and end times');
    });
  });

  describe('POST /video/merge', () => {
    let video1: Video;
    let video2: Video;

    beforeEach(() => {
      video1 = new Video();
      video1.id = '1';
      video1.filename = 'v1.mp4';
      video1.filepath = './uploads/v1.mp4';
      video1.duration = 10;

      video2 = new Video();
      video2.id = '2';
      video2.filename = 'video2.mp4';
      video2.filepath = './uploads/video2.mp4';
      video2.duration = 15;
    });

    it('should merge videos successfully', async () => {
      jest.spyOn(videoRepository, 'findByIds').mockResolvedValue([video1, video2]);
      jest.spyOn(videoService, 'mergeVideos').mockResolvedValue({
        message: 'Video merged successfully',
        mergedVideoUrl: 'http://localhost:3000/uploads/merged-video.mp4',
      });

      const response = await request(app.getHttpServer())
        .post('/video/merge')
        .send({ videoIds: ['1', '2'] })
        .expect(201);

      console.log('response.body: ', response.body);
      expect(response.body).toEqual({
        message: 'Video merged successfully',
        mergedVideoUrl: 'http://localhost:3000/uploads/merged-video.mp4',
      });
    });

  });

  describe('GET /video/:id/share', () => {
    it('should generate a shareable link', async () => {
      const video = await videoRepository.save({
        filename: 'short.mp4',
        filepath: './uploads/short.mp4',
        size: 1024,
        duration: 10,
      });
      console.log('video=========>', video)

      const response = await request(app.getHttpServer())
        .get(`/video/${video.id}/share`)
        .query({ expiry: 10 })
      // .expect(200);

      console.log('response.body: ', response.body);
      expect(response.body).toHaveProperty('shareableLink');
      expect(response.body).toHaveProperty('expiry');
    });

    it('should fail if expiry time is not provided', async () => {
      const video = await videoRepository.save({
        filename: 'v1.mp4',
        filepath: './uploads/v1.mp4',
        size: 1024,
        duration: 10,
      });

      const response = await request(app.getHttpServer())
        .get(`/video/${video.id}/share`)
        .expect(400);

      expect(response.body.message).toContain('Expiry time is required when generating a link');
    });

    it('should stream video with valid token', async () => {
      const video = await videoRepository.save({
        filename: 'v1.mp4',
        filepath: './uploads/v1.mp4',
        size: 1024,
        duration: 10,
        shareToken: 'valid-token',
        shareExpiry: new Date(Date.now() + 10 * 60 * 1000),
      });

      const response = await request(app.getHttpServer())
        .get(`/video/${video.id}/share`)
        .query({ token: 'valid-token' })
        .expect(200);

      expect(response.headers['content-type']).toBe('video/mp4');
    });

    it('should fail if token is invalid', async () => {
      const video = await videoRepository.save({
        filename: 'v1.mp4',
        filepath: './uploads/v1.mp4',
        size: 1024,
        duration: 10,
        shareToken: 'valid-token',
        shareExpiry: new Date(Date.now() + 10 * 60 * 1000),
      });

      const response = await request(app.getHttpServer())
        .get(`/video/${video.id}/share`)
        .query({ token: 'invalid-token' })
        .expect(401);

      expect(response.body.message).toContain('Invalid share token');
    });

    it('should fail if link has expired', async () => {
      const video = await videoRepository.save({
        filename: 'video2.mp4',
        filepath: './uploads/video2.mp4',
        size: 1024,
        duration: 10,
        shareToken: 'valid-token',
        shareExpiry: new Date(Date.now() - 10 * 60 * 1000),
      });

      const response = await request(app.getHttpServer())
        .get(`/video/${video.id}/share`)
        .query({ token: 'valid-token' })
        .expect(401);

      expect(response.body.message).toContain('Shareable link has expired');
    });
  });
});
