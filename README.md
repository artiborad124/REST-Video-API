## Installation

```bash
$ npm install
```
## Set up .env file based on .env.example 

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov

```
## API Documentation

```
# API documentation Link
https://documenter.getpostman.com/view/27591867/2sAYdZuEGW
```

## Assumptions

1. File Uploads
  - Only video files (MP4, M0V, MKV, etc.) are uploaded.
  - The maximum file size is 25MB.
  - Videos should be between 5 to 25 seconds in duration.
  - Videos are stored in the ./uploads folder.

2. Trimming Video
  - The start time must be less than the end time.
  - The end time cannot exceed the video duration.
  - The trimmed video will be saved in the same uploads folder.

3. Merging Videos
  - The input video IDs must exist in the database.
  - The system concatenates videos sequentially.

4. Shareable Link & Streaming
  - The shareable link expires after the given time.
  - The token is unique per video and cannot be reused.
  - The video must exist in the database before streaming.
  - If pass only expiry then receive shareableLink.
  - If pass token then get videoUrl.

## Demo Video Url Reference

- https://www.sample-videos.com/
